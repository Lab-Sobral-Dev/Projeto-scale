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
SECRET_KEY = env("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY não definida no .env. Configure antes de iniciar o servidor.")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

# CORS/CSRF (com protocolo) vindos do .env
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")
CORS_ALLOWED_ORIGIN_REGEXES = env_list(
    "CORS_ALLOWED_ORIGIN_REGEXES",
    r"^https://([a-z0-9-]+\.)?laboratoriosobral\.com\.br$",
)

# --- CORS (com credenciais) ---
# Não usar wildcard quando for trocar cookies/credenciais
CORS_ALLOW_ALL_ORIGINS = False
# Necessário quando o front usa fetch com credentials:'include'
CORS_ALLOW_CREDENTIALS = True
# Cabeçalhos aceitos
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]
# Cabeçalhos expostos ao browser (útil para downloads com filename)
CORS_EXPOSE_HEADERS = ["Content-Disposition"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Terceiros
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",  # <- NECESSÁRIO para filtros no endpoint de auditoria

    # Apps do projeto
    "registro",
    "usuarios",
    "reports",

    #celery
    "django_celery_beat",
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

    "AUTH_HEADER_TYPES": ("Bearer",),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
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
    # mínimo configurável por env, default 8
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": int(env("PASSWORD_MIN_LENGTH", "8"))},
    },
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

# settings.py
BACKUP_DIR = os.environ.get("BACKUP_DIR", "/var/backups/scale")
# Prefixo interno do Nginx para entrega segura (não público)
BACKUP_ACCEL_PREFIX = os.environ.get("BACKUP_ACCEL_PREFIX", "/protected/backups")

# (Opcional) LOGGING para HML — rotação de arquivo
if AUDIT_ENABLED:
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "handlers": {
            "audit_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": "/var/log/scale_hml/audit_app.log",
                "maxBytes": 5_000_000,
                "backupCount": 5,
                "encoding": "utf-8",
            },
            "console": {"class": "logging.StreamHandler"},
        },
        "loggers": {
            "django.request": {
                "handlers": ["audit_file", "console"],
                "level": "INFO",
                "propagate": True,
            },
        },
    }


# Broker/Backend (usando Redis)
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

CELERY_TIMEZONE = TIME_ZONE  # já deve existir
CELERY_ENABLE_UTC = False

# django-celery-beat usa o scheduler baseado em DB
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"


# =========================
# Email / Notificações
# =========================

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)

DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "noreply@laboratoriosobral.com.br")
EMAIL_SUBJECT_PREFIX = "[Scale] "

# Lista de e-mails que receberão alertas de falha de backup
# Pode ser definido como CSV no .env: BACKUP_ALERT_EMAILS=ti@sobral.com,dev@sobral.com
BACKUP_ALERT_EMAILS = env_list("BACKUP_ALERT_EMAILS", "")

# Se nenhum e-mail for configurado, usa ADMINS
ADMINS = [
    ("TI", env("ADMIN_EMAIL", "suporte@laboratoriosobral.com")),
]