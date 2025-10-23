from django.apps import AppConfig


class RegistroConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'registro'

    def ready(self):
        # importa o módulo que contém seus models fora do models.py
        from .audit import audit  # noqa: F401