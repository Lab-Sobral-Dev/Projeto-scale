from django.db import models
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

User = get_user_model()

class LoginSecurity(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="security")
    failed_logins = models.PositiveIntegerField(default=0)
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Segurança de Login"
        verbose_name_plural = "Segurança de Login"

    def __str__(self):
        state = "Bloqueado" if self.is_locked else "Ativo"
        return f"{self.user.username} — {state} (falhas: {self.failed_logins})"

@receiver(post_save, sender=User)
def create_security_profile(sender, instance, created, **kwargs):
    if created:
        LoginSecurity.objects.get_or_create(user=instance)
