# backend/usuarios/permissions.py
from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAuthenticatedReadOnly(BasePermission):
    """
    GET/HEAD/OPTIONS: requer autenticado.
    Escrita (POST/PUT/PATCH/DELETE): negada.
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return False


class IsAdmin(BasePermission):
    """
    Permite apenas admin (perfil.papel == 'admin').
    """
    def has_permission(self, request, view):
        user = request.user
        perfil = getattr(user, "perfil", None)
        return bool(user and user.is_authenticated and perfil and perfil.papel == perfil.PAPEL_ADMIN)


class IsSupervisorOrAdmin(BasePermission):
    """
    Permite supervisor OU admin.
    """
    def has_permission(self, request, view):
        user = request.user
        perfil = getattr(user, "perfil", None)
        if not (user and user.is_authenticated and perfil):
            return False
        return perfil.papel in {perfil.PAPEL_SUPERVISOR, perfil.PAPEL_ADMIN}


class IsAdminOrReadOnly(BasePermission):
    """
    Compatível com sua regra anterior, porém baseada no 'papel' (não em is_staff).
    Leitura: autenticado.
    Escrita: apenas admin.
    """
    def has_permission(self, request, view):
        user = request.user
        if request.method in SAFE_METHODS:
            return bool(user and user.is_authenticated)
        perfil = getattr(user, "perfil", None)
        return bool(user and user.is_authenticated and perfil and perfil.papel == perfil.PAPEL_ADMIN)


class HasScreen(BasePermission):
    """
    Checagem por 'tela/feature' (Screen.code).
    Uso: permission_classes = [HasScreen.with_code("auditoria")]
    """
    required_code = None

    @classmethod
    def with_code(cls, code: str):
        class _HasScreen(cls):
            required_code = code
        _HasScreen.__name__ = f"HasScreen_{code}"
        return _HasScreen

    def has_permission(self, request, view):
        user = request.user
        perfil = getattr(user, "perfil", None)
        code = getattr(self, "required_code", None)
        if not (user and user.is_authenticated and perfil and code):
            return False
        # Usa a API do PerfilUsuario (Caminho A)
        return perfil.has_screen(code)


class IsSupervisorOrAdminOrReadOnly(BasePermission):
    """
    SAFE_METHODS: requer autenticado (qualquer papel) -> leitura liberada.
    Métodos de escrita (POST/PUT/PATCH/DELETE): apenas supervisor ou admin.
    """
    def has_permission(self, request, view):
        user = request.user
        if request.method in SAFE_METHODS:
            return bool(user and user.is_authenticated)

        perfil = getattr(user, "perfil", None)
        if not (user and user.is_authenticated and perfil):
            return False
        return perfil.papel in {perfil.PAPEL_SUPERVISOR, perfil.PAPEL_ADMIN}


# --- NOVA CLASSE ADICIONADA ---
class IsOperatorCreateOrSupervisorEdit(BasePermission):
    """
    Permissão Híbrida para Pesagens:
    - LEITURA (GET): Qualquer usuário autenticado.
    - CRIAÇÃO (POST): Operador, Supervisor ou Admin.
    - EDIÇÃO (PUT/PATCH): Apenas Supervisor ou Admin.
    - DELEÇÃO (DELETE): Normalmente tratado via IsAdmin na view, mas aqui restringe a Supervisor/Admin.
    """
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        # Leitura liberada para todos logados
        if request.method in SAFE_METHODS:
            return True
        
        perfil = getattr(user, "perfil", None)
        if not perfil:
            return False

        # POST (Criar): Liberado para quem tem perfil (inclui Operador)
        if request.method == 'POST':
            return True

        # PUT/PATCH/DELETE: Apenas Supervisor ou Admin
        return perfil.papel in {perfil.PAPEL_SUPERVISOR, perfil.PAPEL_ADMIN}