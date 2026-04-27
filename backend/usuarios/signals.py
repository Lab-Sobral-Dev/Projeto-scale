from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import Screen, Role
from .models_security import LoginSecurity  # importa o modelo de segurança

# --- adiciona novas telas automaticamente ao papel admin ---
@receiver(post_save, sender=Screen)
def add_new_screen_to_admin(sender, instance, created, **kwargs):
    if created:
        admin_role, _ = Role.objects.get_or_create(name="admin")
        admin_role.screens.add(instance)

# --- cria LoginSecurity ao criar novo usuário (PerfilUsuario é criado em models.py) ---
@receiver(post_save, sender=User)
def create_login_security(sender, instance, created, **kwargs):
    if created:
        LoginSecurity.objects.get_or_create(user=instance)
