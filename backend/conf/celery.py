import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "conf.settings")

app = Celery("scale")

# Lê configurações CELERY_ do settings
app.config_from_object("django.conf:settings", namespace="CELERY")

# Descobre tasks em apps registrados
app.autodiscover_tasks()
