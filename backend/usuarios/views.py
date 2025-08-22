from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth.models import User

from .serializers import UserSerializer, UserCreateSerializer, PerfilUsuarioSerializer
from .models import PerfilUsuario

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
    queryset = PerfilUsuario.objects.select_related('user').all()
    serializer_class = PerfilUsuarioSerializer

    def get_permissions(self):
        if self.action in ['me']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        perfil = getattr(request.user, 'perfil', None)
        if not perfil:
            return Response({"detail": "Perfil não encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(perfil).data)


# views.py (substitua o MeView atual)
class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        u = request.user
        perfil = getattr(u, 'perfil', None)
        nome = (u.get_full_name() or '').strip() or u.username

        # 🔧 regra: se é staff/superuser => admin, senão usa perfil.papel (fallback operador)
        if u.is_staff or u.is_superuser:
            tipo = 'admin'
        else:
            tipo = getattr(perfil, 'papel', 'operador')

        return Response({
            "id": u.id,
            "username": u.username,
            "usuario": u.username,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "nome_exibicao": nome,
            "tipo": tipo,                # <- agora consistente
            "is_staff": u.is_staff,
            "is_superuser": u.is_superuser,
        })

