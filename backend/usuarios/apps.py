# usuarios/apps.py
from django.apps import AppConfig
from django.db.models.signals import post_migrate
from django.db import transaction, connections
from django.conf import settings
from django.db.utils import ProgrammingError, OperationalError

def ensure_defaults(sender, **kwargs):
    """
    Roda após migrate:
    - Cria todas as telas do SCREENS_REGISTRY
    - Garante roles admin/supervisor/operador com telas padrão do ROLE_DEFAULT_SCREENS
    - Admin sempre recebe todas as telas
    """
    using = kwargs.get("using", "default")
    conn = connections[using]

    try:
        existing_tables = set(conn.introspection.table_names())
    except Exception:
        return

    required = {
        "usuarios_role",
        "usuarios_screen",
        "usuarios_role_screens",
        "usuarios_perfilusuario_roles",
        "usuarios_perfilusuario_extra_screens",
    }

    if not required.issubset(existing_tables):
        return

    from .models import Role, Screen

    try:
        with transaction.atomic(using=using):
            # 1. Cria/atualiza telas do registry
            registry = getattr(settings, "SCREENS_REGISTRY", None)
            if registry:
                for code, label in registry:
                    Screen.objects.using(using).get_or_create(code=code, defaults={"label": label})

            # 2. Admin recebe todas as telas
            admin_role, _ = Role.objects.using(using).get_or_create(name="admin")
            all_screens = list(Screen.objects.using(using).all())
            if all_screens:
                admin_role.screens.set(all_screens)

            # 3. Supervisor e operador recebem telas padrão (sem sobrescrever extras já atribuídos)
            role_defaults = getattr(settings, "ROLE_DEFAULT_SCREENS", {})
            for role_name, screen_codes in role_defaults.items():
                role, _ = Role.objects.using(using).get_or_create(name=role_name)
                screens = list(Screen.objects.using(using).filter(code__in=screen_codes))
                # Adiciona apenas as que ainda não estão no role (não remove customizações)
                current_ids = set(role.screens.using(using).values_list("id", flat=True))
                to_add = [s for s in screens if s.id not in current_ids]
                if to_add:
                    role.screens.add(*to_add)

    except (ProgrammingError, OperationalError):
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
