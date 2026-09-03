# registro/tests/test_conclusao_op.py
"""
Regras de conclusão automática de OP.

Origem: incidente de 2026-09-03 com a OP 356 (lote 260356). A glicerina chegou
a 478.670 g de 495.000 g necessários (96,70%). Como `verificar_e_concluir`
fechava a OP a partir de 95%, ela virou `concluida` na mesma fração de segundo
da última pesagem — e o frontend esconde OP concluída do seletor de pesagem
(`NovaPesagem.jsx:163` filtra `['aberta', 'em_andamento']`). O operador ficou
sem caminho para lançar os 16,33 kg que faltavam, embora o backend aceitasse.

A regra passa a ser: conclusão automática somente com todos os itens em 100%.
Atingir a tolerância de -5% deixa de FECHAR a OP e passa a apenas HABILITAR a
conclusão explícita por um supervisor (ação separada).
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone

from registro.models import Balanca, ItemOP, Pesagem, StatusOP
from registro.tests.test_models import BaseSetupMixin

D = Decimal

# Status em que o frontend permite selecionar a OP para pesar.
# Espelha NovaPesagem.jsx:163 — se a OP sai desta lista, o operador
# perde o acesso a ela.
STATUS_SELECIONAVEIS = {StatusOP.ABERTA, StatusOP.EM_ANDAMENTO}


@override_settings(AUDIT_ENABLED=False)
class ConclusaoAutomaticaOPTests(BaseSetupMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.op.gerar_itens_a_partir_da_estrutura()
        # mp1 = 1.000 g necessários, mp2 = 500 g (definidos em BaseSetupMixin)
        self.item1 = ItemOP.objects.get(op=self.op, materia_prima=self.mp1)
        self.item2 = ItemOP.objects.get(op=self.op, materia_prima=self.mp2)

        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg",
            identificador="BAL-TESTE",
            casas_decimais=3,
            calibracao_realizada=True,
            ultima_calibracao=timezone.localdate(),
        )

    def _pesar(self, item, liquido_kg, lote="LOTE-MP-1"):
        """Registra uma pesagem. `liquido_kg` em kg, como o formulário envia."""
        return Pesagem.objects.create(
            op=self.op,
            item_op=item,
            pesador="operador-teste",
            balanca=self.balanca,
            tara=D("0"),
            liquido=D(liquido_kg),
            lote_mp=lote,
        )

    def _status(self):
        self.op.refresh_from_db()
        return self.op.status

    # ── O incidente ────────────────────────────────────────────────────────

    def test_item_a_97_por_cento_nao_conclui_a_op(self):
        """Cenário da OP 356: um item dentro da tolerância mas abaixo de 100%.

        Antes: 97% >= 95% fechava a OP.
        Agora: só 100% fecha.
        """
        self._pesar(self.item1, "0.970")   # 970 g de 1.000 g  -> 97,0%
        self._pesar(self.item2, "0.500")   # 500 g de 500 g    -> 100%

        self.assertEqual(self._status(), StatusOP.EM_ANDAMENTO)

    def test_op_a_97_por_cento_continua_selecionavel_para_pesagem(self):
        """O que realmente travou o operador: sair da lista do seletor."""
        self._pesar(self.item1, "0.970")
        self._pesar(self.item2, "0.500")

        self.assertIn(self._status(), STATUS_SELECIONAVEIS)

    def test_op_a_97_por_cento_aceita_a_pesagem_restante_ate_100(self):
        """Fecha o ciclo do incidente: o operador consegue terminar o lote."""
        self._pesar(self.item1, "0.970")
        self._pesar(self.item2, "0.500")

        self._pesar(self.item1, "0.030")   # os 30 g que faltavam

        self.item1.refresh_from_db()
        self.assertEqual(self.item1.quantidade_pesada, D("1000.000"))
        self.assertEqual(self._status(), StatusOP.CONCLUIDA)

    def test_faltando_002_g_por_arredondamento_nao_conclui(self):
        """Caso das OPs 330/331/332 em produção.

        O citrato de sódio pedia 1.114,920 g e foi pesado 1.114,900 g: faltam
        0,020 g, abaixo da resolução de qualquer balança do parque. Essas OPs
        NÃO concluem sozinhas — vão depender da conclusão manual do supervisor.
        Este teste existe para deixar essa consequência explícita, não escondida.
        """
        self._pesar(self.item1, "0.999")   # 999 g de 1.000 g -> 99,9%
        self._pesar(self.item2, "0.500")

        self.assertEqual(self._status(), StatusOP.EM_ANDAMENTO)

    # ── O que NÃO deve mudar ───────────────────────────────────────────────

    def test_conclui_quando_todos_os_itens_atingem_100_por_cento(self):
        self._pesar(self.item1, "1.000")
        self._pesar(self.item2, "0.500")

        self.assertEqual(self._status(), StatusOP.CONCLUIDA)

    def test_conclui_acima_de_100_dentro_da_tolerancia_superior(self):
        """Excesso dentro de +5% segue concluindo — comportamento preservado."""
        self._pesar(self.item1, "1.040")   # 104% de 1.000 g
        self._pesar(self.item2, "0.500")

        self.assertEqual(self._status(), StatusOP.CONCLUIDA)

    def test_limite_superior_de_tolerancia_continua_bloqueando(self):
        """Guarda: a mudança na conclusão não pode afrouxar o limite de +5%."""
        with self.assertRaises(ValidationError):
            self._pesar(self.item1, "1.060")   # 106% > +5%

    def test_op_sem_pesagem_alguma_permanece_aberta(self):
        self.assertEqual(self._status(), StatusOP.ABERTA)

    def test_um_item_completo_e_outro_zerado_nao_conclui(self):
        """Agregado alto não pode concluir com item faltando."""
        self._pesar(self.item1, "1.000")

        self.assertEqual(self._status(), StatusOP.EM_ANDAMENTO)
