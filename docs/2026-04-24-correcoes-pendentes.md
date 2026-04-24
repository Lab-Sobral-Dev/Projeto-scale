# Correções Pendentes — Projeto Scale

**Data:** 2026-04-24  
**Referência:** `docs/2026-04-23-analise-completa-do-projeto.md` vs `CHANGELOG.md`

Itens identificados na análise que **não foram implementados** ainda, separados entre pendências que exigem ação manual e itens de código não iniciados.

---

## Pendências declaradas no CHANGELOG (requerem ação manual)

### [C-1] `.env` com credenciais reais no histórico git 🔴 CRÍTICO

**Localização:** commits `c138fc5`, `6e3c4f2`, `f69e81e`, `1159c83`, `e61f6d1`

`DB_PASSWORD`, `EMAIL_HOST_PASSWORD` e `SECRET_KEY` estão gravados no histórico. O CHANGELOG marca explicitamente como "Ação necessária".

**Ações pendentes:**
1. Revogar todas as credenciais (banco, e-mail, secret key)
2. Gerar nova `SECRET_KEY` forte
3. `git filter-repo --path .env --invert-paths` + force-push
4. Adicionar `.env` e `.env.*` ao `.gitignore`

---

### [C-8] Sem SSL/TLS no Nginx 🔴 CRÍTICO

**Localização:** `nginx/nginx.conf`

Ambos os vhosts ainda usam apenas `listen 80`. O CHANGELOG marca como "Ação necessária".

**Ações pendentes:**
1. Configurar terminação TLS (Let's Encrypt / certificado próprio)  
   **ou** documentar que terminação ocorre em proxy externo (Cloudflare) e garantir `SECURE_PROXY_SSL_HEADER` no Django

---

## Itens de código não iniciados

### [A-1] Tokens JWT armazenados no `localStorage` 🟠 ALTO

**Localização:** `frontend/src/services/api.js:22`

Tokens de refresh (vida de 7 dias) em `localStorage` são vulneráveis a XSS. Qualquer script injetado na página rouba o token permanentemente.

**Correção:** Migrar o refresh token para `httpOnly cookie` (inacessível via JS). O access token de curta duração pode permanecer em memória.

---

### [A-10] Backup sem estratégia offsite 🟠 ALTO

**Localização:** `backend/registro/tasks.py`, `backend/registro/services/backup_db.py`

Todos os backups ficam no mesmo disco do servidor. Falha de hardware resulta em perda total dos dados e dos backups simultaneamente.

**Correção:** Implementar envio automático pós-backup para S3/R2 via `boto3`. Adicionar variáveis `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET` ao `.env`.

---

### [M-5] Gap de numeração nas migrações 🟡 MÉDIO

**Localização:** `backend/registro/migrations/`

Migrações pulam de `0009` para `0015` — 5 arquivos deletados sem squash. O banco pode estar em estado inconsistente em ambientes que aplicaram as migrações deletadas parcialmente.

**Ação:** Verificar `django_migrations` no banco de produção e comparar com os arquivos presentes. Se necessário, executar squash ou migration de reparo.

---

### [M-16] `authRoles.js` baseado 100% em `localStorage` 🟡 MÉDIO

**Localização:** `frontend/src/authRoles.js`

Autorização de visibilidade de telas lida diretamente do `localStorage`, que qualquer usuário pode editar via DevTools para elevar seu papel no frontend.

**Correção:** Ler papel exclusivamente do payload decodificado do JWT (campo `perfil.papel`), que não é mutável sem invalidar a assinatura.

---

### [M-18] Volume de backups sem retenção automática (sem `BackupConfig`) 🟡 MÉDIO

**Localização:** `backend/registro/services/backup_db.py`, `backend/registro/tasks.py`

A limpeza de arquivos antigos só ocorre quando existe um `BackupConfig` no banco. Se o registro não existir (ambiente novo, banco resetado), backups acumulam indefinidamente no disco sem nenhuma política de retenção.

**Correção:** Aplicar política de retenção com fallback para um valor padrão (ex: 30 dias) quando `BackupConfig` não for encontrado.

---

### [B-1] Imagem Docker sem versão pinada 🟢 BAIXO

**Localização:** `backend/Dockerfile`

`FROM python:3.12-slim` sem digest SHA. Uma atualização silenciosa da tag pode quebrar o build ou introduzir mudanças não testadas.

**Correção:** Pinar com digest: `FROM python:3.12-slim@sha256:<digest>` ou ao menos pinar minor version: `python:3.12.x-slim`.

---

### [B-6] `useApi.js` — `refetch` duplicata de `fetchData` 🟢 BAIXO

**Localização:** `frontend/src/hooks/useApi.js:25`

`refetch` é uma referência idêntica a `fetchData`, exposta separadamente sem nenhuma diferença. Código morto que confunde.

**Correção:** Remover `refetch` da API pública do hook ou fazer `refetch` reiniciar o estado (`data: null`) antes de chamar `fetchData`.

---

### [B-8] `console.error` com objetos de erro completos em produção 🟢 BAIXO

**Localização:** 30+ componentes do frontend

Stack traces completos e dados internos (incluindo potencialmente tokens e payloads de API) expostos no console do browser em produção.

**Correção:** Configurar `vite build` para remover `console.*` via `drop: ['console']` no `build.minify`, ou substituir por um logger condicional (`if (import.meta.env.DEV)`).

---

## Resumo

| ID | Severidade | Status | Tipo |
|---|---|---|---|
| C-1 | 🔴 Crítico | Pendente — ação manual | Segurança |
| C-8 | 🔴 Crítico | Pendente — ação manual | Infra |
| A-1 | 🟠 Alto | Não iniciado | Segurança |
| A-10 | 🟠 Alto | Não iniciado | DevOps |
| M-5 | 🟡 Médio | ✅ Falso positivo — `0015` depende explicitamente de `0009` | Backend |
| M-16 | 🟡 Médio | ✅ Implementado em `2026-04-24` | Frontend |
| M-18 | 🟡 Médio | ✅ Implementado em `2026-04-24` | DevOps |
| B-1 | 🟢 Baixo | ✅ Implementado em `2026-04-24` | DevOps |
| B-6 | 🟢 Baixo | ✅ Implementado em `2026-04-24` | Frontend |
| B-8 | 🟢 Baixo | ✅ Implementado em `2026-04-24` | Frontend |

**Pendentes após esta sessão: 4 itens** (2 ação manual + 2 requerem infraestrutura).

Todos os demais 53 itens da análise original foram implementados.
