from rest_framework import permissions


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Leitura para qualquer usuário autenticado.
    Escrita (POST/PUT/PATCH/DELETE) apenas para staff/admin (is_staff=True).
    OBS: Hoje as views principais já usam as permissões do app 'usuarios'
    (IsSupervisorOrAdminOrReadOnly / IsAdmin). Esta classe fica como legado
    ou para endpoints específicos que ainda usem is_staff.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_staff
