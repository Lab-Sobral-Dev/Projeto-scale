# apps/reports/views/estrutura.py
from rest_framework.views import APIView
from rest_framework.response import Response
from registro.models import EstruturaProduto
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..services.formatters import fmt_massa_g
from ..filters import text

# quantidade_por_lote é armazenada em g (DecimalField decimal_places=3). Não há
# balança vinculada, então usamos a própria precisão do campo.
CASAS_QTD_LOTE = 3


class EstruturaProdutoReportView(APIView):
    permission_classes = [IsReportViewer]

    def get(self, request):
        produto = text(request, 'produto')
        status_mp = text(request, 'status_mp')

        qs = EstruturaProduto.objects.select_related('produto').prefetch_related('itens__materia_prima')
        if produto:
            if produto.isdigit():
                qs = qs.filter(produto_id=int(produto))
            else:
                qs = qs.filter(produto__nome__icontains=produto)
        export = request.GET.get('export')

        header = ['Produto', 'Estrutura', 'MP', 'Qtd por Lote (g)', 'MP Ativa?']
        rows = []
        data = []
        for e in qs:
            for it in e.itens.select_related('materia_prima').all():
                if status_mp in ('true', 'false') and it.materia_prima.ativo != (status_mp == 'true'):
                    continue
                qtd_lote = fmt_massa_g(it.quantidade_por_lote, CASAS_QTD_LOTE, origem="g")
                rows.append([
                    e.produto.nome,
                    e.descricao,
                    it.materia_prima.nome,
                    qtd_lote,
                    'Sim' if it.materia_prima.ativo else 'Não',
                ])
                data.append({
                    'produto': e.produto.nome,
                    'estrutura': e.descricao,
                    'materia_prima': it.materia_prima.nome,
                    'quantidade_por_lote_g': qtd_lote,
                    'mp_ativa': it.materia_prima.ativo,
                })

        if export == 'csv':
            return export_csv('estrutura_produto', header, rows)
        if export == 'pdf':
            return export_pdf('estrutura_produto', 'Estrutura de Produto', header, rows)
        return Response(data)