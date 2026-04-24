# Relatório de Análise Completa — Projeto Scale

**Data:** 2026-04-23  
**Gerado por:** Análise automatizada com 5 agentes especializados (Backend, Segurança, Frontend, Arquitetura/DevOps, Módulos Críticos)

---

## Resumo Executivo

| Severidade | Total | Críticos por área |
|---|---|---|
| 🔴 CRÍTICO | 14 | Backup (4), Segurança (3), Pesagem (2), Auditoria (2), Frontend (2), Infra (1) |
| 🟠 ALTO | 18 | Segurança (5), Frontend (5), Backend (4), DevOps (4) |
| 🟡 MÉDIO | 17 | Frontend (6), Backend (5), DevOps (4), Segurança (2) |
| 🟢 BAIXO | 8 | Frontend (5), Backend (2), Infra (1) |

---

## 🔴 CRÍTICOS — Corrigir antes do próximo deploy

---

### Segurança

#### [C-1] `.env` com credenciais reais no histórico git

**Localização:** `/.env` — commits `c138fc5`, `6e3c4f2`, `f69e81e`, `1159c83`, `e61f6d1`

As credenciais reais estão gravadas no histórico:
```
SECRET_KEY=troque-isto-em-producao
DB_PASSWORD=@Acesso06597
POSTGRES_PASSWORD=@Acesso06597
EMAIL_HOST_PASSWORD=1034Hi@n2864
```

A `SECRET_KEY` no valor `troque-isto-em-producao` invalida toda a segurança dos tokens Django (CSRF, sessões, password reset). Qualquer pessoa com acesso ao repositório tem as credenciais do banco e do e-mail.

**Ação imediata:**
1. Revogar e trocar TODAS as credenciais (banco, e-mail, secret key)
2. `git filter-repo --path .env --invert-paths` + force-push para remover do histórico
3. Descomentar `.env` e `.env.*` no `.gitignore`

---

#### [C-2] `gerar_etiqueta_pdf` sem nenhuma autenticação

**Localização:** `registro/views.py:520`

```python
def gerar_etiqueta_pdf(request, pk):
    pesagem = Pesagem.objects.select_related(...).get(pk=pk)
    # sem @login_required, sem permission_classes
```

Qualquer pessoa sem login acessa `GET /api/registro/etiqueta/<pk>/` e obtém produto, matéria-prima, lote, peso, pesador e balança de qualquer pesagem. A enumeração por PK inteiro é trivial.

**Correção:** Adicionar `@login_required` ou converter para `APIView` com `permission_classes = [IsAuthenticated]`.

---

### Módulo de Backup

#### [C-3] `backup_db.py:258` — `shell=True` com variáveis não escapadas no restore

**Localização:** `registro/services/backup_db.py:258`

```python
restore_cmd = f"gzip -cd {shlex.quote(str(path))} | {shlex.quote(pg_client)} -h {host} -p {port} -U {user} -d {name}"
proc_restore = subprocess.run(restore_cmd, shell=True, ...)
```

Apenas `path` e `pg_client` são escapados. `host`, `port`, `user` e `name` vêm diretamente do `.env` sem sanitização. Com o `.env` comprometido (ver C-1), isso é execução arbitrária de comandos no servidor.

**Correção:**
```python
with subprocess.Popen(["gzip", "-cd", str(path)], stdout=subprocess.PIPE) as gz:
    subprocess.run([pg_client, "-h", host, "-p", port, "-U", user, "-d", name],
                   stdin=gz.stdout, env=env, stderr=subprocess.PIPE, check=True)
```

---

#### [C-4] `backup_db.py:154,166` — Exportação de auditoria pré-restore está quebrada silenciosamente

**Localização:** `registro/services/backup_db.py:154,166`

```python
logs = AuditLog.objects.all().order_by("-created_at")[:5000]  # campo não existe
...
log.created_at.strftime(...)  # FieldError silenciado pelo except Exception
```

O modelo `AuditLog` usa `timestamp`, não `created_at`. O `except Exception` silencia o erro. Em cada restore real, o sistema exibe "backup de segurança criado" mas o histórico de auditoria **nunca é salvo**. Toda a trilha de auditoria do período é perdida permanentemente.

**Correção:** Substituir `created_at` por `timestamp` nas linhas 154 e 166.

---

### Módulo de Auditoria

#### [C-5] `purge_audit` — Log de auditoria pode ser apagado por inteiro

**Localização:** `registro/management/commands/purge_audit.py`

```python
deleted, _ = AuditLog.objects.filter(timestamp__lt=cutoff).delete()
```

Pode ser executado com `--days 0`, apagando todo o histórico. Não há período mínimo, não há confirmação, não há log de quem executou o purge. Um administrador pode realizar ações críticas e apagar todos os rastros.

**Correção:** Impor mínimo de 365 dias e registrar o próprio purge como `AuditLog` antes de executar.

---

#### [C-6] `AUDIT_ENABLED=False` por padrão desabilita toda a trilha de auditoria

**Localização:** `conf/settings.py`

```python
AUDIT_ENABLED = os.getenv("AUDIT_ENABLED", "false").strip().lower() == "true"
```

Sem `AUDIT_ENABLED=true` no `.env`, todos os signals de `pre_save`/`post_save` que rastreiam `Pesagem`, `OrdemProducao`, `ItemOP`, `Produto`, `MateriaPrima` e `Balanca` retornam imediatamente sem gravar nada. O sistema aparenta funcionar normalmente mas não registra nenhuma alteração.

**Correção:** Inverter o default para `"true"` ou setar explicitamente `AUDIT_ENABLED=true` no `.env` de produção.

---

### Módulo de Pesagem

#### [C-7] `Pesagem.clean()` nunca é chamado pela API — validação da balança bypassada

**Localização:** `registro/models.py:318`

```python
def clean(self):
    if self.balanca_id and not self.balanca.esta_em_calibracao():
        raise ValidationError("A balança selecionada está fora da calibração.")
```

`clean()` só é invocado por `full_clean()`. O fluxo `PesagemViewSet.perform_create()` → `serializer.save()` → `model.save()` **não chama** `full_clean()`. Resultado: é possível registrar pesagens em balanças vencidas sem nenhum bloqueio pela API.

**Correção:** Adicionar `self.full_clean()` no início de `Pesagem._save_atomic()`.

---

### Infraestrutura

#### [C-8] Sem SSL/TLS no Nginx — tráfego HTTP puro

**Localização:** `nginx/nginx.conf`

Ambos os vhosts (`scale.laboratoriosobral.com.br` e `apiscale.laboratoriosobral.com.br`) usam apenas `listen 80`. Credenciais, tokens JWT e dados de pesagem trafegam em texto claro.

> Se a terminação TLS ocorre num proxy externo (Cloudflare, etc.), documentar explicitamente e garantir que `SECURE_PROXY_SSL_HEADER` está configurado no Django.

---

### Frontend

#### [C-9] `react-router-dom v7.6.1` — 2 CVEs HIGH ativos (XSS + Open Redirect)

**Localização:** `frontend/package.json`

- `GHSA-2w69-qvjg-hvjx` — XSS via Open Redirects (>=7.0.0 ≤7.11.0)
- `GHSA-8v8x-cx79-35w7` — XSS em ScrollRestoration (>=7.0.0 <7.12.0)
- Total auditoria: 40 vulnerabilidades, 22 HIGH

**Correção:** `pnpm update react-router-dom react-router` para `>=7.12.0`.

---

#### [C-10] `PesagemDetalhe.jsx:32-83` — Mini-ApiService com URL de produção hardcoded

**Localização:** `frontend/src/pages/PesagemDetalhe.jsx:32`

```js
const API_BASE_URL = 'https://apiscale.laboratoriosobral.com.br/api';
class ApiService { ... }  // reimplementação local completa
```

Este componente ignora `import.meta.env.VITE_API_BASE_URL` e sempre chama produção, independente do ambiente. Nenhuma correção feita em `api.js` central afeta esta tela.

**Correção:** Remover a mini-ApiService local e importar `api` de `@/services/api`.

---

## 🟠 ALTOS — Resolver no próximo sprint

### Segurança

- **[A-1] Tokens JWT no `localStorage`** (`frontend/src/services/api.js:22`) — vulnerável a XSS. Solução: `httpOnly cookie` para o refresh token (vida longa de 7 dias).
- **[A-2] `UserSecurityView` usa `IsAdminUser` (is_staff) em vez de `IsAdmin` (papel)** (`usuarios/views_security.py:13`) — inconsistência permite que usuários com `is_staff=True` façam unlock de contas e force-reset de senhas sem ter o papel de admin no sistema.
- **[A-3] `IsBackupAdmin` baseado em `is_staff`** (`registro/api/backups.py:40`) — mesmo problema para execute/restore de backup. Um usuário técnico com `is_staff` pode restaurar o banco inteiro.
- **[A-4] `BackupListView` acessível para qualquer autenticado** (`registro/api/backups.py:83`) — operadores veem o caminho físico dos arquivos de backup no servidor. Alterar para `IsBackupAdmin`.
- **[A-5] Sem rate limiting** em nenhum endpoint. O endpoint de login não tem throttle por IP, permitindo bloqueio coordenado de contas e enumeração de usuários. Adicionar `DEFAULT_THROTTLE_CLASSES` no DRF.

### Backend

- **[A-6] `signals.py:71` — `_before = {}` global** compartilhado entre threads. Race condition entre dois saves simultâneos da mesma instância produz diffs incorretos no log de auditoria. Usar `threading.local()`.
- **[A-7] `BackupExecuteView:54` — `transaction.atomic` engloba `pg_dump` + I/O de disco** — transação aberta por minutos, segurando conexões do pool do PostgreSQL. Separar criação do record do I/O de disco.
- **[A-8] `reports/views/auditoria.py:176` — `?meta=filters` carrega todos os `AuditLog` em memória** para construir dropdowns. Com dezenas de milhares de logs, causa OOM no worker. Usar `.values_list().distinct()`.
- **[A-9] `tasks.py:53` — `auto_backup` sem retry, sem `acks_late`** — se o worker morrer durante backup, a task é perdida silenciosamente. Adicionar `bind=True, max_retries=3, acks_late=True`.
- **[A-10] Backup sem estratégia offsite** — todos os backups estão no mesmo disco do servidor. Falha de hardware = perda total. Implementar envio para S3/R2 via `boto3`.

### Frontend

- **[A-11] `Backups.jsx (reports):49` — desestruturação `{ data }` errada** — `api.get()` retorna o body diretamente. A tela de relatório de backups nunca exibe dados.
  ```js
  // Errado:
  const { data } = await api.get('/registro/backups/')
  // Correto:
  const data = await api.get('/registro/backups/')
  ```
- **[A-12] `BackupCard.jsx`** — componente duplicado de `BackupConsole` com o mesmo bug de `{ data }` e comentário "Axios" (projeto anterior). Verificar uso e deletar se não roteado.
- **[A-13] `LogsAuditoria.jsx:92` e `PesagemEditar.jsx:81`** — `fetch` raw bypassando o interceptor de refresh do `api.js`. Token expirado → silêncio ou tela travada. Substituir por `api.get(...)`.
- **[A-14] `Historico.jsx:150`** — carrega 1.500 registros (3× `page_size: 500`) em memória para filtrar no cliente. Migrar para filtros server-side.
- **[A-15] `useApi.js:10`** — race condition clássica: sem cleanup no `useEffect`, `setState` chamado em componente desmontado. Adicionar `AbortController` ou flag `cancelled`.

### DevOps

- **[A-16] Código-fonte montado como bind mount em produção** (`./backend:/app` no `docker-compose.yml`) — container não é imutável; qualquer modificação local afeta produção imediatamente. Remover o bind mount.
- **[A-17] Sem `healthcheck` em nenhum serviço** — race condition no startup do banco antes do Django tentar conectar. Adicionar `pg_isready` no serviço `db` e `condition: service_healthy` no `backend`.
- **[A-18] Redis sem volume persistente e sem autenticação** — perda de estado do Celery Beat em cada restart. Adicionar `requirepass` e volume nomeado.
- **[A-19] Containers rodando como root** (`backend/Dockerfile`) — nenhum `USER` definido. Gunicorn, Celery worker e beat executam como root, ampliando o impacto de qualquer comprometimento.

---

## 🟡 MÉDIOS — Planejar nas próximas 2 semanas

### Backend

- **[M-1]** `Pesagem.item_op` declarado `null=True` mas `_save_atomic` rejeita nulos — invariante de negócio não refletida no campo do banco. Remover `null=True, blank=True`.
- **[M-2]** `codigo_interno` com `default='TEMP'` em `Pesagem` — pesagens podem ser salvas sem código válido. Remover default ou adicionar validação.
- **[M-3]** Auditoria do `update` fora da transação (`views.py:421`) — pesagem pode ser alterada sem log se o servidor reiniciar entre o save e o `AuditLog.create()`. Envolver em `transaction.atomic`.
- **[M-4]** `OrdemProducao.gerar_itens_a_partir_da_estrutura()` — OP concluída pode ter itens recriados com `forcar=True` sem verificação de status.
- **[M-5]** Gap de numeração nas migrações (`0009` → `0015`) — 5 migrações deletadas sem squash. Verificar se o banco está em estado consistente.
- **[M-6]** `CELERY_ENABLE_UTC=False` × `USE_TZ=True` — timestamps inconsistentes entre Django e Celery Beat. Unificar para UTC.

### Segurança

- **[M-7]** `force_reset` retorna senha temporária em plaintext na resposta HTTP (`usuarios/views_security.py:53`). Enviar por e-mail, nunca na resposta.
- **[M-8]** `client_ip()` confia cegamente no `X-Forwarded-For` (`registro/utils/audit.py:2`) — IPs de auditoria podem ser forjados por qualquer cliente. Usar `django-ipware` com proxies confiáveis.
- **[M-9]** Django Admin exposto em `/admin/` sem proteção por IP ou URL customizada.
- **[M-10]** CORS wildcard (`$http_origin`) no bloco `/protected/backups/` do Nginx. Fixar para a origem do frontend.

### Frontend

- **[M-11]** `useMe.js:51` — `isAuthenticated` não verifica expiração do token. Usuário com token expirado ainda aparece como autenticado até o próximo check.
- **[M-12]** Nenhum `ErrorBoundary` em toda a aplicação — qualquer erro JS não capturado causa tela branca total. Adicionar ao menos em `main.jsx`.
- **[M-13]** `App.jsx` — `RequireReportViewer` lê papel do `localStorage` sem verificar validade do token.
- **[M-14]** `BackupConsole.jsx:96-161` — 9 chamadas `alert()`/`window.confirm()` em componente crítico. Substituir por `toast` (sonner) e `AlertDialog` (Radix), já instalados.
- **[M-15]** `Pesagens.jsx` — busca até 5 páginas × 200 itens para popular dropdown de filtro. Criar endpoint server-side de operadores distintos.
- **[M-16]** `authRoles.js` — autorização de visibilidade de telas baseada 100% em `localStorage` mutável pelo usuário via DevTools.

### DevOps

- **[M-17]** `BackupConfig.enabled = False` por padrão — backup não ativa automaticamente após novo deploy. Criar migration que insere `BackupConfig` com `enabled=True`.
- **[M-18]** Volume de backups sem retenção automática quando não há `BackupConfig` no banco.
- **[M-19]** Backups de safety (`safety_before_restore_*`) sem política de limpeza — acumulam indefinidamente no disco.
- **[M-20]** Download de backup não registra `AuditLog` — não há rastro de quem baixou o dump completo do banco.
- **[M-21]** `LOGGING` só configurado quando `AUDIT_ENABLED=true`. Erros 500 e falhas de segurança não são persistidos quando auditoria está desabilitada.

---

## 🟢 BAIXOS — Backlog

- **[B-1]** Imagem Docker sem versão pinada (`python:3.12-slim` sem digest SHA)
- **[B-2]** `usuarios/validators.py:20` — `get_help_text()` diz "10 caracteres" mas `settings.py` define 8 como mínimo
- **[B-3]** `IsAdminOnly` legado (`is_staff`) em `registro/views.py:706` — código morto com inconsistência de modelo de permissões
- **[B-4]** Chave de tabelas por índice (`key={idx}`) em vez de `row.id` em `ReportShell.jsx:179`
- **[B-5]** `Login.jsx:16` usa `escape()` deprecated desde ES3
- **[B-6]** `useApi.js:25` — `refetch` é duplicata idêntica de `fetchData`
- **[B-7]** `NovaPesagem.jsx:468` — `currentDateTime` recalculado a cada render sem atualizar durante a sessão
- **[B-8]** `console.error` com objetos de erro completos em 30+ componentes de produção

---

## Pontos Positivos (não regredir)

- Blacklist de refresh tokens configurada corretamente (`BLACKLIST_AFTER_ROTATION: True`, `ROTATE_REFRESH_TOKENS: True`)
- Lockout por tentativas implementado corretamente (5 falhas, unlock manual por admin)
- `ComplexityValidator` customizado para senhas
- `IsAuthenticated` como default global no `REST_FRAMEWORK`
- Proteção de path traversal nos downloads de backup (`relative_to(backup_dir)`)
- Diretiva `internal` no Nginx para `/protected/backups/`
- Banco PostgreSQL não expõe porta externamente (apenas `expose`, não `ports`)
- `CORS_ALLOW_ALL_ORIGINS = False`
- `select_for_update()` em `ItemOP` no fluxo de pesagem
- Auditoria detalhada em operações críticas quando habilitada

---

## Plano de Ação

### Imediato (hoje)

| # | Ação | Esforço |
|---|---|---|
| 1 | Revogar credenciais do `.env`, gerar nova `SECRET_KEY`, `git filter-repo` | 2h |
| 2 | `pnpm update react-router-dom react-router` para `>=7.12.0` | 15 min |
| 3 | Corrigir `backup_db.py:154,166` (`created_at` → `timestamp`) | 5 min |
| 4 | Adicionar `@login_required` em `gerar_etiqueta_pdf` | 5 min |
| 5 | Setar `AUDIT_ENABLED=true` no `.env` de produção | 1 min |

### Sprint 1 (esta semana)

| # | Ação | Esforço |
|---|---|---|
| 6 | Substituir `shell=True` no restore por lista de argumentos | 1h |
| 7 | Adicionar `self.full_clean()` em `Pesagem._save_atomic()` | 30 min |
| 8 | Corrigir `Backups.jsx` desestruturação `{ data }` | 10 min |
| 9 | Adicionar headers de segurança HTTP no Nginx | 30 min |
| 10 | Corrigir `_before = {}` com `threading.local()` nos signals | 1h |
| 11 | Adicionar `USER` não-root no Dockerfile | 30 min |
| 12 | Adicionar `healthcheck` no `docker-compose.yml` | 30 min |
| 13 | Unificar `IsBackupAdmin` com `IsAdmin` baseado em `perfil.papel` | 30 min |

### Sprint 2 (próximas 2 semanas)

| # | Ação | Esforço |
|---|---|---|
| 14 | Implementar backup offsite (S3/R2 via `boto3`) | 4h |
| 15 | Separar `transaction.atomic` do I/O de disco no `BackupExecuteView` | 1h |
| 16 | Corrigir componentes com `fetch` raw bypassando `api.js` central | 2h |
| 17 | Adicionar retry + `acks_late` na task `auto_backup` | 1h |
| 18 | Adicionar `ErrorBoundary` na aplicação React | 1h |
| 19 | Configurar SSL no Nginx (ou documentar terminação TLS externa) | 2h |
| 20 | Proteção mínima de 365 dias no `purge_audit` + log do próprio purge | 1h |
| 21 | Adicionar `LOGGING` base independente de `AUDIT_ENABLED` | 1h |
| 22 | Rate limiting no Nginx e no DRF para endpoints de autenticação | 1h |
