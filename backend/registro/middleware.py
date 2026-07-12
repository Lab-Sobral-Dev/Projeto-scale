# registro/middleware.py
import logging
import time

from django.conf import settings

from registro.audit_models import AuditLog
from .utils.audit import client_ip

logger = logging.getLogger(__name__)


class AuditRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not getattr(settings, "AUDIT_ENABLED", False):
            return self.get_response(request)

        start = time.time()
        response = self.get_response(request)
        duration_ms = int((time.time() - start) * 1000)

        if request.path.startswith("/static/"):
            return response

        user_obj = getattr(request, "user", None)
        user = user_obj if (user_obj and user_obj.is_authenticated) else None

        # O DRF autentica via JWT no nível da view, então request.user (do
        # Django) pode permanecer anônimo aqui. Recupera o autor pelo claim
        # 'username' do token para que ações de API fiquem atribuíveis
        # (ex.: quem concedeu permissões). Usa o ORM roteado — mesmo banco em
        # que o AuditLog será gravado — mantendo a FK consistente.
        if user is None:
            user = self._user_from_bearer(request)

        try:
            AuditLog.objects.create(
                user=user,
                ip=client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                path=request.path,
                method=request.method,
                status_code=getattr(response, "status_code", None),
                action="request",
                extra={"duration_ms": duration_ms},
            )
        except Exception as e:
            logger.warning("Falha ao registrar AuditLog no middleware: %s", e, exc_info=True)

        return response

    @staticmethod
    def _user_from_bearer(request):
        """Resolve o usuário autenticado a partir do token JWT (claim 'username').

        Retorna None silenciosamente se não houver token, o token for
        inválido/expirado ou o usuário não existir no banco ativo.
        """
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return None
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            from django.contrib.auth import get_user_model

            token = AccessToken(auth.split(" ", 1)[1])
            username = token.get("username")
            if not username:
                return None
            return get_user_model().objects.filter(username=username).first()
        except Exception:
            return None
