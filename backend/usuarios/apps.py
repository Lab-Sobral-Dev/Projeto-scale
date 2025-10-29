# usuarios/apps.py
from django.apps import AppConfig
from django.db.models.signals import post_migrate
from django.db import transaction, connections
from django.conf import settings
from django.db.utils import ProgrammingError, OperationalError

def ensure_defaults(sender, **kwargs):
    """
    Roda após migrate:
    - Só executa se as tabelas necessárias existirem.
    - Garante papel 'admin'
    - Cria telas do SCREENS_REGISTRY (se houver)
    - Atribui todas as telas ao papel admin
    """
    # qual banco está sendo migrado (default, etc.)
    using = kwargs.get("using", "default")
    conn = connections[using]

    try:
        existing_tables = set(conn.introspection.table_names())
    except Exception:
        # em casos muito iniciais de setup, apenas saia
        return

    required = {
        "usuarios_role",
        "usuarios_screen",
        # m2m que o Django cria (os nomes podem variar conforme o teu schema):
        "usuarios_role_screens",
        "usuarios_perfilusuario_roles",
        "usuarios_perfilusuario_extra_screens",
    }

    # se qualquer uma das tabelas essenciais não existir, não faz nada agora
    if not required.issubset(existing_tables):
        return

    from .models import Role, Screen  # importa só depois da checagem

    try:
        with transaction.atomic(using=using):
            admin_role, _ = Role.objects.using(using).get_or_create(name="admin")

            registry = getattr(settings, "SCREENS_REGISTRY", None)
            if registry:
                for code, label in registry:
                    Screen.objects.using(using).get_or_create(code=code, defaults={"label": label})

            all_screens = list(Screen.objects.using(using).all())
            if all_screens:
                admin_role.screens.set(all_screens)
    except (ProgrammingError, OperationalError):
        # se ainda assim algo falhar por ordem de migrações, silencie e deixe para a próxima execução
        return

class UsuariosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'usuarios'

    def ready(self):
        from . import signals  # registra receivers
        post_migrate.connect(ensure_defaults, sender=self)
