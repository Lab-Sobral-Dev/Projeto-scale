# backend/registro/middleware_env.py
import logging

from .db_context import ENV_TO_ALIAS, set_db, clear_db

logger = logging.getLogger(__name__)


class EnvSwitchMiddleware:
    """
    Define o banco ativo (thread-local) por requisição:
    - Login (/auth/login/): lê ?env= do query param.
    - Demais endpoints: lê claim 'env' do JWT (sem validar assinatura —
      a validação completa acontece no JWTAuthentication do DRF).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_db(self._resolve_alias(request))
        try:
            return self.get_response(request)
        finally:
            clear_db()

    def _resolve_alias(self, request) -> str:
        # Prioridade 1: query param (usado no endpoint de login)
        env_param = request.GET.get("env", "").strip().lower()
        if env_param in ENV_TO_ALIAS:
            return ENV_TO_ALIAS[env_param]

        # Prioridade 2: claim 'env' no JWT (sem validar assinatura aqui)
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Bearer "):
            try:
                from rest_framework_simplejwt.tokens import AccessToken
                token = AccessToken(auth.split(" ", 1)[1])
                env_claim = str(token.get("env", "prod")).lower()
                return ENV_TO_ALIAS.get(env_claim, "default")
            except Exception as e:
                logger.debug("EnvSwitchMiddleware: token decode failed: %s", e)

        return "default"
