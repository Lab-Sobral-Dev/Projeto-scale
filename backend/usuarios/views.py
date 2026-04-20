from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth.models import User

from registro.db_context import get_env

from .serializers import (
    UserSerializer, UserCreateSerializer,
    PerfilUsuarioSerializer, PerfilUsuarioUpdateSerializer,
    ScreenSerializer, RoleSerializer
)
from .models import PerfilUsuario, Screen, Role
from .permissions import (
    IsAdmin,
    IsSupervisorOrAdmin,
    IsSupervisorOrAdminOrReadOnly,
    HasScreen,
)


class UserViewSet(viewsets.ModelViewSet):
    """
    Admin pode listar/criar/editar usuários.
    Operador e supervisor não têm acesso aqui.
    Regra baseada no PerfilUsuario.papel (PAPEL_ADMIN).
    """
    queryset = User.objects.all().order_by('username')
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer


class PerfilUsuarioViewSet(viewsets.ModelViewSet):
    """
    Admin gerencia todos os perfis.
    Qualquer usuário autenticado pode consultar apenas o próprio perfil em /perfis/me/.
    """
    queryset = PerfilUsuario.objects.select_related('user').prefetch_related('roles__screens', 'extra_screens').all()

    def get_permissions(self):
        if self.action in ['me']:
            # qualquer autenticado pode ver o próprio perfil
            return [permissions.IsAuthenticated()]
        # demais ações: apenas admin (papel)
        return [IsAdmin()]

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
    CRUD de telas (Screen).
    Apenas admin (papel).
    """
    queryset = Screen.objects.all().order_by("label")
    serializer_class = ScreenSerializer
    permission_classes = [IsAdmin]


class RoleViewSet(viewsets.ModelViewSet):
    """
    CRUD de papéis (Role).
    Apenas admin (papel).
    """
    queryset = Role.objects.prefetch_related("screens").all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [IsAdmin]


# /auth/me (resumo do usuário atual)
class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        u = request.user
        perfil = getattr(u, 'perfil', None)
        nome = (u.get_full_name() or '').strip() or u.username

        # regra: tipo vem prioritariamente do PerfilUsuario.papel
        # fallback: 'operador' se não houver perfil
        if perfil and getattr(perfil, 'papel', None):
            tipo = perfil.papel
        else:
            tipo = 'operador'

        # allowed_screens vem sempre do perfil (quando existir)
        allowed = perfil.get_allowed_screens() if perfil else []

        return Response({
            "id": u.id,
            "username": u.username,
            "usuario": u.username,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "nome_exibicao": nome,
            "tipo": tipo,               # 'admin' | 'supervisor' | 'operador'
            "is_staff": u.is_staff,     # mantido só como info, não como regra de negócio
            "is_superuser": u.is_superuser,
            "allowed_screens": allowed,
            "env": get_env(),   # "prod" ou "hml"
        })
