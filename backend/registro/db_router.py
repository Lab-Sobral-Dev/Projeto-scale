# backend/registro/db_router.py
from .db_context import get_db

# Modelos de infraestrutura global: sempre usam o banco default,
# independente do contexto de ambiente do usuário (JWT env claim).
# Isso garante que o Celery (que escreve em default) e o frontend HML
# leiam/escrevam nos mesmos registros.
_GLOBAL_MODELS = {"backuprecord", "backupconfig"}


class EnvRouter:
    """
    Roteia todas as queries ORM para o banco definido em thread-local.
    Migrations rodam em todos os bancos (ambos precisam do schema completo).
    """

    def db_for_read(self, model, **hints):
        if model._meta.model_name in _GLOBAL_MODELS:
            return "default"
        return get_db()

    def db_for_write(self, model, **hints):
        if model._meta.model_name in _GLOBAL_MODELS:
            return "default"
        return get_db()

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return True
