from rest_framework import viewsets, filters
from .models import Produto, MateriaPrima, Pesagem, Balanca
from .serializers import ProdutoSerializer, MateriaPrimaSerializer, PesagemSerializer, BalancaSerializer
from django.http import HttpResponse
from reportlab.lib.pagesizes import A7
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
import os
from django.conf import settings
from registro.permissions import IsAdminOrReadOnly
from rest_framework.permissions import IsAuthenticated


class ProdutoViewSet(viewsets.ModelViewSet):
    queryset = Produto.objects.all().order_by('nome')
    serializer_class = ProdutoSerializer
    permission_classes = [IsAdminOrReadOnly]

class MateriaPrimaViewSet(viewsets.ModelViewSet):
    queryset = MateriaPrima.objects.all().order_by('nome')
    serializer_class = MateriaPrimaSerializer
    permission_classes = [IsAdminOrReadOnly]

    # 👇 habilita ?search= no endpoint (por nome ou código)
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nome', 'codigo_interno']
    ordering_fields = ['nome', 'codigo_interno']


class BalancaViewSet(viewsets.ModelViewSet):
    """
    Admin pode criar/editar; operadores podem listar/ler.
    """
    queryset = Balanca.objects.all().order_by('nome')
    serializer_class = BalancaSerializer
    # leitura autenticada; escrita só admin
    permission_classes = [IsAdminOrReadOnly]

    # (Opcional) search/ordering — remova se não quiser/precisar
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nome', 'identificador', 'localizacao', 'protocolo']
    ordering_fields = ['nome', 'criado_em', 'atualizado_em']


class PesagemViewSet(viewsets.ModelViewSet):
    queryset = Pesagem.objects.all().order_by('-data_hora')
    serializer_class = PesagemSerializer
    # Operadores podem criar pesagens normalmente
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user
        nome = (user.get_full_name() or "").strip() or user.username
        serializer.save(pesador=nome)


def gerar_etiqueta_pdf(request, pk):
    try:
        # FK carregadas numa tacada só
        pesagem = (
            Pesagem.objects
            .select_related('produto', 'materia_prima', 'balanca')
            .get(pk=pk)
        )
    except Pesagem.DoesNotExist:
        return HttpResponse("Pesagem não encontrada", status=404)

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename=etiqueta_{pesagem.id}.pdf'

    etiqueta_size = (4 * inch, 3 * inch)  # 4x3 polegadas
    p = canvas.Canvas(response, pagesize=etiqueta_size)
    width, height = etiqueta_size

    # 🔶 Inserir logo ao lado esquerdo do título
    logo_path = os.path.join(settings.BASE_DIR, 'registro', 'static', 'logo.png')
    p.setFont("Helvetica-Bold", 12)
    titulo = "THEODORO  F .  SOBRAL"

    if os.path.exists(logo_path):
        logo = ImageReader(logo_path)
        logo_width = 30
        logo_height = 30

        text_width = p.stringWidth(titulo, "Helvetica-Bold", 12)
        total_width = logo_width + 1 + text_width

        start_x = (width - total_width) / 2
        y_pos = height - 15

        p.drawImage(
            logo,
            x=start_x,
            y=y_pos - logo_height + 5,
            width=logo_width,
            height=logo_height,
            mask='auto'
        )

        text_y = y_pos - (logo_height / 2) + 4
        p.drawString(start_x + logo_width + 8, text_y, titulo)
    else:
        # fallback simples: só o título centralizado
        text_width = p.stringWidth(titulo, "Helvetica-Bold", 12)
        p.drawString((width - text_width) / 2, height - 20, titulo)

    # 🔶 Conteúdo da etiqueta
    linha = height - 55
    p.setFont("Helvetica", 9)

    def escrever(texto):
        nonlocal linha
        p.drawString(30, linha, texto)
        linha -= 14

    balanca_txt = pesagem.balanca.nome if pesagem.balanca else ""

    escrever(f"Produto: {pesagem.produto.nome}")
    escrever(f"Matéria-prima: {pesagem.materia_prima.nome}")
    escrever(f"OP: {pesagem.op}   Lote: {pesagem.lote}")
    escrever(f"Peso Bruto: {pesagem.bruto} Kg")
    escrever(f"Tara: {pesagem.tara} Kg")
    escrever(f"Peso Líquido: {pesagem.liquido} Kg")
    escrever(f"Volume: {pesagem.volume}")
    escrever(f"Balança: {balanca_txt}")
    escrever(f"Cód. Interno: {pesagem.codigo_interno}")
    escrever(f"Pesador: {pesagem.pesador}")
    escrever(f"Data: {pesagem.data_hora.strftime('%d/%m/%Y %H:%M')}")

    p.showPage()
    p.save()
    return response