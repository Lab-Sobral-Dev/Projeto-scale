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
