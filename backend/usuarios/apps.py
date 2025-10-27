from django.apps import AppConfig
from django.db.models.signals import post_migrate
from django.db import transaction
from django.conf import settings


def ensure_defaults(sender, **kwargs):
    """
    Roda após migrate:
    - Garante que exista o papel 'admin'
    - (Opcional) Sincroniza telas a partir de settings.SCREENS_REGISTRY
    - Garante que o papel 'admin' tenha TODAS as telas
    """
    from .models import Role, Screen  # importa aqui para evitar import circular

    with transaction.atomic():
        admin_role, _ = Role.objects.get_or_create(name="admin")

        # 1) Sincroniza telas a partir do registro canônico (se existir)
        registry = getattr(settings, "SCREENS_REGISTRY", None)
        if registry:
            for code, label in registry:
                Screen.objects.get_or_create(code=code, defaults={"label": label})

        # 2) Garante que admin tenha todas as telas
        all_screens = list(Screen.objects.all())
        if all_screens:
            admin_role.screens.set(all_screens)  # idempotente


class UsuariosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'usuarios'

    def ready(self):
        # registra sinais (ex.: auto-add de nova Screen ao papel admin)
        from . import signals  # noqa: F401

        # conecta o ensure_defaults para rodar após migrações do app
        post_migrate.connect(ensure_defaults, sender=self)
