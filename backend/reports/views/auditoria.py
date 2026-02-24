# apps/reports/views/auditoria.py
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from registro.audit_models import AuditLog
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import audit_base_filters
from ..datetime_utils import fmt_gmt3_with_zone

# ----------------------------
# Helpers
# ----------------------------

def _fmt_dt(dt):
    return fmt_gmt3_with_zone(dt)


def _human_model_name(model):
    nomes = {
        "Pesagem": "Pesagem",
        "Produto": "Produto",
        "MateriaPrima": "Matéria-prima",
        "OrdemProducao": "Ordem de produção",
        "ItemOP": "Item da OP",
        "Balanca": "Balança",
    }
    return nomes.get(model or "", model or "Registro")


def _human_action(action):
    return {
        "create": "Inserção",
        "update": "Edição",
        "delete": "Exclusão",
    }.get(action, action or "")


def _to_text(data):
    if not data:
        return ""
    if isinstance(data, dict):
        return "; ".join([f"{k}: {v}" for k, v in data.items()])
    return str(data)


def _extract_reason(a: AuditLog):
    c = a.changes or {}
    e = a.extra or {}
    return c.get("motivo") or e.get("motivo") or e.get("reason") or ""


def _before_after(a: AuditLog):
    if a.action == "update":
        before, after = {}, {}
        for field, values in (a.changes or {}).items():
            if isinstance(values, (list, tuple)) and len(values) == 2:
                before[field] = values[0]
                after[field] = values[1]
        return before, after
    if a.action == "delete":
        return a.changes or {}, {}
    if a.action == "create":
        return {}, a.changes or {}
    return {}, {}


def _human_description(a: AuditLog):
    tipo = _human_model_name(a.model)
    objeto = a.object_pk or "sem identificação"
    if a.action == "create":
        return f"{_human_user(a.user)} realizou uma nova inclusão de {tipo} (ID {objeto})."
    if a.action == "update":
        return f"{_human_user(a.user)} editou um registro de {tipo} (ID {objeto})."
    if a.action == "delete":
        return f"{_human_user(a.user)} excluiu um registro de {tipo} (ID {objeto})."
    return f"{_human_user(a.user)} realizou uma ação em {tipo} (ID {objeto})."

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
            .filter(action__in=["create", "update", "delete"])
            .all()
            .order_by("-timestamp")
        )
        qs = audit_base_filters(qs, request)

        header = [
            "Data/Hora (GMT-3)", "Usuário", "Tipo de alteração", "Registro",
            "Descrição", "Motivo", "Antes", "Depois"
        ]

        def row(a: AuditLog):
            before, after = _before_after(a)
            return [
                _fmt_dt(a.timestamp),
                _human_user(a.user),
                _human_action(a.action),
                f"{_human_model_name(a.model)} #{a.object_pk or '—'}",
                _human_description(a),
                _extract_reason(a),
                _to_text(before),
                _to_text(after),
            ]

        # Exportações
        export = (request.GET.get("export") or "").lower()
        if export == "csv":
            rows = [row(a) for a in qs.iterator()]
            return export_csv("auditoria_acoes", header, rows)
        if export == "pdf":
            rows = [row(a) for a in qs.iterator()]
            return export_pdf("auditoria_administracao", "Relatório de Administração — Alterações de Dados", header, rows)

        # JSON (paginado) com chaves que o front espera
        def to_payload(a: AuditLog):
            before, after = _before_after(a)
            return {
                "timestamp": _fmt_dt(a.timestamp),
                "usuario": _human_user(a.user),
                "tipo_alteracao": _human_action(a.action),
                "registro": f"{_human_model_name(a.model)} #{a.object_pk or '—'}",
                "descricao": _human_description(a),
                "motivo": _extract_reason(a),
                "antes": _to_text(before),
                "depois": _to_text(after),
            }

        return _paginate(request, qs, to_payload)


# =========================================================
# Auditoria — Exclusões
# =========================================================
class AuditoriaExclusoesReportView(APIView):
    permission_classes = [IsReportViewer]

    def get(self, request):
        return Response({"detail": "Relatório removido. As exclusões agora fazem parte do relatório de Administração — Ações."}, status=410)


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

        header = ["Data/Hora (GMT-3)", "Usuário", "Evento", "Resultado da tentativa de login", "Motivo", "Detalhes"]

        def _resultado_login(a: AuditLog):
            is_login_event = (a.action == "login") or ("/auth/login" in (a.path or ""))
            if not is_login_event:
                return "Não se aplica"
            if a.status_code and a.status_code < 400:
                return "Login bem sucedido"
            return "Login mal sucedido"

        def _motivo(a: AuditLog):
            extra = a.extra or {}
            if a.status_code == 401:
                return extra.get("reason") or "Usuário ou senha incorretos"
            if a.status_code == 403:
                return extra.get("reason") or "Usuário desativado"
            if a.status_code == 423:
                return extra.get("reason") or "Usuário bloqueado"
            if a.status_code and a.status_code >= 400:
                return extra.get("reason") or "Falha na autenticação"
            return ""

        def row(a: AuditLog):
            return [
                _fmt_dt(a.timestamp),
                _human_user(a.user),
                "Tentativa de login" if (a.action == "login" or "/auth/login" in (a.path or "")) else "Evento de autenticação/erro",
                _resultado_login(a),
                _motivo(a),
                (a.user_agent or "").replace("\n", " ").strip()[:120],
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
                "evento": "Tentativa de login" if (a.action == "login" or "/auth/login" in (a.path or "")) else "Evento de autenticação/erro",
                "resultado_tentativa": _resultado_login(a),
                "motivo": _motivo(a),
                "detalhes": (a.user_agent or ""),
            }

        return _paginate(request, qs, to_payload)
