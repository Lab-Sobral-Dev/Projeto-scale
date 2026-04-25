# registro/views.py
import logging
import os
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.db.models.deletion import ProtectedError
from django.http import HttpResponse

from reportlab.lib.pagesizes import A7
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors

from .db_context import get_env

from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError

import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from django.forms.models import model_to_dict

from registro.audit_models import AuditLog
from registro.audit_filters import AuditLogFilter
from .serializers import AuditLogSerializer

from usuarios.permissions import IsSupervisorOrAdminOrReadOnly, IsAdmin, IsOperatorCreateOrSupervisorEdit
from registro.permissions import IsAdminOrReadOnly  # mantido para compatibilidade/legado
from registro.utils.audit import client_ip

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


# ===========================================================
# Mixin: Exigir motivo na exclusão + registrar em AuditLog
# ===========================================================
class RequireDeleteReasonAuditMixin:
    """
    Mixin para exigir motivo na exclusão (DELETE) e registrar auditoria (AuditLog).
    - Campos aceitos: motivo_exclusao (obrigatório) e motivo_observacao (opcional).
    - Aceita JSON (body) ou querystring (?motivo_exclusao=...&motivo_observacao=...).
    - Personalize:
        * PROTECTED_MESSAGE: texto retornado em caso de ProtectedError
        * DELETE_MOTIVOS: dicionário {key: label} de motivos válidos
        * MODEL_LABEL: nome do modelo salvo na auditoria (por padrão, usa queryset.model.__name__)
    """

    PROTECTED_MESSAGE = "Não é possível excluir: existem registros vinculados."

    DELETE_MOTIVOS = {
        "cadastro_duplicado": "Cadastro duplicado",
        "descontinuacao": "Descontinuação",
        "substituicao": "Substituição",
        "erro_cadastro": "Erro de cadastro",
        "outro": "Outro motivo",
    }

    MODEL_LABEL = None

    def _resolve_delete_reason(self, request):
        motivo = (request.data.get("motivo_exclusao")
                  if hasattr(request, "data") and isinstance(request.data, dict) else None)
        obs = (request.data.get("motivo_observacao")
               if hasattr(request, "data") and isinstance(request.data, dict) else None)

        if not motivo:
            motivo = request.query_params.get("motivo_exclusao")
        if not obs:
            obs = request.query_params.get("motivo_observacao")

        motivo = (motivo or "").strip()
        obs = (obs or "").strip()
        return motivo, obs

    def destroy(self, request, *args, **kwargs):
        motivo, motivo_obs = self._resolve_delete_reason(request)

        if not motivo:
            return Response({"detail": "Informe o motivo da exclusão."}, status=status.HTTP_400_BAD_REQUEST)
        if motivo not in self.DELETE_MOTIVOS:
            return Response(
                {"detail": "Motivo inválido. Use um dos motivos padrões."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance = self.get_object()
        snapshot = model_to_dict(instance)

        try:
            response = super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": self.PROTECTED_MESSAGE},
                status=status.HTTP_409_CONFLICT,
            )

        # Auditoria
        try:
            AuditLog.objects.create(
                user=request.user if request.user.is_authenticated else None,
                ip=client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                path=request.path,
                method=request.method,
                status_code=getattr(response, "status_code", None),
                action="delete",
                model=self.MODEL_LABEL or self.queryset.model.__name__,
                object_pk=str(getattr(instance, "pk", "")),
                changes=snapshot,
                extra={
                    "delete_reason": motivo,
                    "delete_reason_label": self.DELETE_MOTIVOS.get(motivo),
                    "delete_reason_note": motivo_obs,
                },
            )
        except Exception as e:
            logger.warning("Falha ao registrar auditoria (destroy mixin): %s", e, exc_info=True)

        return response


# ======================
# Catálogos
# ======================

class ProdutoViewSet(RequireDeleteReasonAuditMixin, viewsets.ModelViewSet):
    queryset = Produto.objects.all().order_by('nome')
    serializer_class = ProdutoSerializer
    # supervisor/admin escrevem; qualquer autenticado lê
    permission_classes = [IsSupervisorOrAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nome', 'codigo_interno']
    ordering_fields = ['nome', 'codigo_interno']

    MODEL_LABEL = "Produto"
    PROTECTED_MESSAGE = "Não é possível excluir: existem registros vinculados (ex.: estruturas, OPs, pesagens)."
    DELETE_MOTIVOS = {
        "cadastro_duplicado": "Cadastro duplicado",
        "descontinuacao": "Descontinuação do produto",
        "substituicao": "Substituição do SKU",
        "erro_cadastro": "Erro de cadastro",
        "outro": "Outro motivo",
    }


class MateriaPrimaViewSet(RequireDeleteReasonAuditMixin, viewsets.ModelViewSet):
    queryset = MateriaPrima.objects.all().order_by('nome')
    serializer_class = MateriaPrimaSerializer
    permission_classes = [IsSupervisorOrAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nome', 'codigo_interno']
    ordering_fields = ['nome', 'codigo_interno']

    MODEL_LABEL = "MateriaPrima"
    PROTECTED_MESSAGE = "Não é possível excluir: existem registros vinculados (ex.: estruturas, itens de OP, pesagens)."
    DELETE_MOTIVOS = {
        "cadastro_duplicado": "Cadastro duplicado",
        "descontinuacao": "Descontinuação da MP",
        "substituicao": "Substituição por outra MP",
        "erro_cadastro": "Erro de cadastro",
        "outro": "Outro motivo",
    }


class BalancaViewSet(viewsets.ModelViewSet):
    queryset = Balanca.objects.all().order_by('nome')
    serializer_class = BalancaSerializer
    permission_classes = [IsSupervisorOrAdminOrReadOnly]
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

class EstruturaProdutoViewSet(RequireDeleteReasonAuditMixin, viewsets.ModelViewSet):
    queryset = (
        EstruturaProduto.objects
        .select_related("produto")
        .prefetch_related("itens__materia_prima")
        .all()
    )
    serializer_class = EstruturaProdutoSerializer
    permission_classes = [IsSupervisorOrAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['produto__nome', 'produto__codigo_interno', 'descricao']
    ordering_fields = ['id', 'produto__nome']

    MODEL_LABEL = "EstruturaProduto"
    PROTECTED_MESSAGE = (
        "Não é possível excluir: existem registros vinculados "
        "(ex.: OPs geradas a partir desta estrutura)."
    )
    DELETE_MOTIVOS = {
        "cadastro_duplicado": "Cadastro duplicado",
        "revisao_estrutura": "Revisão/substituição da estrutura",
        "erro_cadastro": "Erro de cadastro",
        "outro": "Outro motivo",
    }

    @action(detail=True, methods=["get"], url_path="itens")
    def itens(self, request, pk=None):
        estrutura = self.get_object()
        qs = estrutura.itens.select_related("materia_prima").all()
        serializer = ItemEstruturaSerializer(qs, many=True)
        return Response(serializer.data)


class ItemEstruturaViewSet(viewsets.ModelViewSet):
    queryset = (
        ItemEstrutura.objects
        .select_related("estrutura", "estrutura__produto", "materia_prima")
        .all()
    )
    serializer_class = ItemEstruturaSerializer
    permission_classes = [IsSupervisorOrAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'materia_prima__nome',
        'materia_prima__codigo_interno',
        'estrutura__produto__nome',
    ]
    ordering_fields = ['estrutura__id', 'materia_prima__nome']


# ======================
# OP
# ======================

class OrdemProducaoViewSet(viewsets.ModelViewSet):
    queryset = (
        OrdemProducao.objects
        .select_related("produto", "estrutura", "estrutura__produto")
        .all()
    )
    serializer_class = OrdemProducaoSerializer
    permission_classes = [IsSupervisorOrAdminOrReadOnly]
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
    permission_classes = [IsSupervisorOrAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'op__numero',
        'op__lote',
        'materia_prima__nome',
        'materia_prima__codigo_interno',
    ]
    ordering_fields = ['op__criada_em', 'materia_prima__nome']


# ======================
# Pesagem
# ======================

class PesagemFilter(django_filters.FilterSet):
    produto      = django_filters.CharFilter(field_name='op__produto__nome', lookup_expr='icontains')
    materia_prima = django_filters.CharFilter(field_name='item_op__materia_prima__nome', lookup_expr='icontains')
    op           = django_filters.CharFilter(field_name='op__numero', lookup_expr='icontains')
    lote         = django_filters.CharFilter(field_name='op__lote', lookup_expr='icontains')
    lote_mp      = django_filters.CharFilter(lookup_expr='icontains')
    data_inicio  = django_filters.DateFilter(field_name='data_hora', lookup_expr='date__gte')
    data_fim     = django_filters.DateFilter(field_name='data_hora', lookup_expr='date__lte')
    pesador      = django_filters.CharFilter(lookup_expr='icontains')

    class Meta:
        model = Pesagem
        fields = ['produto', 'materia_prima', 'op', 'lote', 'lote_mp', 'data_inicio', 'data_fim', 'pesador']


class PesagemViewSet(viewsets.ModelViewSet):
    queryset = (
        Pesagem.objects
        .select_related("op", "op__produto", "item_op", "item_op__materia_prima", "balanca")
        .all()
        .order_by('-data_hora')
    )
    serializer_class = PesagemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PesagemFilter
    search_fields = ['op__numero', 'item_op__materia_prima__nome', 'codigo_interno']
    ordering_fields = ['data_hora', 'op__numero']

    # ===== Motivos padrões =====
    EDIT_MOTIVOS = {
        "erro_digitacao": "Correção de erro de digitação",
        "ajuste_tolerancia": "Ajuste por tolerância de pesagem",
        "correcao_balanca": "Correção por falha de balança",
        "troca_materia_prima": "Troca de matéria-prima",
        "outro": "Outro motivo",
    }
    DELETE_MOTIVOS = {
        "duplicidade": "Registro duplicado",
        "erro_operador": "Erro de operação/pesagem",
        "item_incorreto": "Item incorreto vinculado",
        "teste_ou_treinamento": "Registro de teste/treinamento",
        "outro": "Outro motivo",
    }

    def get_permissions(self):
        # delete de pesagem: apenas admin (papel) mantém rigoroso
        if self.action == "destroy":
            return [IsAdmin()]
        
        # Leitura/Escrita: 
        # Antes usava IsSupervisorOrAdminOrReadOnly (bloqueava operador no POST)
        # Agora usa IsOperatorCreateOrSupervisorEdit (libera operador no POST)
        return [IsOperatorCreateOrSupervisorEdit()]

    # -------- helper interno para pegar o nome do pesador --------
    def _get_pesador_nome(self, user, fallback=""):
        """
        Retorna o nome do pesador baseado no usuário autenticado.
        Prioriza: nome completo -> username -> fallback.
        """
        if not user or not user.is_authenticated:
            return fallback
        nome = (user.get_full_name() or "").strip()
        if not nome:
            nome = user.username
        return nome or fallback

    # ================== CREATE (define sempre o pesador) ==================
    def perform_create(self, serializer):
        pesador_nome = self._get_pesador_nome(self.request.user, fallback="")
        try:
            serializer.save(pesador=pesador_nome)
        except DjangoValidationError as e:
            msgs = getattr(e, "messages", None)
            detail = " ".join(msgs) if msgs else str(e)
            raise DRFValidationError({"detail": detail})

    # >>> Converte ValidationError do Django em 400 (DRF) durante UPDATE <<<
    def perform_update(self, serializer):
        # mantém o pesador original; se estiver vazio, usa o usuário atual
        instance = serializer.instance  # objeto antes do update
        pesador_atual = getattr(instance, "pesador", "") or ""
        pesador_nome = pesador_atual or self._get_pesador_nome(self.request.user, fallback="")

        try:
            serializer.save(pesador=pesador_nome)
        except DjangoValidationError as e:
            msgs = getattr(e, "messages", None)
            detail = " ".join(msgs) if msgs else str(e)
            raise DRFValidationError({"detail": detail})

    @action(detail=False, methods=["get"], url_path="pesadores")
    def pesadores(self, request):
        """
        Retorna lista de pesadores distintos registrados nas pesagens.
        GET /api/registro/pesagens/pesadores/
        """
        nomes = (
            Pesagem.objects.exclude(pesador="")
            .values_list("pesador", flat=True)
            .distinct()
            .order_by("pesador")
        )
        return Response(sorted(nomes))

    @action(detail=False, methods=["get"], url_path="motivos")
    def motivos(self, request):
        """
        Endpoint público para o frontend listar motivos padrão.
        GET /api/registro/pesagens/motivos/
        """
        return Response({
            "edit": self.EDIT_MOTIVOS,
            "delete": self.DELETE_MOTIVOS,
        })

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """
        Contagens de pesagens calculadas no banco — evita truncamento por paginação.
        GET /api/registro/pesagens/stats/
        """
        from django.utils import timezone as tz
        today = tz.localdate()
        days_since_sunday = today.isoweekday() % 7
        week_start = today - timedelta(days=days_since_sunday)

        qs = Pesagem.objects.all()
        ultimas = (
            self.get_queryset()[:5]
        )
        from .serializers import PesagemSerializer as _PS
        return Response({
            "pesagens_hoje": qs.filter(data_hora__date=today).count(),
            "pesagens_semana": qs.filter(data_hora__date__gte=week_start).count(),
            "ultimas": _PS(ultimas, many=True).data,
        })

    # ====== Edição (supervisor/admin, com motivo) ======
    def update(self, request, *args, **kwargs):
        motivo = (request.data.get("motivo_edicao") or "").strip()
        motivo_obs = (request.data.get("motivo_observacao") or "").strip()

        if not motivo:
            return Response({"detail": "Informe o motivo da edição."}, status=400)
        if motivo not in self.EDIT_MOTIVOS:
            return Response({"detail": "Motivo inválido. Use um dos motivos padrões."}, status=400)

        instance = self.get_object()
        before = model_to_dict(instance)

        with transaction.atomic():
            response = super().update(request, *args, **kwargs)
            instance.refresh_from_db()
            after = model_to_dict(instance)
            diff = {
                k: {"old": before.get(k), "new": after.get(k)}
                for k in after.keys()
                if before.get(k) != after.get(k)
            }
            AuditLog.objects.create(
                user=request.user if request.user.is_authenticated else None,
                ip=client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                path=request.path,
                method=request.method,
                status_code=getattr(response, "status_code", None),
                action="update",
                model="Pesagem",
                object_pk=str(instance.pk),
                changes=diff,
                extra={
                    "edit_reason": motivo,
                    "edit_reason_label": self.EDIT_MOTIVOS.get(motivo),
                    "edit_reason_note": motivo_obs,
                },
            )
        return response

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    # ====== Exclusão (somente admin, com motivo) ======
    def destroy(self, request, *args, **kwargs):
        motivo = (
            request.data.get("motivo_exclusao")
            or request.query_params.get("motivo_exclusao")
            or ""
        ).strip()
        motivo_obs = (
            request.data.get("motivo_observacao")
            or request.query_params.get("motivo_observacao")
            or ""
        ).strip()

        if not motivo:
            return Response({"detail": "Informe o motivo da exclusão."}, status=400)
        if motivo not in self.DELETE_MOTIVOS:
            return Response({"detail": "Motivo inválido. Use um dos motivos padrões."}, status=400)

        instance = self.get_object()
        snapshot = model_to_dict(instance)
        response = super().destroy(request, *args, **kwargs)

        try:
            AuditLog.objects.create(
                user=request.user if request.user.is_authenticated else None,
                ip=client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                path=request.path,
                method=request.method,
                status_code=getattr(response, "status_code", None),
                action="delete",
                model="Pesagem",
                object_pk=str(instance.pk),
                changes=snapshot,
                extra={
                    "delete_reason": motivo,
                    "delete_reason_label": self.DELETE_MOTIVOS.get(motivo),
                    "delete_reason_note": motivo_obs,
                },
            )
        except Exception as e:
            logger.warning("Falha ao registrar auditoria (pesagem destroy): %s", e, exc_info=True)
        return response


# ======================
# Etiqueta PDF (g)
# ======================

from django.utils import timezone


@api_view(['GET'])
@permission_classes([IsAuthenticated])
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

    # =====================================================================
    # Cabeçalho com logo - agora mantendo proporção e tamanho ajustável
    # =====================================================================
    logo_path = os.path.join(settings.BASE_DIR, 'registro', 'static', 'logo.png')
    titulo = "THEODORO F. SOBRAL"

    if os.path.exists(logo_path):
        logo = ImageReader(logo_path)

        orig_w, orig_h = logo.getSize()
        aspect = orig_h / orig_w

        desired_width  = 60
        desired_height = desired_width * aspect

        p.setFont("Helvetica-Bold", 12)
        text_width  = p.stringWidth(titulo, "Helvetica-Bold", 12)
        total_width = desired_width + 8 + text_width
        start_x     = (width - total_width) / 2
        y_pos       = height - 18

        logo_y = y_pos - desired_height + 3
        p.drawImage(logo, x=start_x, y=logo_y,
                    width=desired_width, height=desired_height, mask='auto')

        text_y = y_pos - (desired_height / 2) + 1
        p.drawString(start_x + desired_width + 8, text_y, titulo)

        header_bottom = logo_y  # ponto mais baixo do cabeçalho

    else:
        p.setFont("Helvetica-Bold", 12)
        text_width = p.stringWidth(titulo, "Helvetica-Bold", 12)
        p.drawString((width - text_width) / 2, height - 20, titulo)
        header_bottom = height - 20 - 4  # baseline − descida estimada da fonte

    # ---- formatação: até 3 casas, removendo zeros à direita ----
    def fmt_g3_ptbr(value):
        """
        Formata valor em gramas em pt-BR, até 3 casas decimais:
        9500     -> '9.500 g'
        500      -> '500 g'
        9000     -> '9.000 g'
        1234.567 -> '1.234,567 g'
        """
        if value is None:
            return "- g"

        # Garante Decimal e arredonda para 3 casas
        d = Decimal(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

        # Representação sem notação científica
        s = f"{d:f}"

        if "." in s:
            inteiro, frac = s.split(".")
            frac = frac.rstrip("0")  # remove zeros à direita
            if not frac:
                frac = None
        else:
            inteiro, frac = s, None

        # Milhares com ponto
        inteiro_fmt = f"{int(inteiro):,}".replace(",", ".")

        if frac:
            return f"{inteiro_fmt},{frac} g"
        return f"{inteiro_fmt} g"

    def dt_local_fmt(dt):
        if not dt:
            return ""
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        dt = timezone.localtime(dt)
        return dt.strftime('%d/%m/%Y %H:%M')

    # Converte kg -> g para exibição
    KG_TO_G = Decimal('1000')
    bruto_g = Decimal(pesagem.bruto or 0) * KG_TO_G
    tara_g = Decimal(pesagem.tara or 0) * KG_TO_G
    # líquido já está em g no banco
    liquido_g = Decimal(pesagem.liquido or 0)

    # Faixa de ambiente — posicionada dinamicamente abaixo do cabeçalho
    env_nome    = get_env()
    env_label   = "HOMOLOGAÇÃO" if env_nome == "hml" else "PRODUÇÃO"
    env_color   = "#b45309" if env_nome == "hml" else "#1d4ed8"
    band_height = 14
    band_top    = header_bottom - 4          # 4pt de gap após o cabeçalho
    band_bottom = band_top - band_height
    p.setFillColor(colors.HexColor(env_color))
    p.rect(0, band_bottom, width, band_height, fill=1, stroke=0)
    p.setFillColor(colors.white)
    p.setFont("Helvetica-Bold", 8)
    label_w = p.stringWidth(env_label, "Helvetica-Bold", 8)
    p.drawString((width - label_w) / 2, band_bottom + 3, env_label)
    p.setFillColor(colors.black)

    # ── Conteúdo da etiqueta ──────────────────────────────────────────────
    # Layout em 2 colunas para compactar; linha_h=13 cabe ~11 linhas na área
    linha_h    = 13
    linha      = band_bottom - 6 - linha_h   # gap + linha em branco antes do Produto
    fnt        = "Helvetica"
    fnt_b      = "Helvetica-Bold"
    sz         = 8
    sz_min     = 6
    ml         = 8                    # margem esquerda
    mr         = 8                    # margem direita
    col2       = width / 2 + 4        # início da coluna direita (~148 pt)
    w_full     = width - ml - mr      # largura total (~272 pt)
    w_half     = width / 2 - ml - 4   # largura de meia coluna (~124 pt)

    def nl():
        nonlocal linha
        linha -= linha_h

    def fit(txt, max_w, bold=False):
        """Reduz fonte até caber; devolve (texto, font_size)."""
        fs = sz
        f  = fnt_b if bold else fnt
        while p.stringWidth(txt, f, fs) > max_w and fs > sz_min:
            fs -= 0.5
        return f, fs

    def linha_full(label, valor, bold_val=False):
        nonlocal linha
        txt = f"{label}: {valor}" if valor else f"{label}:"
        f, fs = fit(txt, w_full, bold=bold_val)
        p.setFont(f, fs)
        p.drawString(ml, linha, txt)
        nl()

    def celula(label, valor, x, max_w, bold_val=False):
        txt = f"{label}: {valor}" if valor else f"{label}:"
        f, fs = fit(txt, max_w, bold=bold_val)
        p.setFont(f, fs)
        p.drawString(x, linha, txt)

    def sep():
        nonlocal linha
        p.setLineWidth(0.3)
        p.setStrokeColor(colors.HexColor("#9ca3af"))
        p.line(ml, linha + linha_h - 4, width - mr, linha + linha_h - 4)
        p.setStrokeColor(colors.black)

    produto_nome = pesagem.op.produto.nome if pesagem.op and pesagem.op.produto else ""
    mp_nome = (
        pesagem.item_op.materia_prima.nome
        if pesagem.item_op and pesagem.item_op.materia_prima
        else ""
    )
    balanca_txt  = pesagem.balanca.nome if pesagem.balanca else ""
    lote_mp_txt  = getattr(pesagem, "lote_mp", "") or ""
    op_num       = pesagem.op.numero if pesagem.op else ""
    op_lote      = pesagem.op.lote   if pesagem.op else ""

    # ── Linha 1: Produto (largura total) ─────────────────────────────────
    linha_full("Produto", produto_nome)

    # ── Linha 2: Matéria-prima (largura total) ────────────────────────────
    linha_full("Matéria-prima", mp_nome)

    sep()

    # ── Linha 3: Cód. Interno | OP ────────────────────────────────────────
    celula("Cód", pesagem.codigo_interno, ml, w_half)
    celula("OP",  op_num,                 col2, w_half)
    nl()

    # ── Linha 4: Lote MP | Lote OP ───────────────────────────────────────
    celula("Lote MP" if lote_mp_txt else "Lote MP", lote_mp_txt or "-", ml, w_half)
    celula("Lote", op_lote, col2, w_half)
    nl()

    sep()

    # ── Linha 5: Pesos em 3 colunas ──────────────────────────────────────
    col3 = width / 3
    celula("Bruto",  fmt_g3_ptbr(bruto_g),   ml,           col3 - ml - 2)
    celula("Tara",   fmt_g3_ptbr(tara_g),    col3 + 2,     col3 - 4)
    celula("Líq.",   fmt_g3_ptbr(liquido_g), col3 * 2 + 2, col3 - mr - 2, bold_val=True)
    nl()

    sep()

    # ── Linha 6: Balança | Pesador ────────────────────────────────────────
    celula("Balança",  balanca_txt,      ml,   w_half)
    celula("Pesador",  pesagem.pesador,  col2, w_half)
    nl()

    # ── Linha 7: Data ─────────────────────────────────────────────────────
    linha_full("Data", dt_local_fmt(pesagem.data_hora))

    # ── Rodapé: Emitido em ───────────────────────────────────────────────
    p.setFont(fnt, 6.5)
    p.setFillColor(colors.HexColor("#6b7280"))
    p.drawString(ml, linha, f"Emitido em: {dt_local_fmt(timezone.now())}")
    p.setFillColor(colors.black)
    p.setFont(fnt, sz)

    p.showPage()
    p.save()
    return response


# ======================
# Auditoria
# ======================

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/auditoria/?q=...&action=...&method=...&model=...&status_code=...
    &user=...&path=...&start=...&end=...&ordering=-timestamp
    &reason=...&action_group=...&status_group=...&anon=sim|nao
    &has_reason=sim|nao&has_changes=sim|nao&has_extra=sim|nao
    &path_contains=...&ua_contains=...&ip=...&object_pk=...
    """
    queryset = AuditLog.objects.all().select_related("user").order_by("-timestamp")
    serializer_class = AuditLogSerializer
    # agora baseado no PerfilUsuario.papel == admin
    permission_classes = [IsAdmin]

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = AuditLogFilter
    search_fields = [
        "path",
        "model",
        "object_pk",
        "user_agent",
        "ip",
        "user__username",
    ]
    ordering_fields = ["timestamp", "status_code", "model", "action"]
    ordering = ["-timestamp"]