from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth.models import User

from .serializers import (
    UserSerializer, UserCreateSerializer,
    PerfilUsuarioSerializer, PerfilUsuarioUpdateSerializer,
    ScreenSerializer, RoleSerializer
)
from .models import PerfilUsuario, Screen, Role


class UserViewSet(viewsets.ModelViewSet):
    """
    Admin pode listar/criar/editar usuários.
    Operador não tem acesso aqui (IsAdminUser).
    """
    queryset = User.objects.all().order_by('username')
    permission_classes = [permissions.IsAdminUser]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer


class PerfilUsuarioViewSet(viewsets.ModelViewSet):
    """
    Admin gerencia todos os perfis.
    Operador: só consegue ver o próprio perfil via /perfis/me/ (custom action).
    """
    queryset = PerfilUsuario.objects.select_related('user').prefetch_related('roles__screens', 'extra_screens').all()

    def get_permissions(self):
        if self.action in ['me']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return PerfilUsuarioUpdateSerializer
        return PerfilUsuarioSerializer

    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        perfil = getattr(request.user, 'perfil', None)
        if not perfil:
            return Response({"detail": "Perfil não encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(PerfilUsuarioSerializer(perfil).data)


class ScreenViewSet(viewsets.ModelViewSet):
    """
    CRUD de telas. Apenas admin.
    """
    queryset = Screen.objects.all().order_by("label")
    serializer_class = ScreenSerializer
    permission_classes = [permissions.IsAdminUser]


class RoleViewSet(viewsets.ModelViewSet):
    """
    CRUD de papéis. Apenas admin.
    """
    queryset = Role.objects.prefetch_related("screens").all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAdminUser]


# /auth/me (resumo do usuário atual)
class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        u = request.user
        perfil = getattr(u, 'perfil', None)
        nome = (u.get_full_name() or '').strip() or u.username

        # regra: se é staff/superuser => admin, senão usa perfil.papel (fallback operador)
        if u.is_staff or u.is_superuser:
            tipo = 'admin'
        else:
            tipo = getattr(perfil, 'papel', 'operador')

        allowed = perfil.get_allowed_screens() if perfil else []

        return Response({
            "id": u.id,
            "username": u.username,
            "usuario": u.username,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "nome_exibicao": nome,
            "tipo": tipo,
            "is_staff": u.is_staff,
            "is_superuser": u.is_superuser,
            "allowed_screens": allowed,
        })
