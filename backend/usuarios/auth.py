from django.contrib.auth import authenticate, get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models_security import LoginSecurity

User = get_user_model()
LOCK_THRESHOLD = 5  # bloqueio após 5 falhas

def _sec(user: User) -> LoginSecurity:
    sec, _ = LoginSecurity.objects.get_or_create(user=user)
    return sec

class TokenWithFlagsSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        sec = _sec(user)

        # flags que o front usa para redirecionar
        token["must_change_password"] = bool(sec.must_change_password)
        token["password_expired"] = bool(sec.is_password_expired())

        # opcional: telas permitidas (se tiver esse método/relacionamento)
        perfil = getattr(user, "perfil", None)
        if perfil and hasattr(perfil, "get_allowed_screens"):
            token["allowed_screens"] = perfil.get_allowed_screens()

        token["username"] = user.username
        token["is_staff"] = user.is_staff
        return token

class TokenWithFlagsView(TokenObtainPairView):
    serializer_class = TokenWithFlagsSerializer

    def post(self, request, *args, **kwargs):
        username = request.data.get("username")
        password = request.data.get("password")

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_401_UNAUTHORIZED)

        sec = _sec(user)

        if not user.is_active:
            return Response({"detail": "Usuário desativado. Contate o administrador."}, status=status.HTTP_403_FORBIDDEN)

        if sec.is_locked:
            return Response({"detail": "Usuário bloqueado. Contate o administrador."}, status=status.HTTP_423_LOCKED)

        user_ok = authenticate(request, username=username, password=password)
        if not user_ok:
            sec.failed_logins = (sec.failed_logins or 0) + 1
            if sec.failed_logins >= LOCK_THRESHOLD:
                sec.is_locked = True
                sec.locked_at = timezone.now()
            sec.save(update_fields=["failed_logins", "is_locked", "locked_at"])
            return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_401_UNAUTHORIZED)

        # sucesso → zera bloqueio
        if sec.failed_logins or sec.is_locked or sec.locked_at:
            sec.reset_lock()

        # emite JWT com flags
        return super().post(request, *args, **kwargs)
