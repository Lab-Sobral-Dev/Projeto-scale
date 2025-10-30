from django.contrib import admin
from django.utils.html import format_html_join
from .models import PerfilUsuario, Screen, Role

@admin.register(PerfilUsuario)
class PerfilUsuarioAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'papel', 'roles_list', 'extra_list', 'allowed_count')
    list_filter = ('papel',)
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email')
    filter_horizontal = ('roles', 'extra_screens')
    autocomplete_fields = ('user',)
    list_select_related = ('user',)
    actions = ('sincronizar_roles_base',)

    def roles_list(self, obj: PerfilUsuario):
        names = list(obj.roles.values_list('name', flat=True))
        return ", ".join(names) if names else "—"
    roles_list.short_description = "Roles"

    def extra_list(self, obj: PerfilUsuario):
        labels = list(obj.extra_screens.values_list('label', flat=True))
        return ", ".join(labels) if labels else "—"
    extra_list.short_description = "Telas extras"

    def allowed_count(self, obj: PerfilUsuario):
        try:
            return len(obj.get_allowed_screens())
        except Exception:
            return 0
    allowed_count.short_description = "Qtd. telas permitidas"

    @admin.action(description="Sincronizar roles-base com o papel selecionado")
    def sincronizar_roles_base(self, request, queryset):
        updated = 0
        for perfil in queryset:
            perfil.sync_roles_with_papel()
            updated += 1
        self.message_user(request, f"Perfis sincronizados: {updated}")


@admin.register(Screen)
class ScreenAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "label")
    search_fields = ("code", "label")
    ordering = ("label",)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "screens_count")
    search_fields = ("name",)
    filter_horizontal = ("screens",)
    ordering = ("name",)

    def screens_count(self, obj: Role):
        return obj.screens.count()
    screens_count.short_description = "Qtd. telas"
