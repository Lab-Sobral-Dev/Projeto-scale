# registro/middleware.py
import time
from .models.audit import AuditLog
from .utils.audit import client_ip
from django.conf import settings

class AuditRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        if not getattr(settings, "AUDIT_ENABLED", False):
            return self.get_response(request)
        start = time.time()
        response = self.get_response(request)
        duration_ms = int((time.time() - start)*1000)

        # Opcional: reduzir ruído ignorando GETs estáticos/healthcheck
        if request.path.startswith("/static/"): 
            return response

        AuditLog.objects.create(
            user=getattr(request, "user", None) if getattr(request, "user", None) and request.user.is_authenticated else None,
            ip=client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT",""),
            path=request.path,
            method=request.method,
            status_code=getattr(response, "status_code", None),
            action="request",
            extra={"duration_ms": duration_ms}
        )
        return response
