# apps/usuarios/models.py
from django.db import models
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

User = get_user_model()

class Screen(models.Model):
    code = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=128)

    class Meta:
        verbose_name = "Tela"
        verbose_name_plural = "Telas"

    def __str__(self):
        return f"{self.label} ({self.code})"


class Role(models.Model):
    name = models.CharField(max_length=64, unique=True)
    screens = models.ManyToManyField(Screen, blank=True, related_name="roles")

    class Meta:
        verbose_name = "Papel"
        verbose_name_plural = "Papéis"

    def __str__(self):
        return self.name


class PerfilUsuario(models.Model):
    PAPEL_OPERADOR   = "operador"
    PAPEL_SUPERVISOR = "supervisor"
    PAPEL_ADMIN      = "admin"
    PAPEL_CHOICES = (
        (PAPEL_OPERADOR, "Operador"),
        (PAPEL_SUPERVISOR, "Supervisor"),
        (PAPEL_ADMIN, "Administrador"),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="perfil")
    papel = models.CharField(max_length=20, choices=PAPEL_CHOICES, default=PAPEL_OPERADOR)

    # Addons/exceções:
    roles = models.ManyToManyField(Role, blank=True, related_name="perfis")
    extra_screens = models.ManyToManyField(Screen, blank=True, related_name="perfis_extra")

    def __str__(self):
        return f"{self.user.username} ({self.get_papel_display()})"

    # --------- Helpers de política ---------
    def _base_role_name(self) -> str:
        # mapeia papel → role homônimo
        return self.papel

    def sync_roles_with_papel(self):
        """
        Garante que o perfil tenha o Role-base do papel atual.
        Remove roles-base de papéis diferentes (evita incoerência),
        mas preserva quaisquer roles adicionais (exceções) se quiser.
        """
        base_name = self._base_role_name()
        try:
            base_role = Role.objects.get(name=base_name)
        except Role.DoesNotExist:
            return  # seed ainda não rodou: sem erro; apenas não sincroniza

        # Remove roles-base de papéis que não correspondem ao papel atual
        base_names_to_remove = {PerfilUsuario.PAPEL_OPERADOR,
                                PerfilUsuario.PAPEL_SUPERVISOR,
                                PerfilUsuario.PAPEL_ADMIN} - {base_name}
        self.roles.remove(*Role.objects.filter(name__in=base_names_to_remove))

        # Garante presença do role-base
        if not self.roles.filter(pk=base_role.pk).exists():
            self.roles.add(base_role)

    def get_allowed_screens(self):
        """
        Telas permitidas = telas do Role-base (via papel) + roles extras + extra_screens.
        """
        # telas via roles (inclui o base sincronizado + eventuais extras)
        role_codes = Screen.objects.filter(roles__perfis=self).values_list("code", flat=True)
        extra_codes = self.extra_screens.values_list("code", flat=True)
        return sorted(set(role_codes) | set(extra_codes))

    def has_screen(self, code: str) -> bool:
        return code in self.get_allowed_screens()


# --------- Signals ---------

@receiver(post_save, sender=User)
def criar_perfil_usuario(sender, instance, created, **kwargs):
    """
    Cria perfil para todo User novo e aplica papel padrão = operador.
    Também sincroniza o role-base (quando já existir no banco).
    """
    if created and not hasattr(instance, 'perfil'):
        perfil = PerfilUsuario.objects.create(user=instance, papel=PerfilUsuario.PAPEL_OPERADOR)
        perfil.sync_roles_with_papel()


@receiver(post_save, sender=PerfilUsuario)
def sincronizar_role_base(sender, instance: PerfilUsuario, **kwargs):
    """
    Sempre que o PerfilUsuario for salvo (ex.: mudança de papel no admin),
    sincroniza o role-base correspondente.
    """
    instance.sync_roles_with_papel()
