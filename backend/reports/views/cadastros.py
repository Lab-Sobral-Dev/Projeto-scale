# apps/reports/views/cadastros.py
from rest_framework.views import APIView
from rest_framework.response import Response
from registro.models import Produto, MateriaPrima
from ..serializers import ProdutoSerializer, MateriaPrimaSerializer
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import text

class ProdutosReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        status = text(request, 'status')
        codigo = text(request, 'codigo_interno')
        descricao = text(request, 'descricao')

        qs = Produto.objects.all()
        if status in ('true','false'):
            qs = qs.filter(ativo=(status=='true'))
        if codigo:
            qs = qs.filter(codigo_interno__icontains=codigo)
        if descricao:
            qs = qs.filter(nome__icontains=descricao)

        export = request.GET.get('export')
        header = ["ID","Nome","Código Interno","Ativo"]
        rows = [[p.id, p.nome, p.codigo_interno, "Sim" if p.ativo else "Não"] for p in qs]

        if export == 'csv':
            return export_csv("produtos", header, rows)
        if export == 'pdf':
            return export_pdf("produtos", "Relatório de Produtos Cadastrados", header, rows)
        return Response(ProdutoSerializer(qs, many=True).data)

class MateriasPrimasReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        status = text(request, 'status')
        codigo = text(request, 'codigo_interno')
        nome = text(request, 'nome')

        qs = MateriaPrima.objects.all()
        if status in ('true','false'):
            qs = qs.filter(ativo=(status=='true'))
        if codigo:
            qs = qs.filter(codigo_interno__icontains=codigo)
        if nome:
            qs = qs.filter(nome__icontains=nome)

        export = request.GET.get('export')
        header = ["ID","Nome","Código Interno","Ativo"]
        rows = [[m.id, m.nome, m.codigo_interno, "Sim" if m.ativo else "Não"] for m in qs]

        if export == 'csv':
            return export_csv("materias_primas", header, rows)
        if export == 'pdf':
            return export_pdf("materias_primas", "Relatório de Matérias-Primas", header, rows)
        return Response(MateriaPrimaSerializer(qs, many=True).data)
