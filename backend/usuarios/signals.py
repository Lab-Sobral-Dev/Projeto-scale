from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import Screen, Role, PerfilUsuario
from .models_security import LoginSecurity  # importa o modelo de segurança

# --- adiciona novas telas automaticamente ao papel admin ---
@receiver(post_save, sender=Screen)
def add_new_screen_to_admin(sender, instance, created, **kwargs):
    if created:
        admin_role, _ = Role.objects.get_or_create(name="admin")
        admin_role.screens.add(instance)

# --- cria perfil e registro de segurança ao criar novo usuário ---
@receiver(post_save, sender=User)
def create_user_profile_and_security(sender, instance, created, **kwargs):
    if created:
        # cria perfil padrão se ainda não existir
        if not hasattr(instance, "perfil"):
            PerfilUsuario.objects.create(user=instance, papel=PerfilUsuario.PAPEL_OPERADOR)

        # cria registro de segurança (bloqueio/senha expirada etc.)
        LoginSecurity.objects.get_or_create(user=instance)
