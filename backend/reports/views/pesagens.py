# apps/reports/views/pesagens.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, F
from registro.models import Pesagem, OrdemProducao, ItemOP
from ..serializers import PesagemSerializer
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import apply_date_filter, text
from ..datetime_utils import fmt_gmt3_with_zone

class PesagensReportView(APIView, PageNumberPagination):
    permission_classes = [IsReportViewer]
    page_size = 50

    def get_queryset(self, request):
        qs = Pesagem.objects.select_related('op','item_op__materia_prima','op__produto','balanca')
        qs = apply_date_filter(qs, request, 'data_hora')

        produto = text(request, 'produto')
        if produto:
            if produto.isdigit():
                qs = qs.filter(op__produto_id=int(produto))
            else:
                qs = qs.filter(op__produto__nome__icontains=produto)

        mp = text(request, 'materia_prima')
        if mp:
            if mp.isdigit():
                qs = qs.filter(item_op__materia_prima_id=int(mp))
            else:
                qs = qs.filter(item_op__materia_prima__nome__icontains=mp)

        op_num = text(request, 'op')
        if op_num:
            qs = qs.filter(op__numero__icontains=op_num)

        lote = text(request, 'lote')
        if lote:
            qs = qs.filter(op__lote__icontains=lote)

        operador = text(request, 'operador')
        if operador:
            qs = qs.filter(pesador__icontains=operador)

        status_op = text(request, 'status')
        if status_op:
            qs = qs.filter(op__status=status_op)

        balanca = text(request, 'balanca')
        if balanca:
            if balanca.isdigit():
                qs = qs.filter(balanca_id=int(balanca))
            else:
                qs = qs.filter(balanca__nome__icontains=balanca)

        return qs.order_by('-data_hora')

    def get(self, request):
        qs = self.get_queryset(request)
        export = request.GET.get('export')

        def _fmt(value, casas):
            return f"{value:.{casas}f}" if value is not None else ""

        header = ["Data/Hora","OP","Produto","Matéria-Prima","Pesador","Bruto (kg)","Tara (kg)","Líquido (g)","Lote MP","Balança","Código Interno"]
        rows = []
        for p in qs:
            # Casas decimais da balança usada (em kg). Sem balança vinculada -> 3 (padrão).
            casas_kg = p.balanca.casas_decimais if p.balanca else 3
            # O líquido é armazenado em gramas; em g a resolução equivale a (casas_kg - 3).
            casas_g = max(casas_kg - 3, 0)
            rows.append([
                fmt_gmt3_with_zone(p.data_hora),
                p.op.numero,
                p.op.produto.nome,
                p.item_op.materia_prima.nome if p.item_op else "",
                p.pesador,
                _fmt(p.bruto, casas_kg),
                _fmt(p.tara, casas_kg),
                _fmt(p.liquido, casas_g),
                p.lote_mp, (p.balanca.nome if p.balanca else ""), p.codigo_interno
            ])

        if export == 'csv':
            return export_csv("relatorio_pesagens", header, rows)
        if export == 'pdf':
            return export_pdf("relatorio_pesagens", "Relatório de Pesagens", header, rows)

        page = self.paginate_queryset(qs, request, view=self)
        ser = PesagemSerializer(page, many=True)
        return self.get_paginated_response(ser.data)