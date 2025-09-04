from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings

class PerfilUsuario(models.Model):
    PAPEL_OPERADOR = 'operador'
    PAPEL_ADMIN = 'admin'
    PAPEL_CHOICES = (
        (PAPEL_OPERADOR, 'Operador'),
        (PAPEL_ADMIN, 'Administrador'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfil')
    
    papel = models.CharField(max_length=20, choices=PAPEL_CHOICES, default=PAPEL_OPERADOR)

    def __str__(self):
        return f"{self.user.username} ({self.get_papel_display()})"

# cria PerfilUsuario automaticamente para todo User novo (fallback = operador)
@receiver(post_save, sender=User)
def criar_perfil_usuario(sender, instance, created, **kwargs):
    if created and not hasattr(instance, 'perfil'):
        PerfilUsuario.objects.create(user=instance, papel=PerfilUsuario.PAPEL_OPERADOR)
