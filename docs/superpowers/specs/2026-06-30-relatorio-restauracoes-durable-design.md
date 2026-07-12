# Relatório de Restaurações durável — Design

**Data:** 2026-06-30
**Branch:** producao
**Status:** Aprovado (aguardando plano de implementação)

## Problema

O relatório de Restaurações (`/relatorios/restores`) lê de `AuditLog`
(`action='restore'`). Porém uma restauração de banco "volta o banco no tempo":
ela faz `DROP SCHEMA public CASCADE` e recarrega um dump antigo no banco-alvo.
Como o `AuditLog` **não** é um modelo global (não está em `_GLOBAL_MODELS`,
que só contém `backuprecord`/`backupconfig`), ele vive no banco roteado por
ambiente. Logo:

- Restaurar o `hml` apaga o `AuditLog` do `hml` — incluindo o próprio registro
  da restauração que acabou de ser feita e todo o histórico de restaurações
  acumulado desde o backup restaurado.
- O relatório fica vazio ou inconsistente justamente quando mais importa.

É um problema de auto-referência: **um evento que substitui um datastore não
pode ser registrado de forma confiável dentro do próprio datastore.**

## Raio de impacto (blast radius) de um restore

- Restaurar `hml` afeta **apenas** as tabelas do `hml`. Não toca em `default`
  nem no sistema de arquivos.
- Restaurar `default` afeta **apenas** as tabelas do `default`.
- O volume Docker `backups_volume` (`/var/backups/scale`) **nunca** é alvo de
  restore e sobrevive a rebuilds (volume nomeado, persistente). É montado em
  `backend`, `worker` e `beat`.

Conclusão: o único armazenamento imune a **toda** restauração é o sistema de
arquivos no volume de backup.

## Infraestrutura já existente

`registro/services/backup_db.py::run_restore` já implementa uma rede de
segurança a cada restauração:

1. Exporta o `AuditLog` atual para CSV (`audit_log_snapshot_*.csv`) antes de ser
   apagado.
2. Cria um backup de segurança do estado atual (`safety_before_restore_*`).
3. Grava o evento em arquivo de texto persistente `restore_history.log`
   (via `_log_restore_event`).

Ou seja, a gravação durável em arquivo **já acontece** — só não num formato
estruturado que o relatório possa consumir de forma confiável.

## Decisões (acordadas com o usuário)

- **Durabilidade:** arquivo append-only no volume de backup. Imune a
  restaurações de `hml` e de `prod`.
- **Histórico antigo:** **incluir** no relatório. O relatório faz *merge em
  tempo de leitura* do `.jsonl` estruturado (going-forward) com o
  `restore_history.log` legado (best-effort), sem migração destrutiva.

## Formato real do `restore_history.log` legado

Confirmado na VPS (2 restaurações históricas, ambas com sucesso):

```
[2025-12-01 15:19:44] SOLICITAÇÃO DE RESTORE por admin (ID: 1) - IP: 192.168.208.8. Alvo: /var/backups/scale/db-20251201-142700.sql.gz
[2025-12-01 15:19:46] SUCESSO: Banco restaurado para versão db-20251201-142700.sql.gz.
[2026-06-29 10:38:21] SOLICITAÇÃO DE RESTORE (hml) por admin (ID: 10) - IP: 172.27.0.7. Alvo: /var/backups/scale/db-hml-20260629-103602.sql.gz
[2026-06-29 10:38:29] SUCESSO: Banco restaurado para versão db-hml-20260629-103602.sql.gz.
```

Observações de formato:

- Linha de início: `[ts] SOLICITAÇÃO DE RESTORE[ (env)] por {user_info}. Alvo: {path}`.
  O `(env)` só existe nos registros pós-feature de ambientes (o de 2025 não tem).
  `user_info` pode conter `(ID: n) - IP: x` — preservado como texto do usuário,
  mas o sufixo ` - IP: ...` é removido para a coluna "usuário".
- Linha de desfecho: `SUCESSO: ...` (sucesso) ou `ERRO CRÍTICO ...` /
  `ABORTADO: ...` (erro), entre uma `SOLICITAÇÃO` e a próxima.

## Arquitetura

Fonte going-forward do histórico: arquivo **JSON Lines** `restore_history.jsonl`
em `BACKUP_DIR` (`/var/backups/scale`), uma linha JSON por restauração. O
relatório lê esse arquivo e ainda faz merge do `restore_history.log` legado
(histórico), deduplicando — tudo baseado em arquivo, **nenhuma query ao banco**.
Ambos os arquivos vivem no volume durável, imune a qualquer restore.

### Componente 1 — Writer (`registro/services/backup_db.py`)

Novo helper:

```python
def _record_restore(alias, user_info, source, result, obs=""):
    """Grava UMA linha JSON estruturada do desfecho de uma restauração no
    arquivo durável restore_history.jsonl. Nunca lança (envolto em try/except)."""
```

Estrutura de cada registro (chaves estáveis, consumidas pelo relatório):

| Campo       | Origem                                              |
|-------------|-----------------------------------------------------|
| `timestamp` | momento do desfecho, ISO 8601 com fuso              |
| `usuario`   | `user_info` recebido por `run_restore`              |
| `env`       | `prod`/`hml` derivado de `alias` (ALIAS_TO_ENV)     |
| `arquivo`   | nome do arquivo de backup origem (`Path(source).name`) |
| `resultado` | `"sucesso"` ou `"erro"`                             |
| `obs`       | nome do safety backup (sucesso) ou mensagem de erro |

Pontos de chamada em `run_restore`:

- **Sucesso:** após a restauração concluir (postgres e sqlite).
- **Erro:** a lógica atual de `run_restore` é envolvida de modo que qualquer
  exceção (arquivo ausente, falha no safety backup, falha no reset/`psql`)
  registre `resultado="erro"` com a mensagem, e então a exceção seja relançada
  (comportamento atual preservado).

As chamadas existentes a `_log_restore_event` permanecem (defesa em
profundidade). O writer é totalmente envolto em `try/except` — registrar o
histórico jamais pode quebrar ou abortar uma restauração.

### Componente 2 — Reader / Relatório (`reports/views/backups.py::RestoresReportView`)

Faz *merge* de duas fontes, ambas no volume durável:

1. `restore_history.jsonl` — registros estruturados (going-forward).
2. `restore_history.log` — log de texto legado, parseado best-effort
   (Componente 3).

Regras:

- Aplica os filtros já existentes: `data_inicial`, `data_final`, `usuario`.
- Retorna as mesmas chaves de payload que o frontend já espera:
  `timestamp, usuario, arquivo, resultado, obs`. **Sem mudança no frontend.**
  (`env` fica disponível no registro para evolução futura, sem ser exibido
  agora.)
- Mantém exportação CSV/PDF com o mesmo cabeçalho atual.
- Robusto: arquivos inexistentes → relatório vazio; linha malformada → ignorada
  (com log de aviso), sem derrubar o relatório.
- Ordena por `timestamp` desc.

**Deduplicação:** uma restauração feita após o deploy é gravada nos DOIS
arquivos (estruturado no `.jsonl` e texto no `.log`, mantido por defesa em
profundidade). Para não duplicá-la, o merge usa a chave estável
`(arquivo, data_yyyy_mm_dd)`: registros do `.jsonl` têm prioridade e suprimem o
gêmeo do `.log`. Limitação aceita: restaurar o **mesmo arquivo** de backup
**duas vezes no mesmo dia** funde as duas ocorrências em uma.

### Componente 3 — Parser do log legado (`reports/views/backups.py` ou helper)

`_parse_restore_log(path) -> list[dict]`:

- Lê o `.log` linha a linha; cada linha `[ts] msg`.
- `SOLICITAÇÃO DE RESTORE` inicia um evento (captura `timestamp`, `env`
  opcional, `usuario` sem o sufixo ` - IP: ...`, `arquivo` = basename do
  "Alvo:").
- A primeira linha `SUCESSO` / `ERRO`/`ABORTADO` seguinte define `resultado`
  (`sucesso`/`erro`) e alimenta `obs`.
- Finaliza o evento ao encontrar a próxima `SOLICITAÇÃO` ou no fim do arquivo.
- Linhas de ruído (safety backup, export de auditoria, limpeza) são ignoradas
  ou usadas como `obs` complementar.
- Tolerante a linhas fora do padrão (ignora).

### Fluxo de dados

```
Restore disparado (API /registro/backups/<id>/restore/ ou Django admin)
   -> run_restore() executa a rede de segurança
   -> _record_restore() acrescenta 1 linha JSON em restore_history.jsonl
      (e _log_restore_event continua escrevendo no .log de texto)
   -> RestoresReportView lê o .jsonl + parseia o .log legado, deduplica e ordena
   -> relatório exibe (e exporta) o histórico completo (antigo + novo)
```

## Tratamento de erros

- Writer: `try/except` interno; falha de gravação apenas loga aviso, nunca
  interrompe a restauração.
- Reader: tolera arquivo ausente e linhas corrompidas (pula a linha inválida).

## Testes

- **Unitário (writer):** `_record_restore` grava uma linha JSON parseável com
  todos os campos esperados; chamada com falha de I/O não lança.
- **Unitário (parser do log legado):** parseia os dois formatos de
  `SOLICITAÇÃO` (com e sem `(env)`); extrai usuário sem o sufixo IP; associa o
  desfecho `SUCESSO`/`ERRO`; ignora linhas de ruído e fora do padrão.
- **Unitário (reader/merge):** une `.jsonl` + `.log`; deduplica por
  `(arquivo, data)` dando prioridade ao `.jsonl`; aplica filtros de data e
  usuário; lida com arquivos ausentes (vazio) e linhas inválidas.
- **Manual (VPS):** confirmar que o relatório exibe as 2 restaurações
  históricas (01/12/2025 e 29/06/2026); acrescentar um registro de teste ao
  `.jsonl` e confirmar que aparece e que não duplica o gêmeo do `.log`. Sem
  disparar um restore real e destrutivo.

## Compatibilidade / migração

- Sem migração de banco (solução baseada em arquivo). Sem passo de migração
  destrutivo — o histórico antigo entra via merge em tempo de leitura.
- Registros antigos baseados em `AuditLog` deixam de alimentar o relatório; o
  histórico passa a vir do `.jsonl` + `.log`. O `restore_history.log` é
  preservado (e continua sendo escrito).
- As gravações de `action='restore'` no `AuditLog` (em `api/backups.py` e
  `admin.py`) permanecem como estão — inofensivas, apenas não são mais a fonte
  do relatório. Remoção fica fora de escopo.

## Fora de escopo

- Remover/limpar as gravações redundantes de `action='restore'` no `AuditLog`.
- Exibir/filtrar por `env` no frontend (campo já fica gravado para evolução).
- Migração one-shot do `.log` para `.jsonl` (preferiu-se merge em leitura).

## Deploy

Mudança só de backend (writer + reader), sem migration e sem frontend. Rebuild
de `backend worker beat` + `up -d` (o código vai na imagem). O volume
`backups_volume` é preservado.
