from django.contrib import admin
from django.contrib.auth import get_user_model
from .models import PerfilUsuario, Screen, Role
from .models_security import LoginSecurity

User = get_user_model()

# -----------------------------
# PerfilUsuario
# -----------------------------
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


# -----------------------------
# Screen
# -----------------------------
@admin.register(Screen)
class ScreenAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "label")
    search_fields = ("code", "label")
    ordering = ("label",)


# -----------------------------
# Role
# -----------------------------
@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "screens_count")
    search_fields = ("name",)
    filter_horizontal = ("screens",)
    ordering = ("name",)

    def screens_count(self, obj: Role):
        return obj.screens.count()
    screens_count.short_description = "Qtd. telas"


# -----------------------------
# LoginSecurity
# -----------------------------
@admin.register(LoginSecurity)
class LoginSecurityAdmin(admin.ModelAdmin):
    list_display = ("user", "failed_logins", "is_locked", "locked_at", "updated_at")
    list_filter = ("is_locked",)
    date_hierarchy = "locked_at"
    search_fields = ("user__username", "user__first_name", "user__last_name")
    autocomplete_fields = ("user",)
    # Evita edições manuais acidentais
    readonly_fields = ("failed_logins", "locked_at", "updated_at")
    actions = ["unlock_selected"]

    def unlock_selected(self, request, queryset):
        updated = queryset.update(is_locked=False, failed_logins=0, locked_at=None)
        self.message_user(request, f"{updated} registro(s) desbloqueado(s).")
    unlock_selected.short_description = "Desbloquear usuários selecionados"


# -----------------------------
# Action global para User list
# -----------------------------
@admin.action(description="Desbloquear usuários selecionados (resetar contador)")
def unlock_users(modeladmin, request, queryset):
    count = 0
    for user in queryset:
        sec, _ = LoginSecurity.objects.get_or_create(user=user)
        if sec.is_locked or sec.failed_logins:
            sec.is_locked = False
            sec.failed_logins = 0
            sec.locked_at = None
            sec.save(update_fields=["is_locked", "failed_logins", "locked_at"])
            count += 1
    modeladmin.message_user(request, f"{count} usuário(s) desbloqueado(s).")


# -----------------------------
# Inline para exibir/editar segurança no User
# -----------------------------
class LoginSecurityInline(admin.StackedInline):
    model = LoginSecurity
    can_delete = False
    extra = 0
    readonly_fields = ("failed_logins", "locked_at", "updated_at")
    fk_name = "user"


# -----------------------------
# UserAdmin (herda do BaseUserAdmin)
# -----------------------------
try:
    from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

    @admin.register(User)
    class UserAdmin(BaseUserAdmin):
        # Padroniza para tuple (funciona mesmo se BaseUserAdmin.actions for None/list/tuple)
        _base_actions = getattr(BaseUserAdmin, "actions", None) or ()
        actions = (*_base_actions, unlock_users)
        inlines = [LoginSecurityInline]

except admin.sites.AlreadyRegistered:
    # Se o User já estiver registrado em outro lugar, ignore.
    pass
