from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

class Screen(models.Model):
    """
    Tela/feature do frontend habilitável por usuário/papel.
    code: identificador estável usado no app (ex.: 'dashboard', 'nova_pesagem').
    label: nome amigável para exibição no admin.
    """
    code = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=128)

    class Meta:
        verbose_name = "Tela"
        verbose_name_plural = "Telas"

    def __str__(self):
        return f"{self.label} ({self.code})"


class Role(models.Model):
    """
    Papel (conjunto de telas). Ex.: admin, operador, qa.
    """
    name = models.CharField(max_length=64, unique=True)
    screens = models.ManyToManyField(Screen, blank=True, related_name="roles")

    class Meta:
        verbose_name = "Papel"
        verbose_name_plural = "Papéis"

    def __str__(self):
        return self.name


class PerfilUsuario(models.Model):
    PAPEL_OPERADOR = 'operador'
    PAPEL_ADMIN = 'admin'
    PAPEL_CHOICES = (
        (PAPEL_OPERADOR, 'Operador'),
        (PAPEL_ADMIN, 'Administrador'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfil')
    papel = models.CharField(max_length=20, choices=PAPEL_CHOICES, default=PAPEL_OPERADOR)

    # Novo: papéis e telas adicionais (overrides) no nível do perfil
    roles = models.ManyToManyField(Role, blank=True, related_name="perfis")
    extra_screens = models.ManyToManyField(Screen, blank=True, related_name="perfis_extra")

    def __str__(self):
        return f"{self.user.username} ({self.get_papel_display()})"

    def get_allowed_screens(self):
        """
        Une telas vindas dos papéis + telas extras do perfil, sem duplicar.
        """
        role_codes = Screen.objects.filter(roles__perfis=self).values_list("code", flat=True)
        extra_codes = self.extra_screens.values_list("code", flat=True)
        return sorted(set(list(role_codes) + list(extra_codes)))


# cria PerfilUsuario automaticamente para todo User novo (fallback = operador)
@receiver(post_save, sender=User)
def criar_perfil_usuario(sender, instance, created, **kwargs):
    if created and not hasattr(instance, 'perfil'):
        PerfilUsuario.objects.create(user=instance, papel=PerfilUsuario.PAPEL_OPERADOR)
