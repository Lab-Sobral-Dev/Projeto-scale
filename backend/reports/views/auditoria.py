# apps/reports/views/auditoria.py
from datetime import datetime
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from registro.audit_models import AuditLog
from ..serializers import AuditLogSerializer  # mantém para compat, mas abaixo retornamos payload próprio
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import audit_base_filters

# ----------------------------
# Helpers
# ----------------------------

def _fmt_dt(dt):
    """ISO curto com minuto (fica legível e ordenável)."""
    if not dt:
        return ""
    # usa timezone-aware -> isoformat; ex: 2025-09-15T17:24
    return dt.isoformat(timespec="minutes")

def _human_user(u):
    if not u:
        return "anônimo"
    full = (u.get_full_name() or "").strip()
    return full or u.username

def _paginate(request, queryset, serializer_fn):
    """Retorna resposta paginada no padrão DRF."""
    paginator = PageNumberPagination()
    try:
        page_size = int(request.GET.get("page_size") or 50)
    except Exception:
        page_size = 50
    paginator.page_size = page_size

    page = paginator.paginate_queryset(queryset, request)
    data = [serializer_fn(obj) for obj in page]
    return paginator.get_paginated_response(data)


# =========================================================
# Auditoria — Ações de Usuário
# =========================================================
class AuditoriaAcoesReportView(APIView):
    permission_classes = [IsReportViewer]

    def get(self, request):
        qs = (
            AuditLog.objects.select_related("user")
            .all()
            .order_by("-timestamp")
        )
        qs = audit_base_filters(qs, request)

        header = [
            "Data/Hora", "Usuário", "Ação", "Modelo", "Objeto",
            "Path", "Método", "Status", "IP"
        ]

        def row(a: AuditLog):
            return [
                _fmt_dt(a.timestamp),
                _human_user(a.user),
                a.action or "",
                a.model or "",
                a.object_pk or "",
                a.path or "",
                a.method or "",
                "" if a.status_code is None else str(a.status_code),
                a.ip or "",
            ]

        # Exportações
        export = (request.GET.get("export") or "").lower()
        if export == "csv":
            rows = [row(a) for a in qs.iterator()]
            return export_csv("auditoria_acoes", header, rows)
        if export == "pdf":
            rows = [row(a) for a in qs.iterator()]
            return export_pdf("auditoria_acoes", "Relatório de Ações de Usuário", header, rows)

        # JSON (paginado) com chaves que o front espera
        def to_payload(a: AuditLog):
            return {
                "timestamp": _fmt_dt(a.timestamp),
                "usuario": _human_user(a.user),
                "action": a.action or "",
                "model": a.model or "",
                "object_pk": a.object_pk or "",
                "path": a.path or "",
                "method": a.method or "",
                "status_code": a.status_code,
                "ip": a.ip or "",
            }

        return _paginate(request, qs, to_payload)


# =========================================================
# Auditoria — Exclusões
# =========================================================
class AuditoriaExclusoesReportView(APIView):
    permission_classes = [IsReportViewer]

    def get(self, request):
        qs = (
            AuditLog.objects.select_related("user")
            .filter(action="delete")
            .order_by("-timestamp")
        )
        qs = audit_base_filters(qs, request)

        header = ["Data/Hora", "Usuário", "Modelo", "Objeto", "Motivo", "Path", "Status"]

        def _motivo(a: AuditLog):
            c = a.changes or {}
            e = a.extra or {}
            return (c.get("motivo") or e.get("motivo") or e.get("reason") or "") or ""

        def row(a: AuditLog):
            return [
                _fmt_dt(a.timestamp),
                _human_user(a.user),
                a.model or "",
                a.object_pk or "",
                _motivo(a),
                a.path or "",
                "" if a.status_code is None else str(a.status_code),
            ]

        export = (request.GET.get("export") or "").lower()
        if export == "csv":
            rows = [row(a) for a in qs.iterator()]
            return export_csv("auditoria_exclusoes", header, rows)
        if export == "pdf":
            rows = [row(a) for a in qs.iterator()]
            return export_pdf("auditoria_exclusoes", "Relatório de Exclusões de Registros", header, rows)

        def to_payload(a: AuditLog):
            return {
                "timestamp": _fmt_dt(a.timestamp),
                "usuario": _human_user(a.user),
                "model": a.model or "",
                "object_pk": a.object_pk or "",
                "motivo": _motivo(a),
                "path": a.path or "",
                "status_code": a.status_code,
            }

        return _paginate(request, qs, to_payload)


# =========================================================
# Auditoria — Erros e Login
# =========================================================
class AuditoriaAuthErrosReportView(APIView):
    """
    Erros HTTP (status_code >= 400) e eventos de autenticação:
    login, logout, token_refresh e 'error'.
    """
    permission_classes = [IsReportViewer]

    def get(self, request):
        qs = (
            AuditLog.objects.select_related("user")
            .filter(
                Q(status_code__gte=400) |
                Q(action__in=["login", "logout", "token_refresh", "error"])
            )
            .order_by("-timestamp")
        )
        qs = audit_base_filters(qs, request)

        header = ["Data/Hora", "Usuário", "Ação", "Status", "Path", "User-Agent", "IP"]

        def row(a: AuditLog):
            ua = (a.user_agent or "").replace("\n", " ").strip()
            return [
                _fmt_dt(a.timestamp),
                _human_user(a.user),
                a.action or "",
                "" if a.status_code is None else str(a.status_code),
                a.path or "",
                ua[:120],  # limita no PDF/CSV para caber
                a.ip or "",
            ]

        export = (request.GET.get("export") or "").lower()
        if export == "csv":
            rows = [row(a) for a in qs.iterator()]
            return export_csv("auditoria_erros_login", header, rows)
        if export == "pdf":
            rows = [row(a) for a in qs.iterator()]
            return export_pdf("auditoria_erros_login", "Relatório de Erros e Tentativas de Login", header, rows)

        def to_payload(a: AuditLog):
            return {
                "timestamp": _fmt_dt(a.timestamp),
                "usuario": _human_user(a.user),
                "action": a.action or "",
                "status_code": a.status_code,
                "path": a.path or "",
                "user_agent": (a.user_agent or ""),
                "ip": a.ip or "",
            }

        return _paginate(request, qs, to_payload)
