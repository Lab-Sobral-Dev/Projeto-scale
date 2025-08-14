from django.contrib import admin
from .models import PerfilUsuario

@admin.register(PerfilUsuario)
class PerfilUsuarioAdmin(admin.ModelAdmin):
    list_display = ('user', 'papel')
    list_filter = ('papel',)
    search_fields = ('user__username', 'user__email')
