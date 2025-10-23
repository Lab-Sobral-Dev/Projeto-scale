# registro/models/audit.py
from django.db import models
from django.contrib.auth import get_user_model
from django.utils.timezone import now

User = get_user_model()

class AuditLog(models.Model):
    timestamp = models.DateTimeField(default=now, db_index=True)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    path = models.CharField(max_length=512, db_index=True)
    method = models.CharField(max_length=8)
    status_code = models.IntegerField(null=True, blank=True)

    action = models.CharField(max_length=32, db_index=True)  # request|create|update|delete|login|logout|token_refresh|label_print|error
    model = models.CharField(max_length=128, blank=True, default="", db_index=True)
    object_pk = models.CharField(max_length=64, blank=True, default="", db_index=True)
    changes = models.JSONField(null=True, blank=True)  # {"field": ["old","new"], ...}
    extra = models.JSONField(null=True, blank=True)    # payloads/resumos úteis

    class Meta:
        indexes = [
            models.Index(fields=["timestamp"]),
            models.Index(fields=["model", "object_pk"]),
        ]
        ordering = ["-timestamp"]
