# apps/reports/permissions.py
from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsReportViewer(BasePermission):
    """
    Permite acesso a usuários com papel 'admin'.
    Se existir PerfilUsuario, consulta o papel.
    """
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        perfil = getattr(user, 'perfil', None)
        if not perfil:
            return False
        return perfil.papel in ('admin')
