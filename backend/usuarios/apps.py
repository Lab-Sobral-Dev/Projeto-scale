from django.apps import AppConfig
from django.db.models.signals import post_migrate
from django.db import transaction
from django.conf import settings

def ensure_defaults(sender, **kwargs):
    from .models import Role, Screen
    with transaction.atomic():
        admin_role, _ = Role.objects.get_or_create(name="admin")
        registry = getattr(settings, "SCREENS_REGISTRY", None)
        if registry:
            for code, label in registry:
                Screen.objects.get_or_create(code=code, defaults={"label": label})
        admin_role.screens.set(list(Screen.objects.all()))

class UsuariosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'usuarios'
    def ready(self):
        from . import signals  # <- garante o registro dos receivers
        post_migrate.connect(ensure_defaults, sender=self)
