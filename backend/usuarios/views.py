from rest_framework import viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth.models import User

from .serializers import UserSerializer, UserCreateSerializer, PerfilUsuarioSerializer
from .models import PerfilUsuario

class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        # permite leitura autenticada; escrita só admin
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_staff


class UserViewSet(viewsets.ModelViewSet):
    """
    Admin pode listar/criar/editar usuários.
    (Ajuste a permissão conforme seu fluxo)
    """
    queryset = User.objects.all().order_by('username')
    permission_classes = [permissions.IsAdminUser]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer


class PerfilUsuarioViewSet(viewsets.ModelViewSet):
    """
    Admin gerencia perfis; operador pode ler apenas o próprio via /me/
    """
    queryset = PerfilUsuario.objects.select_related('user').all()
    serializer_class = PerfilUsuarioSerializer
    permission_classes = [permissions.IsAdminUser]


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        u = request.user
        perfil = getattr(u, 'perfil', None)  # OneToOne PerfilUsuario
        nome = (u.get_full_name() or '').strip() or u.username
        return Response({
            "id": u.id,
            "username": u.username,
            "usuario": u.username,           # conveniência p/ frontend
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "nome_exibicao": nome,
            "tipo": getattr(perfil, 'papel', 'operador'),  # 'admin' | 'operador'
            "is_staff": u.is_staff,
            "is_superuser": u.is_superuser,
        })