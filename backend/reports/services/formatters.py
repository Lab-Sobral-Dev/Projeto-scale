# apps/reports/services/formatters.py
"""
Formatação numérica compartilhada pelos relatórios.

Regra única (decisão de produto):
  • Pesos são exibidos SEMPRE em gramas.
  • Formato pt-BR: vírgula como separador decimal e ponto como separador de milhar.
  • O número de casas decimais segue a precisão da balança (em kg) convertida
    para gramas — ver `casas_gramas`.

Usado tanto no caminho de tela (serializers) quanto no de exportação
(CSV/PDF), garantindo que o mesmo registro apareça igual em todos os lugares.

Módulo sem dependência de Django (apenas stdlib) para ser testável de forma
isolada.
"""
from decimal import Decimal, ROUND_HALF_UP

KG_TO_G = Decimal("1000")
CASAS_KG_PADRAO = 3  # resolução assumida quando não há balança vinculada


def casas_gramas(casas_kg) -> int:
    """
    Converte a precisão da balança (nº de casas decimais em kg) para o número
    de casas decimais equivalente quando o valor é exibido em gramas.

    1 kg = 1000 g, então cada casa decimal a partir da terceira (em kg) vira
    uma casa decimal em g. Balança de 3 casas em kg (resolução de 1 g) exibe
    0 casas em g.
    """
    if casas_kg is None:
        casas_kg = CASAS_KG_PADRAO
    return max(int(casas_kg) - 3, 0)


def fmt_massa_g(valor, casas: int, origem: str = "g") -> str:
    """
    Formata uma massa no padrão pt-BR, sempre em gramas, com `casas` casas
    decimais fixas.

    Args:
        valor: valor numérico (Decimal, int, float ou str). ``None`` -> "".
        casas: nº de casas decimais a exibir (>= 0).
        origem: "g" se `valor` já está em gramas; "kg" se está em quilos
                (será convertido multiplicando por 1000).
    """
    if valor is None:
        return ""

    v = Decimal(str(valor))
    if origem == "kg":
        v = v * KG_TO_G

    casas = max(int(casas), 0)
    quant = Decimal(1).scaleb(-casas)  # 10^-casas
    v = v.quantize(quant, rounding=ROUND_HALF_UP)

    # Formata no padrão en-US (milhar "," / decimal ".") e troca para pt-BR.
    s = f"{v:,.{casas}f}"
    return s.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
