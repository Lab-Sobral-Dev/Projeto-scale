# apps/reports/serializers.py
from rest_framework import serializers
from registro.models import Pesagem, OrdemProducao, ItemOP, Balanca, Produto, MateriaPrima
from registro.audit_models import AuditLog
from django.contrib.auth import get_user_model
from .datetime_utils import fmt_gmt3_with_zone
from .services.formatters import casas_gramas, fmt_massa_g
User = get_user_model()

class PesagemSerializer(serializers.ModelSerializer):
    data_hora = serializers.SerializerMethodField()
    produto = serializers.CharField(source='op.produto.nome', read_only=True)
    materia_prima = serializers.CharField(source='item_op.materia_prima.nome', read_only=True)
    op_numero = serializers.CharField(source='op.numero', read_only=True)
    balanca_nome = serializers.CharField(source='balanca.nome', read_only=True)
    # Pesos exibidos em gramas, pt-BR, na precisão da balança (mesma regra do
    # export e da tela de detalhe da pesagem).
    bruto = serializers.SerializerMethodField()
    tara = serializers.SerializerMethodField()
    liquido = serializers.SerializerMethodField()

    def get_data_hora(self, obj):
        return fmt_gmt3_with_zone(obj.data_hora)

    def _casas(self, obj):
        return casas_gramas(obj.balanca.casas_decimais if obj.balanca else None)

    def get_bruto(self, obj):
        # bruto é armazenado em kg.
        return fmt_massa_g(obj.bruto, self._casas(obj), origem="kg")

    def get_tara(self, obj):
        # tara é armazenada em kg.
        return fmt_massa_g(obj.tara, self._casas(obj), origem="kg")

    def get_liquido(self, obj):
        # líquido é armazenado em g.
        return fmt_massa_g(obj.liquido, self._casas(obj), origem="g")

    class Meta:
        model = Pesagem
        fields = [
            'id','data_hora','op_numero','produto','materia_prima','pesador',
            'bruto','tara','liquido','lote_mp','balanca_nome','codigo_interno'
        ]

class ProdutoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Produto
        fields = ['id','nome','codigo_interno','ativo']

class MateriaPrimaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MateriaPrima
        fields = ['id','nome','codigo_interno','ativo']

class BalancaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Balanca
        fields = ['id','nome','identificador','tipo_conexao','localizacao','ativo']

class UsuarioListSerializer(serializers.ModelSerializer):
    last_login = serializers.SerializerMethodField()
    perfil = serializers.CharField(source='perfil.papel', read_only=True)

    def get_last_login(self, obj):
        return fmt_gmt3_with_zone(obj.last_login) if obj.last_login else "—"

    class Meta:
        model = User
        fields = ['id','username','first_name','last_name','email','last_login','is_active','perfil']

class AuditLogSerializer(serializers.ModelSerializer):
    timestamp = serializers.SerializerMethodField()
    usuario = serializers.SerializerMethodField()

    def get_timestamp(self, obj):
        return fmt_gmt3_with_zone(obj.timestamp)

    def get_usuario(self, obj):
        return obj.user.get_full_name() or obj.user.username if obj.user else "anônimo"
    class Meta:
        model = AuditLog
        fields = ['id','timestamp','usuario','ip','path','method','status_code','action','model','object_pk','changes','extra']