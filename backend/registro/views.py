# registro/views.py
from rest_framework import viewsets, filters, status, permissions
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

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from django.forms.models import model_to_dict

from registro.audit_models import AuditLog
from registro.audit_filters import AuditLogFilter
from .serializers import AuditLogSerializer

from usuarios.permissions import IsSupervisorOrAdminOrReadOnly, IsAdmin
from registro.permissions import IsAdminOrReadOnly  # mantido para compatibilidade/legado

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
                ip=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                path=request.path,
                method=request.method,
                status_code=getattr(response, "status_code", None),
                action="delete",
                model=self.MODEL_LABEL or self.queryset.model.__name__,
                object_pk=str(getattr(instance, "pk", "")),
                changes=snapshot,  # snapshot do registro antes de apagar
                extra={
                    "delete_reason": motivo,
                    "delete_reason_label": self.DELETE_MOTIVOS.get(motivo),
                    "delete_reason_note": motivo_obs,
                },
            )
        except Exception:
            # Não bloqueia o fluxo por falha de auditoria
            pass

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

class PesagemViewSet(viewsets.ModelViewSet):
    queryset = (
        Pesagem.objects
        .select_related("op", "op__produto", "item_op", "item_op__materia_prima", "balanca")
        .all()
        .order_by('-data_hora')
    )
    serializer_class = PesagemSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
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
        # delete de pesagem: apenas admin (papel)
        if self.action == "destroy":
            return [IsAdmin()]
        # leitura/escrita normal: supervisor ou admin, leitura para qualquer autenticado
        return [IsSupervisorOrAdminOrReadOnly()]

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

    # >>> Converte ValidationError do Django em 400 (DRF) durante UPDATE <<<
    def perform_update(self, serializer):
        try:
            serializer.save()
        except DjangoValidationError as e:
            msgs = getattr(e, "messages", None)
            detail = " ".join(msgs) if msgs else str(e)
            raise DRFValidationError({"detail": detail})

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
        response = super().update(request, *args, **kwargs)

        try:
            instance.refresh_from_db()
            after = model_to_dict(instance)
            diff = {
                k: {"old": before.get(k), "new": after.get(k)}
                for k in after.keys()
                if before.get(k) != after.get(k)
            }

            AuditLog.objects.create(
                user=request.user if request.user.is_authenticated else None,
                ip=request.META.get("REMOTE_ADDR"),
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
        except Exception:
            pass
        return response

    def partial_update(self, request, *args, **kwargs):
        # usa a mesma lógica de update (motivo obrigatório)
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
                ip=request.META.get("REMOTE_ADDR"),
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
        except Exception:
            pass
        return response


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
        logo_width = 20
        logo_height = 20
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
            mask='auto',
        )
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
        d = Decimal(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        s = f"{d:.3f}"
        inteiro, frac = s.split(".")
        inteiro = f"{int(inteiro):,}".replace(",", ".")
        return f"{inteiro},{frac} g"

    from django.utils import timezone

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
        p.setFont(base_font, base_size)

    produto_nome = pesagem.op.produto.nome if pesagem.op and pesagem.op.produto else ""
    mp_nome = (
        pesagem.item_op.materia_prima.nome
        if pesagem.item_op and pesagem.item_op.materia_prima
        else ""
    )
    balanca_txt = pesagem.balanca.nome if pesagem.balanca else ""
    lote_mp_txt = getattr(pesagem, "lote_mp", "") or ""

    escrever_ajustado("Produto", produto_nome)
    escrever_ajustado("Matéria-prima", mp_nome)

    escrever(f"Cód. Interno: {pesagem.codigo_interno}")
    escrever(
        f"OP: {pesagem.op.numero if pesagem.op else ''}   "
        f"Lote: {pesagem.op.lote if pesagem.op else ''}"
    )
    if lote_mp_txt:
        escrever(f"Lote MP: {lote_mp_txt}")
    escrever(f"Peso Bruto: {fmt_g3_ptbr(bruto_g)}")
    escrever(f"Tara: {fmt_g3_ptbr(tara_g)}")
    escrever(f"Peso Líquido: {fmt_g3_ptbr(liquido_g)}")
    escrever(f"Balança: {balanca_txt}")
    escrever(f"Pesador: {pesagem.pesador}")
    escrever(f"Data: {dt_local_fmt(pesagem.data_hora)}")

    p.showPage()
    p.save()
    return response


# ======================
# Auditoria
# ======================

class IsAdminOnly(permissions.BasePermission):
    """
    Versão antiga baseada em is_staff.
    Mantida por compatibilidade, mas o controle atual usa IsAdmin (PerfilUsuario.papel).
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_staff


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
