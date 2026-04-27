# apps/registro/models/backup.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class BackupRecord(models.Model):
    STATUS = (
        ("success", "Sucesso"),
        ("error", "Erro"),
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    executed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="db_backups")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    engine = models.CharField(max_length=50)               # ex: postgresql / sqlite3
    output_file = models.CharField(max_length=512)         # caminho do .sql.gz / .sqlite.gz
    size_bytes = models.BigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=16, choices=STATUS, default="success")
    error_message = models.TextField(blank=True, default="")
    db_alias = models.CharField(max_length=20, default="default")  # "default" (prod) ou "hml"

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} — {self.engine} — {self.status}"
