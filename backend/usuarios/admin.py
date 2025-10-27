from django.contrib import admin
from django.db.models.signals import post_save
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

@receiver(post_save, sender=Screen)
def add_new_screen_to_admin(sender, instance, created, **kwargs):
    if created:
        admin_role, _ = Role.objects.get_or_create(name="admin")
        admin_role.screens.add(instance)
