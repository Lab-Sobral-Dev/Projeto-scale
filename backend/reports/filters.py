# apps/reports/filters.py
from django.db.models import Q
from django.utils.dateparse import parse_date
from registro.audit_models import AuditLog

def date_range(request, field='data_hora'):
    di = request.GET.get('data_inicial')
    df = request.GET.get('data_final')
    return di, df, field

def apply_date_filter(qs, request, field):
    di, df, _ = date_range(request, field)
    if di: qs = qs.filter(**{f"{field}__date__gte": di})
    if df: qs = qs.filter(**{f"{field}__date__lte": df})
    return qs

def text(request, key):
    v = request.GET.get(key)
    return v.strip() if v else None

def list_or_none(v):
    return [x for x in v.split(',') if x] if v else None

def audit_base_filters(qs, request):
    qs = apply_date_filter(qs, request, 'timestamp')
    usuario = text(request, 'usuario')
    if usuario:
        qs = qs.filter(Q(user__username__icontains=usuario)|
                       Q(user__first_name__icontains=usuario)|
                       Q(user__last_name__icontains=usuario))
    acao = text(request, 'action')
    if acao:
        qs = qs.filter(action=acao)
    tabela = text(request, 'model')
    if tabela:
        qs = qs.filter(model__icontains=tabela)
    return qs
