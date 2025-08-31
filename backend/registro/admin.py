from django.contrib import admin
from .models import (
    Produto, MateriaPrima, Balanca,
    EstruturaProduto, ItemEstrutura,
    OrdemProducao, ItemOP, Pesagem
)

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

# Filtro por Produto (via OP)
class ProdutoDaOPFilter(admin.SimpleListFilter):
    title = "Produto"
    parameter_name = "produto"

    def lookups(self, request, model_admin):
        qs = Produto.objects.order_by("nome").values_list("id", "nome")
        return [(str(i), n) for i, n in qs]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(op__produto_id=self.value())
        return queryset

# Filtro por Matéria-prima (via ItemOP)
class MateriaPrimaFilter(admin.SimpleListFilter):
    title = "Matéria-prima"
    parameter_name = "materia_prima"

    def lookups(self, request, model_admin):
        qs = MateriaPrima.objects.order_by("nome").values_list("id", "nome")
        return [(str(i), n) for i, n in qs]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(item_op__materia_prima_id=self.value())
        return queryset

# Filtro por Lote de MP (lista valores distintos, limita a 50 para manter leve)
class LoteMPFilter(admin.SimpleListFilter):
    title = "Lote MP"
    parameter_name = "lote_mp"

    def lookups(self, request, model_admin):
        valores = (
            Pesagem.objects.exclude(lote_mp="")
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
        "lote_mp",          # novo: lote da MP
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
        "lote_mp",  # novo
        "op__numero",
        "op__lote",
        "op__produto__nome",
        "item_op__materia_prima__nome",
    )
    date_hierarchy = "data_hora"

    list_filter = (
        ProdutoDaOPFilter,
        MateriaPrimaFilter,
        LoteMPFilter,   # novo
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
