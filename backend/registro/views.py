from rest_framework import viewsets, filters, status
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models.deletion import ProtectedError
from django.db.models import F
from django.http import HttpResponse
from django.conf import settings
from reportlab.lib.pagesizes import A7
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from decimal import Decimal, ROUND_HALF_UP
import os

from .models import (
    Produto, MateriaPrima, Balanca,
    EstruturaProduto, ItemEstrutura,
    OrdemProducao, ItemOP, Pesagem, StatusOP
)
from .serializers import (
    ProdutoSerializer, MateriaPrimaSerializer, BalancaSerializer,
    EstruturaProdutoSerializer, ItemEstruturaSerializer,
    OrdemProducaoSerializer, ItemOPSerializer,
    PesagemSerializer
)
from registro.permissions import IsAdminOrReadOnly
from rest_framework.permissions import IsAuthenticated


# ======================
# Catálogos
# ======================

class ProdutoViewSet(viewsets.ModelViewSet):
    queryset = Produto.objects.all().order_by('nome')
    serializer_class = ProdutoSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nome', 'codigo_interno']
    ordering_fields = ['nome', 'codigo_interno']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {"detail": "Não é possível excluir: existem registros vinculados."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MateriaPrimaViewSet(viewsets.ModelViewSet):
    queryset = MateriaPrima.objects.all().order_by('nome')
    serializer_class = MateriaPrimaSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nome', 'codigo_interno']
    ordering_fields = ['nome', 'codigo_interno']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {"detail": "Não é possível excluir: existem registros vinculados."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class BalancaViewSet(viewsets.ModelViewSet):
    queryset = Balanca.objects.all().order_by('nome')
    serializer_class = BalancaSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nome', 'identificador', 'localizacao', 'protocolo']
    ordering_fields = ['nome', 'criado_em', 'atualizado_em']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {"detail": "Não é possível excluir: existem pesagens vinculadas."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ======================
# Estrutura (BOM)
# ======================

class EstruturaProdutoViewSet(viewsets.ModelViewSet):
    queryset = EstruturaProduto.objects.select_related("produto").prefetch_related("itens__materia_prima").all()
    serializer_class = EstruturaProdutoSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['produto__nome', 'produto__codigo_interno', 'descricao']
    ordering_fields = ['id', 'produto__nome']

    @action(detail=True, methods=["get"], url_path="itens")
    def itens(self, request, pk=None):
        estrutura = self.get_object()
        qs = estrutura.itens.select_related("materia_prima").all()
        serializer = ItemEstruturaSerializer(qs, many=True)
        return Response(serializer.data)


class ItemEstruturaViewSet(viewsets.ModelViewSet):
    queryset = ItemEstrutura.objects.select_related("estrutura", "estrutura__produto", "materia_prima").all()
    serializer_class = ItemEstruturaSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['materia_prima__nome', 'materia_prima__codigo_interno', 'estrutura__produto__nome']
    ordering_fields = ['estrutura__id', 'materia_prima__nome']


# ======================
# OP
# ======================

class OrdemProducaoViewSet(viewsets.ModelViewSet):
    queryset = OrdemProducao.objects.select_related("produto", "estrutura", "estrutura__produto").all()
    serializer_class = OrdemProducaoSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['numero', 'lote', 'produto__nome', 'produto__codigo_interno']
    ordering_fields = ['criada_em', 'numero', 'lote', 'status']

    @action(detail=True, methods=["post"], url_path="gerar-itens")
    def gerar_itens(self, request, pk=None):
        op = self.get_object()
        forcar = request.query_params.get("forcar") in ("1", "true", "True")
        op.gerar_itens_a_partir_da_estrutura(forcar=forcar)
        return Response({"detail": "Itens gerados a partir da estrutura.", "status": op.status})

    @action(detail=True, methods=["get"], url_path="itens")
    def itens(self, request, pk=None):
        op = self.get_object()
        qs = ItemOP.objects.select_related("materia_prima").filter(op=op).all()
        # anota quantidade_restante (já existe property; aqui só devolvemos o serializer)
        serializer = ItemOPSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="concluir-se-possivel")
    def concluir_se_possivel(self, request, pk=None):
        op = self.get_object()
        op.verificar_e_concluir()
        return Response({"status": op.status, "concluida_em": op.concluida_em})


class ItemOPViewSet(viewsets.ModelViewSet):
    queryset = ItemOP.objects.select_related("op", "materia_prima", "op__produto").all()
    serializer_class = ItemOPSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['op__numero', 'op__lote', 'materia_prima__nome', 'materia_prima__codigo_interno']
    ordering_fields = ['op__criada_em', 'materia_prima__nome']


# ======================
# Pesagem
# ======================

class PesagemViewSet(viewsets.ModelViewSet):
    queryset = (
        Pesagem.objects
        .select_related("op", "op__produto", "item_op", "item_op__materia_prima", "balanca")
        .all()
        .order_by('-data_hora')
    )
    serializer_class = PesagemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'op__numero', 'op__lote',
        'item_op__materia_prima__nome', 'item_op__materia_prima__codigo_interno',
        'codigo_interno', 'pesador',
        'lote_mp',  # novo: permite buscar pelo lote da MP
    ]
    ordering_fields = ['data_hora', 'op__numero', 'lote_mp']  # novo: ordenar por lote_mp também

    def get_queryset(self):
        qs = super().get_queryset()
        # filtro exato opcional por ?lote_mp=XYZ (case-insensitive)
        lote_mp = self.request.query_params.get("lote_mp")
        if lote_mp:
            qs = qs.filter(lote_mp__iexact=lote_mp.strip())
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        nome = (user.get_full_name() or "").strip() or user.username
        serializer.save(pesador=nome)


# ======================
# Etiqueta PDF (g)
# ======================

def gerar_etiqueta_pdf(request, pk):
    try:
        pesagem = (
            Pesagem.objects
            .select_related('op', 'op__produto', 'item_op', 'item_op__materia_prima', 'balanca')
            .get(pk=pk)
        )
    except Pesagem.DoesNotExist:
        return HttpResponse("Pesagem não encontrada", status=404)

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename=etiqueta_{pesagem.id}.pdf'

    etiqueta_size = (4 * inch, 3 * inch)  # 4x3 polegadas
    p = canvas.Canvas(response, pagesize=etiqueta_size)
    width, height = etiqueta_size

    # Cabeçalho com logo
    logo_path = os.path.join(settings.BASE_DIR, 'registro', 'static', 'logo.png')
    p.setFont("Helvetica-Bold", 12)
    titulo = "THEODORO F. SOBRAL"

    if os.path.exists(logo_path):
        logo = ImageReader(logo_path)
        logo_width = 30
        logo_height = 30
        text_width = p.stringWidth(titulo, "Helvetica-Bold", 12)
        total_width = logo_width + 1 + text_width
        start_x = (width - total_width) / 2
        y_pos = height - 15

        p.drawImage(logo, x=start_x, y=y_pos - logo_height + 5,
                    width=logo_width, height=logo_height, mask='auto')
        text_y = y_pos - (logo_height / 2) + 4
        p.drawString(start_x + logo_width + 8, text_y, titulo)
    else:
        text_width = p.stringWidth(titulo, "Helvetica-Bold", 12)
        p.drawString((width - text_width) / 2, height - 20, titulo)

    # ---- formatação: 1.234,567 g (pt-BR), sempre 3 casas ----
    def fmt_g3_ptbr(value):
        """
        Ex.: 282000 -> 282.000,000 g
            1234.5 -> 1.234,500 g
            1000   -> 1.000,000 g
        """
        if value is None:
            return "- g"
        d = Decimal(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)  # garante 3 casas
        s = f"{d:.3f}"                 # '282000.000'
        inteiro, frac = s.split(".")   # ('282000', '000')
        inteiro = f"{int(inteiro):,}".replace(",", ".")  # '282.000'
        return f"{inteiro},{frac} g"
    
    from django.utils import timezone

    def dt_local_fmt(dt):
        if not dt:
            return ""
        # garante consciente e converte para o fuso atual (settings.TIME_ZONE)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        dt = timezone.localtime(dt)  # usa settings.TIME_ZONE
        return dt.strftime('%d/%m/%Y %H:%M')


    # Converte kg -> g para exibição
    KG_TO_G = Decimal('1000')
    bruto_g = Decimal(pesagem.bruto or 0) * KG_TO_G
    tara_g  = Decimal(pesagem.tara or 0)  * KG_TO_G
    liquido_g = Decimal(pesagem.liquido or 0)  # já em g no banco

    # Conteúdo
    linha = height - 50
    base_font = "Helvetica"
    base_size = 9
    min_size = 6
    margem_esq = 30
    margem_dir = 10
    max_text_width = width - margem_esq - margem_dir

    p.setFont(base_font, base_size)

    def pular_linha():
        nonlocal linha
        linha -= 14

    def escrever(txt):
        nonlocal linha
        p.setFont(base_font, base_size)
        p.drawString(margem_esq, linha, txt)
        pular_linha()

    def escrever_ajustado(label, valor):
        """
        Desenha 'Label: Valor' e reduz a fonte gradualmente (até min_size)
        se o texto exceder a largura máxima disponível.
        """
        nonlocal linha
        txt = f"{label}: {valor}" if valor else f"{label}:"
        font_size = base_size
        text_width = p.stringWidth(txt, base_font, font_size)

        while text_width > max_text_width and font_size > min_size:
            font_size -= 0.5
            text_width = p.stringWidth(txt, base_font, font_size)

        p.setFont(base_font, font_size)
        p.drawString(margem_esq, linha, txt)
        pular_linha()
        # restaura para os próximos campos
        p.setFont(base_font, base_size)

    produto_nome = pesagem.op.produto.nome if pesagem.op and pesagem.op.produto else ""
    mp_nome = pesagem.item_op.materia_prima.nome if pesagem.item_op and pesagem.item_op.materia_prima else ""
    balanca_txt = pesagem.balanca.nome if pesagem.balanca else ""
    lote_mp_txt = getattr(pesagem, "lote_mp", "") or ""

    # Campos com ajuste dinâmico
    escrever_ajustado("Produto", produto_nome)
    escrever_ajustado("Matéria-prima", mp_nome)

    # Demais campos com fonte padrão
    escrever(f"Cód. Interno: {pesagem.codigo_interno}")
    escrever(f"OP: {pesagem.op.numero if pesagem.op else ''}   Lote: {pesagem.op.lote if pesagem.op else ''}")
    if lote_mp_txt:
        escrever(f"Lote MP: {lote_mp_txt}")
    escrever(f"Volume: {pesagem.volume or ''}")
    escrever(f"Peso Bruto: {fmt_g3_ptbr(bruto_g)}")
    escrever(f"Tara: {fmt_g3_ptbr(tara_g)}")
    escrever(f"Peso Líquido: {fmt_g3_ptbr(liquido_g)}")
    escrever(f"Balança: {balanca_txt}")
    escrever(f"Pesador: {pesagem.pesador}")
    escrever(f"Data: {dt_local_fmt(pesagem.data_hora)}")

    p.showPage()
    p.save()
    return response
