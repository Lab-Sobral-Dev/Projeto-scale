# registro/audit_filters.py
import django_filters
from django.db.models import Q
from django.db import connection

from registro.audit_models import AuditLog


def _has_key_supported() -> bool:
    """
    Verifica suporte razoável a lookups JSON 'has_key'.
    PostgreSQL: sim; SQLite: depende da build. Mantemos fallback seguro.
    """
    return connection.vendor == "postgresql"


class AuditLogFilter(django_filters.FilterSet):
    # Básicos
    q           = django_filters.CharFilter(method="filter_q")
    start       = django_filters.IsoDateTimeFilter(field_name="timestamp", lookup_expr="gte")
    end         = django_filters.IsoDateTimeFilter(field_name="timestamp", lookup_expr="lte")
    action      = django_filters.CharFilter(field_name="action", lookup_expr="exact")
    method      = django_filters.CharFilter(field_name="method", lookup_expr="exact")
    model       = django_filters.CharFilter(field_name="model", lookup_expr="icontains")
    status_code = django_filters.NumberFilter(field_name="status_code", lookup_expr="exact")
    user        = django_filters.CharFilter(method="filter_user_any")           # aceita id, username, nome
    path        = django_filters.CharFilter(field_name="path", lookup_expr="exact")
    ordering    = django_filters.OrderingFilter(
        fields=(("timestamp", "timestamp"), ("status_code", "status_code")),
        field_labels={"timestamp": "timestamp", "status_code": "status_code"},
    )

    # Motivo (em changes/extra)
    reason      = django_filters.CharFilter(method="filter_reason")

    # Avançados (pareados com o frontend)
    action_group   = django_filters.CharFilter(method="filter_action_group")   # seguranca|dados|request|impressao|erro
    status_group   = django_filters.CharFilter(method="filter_status_group")   # 2xx|4xx|5xx|none
    anon           = django_filters.CharFilter(method="filter_anon")           # sim|nao
    has_reason     = django_filters.CharFilter(method="filter_has_reason")     # sim|nao
    has_changes    = django_filters.CharFilter(method="filter_has_changes")    # sim|nao
    has_extra      = django_filters.CharFilter(method="filter_has_extra")      # sim|nao
    path_contains  = django_filters.CharFilter(field_name="path", lookup_expr="icontains")
    ua_contains    = django_filters.CharFilter(field_name="user_agent", lookup_expr="icontains")
    ip             = django_filters.CharFilter(field_name="ip", lookup_expr="exact")
    object_pk      = django_filters.CharFilter(field_name="object_pk", lookup_expr="exact")

    class Meta:
        model = AuditLog
        fields = [
            "q", "start", "end",
            "action", "method", "model", "status_code", "user", "path",
            "reason",
            "action_group", "status_group", "anon",
            "has_reason", "has_changes", "has_extra",
            "path_contains", "ua_contains", "ip", "object_pk",
        ]

    # ---------------------------
    # Métodos
    # ---------------------------

    def filter_q(self, qs, name, value):
        if not value:
            return qs
        v = value.strip()
        return qs.filter(
            Q(path__icontains=v) |
            Q(model__icontains=v) |
            Q(object_pk__icontains=v) |
            Q(user_agent__icontains=v) |
            Q(ip__icontains=v) |
            Q(user__username__icontains=v)
        )

    def filter_user_any(self, qs, name, value):
        if not value:
            return qs
        v = value.strip()
        q = Q(user__username__icontains=v) | Q(user__first_name__icontains=v) | Q(user__last_name__icontains=v)
        if v.isdigit():
            q |= Q(user_id=int(v))
        return qs.filter(q)

    def filter_reason(self, qs, name, value):
        if not value:
            return qs
        v = value.strip()
        keys = [
            "reason", "motivo", "motivo_edicao", "motivo_exclusao",
            "edit_reason", "delete_reason",
        ]
        q = Q()
        for k in keys:
            q |= Q(**{f"changes__{k}": v}) | Q(**{f"extra__{k}": v})
        return qs.filter(q)

    def filter_action_group(self, qs, name, value):
        grp = (value or "").lower().strip()
        mapping = {
            "seguranca": {"login", "logout", "token_refresh"},
            "dados":     {"create", "update", "delete"},
            "request":   {"request"},
            "impressao": {"label_print"},
            "erro":      {"error"},
        }
        actions = mapping.get(grp)
        if not actions:
            return qs
        return qs.filter(action__in=list(actions))

    def filter_status_group(self, qs, name, value):
        v = (value or "").lower().strip()
        if v == "2xx":
            return qs.filter(status_code__gte=200, status_code__lt=300)
        if v == "4xx":
            return qs.filter(status_code__gte=400, status_code__lt=500)
        if v == "5xx":
            return qs.filter(status_code__gte=500)
        if v == "none":
            return qs.filter(Q(status_code__isnull=True))
        return qs

    def filter_anon(self, qs, name, value):
        v = (value or "").lower().strip()
        if v == "sim":
            return qs.filter(user__isnull=True)
        if v == "nao":
            return qs.filter(user__isnull=False)
        return qs

    def _q_has_any_reason_key(self):
        keys = [
            "reason", "motivo", "motivo_edicao", "motivo_exclusao",
            "edit_reason", "delete_reason",
            "reason_note", "motivo_obs", "motivo_observacao", "edit_reason_note",
        ]
        if _has_key_supported():
            q = Q()
            for k in keys:
                q |= Q(**{f"changes__has_key": k}) | Q(**{f"extra__has_key": k})
            return q
        # Fallback genérico (SQLite ou builds sem has_key): testa "{}" vs não-vazio
        # + contém substring do nome da chave no JSON serializado
        q = ~Q(changes={}) | ~Q(extra={})
        for k in keys:
            q |= Q(changes__icontains=f'"{k}"') | Q(extra__icontains=f'"{k}"')
        return q

    def filter_has_reason(self, qs, name, value):
        v = (value or "").lower().strip()
        q_has = self._q_has_any_reason_key()
        if v == "sim":
            return qs.filter(q_has)
        if v == "nao":
            return qs.exclude(q_has)
        return qs

    def filter_has_changes(self, qs, name, value):
        v = (value or "").lower().strip()
        if v == "sim":
            return qs.exclude(Q(changes={}) | Q(changes__isnull=True))
        if v == "nao":
            return qs.filter(Q(changes={}) | Q(changes__isnull=True))
        return qs

    def filter_has_extra(self, qs, name, value):
        v = (value or "").lower().strip()
        if v == "sim":
            return qs.exclude(Q(extra={}) | Q(extra__isnull=True))
        if v == "nao":
            return qs.filter(Q(extra={}) | Q(extra__isnull=True))
        return qs
