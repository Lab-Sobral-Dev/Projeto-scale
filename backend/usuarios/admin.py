from django.contrib import admin
from .models import PerfilUsuario, Screen, Role

@admin.register(PerfilUsuario)
class PerfilUsuarioAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'papel')
    list_filter = ('papel',)
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email')
    filter_horizontal = ('roles', 'extra_screens')

@admin.register(Screen)
class ScreenAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "label")
    search_fields = ("code", "label")
    ordering = ("label",)

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)
    filter_horizontal = ("screens",)
    ordering = ("name",)
