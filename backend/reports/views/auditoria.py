# apps/reports/views/auditoria.py
from rest_framework.views import APIView
from rest_framework.response import Response
from registro.audit_models import AuditLog
from ..serializers import AuditLogSerializer
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import audit_base_filters, text

class AuditoriaAcoesReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = AuditLog.objects.all()
        qs = audit_base_filters(qs, request)
        export = request.GET.get('export')

        header = ["Data/Hora","Usuário","Ação","Modelo","Objeto","Path","Método","Status","IP"]
        rows = [[
            a.timestamp.strftime("%Y-%m-%d %H:%M"), 
            (a.user.get_full_name() or a.user.username) if a.user else "anônimo",
            a.action, a.model, a.object_pk, a.path, a.method, a.status_code, a.ip
        ] for a in qs]

        if export == 'csv':
            return export_csv("auditoria_acoes", header, rows)
        if export == 'pdf':
            return export_pdf("auditoria_acoes", "Relatório de Ações de Usuário", header, rows)
        return Response(AuditLogSerializer(qs, many=True).data)

class AuditoriaExclusoesReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = AuditLog.objects.filter(action='delete')
        qs = audit_base_filters(qs, request)
        export = request.GET.get('export')

        header = ["Data/Hora","Usuário","Modelo","Objeto","Motivo (changes/extra)","Path","Status"]
        def motivo(a):
            # tenta extrair motivos em changes/extra
            c = a.changes or {}
            e = a.extra or {}
            return c.get('motivo') or e.get('motivo') or e.get('reason') or ""
        rows = [[
            a.timestamp.strftime("%Y-%m-%d %H:%M"),
            (a.user.get_full_name() or a.user.username) if a.user else "anônimo",
            a.model, a.object_pk, motivo(a), a.path, a.status_code
        ] for a in qs]

        if export == 'csv':
            return export_csv("auditoria_exclusoes", header, rows)
        if export == 'pdf':
            return export_pdf("auditoria_exclusoes", "Relatório de Exclusões de Registros", header, rows)
        return Response(AuditLogSerializer(qs, many=True).data)

class AuditoriaAuthErrosReportView(APIView):
    """
    Erros HTTP e eventos de login/logout/token_refresh.
    """
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = AuditLog.objects.filter(
            # status >= 400 ou ações de auth
        ).filter(
            # OR encadeado:
            (   # erros
                (   # hack: DRF não facilita >= no filter com None; vamos filtrar != None e >= 400
                    ( ~ (AuditLog.objects.none().query) )  # no-op p/ form
                )
            )
        )
        # Na prática: construímos via Q (mais simples):
        from django.db.models import Q
        qs = AuditLog.objects.filter(
            Q(status_code__gte=400) |
            Q(action__in=['login','logout','token_refresh','error'])
        )
        from ..filters import audit_base_filters
        qs = audit_base_filters(qs, request)

        export = request.GET.get('export')
        header = ["Data/Hora","Usuário","Ação","Status","Path","User-Agent","IP"]
        rows = [[
            a.timestamp.strftime("%Y-%m-%d %H:%M"),
            (a.user.get_full_name() or a.user.username) if a.user else "anônimo",
            a.action, a.status_code, a.path, (a.user_agent or "")[:120], a.ip
        ] for a in qs]

        if export == 'csv':
            return export_csv("auditoria_erros_login", header, rows)
        if export == 'pdf':
            return export_pdf("auditoria_erros_login", "Relatório de Erros e Tentativas de Login", header, rows)
        return Response(AuditLogSerializer(qs, many=True).data)
