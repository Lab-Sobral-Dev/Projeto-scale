# usuarios/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Screen, Role, PerfilUsuario
from django.contrib.auth.models import User

@receiver(post_save, sender=Screen)
def add_new_screen_to_admin(sender, instance, created, **kwargs):
    if created:
        admin_role, _ = Role.objects.get_or_create(name="admin")
        admin_role.screens.add(instance)

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    # mantenha só um dos criadores de perfil no projeto
    if created and not hasattr(instance, 'perfil'):
        PerfilUsuario.objects.create(user=instance, papel=PerfilUsuario.PAPEL_OPERADOR)
