from pathlib import Path
from datetime import timedelta
import os
from dotenv import load_dotenv

# =========================
# Paths e .env
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR.parent / ".env"  # scale/.env
load_dotenv(dotenv_path=ENV_PATH)    # <- carregar .env primeiro

# Agora, sim, ler as flags
APP_ENV = os.getenv("APP_ENV", "prod")
AUDIT_ENABLED = os.getenv("AUDIT_ENABLED", "false").strip().lower() == "true"

# =========================
# Helpers de env
# =========================
def env(key, default=None):
    return os.getenv(key, default)

def env_bool(key, default=False):
    v = os.getenv(key)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "t", "yes", "y", "on"}

def env_list(key, default=""):
    raw = os.getenv(key, default)
    return [p.strip() for p in raw.replace("\n", ",").split(",") if p.strip()]

# =========================
# Base
# =========================
SECRET_KEY = env("SECRET_KEY", "change-me-in-prod")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Terceiros
    "rest_framework",
    "corsheaders",
    "django_filters",  # <- NECESSÁRIO para filtros no endpoint de auditoria

    # Apps do projeto
    "registro",
    "usuarios",
    "reports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # <- antes de CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Inserir middlewares de auditoria somente se habilitado
if AUDIT_ENABLED:
    # inserir o RequestContext logo após o security/cors para capturar o request cedo
    MIDDLEWARE.insert(1, "registro.middleware_requestctx.RequestContextMiddleware")
    # e o de log de requisições bem no topo
    MIDDLEWARE.insert(0, "registro.middleware.AuditRequestMiddleware")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_FILTER_BACKENDS": (  # <- habilita filtros/search/order
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
}

SIMPLE_JWT = {
    # sessão controlada por env (mantido)
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(env("ACCESS_TOKEN_MINUTES", "60"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(env("REFRESH_TOKEN_DAYS", "7"))),

    # extras úteis (segue padrão seguro)
    "AUTH_HEADER_TYPES": ("Bearer",),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
}

ROOT_URLCONF = "conf.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "conf.wsgi.application"

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
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# =========================
# Política de Senhas
# =========================
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    # mínimo configurável por env, default 10
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": int(env("PASSWORD_MIN_LENGTH", "8"))}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    # Validador de complexidade (maiúscula, minúscula, dígito e símbolo)
    {"NAME": "usuarios.validators.ComplexityValidator"},
]

LANGUAGE_CODE = env("LANGUAGE_CODE", "pt-br")
TIME_ZONE = env("TIME_ZONE", "America/Fortaleza")
USE_I18N = True
USE_TZ = True

# =========================
# Static/Media
# =========================
STATIC_URL  = "static/"
STATIC_ROOT = "/app/static"
MEDIA_URL   = "/media/"
MEDIA_ROOT  = "/app/media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# =========================
# Logging de Auditoria (portável e seguro)
# =========================
if AUDIT_ENABLED:
    # Diretório dos logs: pode ser setado no .env (AUDIT_LOG_DIR).
    # Em Windows, evite C:\var\... a menos que você tenha criado e dado permissão.
    AUDIT_LOG_DIR = Path(env("AUDIT_LOG_DIR", str(BASE_DIR / "logs" / "scale_hml")))

    # Garante a criação do diretório antes de o dictConfig rodar
    try:
        AUDIT_LOG_DIR.mkdir(parents=True, exist_ok=True)
        AUDIT_LOG_PATH = AUDIT_LOG_DIR / "audit_app.log"
        AUDIT_HANDLER_CLASS = "logging.handlers.RotatingFileHandler"
    except Exception:
        # Fallback: se por algum motivo não puder criar diretório, não quebre o Django.
        AUDIT_LOG_PATH = None
        AUDIT_HANDLER_CLASS = "logging.NullHandler"

    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "audit_verbose": {
                "format": "[{asctime}] {levelname} {name} {process:d} {thread:d} – {message}",
                "style": "{",
            },
            "simple": {"format": "{levelname} {message}", "style": "{"},
        },
        "handlers": {
            "audit_file": {
                "class": AUDIT_HANDLER_CLASS,
                # Só define filename se não estiver em NullHandler
                **({"filename": str(AUDIT_LOG_PATH)} if AUDIT_LOG_PATH else {}),
                "maxBytes": 5_000_000,
                "backupCount": 5,
                "encoding": "utf-8",
                "delay": True,  # evita abrir arquivo no bootstrap
                "formatter": "audit_verbose",
            },
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "simple",
            },
        },
        "loggers": {
            # Logger específico para sua trilha de auditoria (use-o nas views/middlewares)
            "audit": {
                "handlers": ["audit_file", "console"],
                "level": "INFO",
                "propagate": False,
            },
            # Se quiser também capturar requisições do Django
            "django.request": {
                "handlers": ["audit_file", "console"],
                "level": "INFO",
                "propagate": True,
            },
        },
    }
