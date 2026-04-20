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
