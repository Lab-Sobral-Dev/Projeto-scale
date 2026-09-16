# registro/tests/test_commands.py
"""
Correção de quantidade cadastrada na estrutura (erro de unidade).

CONTEXTO
    A tela da estrutura rotula o campo como "Qtd p/ lote (g)" e envia
    `unidade: 'g'` fixo, mas a pesagem é feita em kg. Quando o valor em kg é
    digitado nesse campo, a fórmula fica 1000x menor do que o especificado:
    a VITAMINA B12 do INGLESA-QUINA SOBRAL 430 ML entrou como 0,01548 g
    quando o lote pede 15,48 g.

    `gerar_itens_a_partir_da_estrutura` copia o valor para `ItemOP` na criação
    da OP, então corrigir a estrutura não alcança as OPs já abertas — elas
    continuariam pedindo a quantidade errada ao operador.

    Regerar os itens (`gerar-itens?forcar=1`) não resolve: ele faz
    `itemop_set.all().delete()`, que esbarra no PROTECT das pesagens já
    registradas e zeraria o `quantidade_pesada` dos demais itens.
"""
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from registro.models import (
    Produto, MateriaPrima, UnidadeMedida,
    EstruturaProduto, ItemEstrutura,
    OrdemProducao, ItemOP, StatusOP,
)

D = Decimal

COMANDO = "corrigir_quantidade_estrutura"


@override_settings(AUDIT_ENABLED=False)
class CorrigirQuantidadeEstruturaTests(TestCase):

    def setUp(self):
        self.produto = Produto.objects.create(
            nome="INGLESA-QUINA SOBRAL 430 ML", codigo_interno="PROD-430"
        )
        self.b12 = MateriaPrima.objects.create(
            nome="VITAMINA B12 A 100% - CIANOCOBALAMINA", codigo_interno="227"
        )
        self.outra_mp = MateriaPrima.objects.create(
            nome="Açúcar Refinado", codigo_interno="101"
        )

        self.estrutura = EstruturaProduto.objects.create(produto=self.produto, descricao="v1")
        self.item_b12 = ItemEstrutura.objects.create(
            estrutura=self.estrutura, materia_prima=self.b12,
            quantidade_por_lote=D("0.015480"),      # kg digitado no campo em g
            unidade=UnidadeMedida.G,
        )
        self.item_acucar = ItemEstrutura.objects.create(
            estrutura=self.estrutura, materia_prima=self.outra_mp,
            quantidade_por_lote=D("50000.000000"),  # 50 kg — correto, não deve ser tocado
            unidade=UnidadeMedida.G,
        )

        self.op = OrdemProducao.objects.create(
            numero="364", produto=self.produto, estrutura=self.estrutura, lote="260364"
        )
        self.op.gerar_itens_a_partir_da_estrutura()

    def _b12_na_op(self, op=None):
        return ItemOP.objects.get(op=op or self.op, materia_prima=self.b12)

    def _run(self, *args):
        out = StringIO()
        call_command(COMANDO, "--mp", "227", "--de", "0.01548", "--para", "15.48",
                     *args, stdout=out, stderr=out)
        return out.getvalue()

    # ---------- dry-run é o padrão ----------

    def test_sem_apply_nao_altera_nada(self):
        saida = self._run()

        self.item_b12.refresh_from_db()
        self.assertEqual(self.item_b12.quantidade_por_lote, D("0.015480"))
        self.assertEqual(self._b12_na_op().quantidade_necessaria, D("0.015480"))
        self.assertIn("15.48", saida)

    # ---------- correção ----------

    def test_apply_corrige_a_estrutura(self):
        self._run("--apply")

        self.item_b12.refresh_from_db()
        self.assertEqual(self.item_b12.quantidade_por_lote, D("15.480000"))

    def test_apply_propaga_para_op_aberta(self):
        self._run("--apply")

        self.assertEqual(self._b12_na_op().quantidade_necessaria, D("15.480000"))

    def test_nao_toca_em_itens_de_outra_materia_prima(self):
        self._run("--apply")

        self.item_acucar.refresh_from_db()
        self.assertEqual(self.item_acucar.quantidade_por_lote, D("50000.000000"))

    def test_nao_toca_em_valor_diferente_do_informado_em_de(self):
        """Só corrige o valor exato declarado em --de: nada é adivinhado."""
        self.item_b12.quantidade_por_lote = D("0.020000")
        self.item_b12.save()

        self._run("--apply")

        self.item_b12.refresh_from_db()
        self.assertEqual(self.item_b12.quantidade_por_lote, D("0.020000"))

    # ---------- histórico preservado ----------

    def test_nao_altera_op_concluida(self):
        """OP concluída é registro de produção: reescrever seria falsear o histórico."""
        op_velha = OrdemProducao.objects.create(
            numero="300", produto=self.produto, estrutura=self.estrutura, lote="260300"
        )
        op_velha.gerar_itens_a_partir_da_estrutura()
        OrdemProducao.objects.filter(pk=op_velha.pk).update(status=StatusOP.CONCLUIDA)

        self._run("--apply")

        self.assertEqual(self._b12_na_op(op_velha).quantidade_necessaria, D("0.015480"))

    def test_preserva_quantidade_pesada_da_op_aberta(self):
        item = self._b12_na_op()
        ItemOP.objects.filter(pk=item.pk).update(quantidade_pesada=D("7.500"))

        self._run("--apply")

        item.refresh_from_db()
        self.assertEqual(item.quantidade_pesada, D("7.500"))
        self.assertEqual(item.quantidade_necessaria, D("15.480000"))

    # ---------- idempotência e segurança ----------

    def test_rodar_duas_vezes_nao_muda_nada_na_segunda(self):
        self._run("--apply")
        saida = self._run("--apply")

        self.item_b12.refresh_from_db()
        self.assertEqual(self.item_b12.quantidade_por_lote, D("15.480000"))
        self.assertIn("Nenhum registro encontrado", saida)

    def test_mp_inexistente_falha_em_vez_de_silenciar(self):
        out = StringIO()
        with self.assertRaises(CommandError):
            call_command(COMANDO, "--mp", "999", "--de", "0.01548", "--para", "15.48",
                         stdout=out, stderr=out)

    def test_filtro_por_produto_restringe_o_alcance(self):
        outro_produto = Produto.objects.create(nome="Outro Xarope", codigo_interno="PROD-999")
        outra_estrutura = EstruturaProduto.objects.create(produto=outro_produto, descricao="v1")
        item_intocado = ItemEstrutura.objects.create(
            estrutura=outra_estrutura, materia_prima=self.b12,
            quantidade_por_lote=D("0.015480"),
            unidade=UnidadeMedida.G,
        )

        out = StringIO()
        call_command(COMANDO, "--mp", "227", "--produto", "PROD-430",
                     "--de", "0.01548", "--para", "15.48", "--apply",
                     stdout=out, stderr=out)

        item_intocado.refresh_from_db()
        self.assertEqual(item_intocado.quantidade_por_lote, D("0.015480"))
        self.item_b12.refresh_from_db()
        self.assertEqual(self.item_b12.quantidade_por_lote, D("15.480000"))


@override_settings(AUDIT_ENABLED=True)
class CorrigirQuantidadeEstruturaAuditoriaTests(TestCase):
    """Correção manual de dado de fórmula precisa deixar rastro."""

    def setUp(self):
        self.produto = Produto.objects.create(
            nome="INGLESA-QUINA SOBRAL 430 ML", codigo_interno="PROD-430"
        )
        self.b12 = MateriaPrima.objects.create(
            nome="VITAMINA B12 A 100%", codigo_interno="227"
        )
        self.estrutura = EstruturaProduto.objects.create(produto=self.produto, descricao="v1")
        ItemEstrutura.objects.create(
            estrutura=self.estrutura, materia_prima=self.b12,
            quantidade_por_lote=D("0.015480"), unidade=UnidadeMedida.G,
        )

    def test_apply_registra_auditlog_com_valor_antigo_e_novo(self):
        from registro.audit_models import AuditLog

        out = StringIO()
        call_command(COMANDO, "--mp", "227", "--de", "0.01548", "--para", "15.48",
                     "--apply", stdout=out, stderr=out)

        log = AuditLog.objects.filter(model="ItemEstrutura", action="update").first()
        self.assertIsNotNone(log, "nenhum AuditLog gravado para a correção")
        self.assertIn("0.015480", str(log.changes))
        self.assertIn("15.480000", str(log.changes))

    def test_dry_run_nao_registra_auditlog(self):
        from registro.audit_models import AuditLog

        out = StringIO()
        call_command(COMANDO, "--mp", "227", "--de", "0.01548", "--para", "15.48",
                     stdout=out, stderr=out)

        self.assertFalse(AuditLog.objects.filter(model="ItemEstrutura").exists())
