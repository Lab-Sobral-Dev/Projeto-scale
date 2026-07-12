# apps/reports/test_formatters.py
"""
Testes do formatador de massa compartilhado (padrão pt-BR, unidade em gramas).

Não dependem de Django — usam apenas a stdlib — para poderem rodar tanto no
runner de testes do Django quanto de forma isolada:

    cd backend && python -m unittest reports.test_formatters -v
"""
import unittest
from decimal import Decimal

from reports.services.formatters import casas_gramas, fmt_massa_g


class CasasGramasTests(unittest.TestCase):
    def test_precisao_kg_convertida_para_gramas(self):
        # Balança com 3 casas em kg tem resolução de 1 g -> 0 casas em g.
        self.assertEqual(casas_gramas(3), 0)
        # 4 casas em kg = 0,1 g -> 1 casa em g.
        self.assertEqual(casas_gramas(4), 1)
        self.assertEqual(casas_gramas(6), 3)

    def test_precisao_baixa_nao_fica_negativa(self):
        self.assertEqual(casas_gramas(0), 0)
        self.assertEqual(casas_gramas(2), 0)

    def test_none_usa_padrao_de_3_casas_kg(self):
        self.assertEqual(casas_gramas(None), 0)


class FmtMassaGTests(unittest.TestCase):
    def test_converte_kg_para_gramas(self):
        # 1,75 kg -> 1750 g, balança de 3 casas (0 casas em g).
        self.assertEqual(fmt_massa_g(Decimal("1.750000"), casas=0, origem="kg"), "1.750")
        self.assertEqual(fmt_massa_g(Decimal("0.500000"), casas=0, origem="kg"), "500")

    def test_valor_ja_em_gramas(self):
        self.assertEqual(fmt_massa_g(Decimal("1250.000000"), casas=0, origem="g"), "1.250")

    def test_casas_decimais_fixas_ptbr(self):
        # Vírgula como separador decimal, ponto como separador de milhar.
        self.assertEqual(fmt_massa_g(Decimal("1250.5"), casas=1, origem="g"), "1.250,5")
        self.assertEqual(fmt_massa_g(Decimal("1250"), casas=3, origem="g"), "1.250,000")

    def test_arredondamento_half_up(self):
        self.assertEqual(fmt_massa_g(Decimal("1250.25"), casas=1, origem="g"), "1.250,3")

    def test_valor_nulo_retorna_string_vazia(self):
        self.assertEqual(fmt_massa_g(None, casas=0, origem="g"), "")

    def test_aceita_float_e_int(self):
        self.assertEqual(fmt_massa_g(1750, casas=0, origem="g"), "1.750")
        self.assertEqual(fmt_massa_g(1.5, casas=0, origem="kg"), "1.500")

    def test_zero(self):
        self.assertEqual(fmt_massa_g(Decimal("0"), casas=0, origem="g"), "0")
        self.assertEqual(fmt_massa_g(Decimal("0"), casas=2, origem="g"), "0,00")


if __name__ == "__main__":
    unittest.main()
