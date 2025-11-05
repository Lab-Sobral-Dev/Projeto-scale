# registro/models/audit.py
from django.db import models
from django.contrib.auth import get_user_model
from django.utils.timezone import now
from django.core.serializers.json import DjangoJSONEncoder  # <<< adicionamos isso

User = get_user_model()

class AuditLog(models.Model):
    timestamp = models.DateTimeField(default=now, db_index=True)
    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
        verbose_name="Usuário"
    )
    ip = models.GenericIPAddressField(null=True, blank=True, verbose_name="Endereço IP")
    user_agent = models.TextField(blank=True, default="", verbose_name="User-Agent")
    path = models.CharField(max_length=512, db_index=True, verbose_name="Rota/Endpoint")
    method = models.CharField(max_length=8, verbose_name="Método HTTP")
    status_code = models.IntegerField(null=True, blank=True, verbose_name="Código de status")

    # Ações possíveis: request | create | update | delete | login | logout | token_refresh | label_print | error
    action = models.CharField(max_length=32, db_index=True, verbose_name="Ação")
    model = models.CharField(max_length=128, blank=True, default="", db_index=True, verbose_name="Modelo afetado")
    object_pk = models.CharField(max_length=64, blank=True, default="", db_index=True, verbose_name="PK do objeto")

    # Aqui está o ponto principal: usar DjangoJSONEncoder para suportar Decimal, datetime, UUID etc.
    changes = models.JSONField(
        null=True,
        blank=True,
        encoder=DjangoJSONEncoder,
        verbose_name="Alterações"
    )
    extra = models.JSONField(
        null=True,
        blank=True,
        encoder=DjangoJSONEncoder,
        verbose_name="Informações extras"
    )

    class Meta:
        indexes = [
            models.Index(fields=["timestamp"]),
            models.Index(fields=["-timestamp"]),
            models.Index(fields=["action"]),
            models.Index(fields=["method"]),
            models.Index(fields=["model"]),
            models.Index(fields=["status_code"]),
            models.Index(fields=["path"]),
            models.Index(fields=["user"]),
            models.Index(fields=["object_pk"]),
            models.Index(fields=["ip"]),
            models.Index(fields=["model", "object_pk"]),
        ]
        ordering = ["-timestamp"]
        verbose_name = "Log de Auditoria"
        verbose_name_plural = "Logs de Auditoria"

    def __str__(self):
        user_display = self.user.username if self.user else "anônimo"
        return f"[{self.timestamp:%Y-%m-%d %H:%M:%S}] {self.action.upper()} {self.model} ({user_display})"
