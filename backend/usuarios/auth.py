from django.contrib.auth import authenticate, get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models_security import LoginSecurity
from registro.audit_models import AuditLog
from registro.utils.audit import client_ip

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

    def _audit_login(self, request, user=None, status_code=None, reason=""):
        AuditLog.objects.create(
            user=user if (user and user.is_authenticated) else None,
            ip=client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            path=request.path,
            method=request.method,
            status_code=status_code,
            action="login",
            model="User",
            object_pk=str(user.pk) if user else "",
            extra={
                "reason": reason,
                "username": request.data.get("username", ""),
            },
        )

    def post(self, request, *args, **kwargs):
        username = request.data.get("username")
        password = request.data.get("password")

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            self._audit_login(request, status_code=status.HTTP_401_UNAUTHORIZED, reason="Usuário incorreto")
            return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_401_UNAUTHORIZED)

        sec = _sec(user)

        if not user.is_active:
            self._audit_login(request, user=user, status_code=status.HTTP_403_FORBIDDEN, reason="Usuário desativado")
            return Response({"detail": "Usuário desativado. Contate o administrador."}, status=status.HTTP_403_FORBIDDEN)

        if sec.is_locked:
            self._audit_login(request, user=user, status_code=status.HTTP_423_LOCKED, reason="Usuário bloqueado")
            return Response({"detail": "Usuário bloqueado. Contate o administrador."}, status=status.HTTP_423_LOCKED)

        user_ok = authenticate(request, username=username, password=password)
        if not user_ok:
            sec.failed_logins = (sec.failed_logins or 0) + 1
            if sec.failed_logins >= LOCK_THRESHOLD:
                sec.is_locked = True
                sec.locked_at = timezone.now()
            sec.save(update_fields=["failed_logins", "is_locked", "locked_at"])
            self._audit_login(request, user=user, status_code=status.HTTP_401_UNAUTHORIZED, reason="Senha incorreta")
            return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_401_UNAUTHORIZED)

        # sucesso → zera bloqueio
        if sec.failed_logins or sec.is_locked or sec.locked_at:
            sec.reset_lock()

        self._audit_login(request, user=user, status_code=status.HTTP_200_OK, reason="Login realizado com sucesso")

        # emite JWT com flags
        return super().post(request, *args, **kwargs)
