# reports/views/lotes.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Sum
from registro.models import OrdemProducao, Pesagem
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import apply_date_filter, text
from ..datetime_utils import fmt_gmt3_with_zone

class LotesReportView(APIView, PageNumberPagination):
    permission_classes = [IsReportViewer]
    page_size = 50

    def get_queryset(self, request):
        qs = OrdemProducao.objects.select_related('produto')
        qs = apply_date_filter(qs, request, 'criada_em')

        produto = text(request, 'produto')
        if produto:
            qs = qs.filter(produto__nome__icontains=produto)

        mp = text(request, 'materia_prima')
        if mp:
            qs = qs.filter(itemop__materia_prima__nome__icontains=mp).distinct()

        opn = text(request, 'op')
        if opn:
            qs = qs.filter(numero__icontains=opn)

        return qs.order_by('-criada_em')

    def get(self, request):
        qs = self.get_queryset(request)
        export = request.GET.get('export')

        header = ["Data Criação","OP","Produto","Lote","Status","Total Pesado (g)","Itens (qtde)"]
        rows = []
        for op in qs:
            total = Pesagem.objects.filter(op=op).aggregate(s=Sum('liquido'))['s'] or 0
            itens = op.itemop_set.count()
            rows.append([
                fmt_gmt3_with_zone(op.criada_em),
                op.numero, op.produto.nome, op.lote, op.status,
                f"{total:.3f}", itens
            ])

        if export == 'csv':
            return export_csv("relatorio_lotes", header, rows)

        if export == 'pdf':
            return export_pdf("relatorio_lotes", "Relatório de Lotes Produzidos", header, rows)

        # JSON simples (sem paginação aqui; se quiser paginação, use self.paginate_queryset)
        data = [{
            "criada_em": fmt_gmt3_with_zone(op.criada_em),
            "op": op.numero,
            "produto": op.produto.nome,
            "lote": op.lote,
            "status": op.status,
            "total_pesado_g": float(Pesagem.objects.filter(op=op).aggregate(s=Sum('liquido'))['s'] or 0),
            "itens": op.itemop_set.count(),
        } for op in qs]

        return Response(data)