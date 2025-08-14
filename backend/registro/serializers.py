from rest_framework import serializers
from .models import Produto, MateriaPrima, Pesagem, Balanca


class ProdutoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Produto
        fields = '__all__'


class MateriaPrimaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MateriaPrima
        fields = '__all__'


class BalancaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Balanca
        fields = '__all__'


class PesagemSerializer(serializers.ModelSerializer):
    # Leitura: objetos aninhados
    produto = ProdutoSerializer(read_only=True)
    materia_prima = MateriaPrimaSerializer(read_only=True)
    balanca = BalancaSerializer(read_only=True)

    # Escrita: enviar apenas os IDs
    produto_id = serializers.PrimaryKeyRelatedField(
        queryset=Produto.objects.all(), write_only=True, source='produto'
    )
    materia_prima_id = serializers.PrimaryKeyRelatedField(
        queryset=MateriaPrima.objects.all(), write_only=True, source='materia_prima'
    )
    balanca_id = serializers.PrimaryKeyRelatedField(
        queryset=Balanca.objects.all(),
        write_only=True,
        source='balanca',
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Pesagem
        fields = [
            'id',
            'produto', 'produto_id',
            'materia_prima', 'materia_prima_id',
            'op', 'pesador', 'lote',
            'data_hora',
            'bruto', 'tara', 'liquido',
            'volume',
            'balanca', 'balanca_id',
            'codigo_interno',
        ]
        read_only_fields = ['id', 'data_hora', 'liquido', 'pesador']
