# apps/reports/views/balancas.py
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Count
from registro.models import Pesagem
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import apply_date_filter, text

class BalancasUsoReportView(APIView):
    permission_classes = [IsReportViewer]

    def get_queryset(self, request):
        qs = Pesagem.objects.select_related('balanca','op__produto','item_op__materia_prima')
        qs = apply_date_filter(qs, request, 'data_hora')

        balanca = text(request,'balanca')
        if balanca: qs = qs.filter(balanca__nome__icontains=balanca)
        operador = text(request,'operador')
        if operador: qs = qs.filter(pesador__icontains=operador)
        produto = text(request,'produto')
        if produto: qs = qs.filter(op__produto__nome__icontains=produto)
        mp = text(request,'materia_prima')
        if mp: qs = qs.filter(item_op__materia_prima__nome__icontains=mp)
        return qs

    def get(self, request):
        qs = self.get_queryset(request)
        export = request.GET.get('export')
        header = ["Balança","Qtd. Pesagens","Primeira Utilização","Última Utilização"]
        by_bal = {}
        for p in qs:
            key = p.balanca.nome if p.balanca else "—"
            d = by_bal.setdefault(key, {"count":0, "min":p.data_hora, "max":p.data_hora})
            d["count"] += 1
            d["min"] = min(d["min"], p.data_hora)
            d["max"] = max(d["max"], p.data_hora)
        rows = [[k, v["count"], v["min"].strftime("%Y-%m-%d %H:%M"), v["max"].strftime("%Y-%m-%d %H:%M")] for k,v in by_bal.items()]

        if export == 'csv':
            return export_csv("relatorio_balancas", header, rows)
        if export == 'pdf':
            return export_pdf("relatorio_balancas", "Relatório de Utilização de Balanças", header, rows)
        return Response([{"balanca":k, **v} for k,v in by_bal.items()])
