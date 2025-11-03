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
        # m2m (nomes podem variar conforme o schema, mantenha estes):
        "usuarios_role_screens",
        "usuarios_perfilusuario_roles",
        "usuarios_perfilusuario_extra_screens",
    }

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


def ensure_security_backfill(sender, **kwargs):
    """
    Pós-migrate complementar:
    - Só executa quando as tabelas necessárias existirem.
    - Garante que todo usuário tenha um registro em LoginSecurity (backfill).
    - Não altera estados existentes; apenas cria o que falta.
    """
    using = kwargs.get("using", "default")
    conn = connections[using]

    try:
        existing_tables = set(conn.introspection.table_names())
    except Exception:
        return

    # Tabelas necessárias para o backfill
    required = {
        "auth_user",                 # tabela do User padrão do Django
        "usuarios_loginsecurity",    # tabela do LoginSecurity
    }
    if not required.issubset(existing_tables):
        return

    from django.contrib.auth import get_user_model
    from .models_security import LoginSecurity

    User = get_user_model()

    try:
        with transaction.atomic(using=using):
            # Seleciona apenas os usuários sem registro de segurança
            user_ids_with_sec = set(
                LoginSecurity.objects.using(using).values_list("user_id", flat=True)
            )
            missing = (
                User.objects.using(using)
                .exclude(id__in=user_ids_with_sec)
                .values_list("id", flat=True)
            )

            created = 0
            for uid in missing:
                LoginSecurity.objects.using(using).get_or_create(user_id=uid)
                created += 1

            if created:
                # Log simples via print para não depender de LOGGING em fase de migração
                print(f"[usuarios.apps] LoginSecurity backfill: criados {created} registro(s).")
    except (ProgrammingError, OperationalError):
        # Se a ordem de migrações ainda não permite, deixe para a próxima execução
        return


class UsuariosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'usuarios'

    def ready(self):
        # registra receivers (signals de perfil/telas + criação do LoginSecurity on_create)
        from . import signals  # noqa: F401

        # pós-migrate: defaults de telas/papel
        post_migrate.connect(ensure_defaults, sender=self)
        # pós-migrate: backfill de segurança (garante que todos os usuários tenham LoginSecurity)
        post_migrate.connect(ensure_security_backfill, sender=self)
