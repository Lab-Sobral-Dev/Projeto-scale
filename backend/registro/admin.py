from django.contrib import admin
from .models import Produto, MateriaPrima, Pesagem, Balanca


@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'codigo_interno', 'ativo')
    list_filter = ('ativo',)
    search_fields = ('nome', 'codigo_interno')
    ordering = ('nome',)


@admin.register(MateriaPrima)
class MateriaPrimaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'codigo_interno','ativo')
    list_filter = ('ativo',)
    search_fields = ('nome',)
    ordering = ('nome',)


@admin.register(Pesagem)
class PesagemAdmin(admin.ModelAdmin):
    list_display = (
        'produto', 'materia_prima', 'op', 'pesador', 'lote',
        'bruto', 'tara', 'liquido', 'volume', 'balanca', 'codigo_interno', 'data_hora'
    )
    list_filter = ('produto', 'materia_prima', 'data_hora')
    search_fields = ('op', 'pesador', 'lote', 'codigo_interno')
    date_hierarchy = 'data_hora'
    readonly_fields = ('liquido', 'data_hora')


@admin.register(Balanca)
class BalancaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'identificador', 'tipo_conexao', 'localizacao', 'ativo', 'atualizado_em')
    list_filter = ('tipo_conexao', 'ativo')
    search_fields = ('nome', 'identificador', 'localizacao', 'protocolo')
