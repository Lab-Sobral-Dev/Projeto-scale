# apps/reports/views/balancas.py
from rest_framework.views import APIView
from rest_framework.response import Response
from registro.models import Pesagem
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import apply_date_filter, text
from ..datetime_utils import fmt_gmt3_with_zone, fmt_gmt3


class BalancasUsoReportView(APIView):
    permission_classes = [IsReportViewer]

    def get_queryset(self, request):
        qs = Pesagem.objects.select_related('balanca', 'op__produto', 'item_op__materia_prima')
        qs = apply_date_filter(qs, request, 'data_hora')

        balanca = text(request, 'balanca')
        if balanca:
            if balanca.isdigit():
                qs = qs.filter(balanca_id=int(balanca))
            else:
                qs = qs.filter(balanca__nome__icontains=balanca)

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

        return qs

    def get(self, request):
        qs = self.get_queryset(request)
        export = request.GET.get('export')
        header = [
            'Balança',
            'Qtd. Pesagens',
            'Primeira Utilização',
            'Última Utilização',
            'Última Calibração',
            'Frequência (dias)',
            'Calibração Realizada?',
            'Em Calibração?',
        ]
        by_bal = {}
        for p in qs:
            key = p.balanca.nome if p.balanca else '—'
            d = by_bal.setdefault(
                key,
                {
                    'count': 0,
                    'min': p.data_hora,
                    'max': p.data_hora,
                    'ultima_calibracao': p.balanca.ultima_calibracao if p.balanca else None,
                    'frequencia_calibracao_dias': p.balanca.frequencia_calibracao_dias if p.balanca else None,
                    'calibracao_realizada': p.balanca.calibracao_realizada if p.balanca else False,
                    'em_calibracao': p.balanca.esta_em_calibracao() if p.balanca else False,
                },
            )
            d['count'] += 1
            d['min'] = min(d['min'], p.data_hora)
            d['max'] = max(d['max'], p.data_hora)

        rows = [
            [
                k,
                v['count'],
                fmt_gmt3_with_zone(v['min']),
                fmt_gmt3_with_zone(v['max']),
                fmt_gmt3(v['ultima_calibracao'], '%Y-%m-%d') if v['ultima_calibracao'] else '—',
                v['frequencia_calibracao_dias'] if v['frequencia_calibracao_dias'] is not None else '—',
                'Sim' if v['calibracao_realizada'] else 'Não',
                'Sim' if v['em_calibracao'] else 'Não',
            ]
            for k, v in by_bal.items()
        ]

        if export == 'csv':
            return export_csv('relatorio_balancas', header, rows)
        if export == 'pdf':
            return export_pdf('relatorio_balancas', 'Relatório de Utilização de Balanças', header, rows)
        return Response([
            {
                'balanca': k,
                **v,
                'min': fmt_gmt3_with_zone(v['min']),
                'max': fmt_gmt3_with_zone(v['max']),
                'ultima_calibracao': fmt_gmt3(v['ultima_calibracao'], '%Y-%m-%d') if v['ultima_calibracao'] else '—',
            }
            for k, v in by_bal.items()
        ])
