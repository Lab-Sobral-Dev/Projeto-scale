# apps/reports/views/auditoria.py
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from registro.audit_models import AuditLog
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import audit_base_filters, text
from ..datetime_utils import fmt_gmt3_with_zone


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


def _human_user(u):
    if not u:
        return "Sistema"
    full = (u.get_full_name() or "").strip()
    return full or u.username


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


def _paginate(request, queryset, serializer_fn):
    paginator = PageNumberPagination()
    try:
        page_size = int(request.GET.get("page_size") or 50)
    except Exception:
        page_size = 50
    paginator.page_size = page_size

    page = paginator.paginate_queryset(queryset, request)
    data = [serializer_fn(obj) for obj in page]
    return paginator.get_paginated_response(data)


class AuditoriaAcoesReportView(APIView):
    permission_classes = [IsReportViewer]

    def _base_qs(self):
        return (
            AuditLog.objects.select_related("user")
            .filter(action__in=["create", "update", "delete"])
            .exclude(model__iexact="BackupRecord")
            .exclude(path__icontains="backup")
            .order_by("-timestamp")
        )

    def get(self, request):
        qs = audit_base_filters(self._base_qs(), request)

        if (request.GET.get("meta") or "").lower() == "filters":
            users = sorted({(x.user.username, _human_user(x.user)) for x in qs if x.user}, key=lambda y: y[1].lower())
            modelos = sorted({(x.model or "") for x in qs if x.model})
            return Response({
                "usuario": [{"value": u[0], "label": u[1]} for u in users],
                "action": [
                    {"value": "create", "label": "Inserção"},
                    {"value": "update", "label": "Edição"},
                    {"value": "delete", "label": "Exclusão"},
                ],
                "model": [{"value": m, "label": _human_model_name(m)} for m in modelos],
            })

        header = [
            "Data/Hora (GMT-3)", "Tipo de alteração", "Usuário", "Registro",
            "Motivo", "Descrição", "Antes", "Depois"
        ]

        def row(a: AuditLog):
            before, after = _before_after(a)
            return [
                _fmt_dt(a.timestamp),
                _human_action(a.action),
                _human_user(a.user),
                f"{_human_model_name(a.model)} #{a.object_pk or '—'}",
                _extract_reason(a),
                _human_description(a),
                _to_text(before),
                _to_text(after),
            ]

        export = (request.GET.get("export") or "").lower()
        if export == "csv":
            return export_csv("auditoria_acoes", header, [row(a) for a in qs.iterator()])
        if export == "pdf":
            return export_pdf("auditoria_administracao", "Relatório de Administração — Alterações de Dados", header, [row(a) for a in qs.iterator()])

        def to_payload(a: AuditLog):
            before, after = _before_after(a)
            return {
                "timestamp": _fmt_dt(a.timestamp),
                "tipo_alteracao": _human_action(a.action),
                "usuario": _human_user(a.user),
                "registro": f"{_human_model_name(a.model)} #{a.object_pk or '—'}",
                "motivo": _extract_reason(a),
                "descricao": _human_description(a),
                "antes": _to_text(before),
                "depois": _to_text(after),
            }

        return _paginate(request, qs, to_payload)


class AuditoriaExclusoesReportView(APIView):
    permission_classes = [IsReportViewer]

    def get(self, request):
        return Response({"detail": "Relatório removido. As exclusões agora fazem parte do relatório de Administração — Ações."}, status=410)


class AuditoriaAuthErrosReportView(APIView):
    permission_classes = [IsReportViewer]

    def _base_qs(self):
        return AuditLog.objects.select_related("user").filter(action="login").order_by("-timestamp")

    def _username_input(self, a: AuditLog):
        return ((a.extra or {}).get("username") or "").strip()

    def _motivo(self, a: AuditLog):
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

    def _failure_flags(self, a: AuditLog):
        reason = (self._motivo(a) or "").lower()
        kind = ((a.extra or {}).get("failure_kind") or "").lower()
        falha_usuario = kind == "username" or "usuário incorreto" in reason
        falha_senha = kind == "password" or "senha incorreta" in reason
        return falha_usuario, falha_senha

    def get(self, request):
        qs = self._base_qs()
        qs = audit_base_filters(qs, request)

        username_input = text(request, "usuario_informado")
        if username_input:
            qs = qs.filter(extra__username__icontains=username_input)

        if (request.GET.get("meta") or "").lower() == "filters":
            users = sorted({(x.user.username, _human_user(x.user)) for x in qs if x.user}, key=lambda y: y[1].lower())
            informados = sorted({self._username_input(x) for x in qs if self._username_input(x)})
            return Response({
                "usuario": [{"value": u[0], "label": u[1]} for u in users],
                "usuario_informado": [{"value": u, "label": u} for u in informados],
            })

        header = [
            "Data/Hora (GMT-3)", "Usuário informado", "Usuário identificado", "Resultado da tentativa",
            "Usuário incorreto?", "Senha incorreta?", "Motivo", "Detalhes"
        ]

        def row(a: AuditLog):
            falha_usuario, falha_senha = self._failure_flags(a)
            return [
                _fmt_dt(a.timestamp),
                self._username_input(a) or "—",
                _human_user(a.user) if a.user else "—",
                "Login bem sucedido" if (a.status_code and a.status_code < 400) else "Login mal sucedido",
                "Sim" if falha_usuario else "Não",
                "Sim" if falha_senha else "Não",
                self._motivo(a),
                (a.user_agent or "").replace("\n", " ").strip()[:120],
            ]

        export = (request.GET.get("export") or "").lower()
        if export == "csv":
            return export_csv("auditoria_erros_login", header, [row(a) for a in qs.iterator()])
        if export == "pdf":
            return export_pdf("auditoria_erros_login", "Relatório de Administração — Erros e Login", header, [row(a) for a in qs.iterator()])

        def to_payload(a: AuditLog):
            falha_usuario, falha_senha = self._failure_flags(a)
            return {
                "timestamp": _fmt_dt(a.timestamp),
                "usuario_informado": self._username_input(a) or "—",
                "usuario": _human_user(a.user) if a.user else "—",
                "resultado_tentativa": "Login bem sucedido" if (a.status_code and a.status_code < 400) else "Login mal sucedido",
                "falha_usuario": falha_usuario,
                "falha_senha": falha_senha,
                "motivo": self._motivo(a),
                "detalhes": (a.user_agent or ""),
            }

        return _paginate(request, qs, to_payload)
