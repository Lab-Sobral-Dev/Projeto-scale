from datetime import timedelta
from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

PASSWORD_MAX_AGE_DAYS = 90  # política de expiração (90 dias)

class LoginSecurity(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="security")

    # bloqueio por tentativas
    failed_logins = models.PositiveIntegerField(default=0)
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)

    # política de senha
    last_password_change = models.DateTimeField(null=True, blank=True)
    must_change_password = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Segurança de Login"
        verbose_name_plural = "Segurança de Login"

    def __str__(self):
        return f"{self.user.username} — {'Bloqueado' if self.is_locked else 'Ativo'}"

    # ——— Expiração de senha ———
    def password_expires_at(self):
        base = self.last_password_change or self.user.date_joined or timezone.now()
        return base + timedelta(days=PASSWORD_MAX_AGE_DAYS)

    def is_password_expired(self):
        return timezone.now() >= self.password_expires_at()

    def mark_password_changed(self):
        self.last_password_change = timezone.now()
        self.must_change_password = False
        self.save(update_fields=["last_password_change", "must_change_password"])

    # helpers de bloqueio
    def reset_lock(self):
        self.failed_logins = 0
        self.is_locked = False
        self.locked_at = None
        self.save(update_fields=["failed_logins", "is_locked", "locked_at"])
