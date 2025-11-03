# auth.py
from django.contrib.auth import get_user_model, authenticate
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

LOCK_THRESHOLD = 5  # tentativas consecutivas

def _get_or_create_security(user):
    """
    Evita depender de custom user. Mantemos o estado de segurança
    num OneToOne independente (LoginSecurity).
    """
    from .models_security import LoginSecurity
    sec, _ = LoginSecurity.objects.get_or_create(user=user)
    return sec

class TokenWithScreensSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        perfil = getattr(user, "perfil", None)
        allowed = perfil.get_allowed_screens() if perfil else []
        token["allowed_screens"] = allowed
        token["username"] = user.username
        return token

class TokenWithScreensView(TokenObtainPairView):
    """
    Emite JWT E aplica regras:
    - bloqueio após 5 falhas consecutivas (423 Locked)
    - zera contador no sucesso
    - mensagens de erro neutras (não revelar existência de usuário)
    """
    serializer_class = TokenWithScreensSerializer

    def post(self, request, *args, **kwargs):
        username = request.data.get("username")
        password = request.data.get("password")

        # 1) Não revelar se usuário existe — resposta neutra
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_401_UNAUTHORIZED)

        # 2) Checar estado de bloqueio
        sec = _get_or_create_security(user)
        if sec.is_locked:
            return Response({"detail": "Usuário bloqueado. Contate o administrador."}, status=status.HTTP_423_LOCKED)

        # 3) Autenticar
        user_ok = authenticate(request, username=username, password=password)
        if not user_ok:
            sec.failed_logins = (sec.failed_logins or 0) + 1
            if sec.failed_logins >= LOCK_THRESHOLD:
                sec.is_locked = True
                sec.locked_at = timezone.now()
            sec.save(update_fields=["failed_logins", "is_locked", "locked_at"])
            return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_401_UNAUTHORIZED)

        # 4) Sucesso → zera contador/lock e delega emissão de token
        if sec.failed_logins or sec.is_locked or sec.locked_at:
            sec.failed_logins = 0
            sec.is_locked = False
            sec.locked_at = None
            sec.save(update_fields=["failed_logins", "is_locked", "locked_at"])

        return super().post(request, *args, **kwargs)
