# apps/reports/views/backups.py
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from registro.backup import BackupRecord
from registro.audit_models import AuditLog
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import apply_date_filter, text
from ..datetime_utils import fmt_gmt3_with_zone

class BackupsReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = BackupRecord.objects.select_related('executed_by').all().order_by('-created_at')
        qs = apply_date_filter(qs, request, 'created_at')
        usuario = text(request, 'usuario')
        if usuario:
            qs = qs.filter(
                Q(executed_by__username__icontains=usuario)
                | Q(executed_by__first_name__icontains=usuario)
                | Q(executed_by__last_name__icontains=usuario)
            )
        export = request.GET.get('export')
        header = ["Data/Hora","Usuário","Tipo","Status"]
        rows = []
        data = []
        for b in qs:
            tipo = "Automático" if (b.executed_by is None or "celery-auto-backup" in (b.user_agent or "")) else "Manual"
            status = "OK" if b.status == "success" else "Erro"
            ts = fmt_gmt3_with_zone(b.created_at)
            usuario_nome = (b.executed_by.get_full_name() or b.executed_by.username) if b.executed_by else "sistema"
            rows.append([ts,
                         usuario_nome,
                         tipo, status])
            data.append({"timestamp": ts, "usuario": usuario_nome,
                         "tipo": tipo, "status": status})
        if export == 'csv':
            return export_csv("backups", header, rows)
        if export == 'pdf':
            return export_pdf("backups", "Relatório de Backups Executados", header, rows)
        return Response(data)

class RestoresReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = AuditLog.objects.filter(action='restore')
        qs = apply_date_filter(qs, request, 'timestamp')
        usuario = text(request, 'usuario')
        if usuario:
            qs = qs.filter(
                Q(user__username__icontains=usuario)
                | Q(user__first_name__icontains=usuario)
                | Q(user__last_name__icontains=usuario)
            )
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