# sua_app/tests/test_models.py
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from registro import (
    Produto, MateriaPrima, UnidadeMedida,
    EstruturaProduto, ItemEstrutura,
    Balanca,
    OrdemProducao, ItemOP, StatusOP,
    Pesagem, TOLERANCIA_PERCENTUAL, KG_TO_G
)

D = Decimal  # açucar sintático


class BaseSetupMixin:
    def setUp(self):
        # Catálogos
        self.prod = Produto.objects.create(nome="Xarope A 200 mL", codigo_interno="PROD-001")
        self.mp1 = MateriaPrima.objects.create(nome="Glicerina", codigo_interno="MP-GLIC")
        self.mp2 = MateriaPrima.objects.create(nome="Água Purificada", codigo_interno="MP-AGUA")

        # Estrutura (1 lote)
        self.estr = EstruturaProduto.objects.create(produto=self.prod, descricao="v1")
        self.item_e1 = ItemEstrutura.objects.create(
            estrutura=self.estr, materia_prima=self.mp1,
            quantidade_por_lote=D("1000.000"),  # 1000 g
            unidade=UnidadeMedida.G
        )
        self.item_e2 = ItemEstrutura.objects.create(
            estrutura=self.estr, materia_prima=self.mp2,
            quantidade_por_lote=D("500.000"),   # 500 g
            unidade=UnidadeMedida.G
        )

        # OP
        self.op = OrdemProducao.objects.create(
            numero="OP-0001",
            produto=self.prod,
            estrutura=self.estr,
            lote="L24A0001",
            status=StatusOP.ABERTA,
        )

    # Helpers de tolerância
    def min_allowed(self, q):  # q em g
        return (q * (D("1") - TOLERANCIA_PERCENTUAL)).quantize(D("0.001"))

    def max_allowed(self, q):
        return (q * (D("1") + TOLERANCIA_PERCENTUAL)).quantize(D("0.001"))


class EstruturaOPTests(BaseSetupMixin, TestCase):
    def test_gera_itens_em_g_e_op_aberta(self):
        self.op.gerar_itens_a_partir_da_estrutura()
        itens = ItemOP.objects.filter(op=self.op).order_by("materia_prima__id")
        self.assertEqual(itens.count(), 2)
        self.assertEqual(itens[0].unidade, UnidadeMedida.G)
        self.assertEqual(itens[0].quantidade_necessaria, D("1000.000"))
        self.assertEqual(itens[1].quantidade_necessaria, D("500.000"))
        self.op.refresh_from_db()
        self.assertEqual(self.op.status, StatusOP.ABERTA)

    def test_recriar_sem_forcar_erro(self):
        self.op.gerar_itens_a_partir_da_estrutura()
        with self.assertRaises(ValidationError):
            self.op.gerar_itens_a_partir_da_estrutura(forcar=False)

    def test_recriar_com_forcar_substitui(self):
        self.op.gerar_itens_a_partir_da_estrutura()
        antes = ItemOP.objects.filter(op=self.op).count()
        self.assertEqual(antes, 2)
        self.op.gerar_itens_a_partir_da_estrutura(forcar=True)
        depois = ItemOP.objects.filter(op=self.op).count()
        self.assertEqual(depois, 2)

    def test_limites_min_max_5pct(self):
        self.op.gerar_itens_a_partir_da_estrutura()
        it1 = ItemOP.objects.get(op=self.op, materia_prima=self.mp1)
        self.assertEqual(it1.quantidade_minima_permitida, self.min_allowed(D("1000")))
        self.assertEqual(it1.quantidade_maxima_permitida, self.max_allowed(D("1000")))


class PesagemTests(BaseSetupMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.op.gerar_itens_a_partir_da_estrutura()
        self.item1 = ItemOP.objects.get(op=self.op, materia_prima=self.mp1)
        self.item2 = ItemOP.objects.get(op=self.op, materia_prima=self.mp2)
        self.bal = Balanca.objects.create(
            nome="Balança Sala 01", identificador="BAL-01", tipo_conexao=Balanca.TIPO_ETHERNET,
            endereco_ip="192.168.0.10", porta=1234,
            calibracao_realizada=True,
            ultima_calibracao=timezone.localdate(),
            frequencia_calibracao_dias=365,
        )

    def test_clean_rejeita_liquido_zero_ou_tara_negativa(self):
        p = Pesagem(
            op=self.op, item_op=self.item1, pesador="João",
            tara=D("-0.001"), liquido=D("0.100"),  # tara negativa
            balanca=self.bal, lote_mp="  24A0321  "
        )
        with self.assertRaises(ValidationError):
            p.clean()

        p2 = Pesagem(
            op=self.op, item_op=self.item1, pesador="João",
            tara=D("0.100"), liquido=D("0.000"),  # líquido zero
            balanca=self.bal, lote_mp="  24A0321  "
        )
        with self.assertRaises(ValidationError):
            p2.clean()

    def test_itemop_deve_ser_da_mesma_op(self):
        op2 = OrdemProducao.objects.create(
            numero="OP-0002", produto=self.prod, estrutura=self.estr, lote="L24A0002"
        )
        op2.gerar_itens_a_partir_da_estrutura()
        item_op2 = ItemOP.objects.get(op=op2, materia_prima=self.mp1)

        p = Pesagem(
            op=self.op, item_op=item_op2, pesador="João",
            tara=D("0.100"), liquido=D("0.100")
        )
        with self.assertRaises(ValidationError):
            p.clean()

    def test_save_converte_e_normaliza_lote(self):
        # 0.120 kg → 120 g; tara 0.080 kg; bruto = 0.200 kg
        p = Pesagem(
            op=self.op, item_op=self.item1, pesador="Ana",
            tara=D("0.080"), liquido=D("0.120"), balanca=self.bal, lote_mp=" 24A0321 "
        )
        p.full_clean()
        p.save()

        p.refresh_from_db()
        self.assertEqual(p.bruto, D("0.200"))
        self.assertEqual(p.liquido, D("120.000"))  # armazenado em g
        self.assertEqual(p.lote_mp, "24A0321")

        self.item1.refresh_from_db()
        self.assertEqual(self.item1.quantidade_pesada, D("120.000"))

    def test_bloqueia_ultrapassar_teto(self):
        teto = self.max_allowed(D("1000"))
        Pesagem.objects.create(
            op=self.op, item_op=self.item1, pesador="Ana",
            tara=D("0.000"), liquido=(teto - D("1.000")) / KG_TO_G
        )
        self.item1.refresh_from_db()
        self.assertEqual(self.item1.quantidade_pesada, teto - D("1.000"))

        with self.assertRaises(ValidationError) as ctx:
            Pesagem.objects.create(
                op=self.op, item_op=self.item1, pesador="Ana",
                tara=D("0.000"), liquido=D("0.002")  # 2 g
            )
        self.assertIn("Ultrapassa o limite superior", str(ctx.exception))

    def test_parciais_ok_conclui_no_minimo(self):
        min1 = self.min_allowed(D("1000"))  # 950 g
        min2 = self.min_allowed(D("500"))   # 475 g

        Pesagem.objects.create(
            op=self.op, item_op=self.item1, pesador="Ana",
            tara=D("0.000"), liquido=(min1 - D("50.000")) / KG_TO_G
        )
        Pesagem.objects.create(
            op=self.op, item_op=self.item2, pesador="Ana",
            tara=D("0.000"), liquido=(min2 - D("50.000")) / KG_TO_G
        )
        self.op.refresh_from_db()
        self.assertEqual(self.op.status, StatusOP.EM_ANDAMENTO)

        restante1 = min1 - ItemOP.objects.get(pk=self.item1.pk).quantidade_pesada
        restante2 = min2 - ItemOP.objects.get(pk=self.item2.pk).quantidade_pesada

        Pesagem.objects.create(
            op=self.op, item_op=self.item1, pesador="Ana",
            tara=D("0.000"), liquido=(restante1 / KG_TO_G)
        )
        Pesagem.objects.create(
            op=self.op, item_op=self.item2, pesador="Ana",
            tara=D("0.000"), liquido=(restante2 / KG_TO_G)
        )

        self.op.refresh_from_db()
        self.assertEqual(self.op.status, StatusOP.CONCLUIDA)
        self.assertIsNotNone(self.op.concluida_em)
        self.assertLess((timezone.now() - self.op.concluida_em).total_seconds(), 5.0)

    def test_saldo_por_mp_campos_ok(self):
        Pesagem.objects.create(op=self.op, item_op=self.item1, pesador="A", tara=D("0"), liquido=D("0.100"))
        Pesagem.objects.create(op=self.op, item_op=self.item2, pesador="A", tara=D("0"), liquido=D("0.050"))

        qs = self.op.saldo_por_mp().order_by("materia_prima__id")
        linha1, linha2 = list(qs)
        self.assertEqual(linha1["necessaria"], D("1000.000"))
        self.assertEqual(linha1["pesada"], D("100.000"))
        self.assertEqual(linha1["restante"], D("900.000"))

        self.assertEqual(linha2["necessaria"], D("500.000"))
        self.assertEqual(linha2["pesada"], D("50.000"))
        self.assertEqual(linha2["restante"], D("450.000"))


    def test_bloqueia_balanca_fora_da_calibracao(self):
        self.bal.ultima_calibracao = timezone.localdate() - timedelta(days=366)
        self.bal.save(update_fields=["ultima_calibracao"])

        with self.assertRaises(ValidationError) as ctx:
            Pesagem.objects.create(
                op=self.op, item_op=self.item1, pesador="Ana",
                tara=D("0.000"), liquido=D("0.100"), balanca=self.bal, lote_mp="24B0002"
            )
        self.assertIn("fora da calibração", str(ctx.exception))

    def test_permite_balanca_dentro_da_calibracao(self):
        self.bal.ultima_calibracao = timezone.localdate()
        self.bal.save(update_fields=["ultima_calibracao"])

        p = Pesagem.objects.create(
            op=self.op, item_op=self.item1, pesador="Ana",
            tara=D("0.000"), liquido=D("0.100"), balanca=self.bal, lote_mp="24B0003"
        )
        self.assertIsNotNone(p.pk)

    def test_lote_mp_obrigatorio_e_normalizado(self):
        with self.assertRaises(ValidationError):
            Pesagem.objects.create(
                op=self.op, item_op=self.item1, pesador="Ana",
                tara=D("0.000"), liquido=D("0.100"), lote_mp=""
            )

        p2 = Pesagem.objects.create(
            op=self.op, item_op=self.item1, pesador="Ana",
            tara=D("0.000"), liquido=D("0.100"), lote_mp="  24B0001  "
        )
        self.assertEqual(p2.lote_mp, "24B0001")