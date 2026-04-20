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
