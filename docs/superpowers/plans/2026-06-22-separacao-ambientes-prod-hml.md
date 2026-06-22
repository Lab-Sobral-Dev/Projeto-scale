# Separação Real de Ambientes PROD/HML — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar a infraestrutura à arquitetura documentada (RNF-08 §12.2/§12.3), transformando o modelo atual de "uma instância com troca de banco por claim JWT" em **dois deployments completamente independentes** (PROD e HML), fechando os Riscos 16, 18 e 19.

**Architecture:** Aposentamos o switch em runtime (`EnvSwitchMiddleware` + `EnvRouter` + thread-local) e tornamos o backend **agnóstico de ambiente**: cada deployment lê um único banco/Redis/segredo do seu próprio `.env`, e o ambiente (`APP_ENV`) é fixo por build. O `docker-compose.yml` vira parametrizável e roda como **dois projetos isolados** (`-p scale_prod` / `-p scale_hml`), gerando containers, redes e volumes separados. HML ganha subdomínios próprios.

**Tech Stack:** Django 5.2.5 + Gunicorn 23 + DRF 3.16.1 | React 19 + Vite | PostgreSQL 15 | Redis | Docker Compose | Nginx.

## Global Constraints

- **PostgreSQL:** 15 (manter `image: postgres:15`).
- **Gunicorn:** 23.0.0; execução não-root (`appuser`); WSGI `conf.wsgi:application`.
- **Deploy:** `docker compose` na VPS em `~/projetos/Projeto-scale`; **rebuild obrigatório** (código vai na imagem). Após cada mudança: commit + push na branch atual.
- **Nomes de banco documentados (§12.3):** PROD = `scale_prod`, HML = `scale_hml`.
- **Subdomínios documentados (§12.2):** PROD `scale.` / `apiscale.`; HML `hml-scale.` / `apihml-scale.` (laboratoriosobral.com.br).
- **Segredos distintos por ambiente (RNF-08):** `SECRET_KEY`/JWT secret, senhas de banco e Redis diferentes entre PROD e HML.
- **Watermark/badge HML (§12.3, RNF-05):** preservados, mas dirigidos por `APP_ENV` (build/deploy), não pela claim do token.
- **Regra de ouro de segurança:** nenhuma mudança pode quebrar o PROD em produção. A ordem das fases garante que PROD permaneça idêntico até a stack HML estar isolada.

> **Pré-requisito de execução:** trabalhar em worktree isolado (skill `superpowers:using-git-worktrees`) ou branch dedicada a partir de `producao`.

> **Dependências externas (AÇÃO DO USUÁRIO — fora do código):**
> - Criar registros DNS `hml-scale` e `apihml-scale` apontando para a VPS.
> - Configurar o edge (Cloudflare/TLS) e o proxy de host para rotear os subdomínios HML para a porta da stack HML (ver Task 12).
> - Gerar segredos fortes para `.env.hml` (`openssl rand -hex 50` para `SECRET_KEY`; senhas distintas para DB/Redis).

---

## Mapa de Fases (ordem segura)

| Fase | Tasks | Risco que fecha | PROD em risco? |
|---|---|---|---|
| 1. Gunicorn hardening | 1–3 | 19 | Não (melhoria aditiva) |
| 2. Backend agnóstico de ambiente | 4–8 | 16/18 (raiz) | Não (comportamento PROD idêntico) |
| 3. Frontend por build | 9–10 | 16 (cookies/origem) | Não |
| 4. Split de infra (compose/env/credenciais) | 11 | 16/18 | Não (PROD migra para `.env.prod`) |
| 5. Edge + subdomínios HML | 12 | 18 | Não (aditivo) |
| 6. Docs + evidências | 13–14 | 16/18/19 | Não |

---

## FASE 1 — Gunicorn hardening (Risco 19)

### Task 1: Extrair configuração do Gunicorn para `gunicorn.conf.py`

**Files:**
- Create: `backend/gunicorn.conf.py`
- Modify: `backend/Dockerfile:48-52`

**Interfaces:**
- Produces: arquivo de config lido pelo Gunicorn via `--config`; lê `GUNICORN_WORKERS`, `GUNICORN_TIMEOUT`, `GUNICORN_MAX_REQUESTS`, `GUNICORN_MAX_REQUESTS_JITTER` do ambiente.

- [ ] **Step 1: Criar `backend/gunicorn.conf.py`**

```python
# backend/gunicorn.conf.py
"""Configuração do Gunicorn parametrizada por variáveis de ambiente (RNF-07)."""
import os

bind = "0.0.0.0:8000"
# Default conservador para 2 vCPU; sobrescrevível por env.
workers = int(os.getenv("GUNICORN_WORKERS", "3"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
# Reciclagem de workers para mitigar vazamento de memória em uptime longo.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "100"))
accesslog = "-"
errorlog = "-"
```

- [ ] **Step 2: Alterar o `CMD` do Dockerfile para usar o config**

Substituir `backend/Dockerfile:48-52` por:

```dockerfile
CMD ["sh", "-lc", "\
    python manage.py migrate && \
    python manage.py collectstatic --noinput && \
    gunicorn conf.wsgi:application --config /app/gunicorn.conf.py \
"]
```

- [ ] **Step 3: Verificar o build localmente**

Run: `cd backend && docker build -t scale_backend_test .`
Expected: build conclui sem erro; imagem criada.

- [ ] **Step 4: Verificar boot do Gunicorn (smoke)**

Run: `docker run --rm -e DJANGO_SETTINGS_MODULE=conf.settings -e SECRET_KEY=dummy -e DB_ENGINE=sqlite scale_backend_test sh -lc "gunicorn conf.wsgi:application --config /app/gunicorn.conf.py --check-config"`
Expected: sai sem erro de config (exit 0). Se `--check-config` exigir DB, validar via `python -c "import gunicorn"` e leitura do arquivo.

- [ ] **Step 5: Commit**

```bash
git add backend/gunicorn.conf.py backend/Dockerfile
git commit -m "feat(gunicorn): config parametrizada por env com reciclagem de workers"
```

### Task 2: Healthcheck do backend e dependência ordenada do nginx

**Files:**
- Modify: `docker-compose.yml` (serviço `backend`: adicionar `healthcheck`; serviço `nginx`: `depends_on` condicional)

**Interfaces:**
- Consumes: endpoint HTTP do backend que responda 200 sem auth. Usar a rota de schema/health existente; se não houver, usar `GET /api/` (DRF retorna 200/401 — usar 401 como "vivo"). Preferir endpoint dedicado (Task 3).

- [ ] **Step 1: Adicionar healthcheck ao serviço `backend` no `docker-compose.yml`**

Dentro de `backend:`, após `expose:`:

```yaml
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz/')\" || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s
```

- [ ] **Step 2: Tornar o nginx dependente do backend saudável**

No serviço `nginx:`, trocar `depends_on:` para:

```yaml
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_started
```

- [ ] **Step 3: Validar sintaxe do compose**

Run: `docker compose config >/dev/null && echo OK`
Expected: `OK` (sem erro de parsing).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(infra): healthcheck do backend e nginx aguardando service_healthy"
```

### Task 3: Endpoint `/healthz/` sem autenticação

**Files:**
- Create: `backend/conf/health.py`
- Modify: `backend/conf/urls.py`
- Test: `backend/registro/tests/test_health.py`

**Interfaces:**
- Produces: `GET /healthz/` → `200` com corpo `{"status": "ok"}`, sem auth, sem tocar banco.

- [ ] **Step 1: Escrever o teste que falha**

```python
# backend/registro/tests/test_health.py
from rest_framework.test import APIClient

def test_healthz_returns_ok_without_auth(db):
    client = APIClient()
    resp = client.get("/healthz/")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `cd backend && python -m pytest registro/tests/test_health.py -v`
Expected: FAIL (404 — rota inexistente).

- [ ] **Step 3: Implementar a view**

```python
# backend/conf/health.py
from django.http import JsonResponse

def healthz(_request):
    return JsonResponse({"status": "ok"})
```

- [ ] **Step 4: Registrar a rota em `backend/conf/urls.py`**

Adicionar o import e a rota (antes das rotas autenticadas):

```python
from conf.health import healthz
# ...
urlpatterns = [
    path("healthz/", healthz),
    # ... rotas existentes
]
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd backend && python -m pytest registro/tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/conf/health.py backend/conf/urls.py backend/registro/tests/test_health.py
git commit -m "feat(backend): endpoint /healthz/ para healthcheck do container"
```

---

## FASE 2 — Backend agnóstico de ambiente (raiz dos Riscos 16/18)

> Esta fase remove a troca por claim. Como `get_db()` já resolve para `default` (=PROD) fora de requisição e o front PROD nunca passa `?env=hml`, o comportamento do PROD permanece idêntico após a remoção.

### Task 4: Substituir `get_env()` pela constante de deployment `settings.APP_ENV`

**Files:**
- Modify: `backend/usuarios/auth.py:12,41`
- Modify: `backend/usuarios/views.py:7,116`
- Modify: `backend/registro/views.py:19,661`

**Interfaces:**
- Consumes: `settings.APP_ENV` (já existe em `settings.py:14`, default `"prod"`).
- Produces: claim `env` do JWT e campo `env` de `/auth/me` passam a refletir `APP_ENV` do deployment; faixa do PDF idem.

- [ ] **Step 1: `usuarios/auth.py` — trocar import e uso**

Remover `from registro.db_context import get_env` (linha 12). Adicionar no topo `from django.conf import settings`. Trocar linha 41:

```python
        token["env"] = settings.APP_ENV
```

- [ ] **Step 2: `usuarios/views.py` — trocar import e uso**

Remover `from registro.db_context import get_env` (linha 7). Garantir `from django.conf import settings` no arquivo. Trocar linha 116:

```python
            "env": settings.APP_ENV,
```

- [ ] **Step 3: `registro/views.py` — trocar import e uso**

Remover `from .db_context import get_env` (linha 19). Garantir `from django.conf import settings`. Trocar linha 661:

```python
    env_nome    = settings.APP_ENV
```

(As linhas 662-663 que comparam `== "hml"` permanecem válidas.)

- [ ] **Step 4: Verificar que não restou referência a `get_env`**

Run: `cd backend && grep -rn "get_env" --include=*.py . | grep -v db_context.py`
Expected: nenhuma saída.

- [ ] **Step 5: Commit**

```bash
git add backend/usuarios/auth.py backend/usuarios/views.py backend/registro/views.py
git commit -m "refactor(env): env do deployment via APP_ENV em vez da claim/thread-local"
```

### Task 5: Remover `get_db()` de `models.py` (transações no banco default)

**Files:**
- Modify: `backend/registro/models.py:10,172,346,439`

**Interfaces:**
- Produces: `transaction.atomic()` sem `using=` → usa o banco `default` (único após a separação).

- [ ] **Step 1: Remover o import**

Remover `from registro.db_context import get_db` (linha 10).

- [ ] **Step 2: Trocar as três transações**

Em `models.py:172`, `:346`, `:439`, trocar:

```python
        with transaction.atomic(using=get_db()):
```
por:
```python
        with transaction.atomic():
```

- [ ] **Step 3: Verificar ausência de `get_db`**

Run: `cd backend && grep -rn "get_db" --include=*.py . | grep -v db_context.py`
Expected: nenhuma saída.

- [ ] **Step 4: Commit**

```bash
git add backend/registro/models.py
git commit -m "refactor(db): transações no banco default após remover switch de ambiente"
```

### Task 6: Reduzir `DATABASES` a um único banco e remover o router

**Files:**
- Modify: `backend/conf/settings.py:189-219`

**Interfaces:**
- Produces: `DATABASES` com apenas `default` lido de `DB_*`; sem `DATABASE_ROUTERS`.

- [ ] **Step 1: Substituir o bloco de `DATABASES`**

Trocar `settings.py:190-210` (bloco postgres com `default` + `hml`) por apenas o `default`:

```python
if DB_ENGINE == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME", "scale"),
            "USER": env("DB_USER", "scale"),
            "PASSWORD": env("DB_PASSWORD", "scale"),
            "HOST": env("DB_HOST", "db"),
            "PORT": env("DB_PORT", "5432"),
            "CONN_MAX_AGE": int(env("DB_CONN_MAX_AGE", "60")),
        },
    }
```

- [ ] **Step 2: Remover a linha de routers**

Apagar `settings.py:219`:

```python
DATABASE_ROUTERS = ["registro.db_router.EnvRouter"]
```

- [ ] **Step 3: Remover o middleware do switch da lista `MIDDLEWARE`**

Apagar `settings.py:113`:

```python
    "registro.middleware_env.EnvSwitchMiddleware",
```

- [ ] **Step 4: Verificar configuração do Django**

Run: `cd backend && SECRET_KEY=dummy DB_ENGINE=sqlite python manage.py check`
Expected: `System check identified no issues`.

- [ ] **Step 5: Commit**

```bash
git add backend/conf/settings.py
git commit -m "refactor(settings): banco único e remoção do DATABASE_ROUTERS de ambiente"
```

### Task 7: Apagar os módulos do switch

**Files:**
- Delete: `backend/registro/middleware_env.py`
- Delete: `backend/registro/db_router.py`
- Delete: `backend/registro/db_context.py`

**Interfaces:**
- Consumes: confirmação de que Tasks 4–6 removeram todos os importadores.

- [ ] **Step 1: Confirmar que não há importadores remanescentes**

Run: `cd backend && grep -rn "middleware_env\|db_router\|db_context" --include=*.py .`
Expected: nenhuma saída.

- [ ] **Step 2: Apagar os arquivos**

```bash
git rm backend/registro/middleware_env.py backend/registro/db_router.py backend/registro/db_context.py
```

- [ ] **Step 3: Rodar a suíte de testes do backend**

Run: `cd backend && SECRET_KEY=dummy DB_ENGINE=sqlite python -m pytest -q`
Expected: PASS (sem ImportError; testes existentes verdes).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(env): remover módulos de troca de banco por claim (middleware_env, db_router, db_context)"
```

### Task 8: Remover o `?env=` do endpoint de login

**Files:**
- Modify: `backend/usuarios/auth.py` (método `post` de `TokenWithFlagsView`)

**Interfaces:**
- Produces: login ignora qualquer query param `env`; o ambiente é o do deployment.

- [ ] **Step 1: Confirmar que o login não lê `env`**

O `post` atual não lê `request.GET["env"]` diretamente — a leitura estava no `EnvSwitchMiddleware` (já removido na Task 6/7). Verificar:

Run: `cd backend && grep -rn 'GET.get("env"\|GET\["env"\|query_params.*env' --include=*.py .`
Expected: nenhuma saída. Se houver, remover a leitura.

- [ ] **Step 2: Commit (se houve alteração)**

```bash
git add backend/usuarios/auth.py
git commit -m "refactor(auth): login não depende mais de ?env="
```

---

## FASE 3 — Frontend por build (Risco 16: cookies/origem)

### Task 9: Ambiente dirigido por `VITE_APP_ENV`, remover seletor e claim

**Files:**
- Modify: `frontend/src/services/api.js:30-45,199-202`
- Modify: `frontend/src/components/Login.jsx:29,61,243,248`
- Modify: `frontend/src/components/Layout.jsx:49-51`
- Modify: `frontend/src/components/Sobre.jsx:16,22`
- Create: `frontend/src/lib/appEnv.js`

**Interfaces:**
- Produces: helper `getAppEnv()` que retorna `'hml'` ou `'prod'` a partir de `import.meta.env.VITE_APP_ENV` (default `'prod'`). Badge e watermark consomem ele.

- [ ] **Step 1: Criar helper `frontend/src/lib/appEnv.js`**

```javascript
// frontend/src/lib/appEnv.js
// Ambiente fixo por build (Vite). Não depende mais do token nem de localStorage.
export function getAppEnv() {
  const v = (import.meta.env?.VITE_APP_ENV || 'prod').toLowerCase()
  return v === 'hml' ? 'hml' : 'prod'
}
```

- [ ] **Step 2: `api.js` — remover persistência de `app_env` e o `?env=` do login**

- Remover, em `login` (linhas 199-202), o parâmetro `env` e o `?env=${envParam}`. A chamada passa a ser `POST {baseUsuarios}/auth/login/`.
- Remover a leitura `payload.env`/`localStorage.setItem("app_env", ...)` (linhas 30-34) e `localStorage.removeItem("app_env")` (linha 45).

- [ ] **Step 3: `Login.jsx` — remover o seletor de ambiente**

Remover o estado `const [env, setEnv] = useState('prod')` (linha 29), o `env,` enviado no login (linha 61) e o bloco de UI do seletor de ambiente (linhas ~243-248 e o container dos botões prod/hml).

- [ ] **Step 4: `Layout.jsx` — badge a partir do helper**

Trocar `getActiveEnv` (linhas 49-51) para:

```javascript
import { getAppEnv } from '../lib/appEnv'
function getActiveEnv() {
  return getAppEnv()
}
```

(O resto do componente que compara `activeEnv === 'hml'` permanece.)

- [ ] **Step 5: `Sobre.jsx` — badge a partir do helper**

Trocar a inicialização (linha 16) e o listener de `storage` (linhas 22) por:

```javascript
import { getAppEnv } from '../lib/appEnv'
const [activeEnv] = useState(getAppEnv())
```

(Remover o `useEffect` que escutava `app_env` no `storage`.)

- [ ] **Step 6: Build do frontend**

Run: `cd frontend && pnpm install && VITE_APP_ENV=prod pnpm run build`
Expected: build conclui sem erro; sem referências quebradas a `app_env`.

- [ ] **Step 7: Verificar ausência de `app_env`**

Run: `cd frontend && grep -rn "app_env" src/`
Expected: nenhuma saída.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/appEnv.js frontend/src/services/api.js frontend/src/components/Login.jsx frontend/src/components/Layout.jsx frontend/src/components/Sobre.jsx
git commit -m "refactor(frontend): ambiente por build (VITE_APP_ENV), remover seletor e claim env"
```

### Task 10: Variáveis de build do frontend por ambiente

**Files:**
- Modify: `frontend/.env.example`
- Modify: `frontend/Dockerfile` (aceitar `VITE_APP_ENV` e `VITE_API_BASE_URL` como build args)

**Interfaces:**
- Consumes: build arg `VITE_APP_ENV`, `VITE_API_BASE_URL`.

- [ ] **Step 1: Documentar as vars em `frontend/.env.example`**

Adicionar:

```
VITE_API_BASE_URL=https://apiscale.laboratoriosobral.com.br/api
VITE_APP_ENV=prod
```

- [ ] **Step 2: Aceitar build args no `frontend/Dockerfile`**

Antes do `pnpm run build`, adicionar:

```dockerfile
ARG VITE_API_BASE_URL
ARG VITE_APP_ENV=prod
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_ENV=$VITE_APP_ENV
```

- [ ] **Step 3: Validar build com args HML**

Run: `cd frontend && docker build --build-arg VITE_APP_ENV=hml --build-arg VITE_API_BASE_URL=https://apihml-scale.laboratoriosobral.com.br/api -t scale_frontend_hml_test .`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add frontend/.env.example frontend/Dockerfile
git commit -m "feat(frontend): build args VITE_APP_ENV e VITE_API_BASE_URL por ambiente"
```

---

## FASE 4 — Split de infra: compose, env e credenciais (Riscos 16/18)

### Task 11: Compose parametrizável + `.env.prod`/`.env.hml` + credenciais isoladas

**Files:**
- Modify: `docker-compose.yml` (remover bloco/vars HML do serviço `db`; tornar build args do frontend parametrizáveis; portas via env)
- Modify: `.env.example` (renomear PROD para `scale_prod`; remover seção HML; documentar `APP_ENV`, `COMPOSE_PROJECT_NAME`, `NGINX_BIND`, `GUNICORN_*`)
- Delete: `docker/postgres-init/01_create_hml_db.sh`
- Create (no servidor, NÃO versionar): `.env.prod`, `.env.hml`

**Interfaces:**
- Produces: uma stack por ambiente via `docker compose -p <projeto> --env-file <arquivo> up -d --build`. Cada projeto cria seu próprio `db`, `redis` e volumes (prefixados pelo nome do projeto → isolamento automático de storage/cache).

- [ ] **Step 1: Limpar o serviço `db` no `docker-compose.yml`**

Remover do serviço `db` as variáveis `DB_NAME_HML/DB_USER_HML/DB_PASSWORD_HML` (linhas 103-105) e o mount do init script (`./docker/postgres-init:...`, linha 108). O `db` passa a hospedar **um** banco por stack.

- [ ] **Step 2: Parametrizar o bind do nginx e o build do frontend**

No serviço `nginx`, trocar a porta fixa por env:

```yaml
    ports:
      - "127.0.0.1:${NGINX_BIND:-8091}:80"
```

No serviço `frontend`, adicionar build args:

```yaml
  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL}
        VITE_APP_ENV: ${APP_ENV:-prod}
```

- [ ] **Step 3: Apagar o init script de HML**

```bash
git rm docker/postgres-init/01_create_hml_db.sh
```

- [ ] **Step 4: Atualizar `.env.example`**

- `DB_NAME=scale_prod`, `POSTGRES_DB=scale_prod` (manual §12.3).
- **Usuário de aplicação não-superuser** (criar `scale_app` em vez de usar `POSTGRES_USER`); manter `POSTGRES_USER` só para administração.
- Remover toda a seção `# ——— Banco HML (opcional) ———` (linhas 62-67 do exemplo).
- Adicionar:

```
APP_ENV=prod
COMPOSE_PROJECT_NAME=scale_prod
NGINX_BIND=8091
GUNICORN_WORKERS=3
GUNICORN_TIMEOUT=120
```

- [ ] **Step 5: Validar o compose para os dois projetos**

Run:
```bash
docker compose -p scale_prod --env-file .env.prod config >/dev/null && echo PROD_OK
docker compose -p scale_hml  --env-file .env.hml  config >/dev/null && echo HML_OK
```
Expected: `PROD_OK` e `HML_OK`.

- [ ] **Step 6: Subir a stack HML isolada na VPS (aditivo, não toca PROD)**

Run (na VPS):
```bash
docker compose -p scale_hml --env-file .env.hml up -d --build
docker compose -p scale_hml --env-file .env.hml exec backend python manage.py migrate
docker compose -p scale_hml --env-file .env.hml exec backend python manage.py createsuperuser
```
Expected: containers `scale_hml_*` no ar; migração aplicada **no banco HML** (resolve o achado de migração do Risco 19).

- [ ] **Step 7: Redeploy do PROD com `.env.prod` e projeto nomeado**

Run (na VPS, em janela de manutenção):
```bash
docker compose -p scale_prod --env-file .env.prod up -d --build
```
Expected: PROD no ar com nome de projeto `scale_prod`; dados preservados (mesmo volume de dados — ver nota de migração de volume abaixo).

> **Nota de migração de volume (PROD):** ao renomear o projeto compose, o nome dos volumes muda (`scale_db_data` → `scale_prod_db_data`). **Antes** do Step 7, fazer backup (`pg_dump`) e planejar uma destas: (a) restaurar o dump no volume novo, ou (b) declarar o volume existente como `external` no compose para reaproveitá-lo. Detalhar com o responsável de infra; **não** subir sem backup confirmado (manual §10.4).

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(infra): compose parametrizado por projeto; PROD=scale_prod; remover HML do db compartilhado"
```

---

## FASE 5 — Edge + subdomínios HML (Risco 18 §12.2)

### Task 12: Roteamento dos subdomínios HML

**Files:**
- Modify: `nginx/nginx.conf` (server_name aceitando os hosts HML quando aplicável)
- Doc/infra: configuração do edge (Cloudflare) e proxy de host — **AÇÃO DO USUÁRIO**

**Interfaces:**
- Produces: `hml-scale.laboratoriosobral.com.br` e `apihml-scale.laboratoriosobral.com.br` servidos pela stack `scale_hml` (bind `NGINX_BIND=8092`).

- [ ] **Step 1: Garantir que o nginx de cada stack responda ao host do seu ambiente**

Como cada stack tem seu próprio container nginx, o nginx da stack HML pode manter os mesmos blocos genéricos. Ajustar `server_name` da stack HML para incluir os hosts HML (via template/env ou um `nginx.hml.conf`). Opção simples: aceitar ambos no `server_name` e deixar o edge decidir o roteamento por porta.

- [ ] **Step 2: Configurar o edge (AÇÃO DO USUÁRIO)**

- DNS: `hml-scale` e `apihml-scale` → IP da VPS.
- Cloudflare/host proxy: rotear esses hosts para `127.0.0.1:8092` (stack HML); PROD continua em `127.0.0.1:8091`.

- [ ] **Step 3: Verificar resolução e isolamento de origem**

Run (na VPS/cliente):
```bash
curl -skI https://apihml-scale.laboratoriosobral.com.br/healthz/
curl -skI https://apiscale.laboratoriosobral.com.br/healthz/
```
Expected: ambos `200`; cookies/origem agora distintos por subdomínio (fecha o item de cookies do Risco 16).

- [ ] **Step 4: Commit**

```bash
git add nginx/nginx.conf
git commit -m "feat(nginx): suporte aos subdomínios de HML (hml-scale/apihml-scale)"
```

---

## FASE 6 — Documentação e evidências (Riscos 16/18/19)

### Task 13: Atualizar o manual e o `.env.example` para refletir a separação real

**Files:**
- Modify: `MANUAL_OPERACAO_E_ESPECIFICACOES.md` (§4.1, §7.1, §12.2, §12.3, RNF-08/09)

- [ ] **Step 1: Ajustar o diagrama/§7.1 e §4.1**

Documentar duas stacks isoladas (`scale_prod_*` / `scale_hml_*`), cada uma com Postgres, Redis e volumes próprios; remover a menção a "banco HML opcional no mesmo `db`".

- [ ] **Step 2: Confirmar §12.3 e RNF-08**

Garantir que a tabela §12.3 e o RNF-08 (bancos, builds, credenciais e JWT secrets independentes) batem com a implementação. Documentar o comando de deploy por projeto.

- [ ] **Step 3: Commit**

```bash
git add MANUAL_OPERACAO_E_ESPECIFICACOES.md
git commit -m "docs(manual): refletir separação real de ambientes PROD/HML"
```

### Task 14: Capturar evidências de auditoria

**Files:**
- Create: `docs/2026-06-22-evidencias-isolamento-ambientes.md` (colar as saídas)

- [ ] **Step 1: Rodar e colar as evidências (na VPS)**

```bash
docker compose ls
docker ps --format '{{.Names}}'
docker volume ls | grep scale
docker network ls | grep scale
docker compose -p scale_prod --env-file .env.prod exec db psql -U <admin> -c "\l"
docker compose -p scale_hml  --env-file .env.hml  exec db psql -U <admin> -c "\l"
docker logs scale_prod-backend-1 --tail 50
docker compose -p scale_hml --env-file .env.hml exec backend python manage.py showmigrations --database=default | grep '\[ \]' || echo "sem pendências"
```
Expected: dois conjuntos isolados de containers/volumes/redes; bancos `scale_prod` e `scale_hml` em instâncias distintas; Gunicorn sem erros; sem migrações pendentes.

- [ ] **Step 2: Commit**

```bash
git add docs/2026-06-22-evidencias-isolamento-ambientes.md
git commit -m "docs(auditoria): evidências de isolamento PROD/HML (Riscos 16/18/19)"
```

---

## Self-Review (cobertura × spec)

- **Risco 16 (isolamento DB/storage/cache/cookies):** Tasks 6–7 (sem switch), 11 (DB/Redis/volumes por projeto → storage e cache isolados), 12 (subdomínios → cookies/origem isolados). ✅
- **Risco 18 (Postgres conforme arquitetura):** Tasks 6, 11 (banco `scale_prod`, instância por ambiente, usuário não-superuser, senha HML forte), 12 (subdomínios), 13 (doc). ✅
- **Risco 19 (Gunicorn config + operação):** Tasks 1–3 (config por env, `--max-requests`, healthcheck), 11 Step 6 (migração do banco HML resolvida por construção), 14 (evidência de operação sem erros). ✅
- **RNF-07 (env para parâmetros críticos):** Task 1 (workers/timeout via env). ✅
- **RNF-08 (segredos/credenciais independentes):** Tasks 4 (JWT por deployment), 11 (segredos e usuário de banco distintos). ✅
- **RNF-05/§12.3 (badge/watermark HML):** Tasks 4 (watermark via APP_ENV), 9 (badge via VITE_APP_ENV). ✅

## Pontos que exigem decisão/insumo do usuário antes de executar
1. **Migração do volume PROD** (Task 11, Step 7) — estratégia de preservação de dados (dump+restore vs volume external). **Bloqueante** para o redeploy do PROD.
2. **DNS + edge** para subdomínios HML (Task 12) — fora do código.
3. **Segredos do `.env.hml`** — gerar e guardar fora do repositório.
