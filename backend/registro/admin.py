from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from django.db import models
import json

from .models import (
    Produto, MateriaPrima, Balanca,
    EstruturaProduto, ItemEstrutura,
    OrdemProducao, ItemOP, Pesagem
)

# --- Produtos / MPs ---

@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ("nome", "codigo_interno", "ativo")
    search_fields = ("nome", "codigo_interno")
    list_filter = ("ativo",)


@admin.register(MateriaPrima)
class MateriaPrimaAdmin(admin.ModelAdmin):
    list_display = ("nome", "codigo_interno", "ativo")
    search_fields = ("nome", "codigo_interno")
    list_filter = ("ativo",)


class ItemEstruturaInline(admin.TabularInline):
    model = ItemEstrutura
    extra = 0


@admin.register(EstruturaProduto)
class EstruturaProdutoAdmin(admin.ModelAdmin):
    list_display = ("produto", "descricao", "ativo")
    list_filter = ("ativo", "produto")
    search_fields = ("produto__nome", "descricao")
    inlines = [ItemEstruturaInline]


class ItemOPInline(admin.TabularInline):
    model = ItemOP
    extra = 0
    autocomplete_fields = ("materia_prima",)


@admin.register(OrdemProducao)
class OrdemProducaoAdmin(admin.ModelAdmin):
    list_display = ("numero", "produto", "lote", "status", "criada_em", "concluida_em")
    list_filter = ("status", "produto", "criada_em")
    search_fields = ("numero", "lote", "produto__nome")
    date_hierarchy = "criada_em"
    inlines = [ItemOPInline]


@admin.register(Balanca)
class BalancaAdmin(admin.ModelAdmin):
    list_display = ("nome", "identificador", "tipo_conexao", "ativo", "localizacao")
    list_filter = ("ativo", "tipo_conexao")
    search_fields = ("nome", "identificador", "endereco_ip", "porta_serial")


# -------- Pesagem --------

from .models import Produto as _Produto, MateriaPrima as _MateriaPrima, Pesagem as _Pesagem  # alias só pra uso nos filtros


class ProdutoDaOPFilter(admin.SimpleListFilter):
    title = "Produto"
    parameter_name = "produto"

    def lookups(self, request, model_admin):
        qs = _Produto.objects.order_by("nome").values_list("id", "nome")
        return [(str(i), n) for i, n in qs]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(op__produto_id=self.value())
        return queryset


class MateriaPrimaFilter(admin.SimpleListFilter):
    title = "Matéria-prima"
    parameter_name = "materia_prima"

    def lookups(self, request, model_admin):
        qs = _MateriaPrima.objects.order_by("nome").values_list("id", "nome")
        return [(str(i), n) for i, n in qs]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(item_op__materia_prima_id=self.value())
        return queryset


class LoteMPFilter(admin.SimpleListFilter):
    title = "Lote MP"
    parameter_name = "lote_mp"

    def lookups(self, request, model_admin):
        valores = (
            _Pesagem.objects.exclude(lote_mp="")
            .values_list("lote_mp", flat=True)
            .distinct()
            .order_by("lote_mp")[:50]
        )
        return [(v, v) for v in valores]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(lote_mp=self.value())
        return queryset


@admin.register(Pesagem)
class PesagemAdmin(admin.ModelAdmin):
    list_display = (
        "data_hora",
        "produto",          # via método
        "materia_prima",    # via método
        "lote",             # via método (lote da OP)
        "lote_mp",
        "liquido",
        "bruto",
        "tara",
        "pesador",
        "balanca",
        "codigo_interno",
    )
    ordering = ("-data_hora",)
    search_fields = (
        "pesador",
        "codigo_interno",
        "lote_mp",
        "op__numero",
        "op__lote",
        "op__produto__nome",
        "item_op__materia_prima__nome",
    )
    date_hierarchy = "data_hora"
    list_filter = (
        ProdutoDaOPFilter,
        MateriaPrimaFilter,
        LoteMPFilter,
        "balanca",
        "data_hora",
    )
    list_select_related = (
        "op",
        "item_op",
        "balanca",
        "op__produto",
        "item_op__materia_prima",
    )

    # Colunas virtuais
    def produto(self, obj):
        return obj.op.produto
    produto.admin_order_field = "op__produto__nome"
    produto.short_description = "Produto"

    def materia_prima(self, obj):
        return obj.item_op.materia_prima
    materia_prima.admin_order_field = "item_op__materia_prima__nome"
    materia_prima.short_description = "Matéria-prima"

    def lote(self, obj):
        return obj.op.lote
    lote.admin_order_field = "op__lote"
    lote.short_description = "Lote (OP)"


# -------- AuditLog (somente leitura) --------

# Import do modelo de auditoria
from .audit_models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """
    Admin de auditoria:
    - somente leitura (não permite adicionar/editar/excluir)
    - filtros por campos-chave
    - pretty JSON para 'changes' e 'extra'
    """
    date_hierarchy = "timestamp"
    ordering = ("-timestamp",)
    list_per_page = 50
    list_select_related = ("user",)

    # colunas
    list_display = (
        "timestamp",
        "action",
        "model",
        "object_pk",
        "user",
        "ip",
        "method",
        "status_code",
        "path_short",
    )

    # filtros laterais
    list_filter = (
        "action",
        "method",
        "status_code",
        "model",
        "ip",
        ("user", admin.RelatedOnlyFieldListFilter),
        "timestamp",
    )

    # busca
    search_fields = (
        "path",
        "model",
        "object_pk",
        "user__username",
        "user_agent",
        "ip",
    )

    readonly_fields = (
        "timestamp",
        "user",
        "ip",
        "user_agent_pre",
        "path",
        "method",
        "status_code",
        "action",
        "model",
        "object_pk",
        "changes_pre",
        "extra_pre",
    )

    fieldsets = (
        ("Contexto da Requisição", {
            "fields": ("timestamp", "user", "ip", "user_agent_pre", "path", "method", "status_code")
        }),
        ("Alvo", {
            "fields": ("action", "model", "object_pk")
        }),
        ("Detalhes", {
            "fields": ("changes_pre", "extra_pre")
        }),
    )

    # Helpers de exibição

    def path_short(self, obj):
        s = obj.path or ""
        return s if len(s) <= 60 else s[:57] + "…"
    path_short.short_description = "Path"

    def _pre_json(self, data):
        if data is None:
            return "-"
        try:
            pretty = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        except Exception:
            # fallback para string crua
            pretty = str(data)
        return mark_safe(f"<pre style='white-space:pre-wrap;max-height:400px;overflow:auto;margin:0'>{pretty}</pre>")

    def user_agent_pre(self, obj):
        ua = obj.user_agent or ""
        return mark_safe(f"<pre style='white-space:pre-wrap;margin:0'>{ua}</pre>")
    user_agent_pre.short_description = "User-Agent"

    def changes_pre(self, obj):
        return self._pre_json(obj.changes)
    changes_pre.short_description = "Alterações (JSON)"

    def extra_pre(self, obj):
        return self._pre_json(obj.extra)
    extra_pre.short_description = "Extras (JSON)"

    # Somente leitura
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
