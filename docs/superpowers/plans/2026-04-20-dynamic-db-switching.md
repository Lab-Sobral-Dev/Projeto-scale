# Dynamic Database Switching (HML ↔ PROD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário selecione o ambiente (HML ou PROD) na tela de login, roteando automaticamente todas as queries para o banco correto via thread-local + Database Router do Django, com badge visual dinâmico no frontend.

**Architecture:**
O Django mantém dois aliases de banco (`default` = PROD, `hml` = HML) configurados em `settings.py`. Um middleware (`EnvSwitchMiddleware`) lê o `env` do query param no login ou da claim do JWT nas demais requisições, e armazena o alias em thread-local. Um `EnvRouter` lê esse thread-local em cada operação ORM, roteando transparentemente para o banco correto. O frontend envia `?env=hml` no login, recebe o claim `env` no JWT e exibe um badge colorido persistente.

**Tech Stack:** Django 5.2 · DRF · SimpleJWT · ThreadLocal · React 19 · TailwindCSS · Radix UI

---

## Variáveis de Ambiente (`.env`)

Adicionar ao `.env` existente:

```dotenv
# === Banco HML (Homologação) ===
DB_NAME_HML=scale_hml
DB_USER_HML=scale_hml
DB_PASSWORD_HML=SENHA_SEGURA_HML
DB_HOST_HML=db          # mesmo host postgres
DB_PORT_HML=5432
```

As variáveis PROD já existem (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`).
**As credenciais de PROD nunca são enviadas ao frontend** — apenas a string `"prod"` ou `"hml"` viaja no JWT.

---

## Mapa de Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `backend/registro/db_context.py` |
| Criar | `backend/registro/db_router.py` |
| Criar | `backend/registro/middleware_env.py` |
| Criar | `docker/postgres-init/01_create_hml_db.sh` |
| Modificar | `backend/conf/settings.py` |
| Modificar | `backend/usuarios/auth.py` |
| Modificar | `backend/usuarios/views.py` |
| Modificar | `docker-compose.yml` |
| Modificar | `frontend/src/components/Login.jsx` |
| Modificar | `frontend/src/components/Layout.jsx` |
| Modificar | `frontend/src/services/api.js` |

---

## Task 1: Thread-local context + Database Router

**Files:**
- Create: `backend/registro/db_context.py`
- Create: `backend/registro/db_router.py`

- [ ] **Step 1: Criar `db_context.py`**

```python
# backend/registro/db_context.py
import threading

_local = threading.local()

# Mapa canônico: env_name -> db_alias e inverso
ENV_TO_ALIAS: dict[str, str] = {
    "prod": "default",
    "hml": "hml",
}
ALIAS_TO_ENV: dict[str, str] = {v: k for k, v in ENV_TO_ALIAS.items()}


def set_db(alias: str) -> None:
    _local.db = alias


def get_db() -> str:
    return getattr(_local, "db", "default")


def clear_db() -> None:
    _local.db = "default"


def get_env() -> str:
    """Retorna o nome do ambiente ativo ('prod' ou 'hml')."""
    return ALIAS_TO_ENV.get(get_db(), "prod")
```

- [ ] **Step 2: Criar `db_router.py`**

```python
# backend/registro/db_router.py
from .db_context import get_db


class EnvRouter:
    """
    Roteia todas as queries ORM para o banco definido em thread-local.
    Migrations rodam em todos os bancos (ambos precisam do schema completo).
    """

    def db_for_read(self, model, **hints):
        return get_db()

    def db_for_write(self, model, **hints):
        return get_db()

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return True
```

- [ ] **Step 3: Commit**

```bash
git add backend/registro/db_context.py backend/registro/db_router.py
git commit -m "feat: add thread-local db context and EnvRouter"
```

---

## Task 2: Settings — segundo banco + registro do router

**Files:**
- Modify: `backend/conf/settings.py`

- [ ] **Step 1: Adicionar segundo banco e DATABASE_ROUTERS**

Localizar o bloco `DATABASES` em `settings.py` (atualmente só tem `default` e `sqlite3`) e substituir por:

```python
# =========================
# Banco de Dados
# =========================
DB_ENGINE = env("DB_ENGINE", "postgres")
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
        "hml": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME_HML", ""),
            "USER": env("DB_USER_HML", ""),
            "PASSWORD": env("DB_PASSWORD_HML", ""),
            "HOST": env("DB_HOST_HML", env("DB_HOST", "db")),
            "PORT": env("DB_PORT_HML", env("DB_PORT", "5432")),
            "CONN_MAX_AGE": int(env("DB_CONN_MAX_AGE", "60")),
        },
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

DATABASE_ROUTERS = ["registro.db_router.EnvRouter"]
```

- [ ] **Step 2: Commit**

```bash
git add backend/conf/settings.py
git commit -m "feat: add HML database config and EnvRouter registration"
```

---

## Task 3: EnvSwitchMiddleware

**Files:**
- Create: `backend/registro/middleware_env.py`
- Modify: `backend/conf/settings.py` (registrar middleware)

- [ ] **Step 1: Criar `middleware_env.py`**

```python
# backend/registro/middleware_env.py
import logging

from .db_context import ENV_TO_ALIAS, set_db, clear_db

logger = logging.getLogger(__name__)


class EnvSwitchMiddleware:
    """
    Define o banco ativo (thread-local) por requisição:
    - Login (/auth/login/): lê ?env= do query param.
    - Demais endpoints: lê claim 'env' do JWT (sem validar assinatura —
      a validação completa acontece no JWTAuthentication do DRF).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_db(self._resolve_alias(request))
        try:
            return self.get_response(request)
        finally:
            clear_db()

    def _resolve_alias(self, request) -> str:
        # Prioridade 1: query param (usado no endpoint de login)
        env_param = request.GET.get("env", "").strip().lower()
        if env_param in ENV_TO_ALIAS:
            return ENV_TO_ALIAS[env_param]

        # Prioridade 2: claim 'env' no JWT (sem validar assinatura aqui)
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Bearer "):
            try:
                from rest_framework_simplejwt.tokens import AccessToken
                token = AccessToken(auth.split(" ", 1)[1])
                env_claim = str(token.get("env", "prod")).lower()
                return ENV_TO_ALIAS.get(env_claim, "default")
            except Exception as e:
                logger.debug("EnvSwitchMiddleware: token decode failed: %s", e)

        return "default"
```

- [ ] **Step 2: Registrar o middleware em `settings.py`**

Adicionar `"registro.middleware_env.EnvSwitchMiddleware"` como **primeiro** middleware da lista (antes do `SecurityMiddleware`), para garantir que o banco esteja definido antes de qualquer outra camada:

```python
MIDDLEWARE = [
    "registro.middleware_env.EnvSwitchMiddleware",  # <- PRIMEIRO
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

if AUDIT_ENABLED:
    MIDDLEWARE.insert(1, "registro.middleware_requestctx.RequestContextMiddleware")
    MIDDLEWARE.insert(0, "registro.middleware.AuditRequestMiddleware")
```

- [ ] **Step 3: Commit**

```bash
git add backend/registro/middleware_env.py backend/conf/settings.py
git commit -m "feat: add EnvSwitchMiddleware — routes DB per request via JWT claim or query param"
```

---

## Task 4: Claim `env` no JWT

**Files:**
- Modify: `backend/usuarios/auth.py`

- [ ] **Step 1: Adicionar `env` claim em `TokenWithFlagsSerializer.get_token()`**

Localizar a classe `TokenWithFlagsSerializer` em `backend/usuarios/auth.py` e adicionar a claim `env` ao final do método `get_token()`:

```python
# backend/usuarios/auth.py
from registro.db_context import get_env   # <- adicionar este import

class TokenWithFlagsSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        sec = _sec(user)

        token["must_change_password"] = bool(sec.must_change_password)
        token["password_expired"] = bool(sec.is_password_expired())

        perfil = getattr(user, "perfil", None)
        if perfil and hasattr(perfil, "get_allowed_screens"):
            token["allowed_screens"] = perfil.get_allowed_screens()

        token["username"] = user.username
        token["is_staff"] = user.is_staff

        # Ambiente ativo no momento do login (lido do thread-local já setado pelo middleware)
        token["env"] = get_env()   # <- ADICIONAR

        return token
```

> **Por que funciona:** O `EnvSwitchMiddleware` já setou o thread-local antes da view ser chamada. Quando `get_token()` executa, `get_env()` retorna corretamente `"hml"` ou `"prod"`.

- [ ] **Step 2: Commit**

```bash
git add backend/usuarios/auth.py
git commit -m "feat: add env claim to JWT — records active database environment"
```

---

## Task 5: MeView retorna `env`

**Files:**
- Modify: `backend/usuarios/views.py`

- [ ] **Step 1: Adicionar `env` na resposta do `MeView`**

Localizar `MeView.get()` em `backend/usuarios/views.py` e adicionar o campo `env`:

```python
# backend/usuarios/views.py
from registro.db_context import get_env   # <- adicionar este import

class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        u = request.user
        perfil = getattr(u, 'perfil', None)
        nome = (u.get_full_name() or '').strip() or u.username

        if perfil and getattr(perfil, 'papel', None):
            tipo = perfil.papel
        else:
            tipo = 'operador'

        allowed = perfil.get_allowed_screens() if perfil else []

        return Response({
            "id": u.id,
            "username": u.username,
            "usuario": u.username,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "nome_exibicao": nome,
            "tipo": tipo,
            "is_staff": u.is_staff,
            "is_superuser": u.is_superuser,
            "allowed_screens": allowed,
            "env": get_env(),   # <- ADICIONAR: "prod" ou "hml"
        })
```

- [ ] **Step 2: Commit**

```bash
git add backend/usuarios/views.py
git commit -m "feat: MeView returns active env — allows frontend to always know current environment"
```

---

## Task 6: Banco HML — criação automática no Docker

**Files:**
- Create: `docker/postgres-init/01_create_hml_db.sh`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Criar script de inicialização do banco HML**

```bash
mkdir -p docker/postgres-init
```

Criar `docker/postgres-init/01_create_hml_db.sh`:

```bash
#!/bin/bash
# Cria o banco HML se ainda não existir.
# Executado automaticamente pelo postgres na primeira inicialização do volume.
set -e

HML_DB="${DB_NAME_HML:-scale_hml}"
HML_USER="${DB_USER_HML:-scale_hml}"
HML_PASSWORD="${DB_PASSWORD_HML:-scale_hml}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    -- Cria usuário HML (se não existir)
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${HML_USER}') THEN
            CREATE USER ${HML_USER} WITH PASSWORD '${HML_PASSWORD}';
        END IF;
    END
    \$\$;

    -- Cria banco HML (se não existir)
    SELECT 'CREATE DATABASE ${HML_DB} OWNER ${HML_USER}'
    WHERE NOT EXISTS (
        SELECT FROM pg_database WHERE datname = '${HML_DB}'
    )\gexec

    GRANT ALL PRIVILEGES ON DATABASE ${HML_DB} TO ${HML_USER};
EOSQL

echo "Banco HML '${HML_DB}' verificado/criado com sucesso."
```

```bash
chmod +x docker/postgres-init/01_create_hml_db.sh
```

- [ ] **Step 2: Atualizar `docker-compose.yml` — montar script de init**

Adicionar o volume de init ao serviço `db`:

```yaml
  db:
    image: postgres:15
    container_name: scale_db
    restart: unless-stopped
    env_file:
      - .env
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME_HML: ${DB_NAME_HML:-scale_hml}
      DB_USER_HML: ${DB_USER_HML:-scale_hml}
      DB_PASSWORD_HML: ${DB_PASSWORD_HML:-scale_hml}
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro   # <- ADICIONAR
```

> **Nota:** `docker-entrypoint-initdb.d` só executa na **primeira inicialização** do volume. Para ambientes já em produção, rodar manualmente:
> ```bash
> docker compose exec db psql -U $POSTGRES_USER -c "CREATE DATABASE scale_hml OWNER scale_hml;"
> ```

- [ ] **Step 3: Rodar migrations no banco HML**

Após subir os containers:

```bash
docker compose exec backend python manage.py migrate --database=hml
```

Expected output: todas as migrations aplicadas no banco `scale_hml`.

- [ ] **Step 4: Commit**

```bash
git add docker/postgres-init/01_create_hml_db.sh docker-compose.yml
git commit -m "feat: add postgres init script and docker-compose volume for HML database auto-creation"
```

---

## Task 7: Frontend — seletor de ambiente no Login

**Files:**
- Modify: `frontend/src/components/Login.jsx`
- Modify: `frontend/src/services/api.js`

- [ ] **Step 1: Atualizar `api.js` — passar `env` como query param no login**

Localizar o método `login()` em `frontend/src/services/api.js` e substituir:

```js
// frontend/src/services/api.js
async login({ username, password, env = "prod" }) {
  const envParam = ["prod", "hml"].includes(env) ? env : "prod";
  const data = await this.request(
    `${this.baseUsuarios}/auth/login/?env=${envParam}`,
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
    { retry: false }
  );
  if (data?.access) this.setTokens({ access: data.access, refresh: data.refresh });
  return data;
}
```

- [ ] **Step 2: Adicionar persistência do `env` em `setTokens()`**

Atualizar `setTokens()` para também salvar o env em localStorage quando presente:

```js
setTokens({ access, refresh }) {
  if (access) localStorage.setItem("access", access);
  if (refresh) localStorage.setItem("refresh", refresh);
  // Extrai env da claim do JWT e persiste para o badge do Layout
  if (access) {
    try {
      const payload = JSON.parse(atob(access.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload?.env) localStorage.setItem("app_env", payload.env);
    } catch {
      // JWT malformado — ignora
    }
  }
}
```

E atualizar `clearTokens()` para limpar o env:

```js
clearTokens() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("allowed_screens");
  localStorage.removeItem("pwd_flags");
  localStorage.removeItem("app_env");   // <- ADICIONAR
}
```

- [ ] **Step 3: Atualizar `Login.jsx` — adicionar seletor de ambiente**

Substituir o componente completo `Login.jsx` (as seções de state e JSX; manter a lógica de `decodeJwt`, `handleChange` e tratamento de erros inalterados):

**Adicionar ao state:**
```jsx
const [env, setEnv] = useState('prod')
```

**Atualizar a chamada de login no `handleSubmit`:**
```jsx
const tokens = await api.login({
  username: formData.usuario.trim(),
  password: formData.senha,
  env,              // <- ADICIONAR
})
```

**Inserir o seletor de ambiente no JSX**, logo abaixo do campo de senha e antes do `{error && ...}`:

```jsx
{/* Seletor de ambiente */}
<div className="space-y-2">
  <Label className="text-sm font-medium text-slate-700">Ambiente</Label>
  <div className="flex gap-3">
    {[
      { value: 'prod', label: 'Produção', color: 'blue' },
      { value: 'hml',  label: 'Homologação', color: 'orange' },
    ].map(({ value, label, color }) => (
      <button
        key={value}
        type="button"
        onClick={() => setEnv(value)}
        disabled={loading}
        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all
          ${env === value
            ? color === 'orange'
              ? 'bg-orange-50 border-orange-400 text-orange-700 shadow-sm'
              : 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm'
            : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
      >
        <span className={`inline-block h-2 w-2 rounded-full mr-2 ${
          env === value
            ? color === 'orange' ? 'bg-orange-500' : 'bg-blue-500'
            : 'bg-slate-300'
        }`} />
        {label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.js frontend/src/components/Login.jsx
git commit -m "feat: add environment selector to login — sends env query param and persists in localStorage"
```

---

## Task 8: Frontend — badge de ambiente dinâmico no Layout

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Ler env do localStorage e tornar badge dinâmico**

Adicionar no início do componente `Layout`, após os imports:

```jsx
// Lê o ambiente ativo — persiste durante toda a sessão
function getActiveEnv() {
  return localStorage.getItem("app_env") || "prod"
}
```

Adicionar ao state do `Layout`:

```jsx
const [activeEnv, setActiveEnv] = useState(getActiveEnv)
```

Adicionar um `useEffect` para sincronizar quando o usuário muda (ex.: re-login):

```jsx
useEffect(() => {
  setActiveEnv(getActiveEnv())
}, [user])
```

- [ ] **Step 2: Substituir o badge hardcoded por um dinâmico**

Localizar as duas ocorrências do badge "Homologação" em `Layout.jsx` (sidebar mobile linha ~199 e topbar linha ~308) e substituir ambas por:

**Badge na sidebar mobile** (substituir o `<span>` com "v1.0 Homologação"):
```jsx
<span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
  activeEnv === 'hml'
    ? 'text-orange-700 bg-orange-50 border-orange-200'
    : 'text-blue-700 bg-blue-50 border-blue-200'
}`}>
  {activeEnv === 'hml' ? 'Homologação' : 'Produção'}
</span>
```

**Badge pill centralizado na topbar** (substituir o `<span>` com `animate-pulse`):
```jsx
<div className="absolute inset-x-0 flex justify-center items-center pointer-events-none">
  <span className={`inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full border shadow-sm ${
    activeEnv === 'hml'
      ? 'bg-orange-50/90 text-orange-700 border-orange-200'
      : 'bg-blue-50/90 text-blue-700 border-blue-200'
  }`}>
    <span className={`h-2 w-2 rounded-full animate-pulse ${
      activeEnv === 'hml' ? 'bg-orange-500' : 'bg-blue-500'
    }`} />
    {activeEnv === 'hml' ? 'Homologação' : 'Produção'}
  </span>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.jsx
git commit -m "feat: dynamic environment badge in Layout — orange for HML, blue for PROD"
```

---

## Verificação Final

- [ ] **Backend:** Subir containers e verificar que login com `?env=hml` roteia para `scale_hml`

```bash
docker compose up -d
# Testar login HML:
curl -X POST "http://localhost:8091/api/usuarios/auth/login/?env=hml" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "senha"}' | python -m json.tool
# Verificar claim 'env' no JWT retornado (decodificar o access token)
```

- [ ] **Migrations HML:**

```bash
docker compose exec backend python manage.py migrate --database=hml
```

Expected: todas as migrations aplicadas.

- [ ] **Frontend:** Abrir `/login`, selecionar "Homologação", logar e verificar badge laranja na topbar.

- [ ] **Verificar isolamento:** Dados criados em HML não aparecem quando logado em PROD e vice-versa.

---

## Notas de Segurança

- As credenciais de PROD (`DB_PASSWORD`) **nunca** chegam ao frontend — apenas a string `"prod"` viaja no JWT assinado.
- O `EnvSwitchMiddleware` decodifica o JWT apenas para ler a claim `env` sem validar a assinatura. A validação completa (assinatura, expiração) continua sendo feita pelo `JWTAuthentication` do DRF. Um token forjado com `env=hml` chegaria ao banco HML mas seria rejeitado na autenticação — sem acesso a dados.
- Troca de ambiente exige **novo login** — não é possível mudar o banco durante uma sessão existente sem reautenticar.
- Workers Celery sempre usam o banco `default` (PROD), pois não recebem JWT. Tasks que precisem operar em HML devem receber o `db_alias` como parâmetro explícito.
