# serializers.py

from rest_framework import serializers
from .models import (
    Produto, MateriaPrima, Balanca,
    EstruturaProduto, ItemEstrutura,
    OrdemProducao, ItemOP, Pesagem,
)

from registro.audit_models import AuditLog


# ============== Básicos ==============

class ProdutoSerializer(serializers.ModelSerializer):
    def validate_nome(self, value):
        nome = (value or "").strip()
        if not nome:
            raise serializers.ValidationError("Informe o nome do produto.")

        queryset = Produto.objects.filter(nome__iexact=nome)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError("Já existe um produto cadastrado com este nome.")

        return nome

    def validate_codigo_interno(self, value):
        codigo = (value or "").strip()
        if not codigo:
            raise serializers.ValidationError("Informe o código interno do produto.")

        queryset = Produto.objects.filter(codigo_interno__iexact=codigo)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError("Já existe um produto cadastrado com este código interno.")

        return codigo

    class Meta:
        model = Produto
        fields = "__all__"

class MateriaPrimaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MateriaPrima
        fields = "__all__"

class BalancaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Balanca
        fields = "__all__"

# ============== Estrutura (BOM) ==============

class ItemEstruturaSerializer(serializers.ModelSerializer):
    materia_prima = MateriaPrimaSerializer(read_only=True)
    materia_prima_id = serializers.PrimaryKeyRelatedField(
        queryset=MateriaPrima.objects.all(), write_only=True, source="materia_prima"
    )
    estrutura_id = serializers.PrimaryKeyRelatedField(
        queryset=EstruturaProduto.objects.all(), write_only=True, source="estrutura"
    )

    class Meta:
        model = ItemEstrutura
        fields = [
            "id",
            "estrutura_id",
            "materia_prima", "materia_prima_id",
            "quantidade_por_lote",
            "unidade",
        ]
        read_only_fields = ["id"]

class EstruturaProdutoSerializer(serializers.ModelSerializer):
    produto = ProdutoSerializer(read_only=True)
    produto_id = serializers.PrimaryKeyRelatedField(
        queryset=Produto.objects.all(), write_only=True, source="produto"
    )
    itens = ItemEstruturaSerializer(many=True, read_only=True)

    class Meta:
        model = EstruturaProduto
        fields = [
            "id",
            "produto", "produto_id",
            "descricao",
            "ativo",
            "itens",
        ]
        read_only_fields = ["id", "itens"]

# ============== OP ==============

class ItemOPSerializer(serializers.ModelSerializer):
    op_id = serializers.PrimaryKeyRelatedField(
        queryset=OrdemProducao.objects.all(), write_only=True, source="op"
    )
    materia_prima = MateriaPrimaSerializer(read_only=True)
    materia_prima_id = serializers.PrimaryKeyRelatedField(
        queryset=MateriaPrima.objects.all(), write_only=True, source="materia_prima"
    )
    quantidade_restante = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True)

    class Meta:
        model = ItemOP
        fields = [
            "id",
            "op_id",
            "materia_prima", "materia_prima_id",
            "quantidade_necessaria",
            "quantidade_pesada",
            "quantidade_restante",
            "unidade",
        ]
        read_only_fields = ["id", "quantidade_pesada", "quantidade_restante"]

class OrdemProducaoSerializer(serializers.ModelSerializer):
    produto = ProdutoSerializer(read_only=True)
    produto_id = serializers.PrimaryKeyRelatedField(
        queryset=Produto.objects.all(), write_only=True, source="produto"
    )
    estrutura = EstruturaProdutoSerializer(read_only=True)
    estrutura_id = serializers.PrimaryKeyRelatedField(
        queryset=EstruturaProduto.objects.all(), write_only=True, source="estrutura"
    )

    class Meta:
        model = OrdemProducao
        fields = [
            "id",
            "numero",
            "produto", "produto_id",
            "estrutura", "estrutura_id",
            "lote",
            "status",
            "observacoes",
            "criada_em",
            "concluida_em",
        ]
        read_only_fields = ["id", "status", "criada_em", "concluida_em"]


# ============== Pesagem ==============

class PesagemSerializer(serializers.ModelSerializer):
    op = OrdemProducaoSerializer(read_only=True)
    op_id = serializers.PrimaryKeyRelatedField(
        queryset=OrdemProducao.objects.all(),
        write_only=True,
        source="op"
    )

    item_op = ItemOPSerializer(read_only=True)
    item_op_id = serializers.PrimaryKeyRelatedField(
        queryset=ItemOP.objects.all(),
        write_only=True,
        source="item_op"
    )

    balanca = BalancaSerializer(read_only=True)
    balanca_id = serializers.PrimaryKeyRelatedField(
        queryset=Balanca.objects.all(),
        write_only=True,
        source="balanca",
        required=False,
        allow_null=True
    )

    # derivados
    produto_nome = serializers.SerializerMethodField()
    materia_prima_nome = serializers.SerializerMethodField()

    class Meta:
        model = Pesagem
        fields = [
            "id",

            # vínculos
            "op", "op_id",
            "item_op", "item_op_id",
            "balanca", "balanca_id",

            # dados
            "pesador",          # leitura
            "data_hora",
            "bruto",
            "tara",
            "liquido",
            "codigo_interno",
            "lote_mp",

            # extras
            "produto_nome",
            "materia_prima_nome",
        ]

        read_only_fields = [
            "id", "data_hora",
            "bruto",            # calculado no model.save()
            "pesador",          # sempre backend
            "op", "item_op", "balanca"
        ]

    def get_produto_nome(self, obj):
        return getattr(obj.op.produto, "nome", None)

    def get_materia_prima_nome(self, obj):
        return getattr(obj.item_op.materia_prima, "nome", None)

    def validate(self, attrs):
        op = attrs.get("op") or getattr(self.instance, "op", None)
        item_op = attrs.get("item_op") or getattr(self.instance, "item_op", None)

        if op and item_op and item_op.op_id != op.id:
            raise serializers.ValidationError(
                "O item_op informado não pertence à OP fornecida."
            )

        # normaliza lote_mp
        if "lote_mp" in attrs and attrs["lote_mp"] is not None:
            attrs["lote_mp"] = attrs["lote_mp"].strip()

        return attrs

    

class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "timestamp",
            "user",
            "ip",
            "user_agent",
            "path",
            "method",
            "status_code",
            "action",
            "model",
            "object_pk",
            "changes",
            "extra",
            "user_name",
        ]
        read_only_fields = fields

    def get_user_name(self, obj):
        # melhor esforço para exibir um display name consistente com o frontend
        if getattr(obj, "user", None) and getattr(obj.user, "get_full_name", None):
            name = (obj.user.get_full_name() or "").strip()
            if name:
                return name
        if getattr(obj, "user", None) and getattr(obj.user, "username", None):
            return obj.user.username
        return getattr(obj, "username", None) or ""
