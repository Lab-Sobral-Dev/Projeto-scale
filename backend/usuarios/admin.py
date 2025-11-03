from django.contrib import admin
from django.contrib.auth import get_user_model
from django.utils.html import format_html
from django.utils import timezone

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
    list_display = (
        "user",
        "failed_logins",
        "is_locked",
        "must_change_password",
        "password_status",
        "locked_at",
        "last_password_change",
        "updated_at",
    )
    list_filter = ("is_locked", "must_change_password")
    date_hierarchy = "locked_at"
    search_fields = ("user__username", "user__first_name", "user__last_name")
    autocomplete_fields = ("user",)
    readonly_fields = ("failed_logins", "locked_at", "updated_at")
    actions = [
        "unlock_selected",
        "force_expiration",
        "mark_change_required",
    ]

    def password_status(self, obj: LoginSecurity):
        if obj.is_password_expired():
            return format_html('<span style="color:red;">Expirada</span>')
        if obj.must_change_password:
            return format_html('<span style="color:orange;">Troca obrigatória</span>')
        return format_html('<span style="color:green;">Válida</span>')
    password_status.short_description = "Status senha"

    @admin.action(description="Desbloquear usuários selecionados")
    def unlock_selected(self, request, queryset):
        updated = 0
        for sec in queryset:
            sec.failed_logins = 0
            sec.is_locked = False
            sec.locked_at = None
            sec.save(update_fields=["failed_logins", "is_locked", "locked_at"])
            updated += 1
        self.message_user(request, f"{updated} usuário(s) desbloqueado(s).")

    @admin.action(description="Forçar expiração imediata da senha (90 dias retroativos)")
    def force_expiration(self, request, queryset):
        updated = 0
        for sec in queryset:
            sec.last_password_change = timezone.now() - timezone.timedelta(days=91)
            sec.must_change_password = True
            sec.save(update_fields=["last_password_change", "must_change_password"])
            updated += 1
        self.message_user(request, f"{updated} senha(s) marcadas como expirada(s).")

    @admin.action(description="Marcar 'troca obrigatória' sem alterar data")
    def mark_change_required(self, request, queryset):
        updated = queryset.update(must_change_password=True)
        self.message_user(request, f"{updated} usuário(s) precisarão trocar senha no próximo login.")


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
        _base_actions = getattr(BaseUserAdmin, "actions", None) or ()
        actions = (*_base_actions, unlock_users)
        inlines = [LoginSecurityInline]

        # Mostra flag de troca obrigatória diretamente na listagem
        def must_change_password(self, obj):
            try:
                sec = obj.security
                if sec.must_change_password:
                    return format_html('<span style="color:orange;">Sim</span>')
                return format_html('<span style="color:green;">Não</span>')
            except LoginSecurity.DoesNotExist:
                return "—"
        must_change_password.short_description = "Troca obrigatória"

        list_display = BaseUserAdmin.list_display + ('must_change_password',)

except admin.sites.AlreadyRegistered:
    pass
