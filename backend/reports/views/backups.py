# apps/reports/views/backups.py
from rest_framework.views import APIView
from rest_framework.response import Response
from registro.audit_models import AuditLog
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import audit_base_filters
from ..datetime_utils import fmt_gmt3_with_zone

class BackupsReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = AuditLog.objects.filter(action='backup')
        qs = audit_base_filters(qs, request)
        export = request.GET.get('export')
        header = ["Data/Hora","Usuário","Tipo","Arquivo","Tamanho","Observações"]
        rows = []
        data = []
        for a in qs:
            tipo = (a.extra or {}).get('tipo')  # manual/automatico
            arquivo = (a.extra or {}).get('arquivo')
            tamanho = (a.extra or {}).get('tamanho')
            obs = (a.extra or {}).get('obs') or ""
            ts = fmt_gmt3_with_zone(a.timestamp)
            rows.append([ts,
                         (a.user.get_full_name() or a.user.username) if a.user else "anônimo",
                         tipo, arquivo, tamanho, obs])
            data.append({"timestamp": ts, "usuario": (a.user.get_full_name() or a.user.username) if a.user else "anônimo",
                         "tipo":tipo,"arquivo":arquivo,"tamanho":tamanho,"obs":obs})
        if export == 'csv':
            return export_csv("backups", header, rows)
        if export == 'pdf':
            return export_pdf("backups", "Relatório de Backups Executados", header, rows)
        return Response(data)

class RestoresReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = AuditLog.objects.filter(action='restore')
        qs = audit_base_filters(qs, request)
        export = request.GET.get('export')
        header = ["Data/Hora","Usuário","Arquivo Origem","Resultado","Observações"]
        rows, data = [], []
        for a in qs:
            arquivo = (a.extra or {}).get('arquivo')
            resultado = (a.extra or {}).get('resultado')
            obs = (a.extra or {}).get('obs') or ""
            ts = fmt_gmt3_with_zone(a.timestamp)
            rows.append([ts,
                         (a.user.get_full_name() or a.user.username) if a.user else "anônimo",
                         arquivo, resultado, obs])
            data.append({"timestamp":ts,"usuario": (a.user.get_full_name() or a.user.username) if a.user else "anônimo",
                        "arquivo":arquivo,"resultado":resultado,"obs":obs})
        if export == 'csv':
            return export_csv("restores", header, rows)
        if export == 'pdf':
            return export_pdf("restores", "Relatório de Restaurações", header, rows)
        return Response(data)