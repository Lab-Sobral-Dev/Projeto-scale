# AuditLog — Classificação por Criticidade

Data: 2026-05-05
Branch: producao
Commit: 3b45599

---

## O que foi feito

O modelo `AuditLog` ganhou um campo `criticidade` que classifica cada log automaticamente
com base na ação registrada, permitindo políticas de retenção diferenciadas.

| Criticidade | Ações                                          | Retenção padrão |
|-------------|------------------------------------------------|-----------------|
| `alta`      | `create`, `update`, `delete`, `login`, `logout`, `label_print` | 1825 dias (5 anos) |
| `baixa`     | `request`, `token_refresh`, `error`            | 90 dias         |

A classificação é automática: o método `save()` do modelo define `criticidade` com base
em `action` — não é necessário passar o campo ao criar registros.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `backend/registro/audit_models.py` | Campo `criticidade`, `save()` override, índice composto |
| `backend/registro/migrations/0022_auditlog_criticidade.py` | Adiciona campo, backfill e índice |
| `backend/registro/management/commands/purge_audit.py` | Retenção por criticidade, dry-run, batches |

---

## Deploy no servidor

Execute os passos abaixo **nesta ordem**:

```bash
# 1. Atualizar o código
git pull

# 2. Aplicar a migration
#    - Adiciona coluna criticidade (fast no PostgreSQL 12+)
#    - Faz backfill: marca request/token_refresh/error como 'baixa'
#    - Cria índice composto (criticidade, -timestamp)
python manage.py migrate

# 3. Reiniciar a aplicação
sudo systemctl restart gunicorn   # ajuste para o nome do seu serviço
```

> **Atenção:** se a tabela AuditLog tiver milhões de registros, o backfill do `RunPython`
> pode levar alguns segundos. Faça no horário de menor tráfego.

---

## Agendamento do purge_audit (cron)

O comando não roda sozinho — precisa ser agendado. Adicione ao crontab do servidor:

```bash
crontab -e
```

```cron
# Roda todo dia às 02:00
# Baixa: remove logs > 90 dias | Alta: remove logs > 1825 dias (5 anos)
0 2 * * * /caminho/para/venv/bin/python /caminho/para/manage.py purge_audit >> /var/log/purge_audit.log 2>&1
```

Substitua `/caminho/para/` pelo caminho real do projeto e do virtualenv.

---

## Uso do comando purge_audit

```bash
# Padrões (baixa: 90 dias, alta: 1825 dias)
python manage.py purge_audit

# Personalizar períodos
python manage.py purge_audit --dias-baixa 60 --dias-alta 3650

# Simular sem deletar nada (recomendado antes do primeiro uso em produção)
python manage.py purge_audit --dry-run
```

Limites mínimos obrigatórios:
- `--dias-baixa`: mínimo 30 dias
- `--dias-alta`: mínimo 365 dias

---

## Verificar saúde dos logs

```bash
# Volume por criticidade
python manage.py shell -c "
from registro.audit_models import AuditLog
from django.db.models import Count
print(list(AuditLog.objects.values('criticidade').annotate(total=Count('id'))))"

# Simulação de purge
python manage.py purge_audit --dry-run
```

---

## Rollback

Se necessário reverter a migration:

```bash
python manage.py migrate registro 0021_backuprecord_db_alias
```

Isso remove o campo `criticidade` e o índice. Os dados não são afetados (nenhum registro
é deletado pelo rollback).
