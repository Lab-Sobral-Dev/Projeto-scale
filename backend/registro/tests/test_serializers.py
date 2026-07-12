# registro/tests/test_serializers.py
from decimal import Decimal
from django.test import TestCase, override_settings

from registro.models import (
    Produto, MateriaPrima, UnidadeMedida,
    EstruturaProduto, ItemEstrutura,
    OrdemProducao, StatusOP,
)
from registro.serializers import OrdemProducaoSerializer, ItemEstruturaSerializer

D = Decimal


@override_settings(AUDIT_ENABLED=False)
class OrdemProducaoSerializerTests(TestCase):
    def setUp(self):
        self.prod = Produto.objects.create(nome="Xarope A", codigo_interno="PROD-001", ativo=True)
        self.estr = EstruturaProduto.objects.create(produto=self.prod, descricao="v1", ativo=True)
        self.mp = MateriaPrima.objects.create(nome="Glicerina", codigo_interno="MP-GLIC", ativo=True)
        ItemEstrutura.objects.create(
            estrutura=self.estr, materia_prima=self.mp,
            quantidade_por_lote=D("1000.000"), unidade=UnidadeMedida.G,
        )

    def _base_data(self, **overrides):
        data = {
            "numero": "OP-1000",
            "produto_id": self.prod.id,
            "estrutura_id": self.estr.id,
            "lote": "L-1000",
        }
        data.update(overrides)
        return data

    def test_cria_op_valida(self):
        s = OrdemProducaoSerializer(data=self._base_data())
        self.assertTrue(s.is_valid(), s.errors)

    def test_numero_duplicado_mensagem_clara(self):
        OrdemProducao.objects.create(
            numero="OP-1000", produto=self.prod, estrutura=self.estr, lote="L-EXIST",
        )
        s = OrdemProducaoSerializer(data=self._base_data(lote="L-NOVO"))
        self.assertFalse(s.is_valid())
        self.assertIn("numero", s.errors)
        self.assertIn("número", str(s.errors["numero"]).lower())

    def test_lote_duplicado_mensagem_clara(self):
        OrdemProducao.objects.create(
            numero="OP-EXIST", produto=self.prod, estrutura=self.estr, lote="L-1000",
        )
        s = OrdemProducaoSerializer(data=self._base_data(numero="OP-NOVO"))
        self.assertFalse(s.is_valid())
        self.assertIn("lote", s.errors)
        self.assertIn("lote", str(s.errors["lote"]).lower())

    def test_numero_e_lote_duplicados_reporta_ambos(self):
        OrdemProducao.objects.create(
            numero="OP-1000", produto=self.prod, estrutura=self.estr, lote="L-1000",
        )
        s = OrdemProducaoSerializer(data=self._base_data())
        self.assertFalse(s.is_valid())
        self.assertIn("numero", s.errors)
        self.assertIn("lote", s.errors)

    def test_bloqueia_produto_inativo(self):
        self.prod.ativo = False
        self.prod.save(update_fields=["ativo"])
        s = OrdemProducaoSerializer(data=self._base_data())
        self.assertFalse(s.is_valid())
        # erro de produto (campo ou non_field)
        self.assertTrue("produto_id" in s.errors or "produto" in s.errors or "non_field_errors" in s.errors)
        self.assertIn("inativo", str(s.errors).lower())

    def test_bloqueia_estrutura_inativa(self):
        self.estr.ativo = False
        self.estr.save(update_fields=["ativo"])
        s = OrdemProducaoSerializer(data=self._base_data())
        self.assertFalse(s.is_valid())
        self.assertIn("inativ", str(s.errors).lower())


@override_settings(AUDIT_ENABLED=False)
class ItemEstruturaSerializerTests(TestCase):
    def setUp(self):
        self.prod = Produto.objects.create(nome="Xarope A", codigo_interno="PROD-001", ativo=True)
        self.estr = EstruturaProduto.objects.create(produto=self.prod, descricao="v1", ativo=True)
        self.mp_ativa = MateriaPrima.objects.create(nome="Glicerina", codigo_interno="MP-GLIC", ativo=True)
        self.mp_inativa = MateriaPrima.objects.create(nome="Corante", codigo_interno="MP-COR", ativo=False)

    def _data(self, mp):
        return {
            "estrutura_id": self.estr.id,
            "materia_prima_id": mp.id,
            "quantidade_por_lote": "500.000",
            "unidade": "g",
        }

    def test_aceita_materia_prima_ativa(self):
        s = ItemEstruturaSerializer(data=self._data(self.mp_ativa))
        self.assertTrue(s.is_valid(), s.errors)

    def test_bloqueia_materia_prima_inativa(self):
        s = ItemEstruturaSerializer(data=self._data(self.mp_inativa))
        self.assertFalse(s.is_valid())
        self.assertIn("inativ", str(s.errors).lower())
