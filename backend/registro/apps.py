# backend/registro/apps.py
from django.apps import AppConfig

class RegistroConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'registro'

    def ready(self):
        # 1. Importa os sinais para registrar os @receiver da auditoria
        import registro.signals 
        
        # 2. Opcional: O Celery faz autodiscover de 'registro.tasks' automaticamente,
        # mas importar aqui não faz mal e garante o registro.
        try:
            import registro.tasks
        except ImportError:
            pass