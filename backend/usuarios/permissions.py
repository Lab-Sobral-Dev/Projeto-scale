from rest_framework import permissions

class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Leitura: autenticado.
    Escrita: apenas admin (is_staff).
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_staff)
