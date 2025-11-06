# apps/reports/serializers.py
from rest_framework import serializers
from registro.models import Pesagem, OrdemProducao, ItemOP, Balanca, Produto, MateriaPrima
from registro.audit_models import AuditLog
from django.contrib.auth import get_user_model
User = get_user_model()

class PesagemSerializer(serializers.ModelSerializer):
    produto = serializers.CharField(source='op.produto.nome', read_only=True)
    materia_prima = serializers.CharField(source='item_op.materia_prima.nome', read_only=True)
    op_numero = serializers.CharField(source='op.numero', read_only=True)
    balanca_nome = serializers.CharField(source='balanca.nome', read_only=True)

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
    perfil = serializers.CharField(source='perfil.papel', read_only=True)
    class Meta:
        model = User
        fields = ['id','username','first_name','last_name','email','last_login','is_active','perfil']

class AuditLogSerializer(serializers.ModelSerializer):
    usuario = serializers.SerializerMethodField()
    def get_usuario(self, obj):
        return obj.user.get_full_name() or obj.user.username if obj.user else "anônimo"
    class Meta:
        model = AuditLog
        fields = ['id','timestamp','usuario','ip','path','method','status_code','action','model','object_pk','changes','extra']
