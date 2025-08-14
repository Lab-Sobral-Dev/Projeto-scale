from django.db import models
from django.contrib.auth.models import User

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
