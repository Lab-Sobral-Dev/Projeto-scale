# Integração das Balanças — Plano 2: Agente Local

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o serviço Windows que lê as portas seriais das balanças, decodifica os frames de peso, normaliza para kg e reporta leituras e status à API do SCALE.

**Architecture:** Uma thread por porta serial alimenta um buffer compartilhado; um publicador agrega e envia lotes à API a ~1 Hz. A decodificação é dividida em dois decodificadores genéricos e completamente testados — **posicional** (frame de formato fixo, caso Toledo 2090) e **textual** (frame ASCII com rótulo de unidade, caso Ohaus) — e cada família de balança apenas declara um descritor de 6 campos, extraído do manual e calibrado contra frames reais capturados na Fase 0. O agente não escuta em porta nenhuma e não conhece nenhuma regra de negócio.

**Tech Stack:** Python 3.11+, `pyserial`, `httpx`, `pytest`, PyInstaller, NSSM

**Spec:** `docs/superpowers/specs/2026-09-03-integracao-balancas-design.md`

**Depende de:** Plano 1 (contrato da API fechado). Tasks 1-7 deste plano não dependem do Plano 1 e podem rodar em paralelo a ele.

## Global Constraints

- **Nunca `float` para peso.** Todo peso é `Decimal`, do parse até o envio. O peso vai para JSON como **string**.
- **Nenhuma regra de negócio no agente.** Ele entrega peso e estabilidade. Tolerância, calibração e cálculo de bruto são do backend.
- **O agente não abre porta de escuta.** Só faz HTTPS outbound.
- **Toda requisição à API leva `?env=prod`** (valor lido do `config.json`).
- **`config.json` tem exatamente 3 campos:** `api_base`, `env`, `token`. Todo o resto vem do cadastro via `GET /agente/configuracao/`.
- **Balança sem `protocolo` é ignorada.** Nunca decodificar às cegas.
- Peso acima de `capacidade_maxima` reporta `erro_leitura`, **nunca** o valor.
- Log local rotacionado com todas as leituras e eventos de reconexão (requisito da ERU, seção 7.7 da spec).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `agente/pyproject.toml` | Dependências e entrypoints |
| `agente/scale_agente/config.py` | Carregar e validar `config.json` |
| `agente/scale_agente/sniffer.py` | CLI de captura de bytes crus (Fase 0 e diagnóstico) |
| `agente/scale_agente/unidades.py` | Conversão g↔kg em `Decimal` |
| `agente/scale_agente/parsers/base.py` | `LeituraPeso`, protocolo `LeitorBalanca`, registry |
| `agente/scale_agente/parsers/posicional.py` | Decodificador de frame de formato fixo |
| `agente/scale_agente/parsers/textual.py` | Decodificador de frame ASCII com rótulo |
| `agente/scale_agente/parsers/toledo_2090.py` | Descritor da família Toledo 2090 |
| `agente/scale_agente/parsers/ohaus_adventurer.py` | Descritor da família Ohaus Adventurer |
| `agente/scale_agente/estabilidade.py` | Decidir estabilidade quando o protocolo não informa |
| `agente/scale_agente/api.py` | Cliente HTTP da API do SCALE |
| `agente/scale_agente/serial_worker.py` | Uma thread por porta: ler, decodificar, validar |
| `agente/scale_agente/publicador.py` | Agregar e enviar lotes a ~1 Hz |
| `agente/scale_agente/servico.py` | Entrypoint, orquestração, logging |

---

## Task 1: Scaffold e carregamento de configuração

**Files:**
- Create: `agente/pyproject.toml`, `agente/scale_agente/__init__.py`, `agente/scale_agente/config.py`
- Create: `agente/tests/test_config.py`, `agente/config.exemplo.json`

**Interfaces:**
- Consumes: nada
- Produces:
  - `@dataclass ConfigAgente` com `api_base: str`, `env: str`, `token: str`
  - `carregar_config(caminho: Path) -> ConfigAgente`
  - `ConfigErro(Exception)`

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_config.py
import json

import pytest

from scale_agente.config import ConfigErro, carregar_config


def escrever(tmp_path, dados):
    caminho = tmp_path / "config.json"
    caminho.write_text(json.dumps(dados), encoding="utf-8")
    return caminho


def test_carrega_os_tres_campos(tmp_path):
    caminho = escrever(tmp_path, {
        "api_base": "https://apiscale.laboratoriosobral.com.br",
        "env": "prod",
        "token": "abc123",
    })
    cfg = carregar_config(caminho)

    assert cfg.api_base == "https://apiscale.laboratoriosobral.com.br"
    assert cfg.env == "prod"
    assert cfg.token == "abc123"


def test_remove_barra_final_do_api_base(tmp_path):
    caminho = escrever(tmp_path, {
        "api_base": "https://apiscale.laboratoriosobral.com.br/",
        "env": "prod", "token": "abc",
    })
    assert carregar_config(caminho).api_base.endswith("com.br")


def test_arquivo_ausente_levanta_config_erro(tmp_path):
    with pytest.raises(ConfigErro, match="não encontrado"):
        carregar_config(tmp_path / "nao-existe.json")


def test_json_invalido_levanta_config_erro(tmp_path):
    caminho = tmp_path / "config.json"
    caminho.write_text("{ isso nao e json", encoding="utf-8")
    with pytest.raises(ConfigErro, match="JSON inválido"):
        carregar_config(caminho)


@pytest.mark.parametrize("faltando", ["api_base", "env", "token"])
def test_campo_obrigatorio_faltando(tmp_path, faltando):
    dados = {"api_base": "https://x", "env": "prod", "token": "abc"}
    del dados[faltando]
    caminho = escrever(tmp_path, dados)
    with pytest.raises(ConfigErro, match=faltando):
        carregar_config(caminho)


def test_env_invalido_e_rejeitado(tmp_path):
    caminho = escrever(tmp_path, {"api_base": "https://x", "env": "producao", "token": "abc"})
    with pytest.raises(ConfigErro, match="env"):
        carregar_config(caminho)


def test_api_base_sem_https_e_rejeitado(tmp_path):
    """O token do agente é credencial de longa duração: nunca em texto claro."""
    caminho = escrever(tmp_path, {"api_base": "http://x", "env": "prod", "token": "abc"})
    with pytest.raises(ConfigErro, match="https"):
        carregar_config(caminho)
```

- [ ] **Step 2: Create the project scaffold**

```toml
# agente/pyproject.toml
[project]
name = "scale-agente"
version = "1.0.0"
description = "Agente local de leitura de balanças para o SCALE"
requires-python = ">=3.11"
dependencies = [
    "pyserial==3.5",
    "httpx==0.27.2",
]

[project.optional-dependencies]
dev = ["pytest==8.3.3", "pyinstaller==6.11.0"]

[project.scripts]
scale-agente = "scale_agente.servico:main"
scale-agente-sniffer = "scale_agente.sniffer:main"

[tool.pytest.ini_options]
testpaths = ["tests"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

```bash
cd agente
python -m venv .venv
.venv/Scripts/activate      # Windows
pip install -e ".[dev]"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd agente && pytest tests/test_config.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.config'`

- [ ] **Step 4: Write minimal implementation**

```python
# agente/scale_agente/config.py
"""
Configuração local da estação.

São exatamente três campos, de propósito: todo o resto (porta COM, baud rate,
protocolo, capacidade, casas decimais) vem do cadastro de Balança via API.
Assim trocar a porta COM de uma balança é edição na tela do SCALE, não visita
à máquina do operador com um editor de texto.
"""
import json
from dataclasses import dataclass
from pathlib import Path

ENVS_VALIDOS = ("prod", "hml")


class ConfigErro(Exception):
    pass


@dataclass(frozen=True)
class ConfigAgente:
    api_base: str
    env: str
    token: str


def carregar_config(caminho: Path) -> ConfigAgente:
    caminho = Path(caminho)
    if not caminho.is_file():
        raise ConfigErro(f"config.json não encontrado em {caminho}")

    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ConfigErro(f"JSON inválido em {caminho}: {e}") from e

    for campo in ("api_base", "env", "token"):
        if not dados.get(campo):
            raise ConfigErro(f"campo obrigatório ausente ou vazio no config.json: {campo}")

    env = str(dados["env"]).strip().lower()
    if env not in ENVS_VALIDOS:
        raise ConfigErro(f"env deve ser um de {ENVS_VALIDOS}, recebido: {env!r}")

    api_base = str(dados["api_base"]).strip().rstrip("/")
    if not api_base.startswith("https://"):
        raise ConfigErro(
            "api_base deve usar https: o token do agente é credencial de longa "
            "duração e não pode trafegar em texto claro."
        )

    return ConfigAgente(api_base=api_base, env=env, token=str(dados["token"]).strip())
```

```json
// agente/config.exemplo.json
{
  "api_base": "https://apiscale.laboratoriosobral.com.br",
  "env": "prod",
  "token": "COLE-AQUI-O-TOKEN-GERADO-NO-CADASTRO"
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd agente && pytest tests/test_config.py -v`
Expected: 9 testes PASS

- [ ] **Step 6: Commit**

```bash
git add agente/
git commit -m "feat(agente): scaffold do projeto e carregamento de configuracao"
```

---

## Task 2: Sniffer — captura de frames reais (entrega da Fase 0)

**Files:**
- Create: `agente/scale_agente/sniffer.py`
- Create: `agente/tests/test_sniffer.py`
- Create: `agente/tests/fixtures/.gitkeep`

**Interfaces:**
- Consumes: nada
- Produces:
  - `capturar(porta: str, baud: int, paridade: str, segundos: int, destino: Path) -> int` (devolve bytes capturados)
  - `main()` — CLI

Esta é a ferramenta que destrava as Tasks 5 e 6. Manual de indicador industrial frequentemente descreve o formato de uma revisão de firmware diferente da instalada; o parser é escrito contra a spec e **validado contra o byte real**.

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_sniffer.py
import serial

from scale_agente.sniffer import capturar


def test_capturar_grava_bytes_no_destino(tmp_path, monkeypatch):
    """Usa a porta virtual loop:// do pyserial: escreve e lê de si mesma."""
    destino = tmp_path / "toledo_2090.bin"
    quadros = b"\x02  12.485 kg\x03" * 3

    class PortaFake:
        def __init__(self):
            self._dados = quadros
        def read(self, n):
            saida, self._dados = self._dados[:n], self._dados[n:]
            return saida
        def close(self):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr(serial, "Serial", lambda *a, **k: PortaFake())

    total = capturar("COM3", 9600, "N", segundos=0, destino=destino)

    assert total == len(quadros)
    assert destino.read_bytes() == quadros


def test_capturar_cria_o_diretorio_do_destino(tmp_path, monkeypatch):
    destino = tmp_path / "novo" / "sub" / "ohaus.bin"

    class PortaVazia:
        def read(self, n):
            return b""
        def close(self):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr(serial, "Serial", lambda *a, **k: PortaVazia())

    capturar("COM4", 9600, "N", segundos=0, destino=destino)
    assert destino.parent.is_dir()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_sniffer.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.sniffer'`

- [ ] **Step 3: Write minimal implementation**

```python
# agente/scale_agente/sniffer.py
"""
Captura bytes crus de uma porta serial para arquivo.

Serve a dois momentos:
  1. Fase 0 — gerar os fixtures reais que servem de base e de teste para os
     parsers das Tasks 5 e 6.
  2. Diagnóstico em campo — quando uma balança para de ser decodificada,
     comparar o que ela emite hoje com o fixture de referência.
"""
import argparse
import sys
import time
from pathlib import Path

import serial

PARIDADES = {
    "N": serial.PARITY_NONE,
    "E": serial.PARITY_EVEN,
    "O": serial.PARITY_ODD,
}


def capturar(porta: str, baud: int, paridade: str, segundos: int, destino: Path) -> int:
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)

    limite = time.monotonic() + segundos
    capturado = bytearray()

    with serial.Serial(
        port=porta, baudrate=baud, parity=PARIDADES[paridade.upper()],
        bytesize=serial.EIGHTBITS, stopbits=serial.STOPBITS_ONE, timeout=0.2,
    ) as conexao:
        while True:
            capturado.extend(conexao.read(256))
            if time.monotonic() >= limite:
                break

    destino.write_bytes(bytes(capturado))
    return len(capturado)


def main() -> int:
    p = argparse.ArgumentParser(
        description="Captura bytes crus de uma balança para arquivo de fixture."
    )
    p.add_argument("--porta", required=True, help="ex.: COM3")
    p.add_argument("--baud", type=int, default=9600)
    p.add_argument("--paridade", default="N", choices=["N", "E", "O"])
    p.add_argument("--segundos", type=int, default=30)
    p.add_argument("--destino", required=True, type=Path)
    args = p.parse_args()

    total = capturar(args.porta, args.baud, args.paridade, args.segundos, args.destino)
    print(f"{total} bytes capturados em {args.destino}")
    if total == 0:
        print(
            "AVISO: nenhum byte recebido. Verifique se o indicador está em modo de "
            "saída contínua, se o baud está correto, e se o cabo é null-modem quando "
            "necessário.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agente && pytest tests/test_sniffer.py -v`
Expected: 2 testes PASS

- [ ] **Step 5: Capturar os frames reais das duas famílias**

Este passo exige acesso físico às balanças. Para cada família, capture **três** cenários e nomeie exatamente assim (as Tasks 5 e 6 leem estes arquivos):

```bash
# Toledo 2090 (BAL-701012) — prato vazio, carga estável, carga em movimento
scale-agente-sniffer --porta COM3 --baud 9600 --segundos 20 \
  --destino tests/fixtures/toledo_2090_zero.bin
scale-agente-sniffer --porta COM3 --baud 9600 --segundos 20 \
  --destino tests/fixtures/toledo_2090_estavel.bin
scale-agente-sniffer --porta COM3 --baud 9600 --segundos 20 \
  --destino tests/fixtures/toledo_2090_instavel.bin

# Ohaus ARD110 (BAL-701018)
scale-agente-sniffer --porta COM5 --baud 9600 --segundos 20 \
  --destino tests/fixtures/ohaus_ard110_zero.bin
scale-agente-sniffer --porta COM5 --baud 9600 --segundos 20 \
  --destino tests/fixtures/ohaus_ard110_estavel.bin
scale-agente-sniffer --porta COM5 --baud 9600 --segundos 20 \
  --destino tests/fixtures/ohaus_ard110_instavel.bin
```

Para cada captura, **anote em `tests/fixtures/LEIA-ME.md`**: o peso real que estava no prato (medido pelo display da balança) e a unidade exibida. Sem esse valor de referência não há como afirmar que o parser está correto — só que ele não estourou.

- [ ] **Step 6: Inspecionar as capturas**

Run:
```bash
cd agente && python -c "
from pathlib import Path
for f in sorted(Path('tests/fixtures').glob('*.bin')):
    d = f.read_bytes()
    print(f.name, len(d), 'bytes')
    print('  hex:', d[:60].hex(' '))
    print('  asc:', repr(d[:60]))
"
```
Expected: para a Ohaus, texto ASCII legível com número e rótmulo de unidade. Para a Toledo, formato fixo, provavelmente delimitado por `\x02`/`\x03` (STX/ETX) ou terminado em `\r\n`. Compare com o manual de comunicação de cada equipamento e **registre o layout observado em `tests/fixtures/LEIA-ME.md`** — é esse layout que as Tasks 5 e 6 traduzem em descritor.

- [ ] **Step 7: Commit**

```bash
git add agente/scale_agente/sniffer.py agente/tests/test_sniffer.py \
        agente/tests/fixtures/
git commit -m "feat(agente): sniffer serial e fixtures reais das duas familias"
```

---

## Task 3: Normalização de unidades

**Files:**
- Create: `agente/scale_agente/unidades.py`
- Create: `agente/tests/test_unidades.py`

**Interfaces:**
- Consumes: nada
- Produces: `para_kg(valor: Decimal, unidade: str) -> Decimal`, `UnidadeDesconhecida(Exception)`

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_unidades.py
from decimal import Decimal

import pytest

from scale_agente.unidades import UnidadeDesconhecida, para_kg

D = Decimal


@pytest.mark.parametrize("valor,unidade,esperado", [
    # Toledo 2090: já vem em kg
    (D("12.485"), "kg", D("12.485")),
    (D("100.00"), "kg", D("100.00")),
    (D("0"), "kg", D("0")),
    # Ohaus ARD110: vem em gramas. Este é o caso que dói se errarmos —
    # 4100 g sem conversão seriam 4100 kg numa balança de 4,1 kg.
    (D("4100.00"), "g", D("4.10000")),
    (D("123.45"), "g", D("0.12345")),
    (D("0.5"), "g", D("0.0005")),
    # Peso negativo é válido transitoriamente (prato em movimento)
    (D("-0.020"), "kg", D("-0.020")),
    (D("-15.0"), "g", D("-0.0150")),
])
def test_conversao_para_kg(valor, unidade, esperado):
    assert para_kg(valor, unidade) == esperado


def test_conversao_de_gramas_e_exata_sem_arredondamento():
    """Divisão por Decimal(1000), não por float: nenhum erro de representação."""
    resultado = para_kg(D("0.1"), "g")
    assert resultado == D("0.0001")
    assert str(resultado) == "0.0001"


def test_unidade_e_case_insensitive():
    assert para_kg(D("1000"), "G") == D("1")
    assert para_kg(D("1"), "KG") == D("1")


def test_unidade_desconhecida_levanta():
    with pytest.raises(UnidadeDesconhecida, match="lb"):
        para_kg(D("1"), "lb")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_unidades.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.unidades'`

- [ ] **Step 3: Write minimal implementation**

```python
# agente/scale_agente/unidades.py
"""
Normalização de unidades de massa para kg.

As balanças do parque não falam a mesma unidade: a Toledo 2090 emite kg, a
Ohaus ARD110 emite gramas. A conversão usa Decimal(1000) — nunca float — para
que nenhum erro de representação entre num valor que vai para etiqueta e
auditoria.
"""
from decimal import Decimal

GRAMAS_POR_KG = Decimal(1000)


class UnidadeDesconhecida(Exception):
    pass


def para_kg(valor: Decimal, unidade: str) -> Decimal:
    normalizada = (unidade or "").strip().lower()
    if normalizada == "kg":
        return valor
    if normalizada == "g":
        return valor / GRAMAS_POR_KG
    raise UnidadeDesconhecida(f"unidade de massa não suportada: {unidade!r}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agente && pytest tests/test_unidades.py -v`
Expected: 14 testes PASS

- [ ] **Step 5: Commit**

```bash
git add agente/scale_agente/unidades.py agente/tests/test_unidades.py
git commit -m "feat(agente): normalizacao de unidades de massa para kg"
```

---

## Task 4: Interface de parser e os dois decodificadores genéricos

**Files:**
- Create: `agente/scale_agente/parsers/__init__.py`, `parsers/base.py`, `parsers/posicional.py`, `parsers/textual.py`
- Create: `agente/tests/test_parsers_genericos.py`

**Interfaces:**
- Consumes: `unidades.para_kg` (Task 3)
- Produces:
  - `@dataclass(frozen=True) LeituraPeso` com `peso: Decimal`, `unidade: str`, `estavel: bool | None`
  - `class LeitorBalanca(Protocol)` com `modo_saida: str`, `comando_envio: bytes | None`, `parse(buffer: bytearray) -> LeituraPeso | None`
  - `@dataclass(frozen=True) DescritorPosicional` com `stx`, `etx`, `tamanho`, `fatia_peso`, `unidade`, `indice_estabilidade`, `bit_estavel`
  - `DecodificadorPosicional(descritor, modo_saida, comando_envio)`
  - `DecodificadorTextual(padrao, modo_saida, comando_envio, unidade_padrao)`
  - `registrar(nome: str, leitor_factory)` e `obter_leitor(nome: str) -> LeitorBalanca`

Os decodificadores são completos e testados aqui, com frames sintéticos. As Tasks 5 e 6 apenas declaram descritores — dado extraído do manual, não código novo.

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_parsers_genericos.py
import re
from decimal import Decimal

import pytest

from scale_agente.parsers.base import LeituraPeso, obter_leitor, registrar
from scale_agente.parsers.posicional import DescritorPosicional, DecodificadorPosicional
from scale_agente.parsers.textual import DecodificadorTextual

D = Decimal


class TestDecodificadorPosicional:
    """Frame de formato fixo delimitado por STX/ETX.

    Layout do frame sintético (14 bytes):
      idx 0        STX (0x02)
      idx 1        byte de status (bit 0 = estável)
      idx 2..10    peso em ASCII, 9 chars, com ponto decimal
      idx 11..12   preenchimento
      idx 13       ETX (0x03)
    """

    @pytest.fixture
    def decodificador(self):
        return DecodificadorPosicional(
            DescritorPosicional(
                stx=b"\x02", etx=b"\x03", tamanho=14,
                fatia_peso=slice(2, 11), unidade="kg",
                indice_estabilidade=1, bit_estavel=0b00000001,
            ),
            modo_saida="continuo", comando_envio=None,
        )

    def _frame(self, peso_texto: str, estavel: bool) -> bytes:
        status = 0x01 if estavel else 0x00
        corpo = peso_texto.rjust(9).encode("ascii")
        return b"\x02" + bytes([status]) + corpo + b"  " + b"\x03"

    def test_decodifica_frame_estavel(self, decodificador):
        buffer = bytearray(self._frame("   12.485", True))
        leitura = decodificador.parse(buffer)

        assert leitura == LeituraPeso(peso=D("12.485"), unidade="kg", estavel=True)
        assert buffer == bytearray()  # frame consumido

    def test_decodifica_frame_instavel(self, decodificador):
        leitura = decodificador.parse(bytearray(self._frame("   12.400", False)))
        assert leitura.estavel is False

    def test_buffer_incompleto_devolve_none_e_preserva(self, decodificador):
        parcial = self._frame("   12.485", True)[:8]
        buffer = bytearray(parcial)

        assert decodificador.parse(buffer) is None
        assert buffer == bytearray(parcial)  # espera mais bytes

    def test_descarta_lixo_antes_do_stx(self, decodificador):
        buffer = bytearray(b"\xff\x00lixo" + self._frame("   12.485", True))
        leitura = decodificador.parse(buffer)
        assert leitura.peso == D("12.485")

    def test_frame_sem_etx_na_posicao_e_descartado(self, decodificador):
        """Frame corrompido: STX presente, mas ETX não está onde deveria."""
        ruim = bytearray(b"\x02\x01   12.485  \xff")
        assert decodificador.parse(ruim) is None
        assert b"\x02" not in ruim  # o STX inválido foi consumido

    def test_peso_nao_numerico_e_descartado(self, decodificador):
        ruim = bytearray(b"\x02\x01" + b"  ERRO   " + b"  \x03")
        assert decodificador.parse(ruim) is None

    def test_peso_negativo(self, decodificador):
        leitura = decodificador.parse(bytearray(self._frame("   -0.020", True)))
        assert leitura.peso == D("-0.020")

    def test_dois_frames_no_buffer_devolve_o_primeiro(self, decodificador):
        buffer = bytearray(self._frame("   1.000", True) + self._frame("   2.000", True))
        assert decodificador.parse(buffer).peso == D("1.000")
        assert decodificador.parse(buffer).peso == D("2.000")
        assert decodificador.parse(buffer) is None


class TestDecodificadorTextual:
    """Frame ASCII terminado em CRLF, com rótulo de unidade no próprio frame."""

    @pytest.fixture
    def decodificador(self):
        return DecodificadorTextual(
            padrao=re.compile(
                rb"(?P<peso>[-+]?\s*\d+\.?\d*)\s*(?P<unidade>kg|g)\s*(?P<estab>[A-Z]?)\r\n"
            ),
            modo_saida="sob_comando", comando_envio=b"P\r\n", unidade_padrao="g",
        )

    def test_decodifica_gramas_com_rotulo(self, decodificador):
        leitura = decodificador.parse(bytearray(b"    123.45 g S\r\n"))
        assert leitura.peso == D("123.45")
        assert leitura.unidade == "g"

    def test_le_a_unidade_do_frame_nao_da_configuracao(self, decodificador):
        """Quando o protocolo rotula, o rótulo manda — não o unidade_padrao."""
        leitura = decodificador.parse(bytearray(b"      4.10 kg S\r\n"))
        assert leitura.unidade == "kg"

    def test_frame_sem_terminador_devolve_none(self, decodificador):
        buffer = bytearray(b"    123.45 g")
        assert decodificador.parse(buffer) is None
        assert buffer == bytearray(b"    123.45 g")

    def test_estabilidade_none_quando_o_protocolo_nao_informa(self):
        sem_estab = DecodificadorTextual(
            padrao=re.compile(rb"(?P<peso>[-+]?\d+\.?\d*)\s*(?P<unidade>kg|g)\r\n"),
            modo_saida="continuo", comando_envio=None, unidade_padrao="g",
        )
        leitura = sem_estab.parse(bytearray(b"123.45 g\r\n"))
        assert leitura.estavel is None

    def test_expoe_o_comando_de_envio(self, decodificador):
        assert decodificador.modo_saida == "sob_comando"
        assert decodificador.comando_envio == b"P\r\n"

    def test_peso_com_sinal_e_espaco(self, decodificador):
        leitura = decodificador.parse(bytearray(b"-  12.30 g S\r\n"))
        assert leitura.peso == D("-12.30")


class TestRegistry:
    def test_registrar_e_obter(self):
        sentinela = object()
        registrar("familia_teste", lambda: sentinela)
        assert obter_leitor("familia_teste") is sentinela

    def test_protocolo_desconhecido_levanta(self):
        with pytest.raises(KeyError, match="familia_inexistente"):
            obter_leitor("familia_inexistente")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_parsers_genericos.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.parsers'`

- [ ] **Step 3: Write `base.py`**

```python
# agente/scale_agente/parsers/base.py
"""
Contrato comum a todas as famílias de balança.

Adicionar um fabricante novo no futuro é implementar um LeitorBalanca e
registrá-lo — nenhuma outra parte do agente muda.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable, Protocol


@dataclass(frozen=True)
class LeituraPeso:
    peso: Decimal
    unidade: str
    estavel: bool | None  # None = o protocolo não informa; usar fallback


class LeitorBalanca(Protocol):
    modo_saida: str
    comando_envio: bytes | None

    def parse(self, buffer: bytearray) -> LeituraPeso | None:
        """Consome do buffer o primeiro frame completo e devolve a leitura.

        Devolve None quando o buffer ainda não tem um frame completo (nesse
        caso o buffer é preservado) ou quando o frame estava corrompido
        (nesse caso os bytes ruins são descartados).
        """
        ...


_REGISTRY: dict[str, Callable[[], LeitorBalanca]] = {}


def registrar(nome: str, leitor_factory: Callable[[], LeitorBalanca]) -> None:
    _REGISTRY[nome] = leitor_factory


def obter_leitor(nome: str) -> LeitorBalanca:
    if nome not in _REGISTRY:
        raise KeyError(f"protocolo não registrado: {nome!r}")
    return _REGISTRY[nome]()
```

- [ ] **Step 4: Write `posicional.py`**

```python
# agente/scale_agente/parsers/posicional.py
"""
Decodificador de frame de formato fixo, delimitado por bytes de início e fim.

É o formato típico de indicador industrial (caso Toledo 2090): o peso ocupa
sempre as mesmas posições e a estabilidade é um bit num byte de status.
"""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from scale_agente.parsers.base import LeituraPeso


@dataclass(frozen=True)
class DescritorPosicional:
    stx: bytes
    etx: bytes
    tamanho: int
    fatia_peso: slice
    unidade: str
    indice_estabilidade: int | None
    bit_estavel: int


class DecodificadorPosicional:
    def __init__(self, descritor: DescritorPosicional, modo_saida: str,
                 comando_envio: bytes | None):
        self.descritor = descritor
        self.modo_saida = modo_saida
        self.comando_envio = comando_envio

    def parse(self, buffer: bytearray) -> LeituraPeso | None:
        d = self.descritor

        inicio = buffer.find(d.stx)
        if inicio == -1:
            # Nenhum começo de frame à vista: descarta o lixo acumulado, mas
            # preserva um resto curto que pode ser um STX partido ao meio.
            del buffer[:max(0, len(buffer) - len(d.stx))]
            return None

        if inicio > 0:
            del buffer[:inicio]

        if len(buffer) < d.tamanho:
            return None

        frame = bytes(buffer[:d.tamanho])

        if not frame.endswith(d.etx):
            # STX presente mas frame malformado: consome o STX para não
            # reprocessar o mesmo lixo indefinidamente.
            del buffer[:len(d.stx)]
            return None

        del buffer[:d.tamanho]

        try:
            peso = Decimal(frame[d.fatia_peso].decode("ascii").strip())
        except (InvalidOperation, UnicodeDecodeError, ValueError):
            return None

        estavel = None
        if d.indice_estabilidade is not None:
            estavel = bool(frame[d.indice_estabilidade] & d.bit_estavel)

        return LeituraPeso(peso=peso, unidade=d.unidade, estavel=estavel)
```

- [ ] **Step 5: Write `textual.py`**

```python
# agente/scale_agente/parsers/textual.py
"""
Decodificador de frame ASCII com rótulo de unidade no próprio frame.

É o formato típico de balança analítica de laboratório (caso Ohaus
Adventurer): linha de texto terminada em CRLF, com espaçamento variável.
Quando o frame rotula a unidade, o rótulo manda — a configuração
`unidade_padrao` só serve de fallback.
"""
import re
from decimal import Decimal, InvalidOperation

from scale_agente.parsers.base import LeituraPeso

# Grupos opcionais que o padrão pode declarar
GRUPO_ESTABILIDADE = "estab"
MARCADORES_ESTAVEL = (b"S", b"ST")


class DecodificadorTextual:
    def __init__(self, padrao: re.Pattern[bytes], modo_saida: str,
                 comando_envio: bytes | None, unidade_padrao: str):
        self.padrao = padrao
        self.modo_saida = modo_saida
        self.comando_envio = comando_envio
        self.unidade_padrao = unidade_padrao

    def parse(self, buffer: bytearray) -> LeituraPeso | None:
        match = self.padrao.search(bytes(buffer))
        if match is None:
            return None

        del buffer[:match.end()]

        bruto = match.group("peso").replace(b" ", b"")
        try:
            peso = Decimal(bruto.decode("ascii"))
        except (InvalidOperation, UnicodeDecodeError, ValueError):
            return None

        unidade = self.unidade_padrao
        if "unidade" in self.padrao.groupindex:
            rotulo = match.group("unidade")
            if rotulo:
                unidade = rotulo.decode("ascii").lower()

        estavel = None
        if GRUPO_ESTABILIDADE in self.padrao.groupindex:
            marcador = (match.group(GRUPO_ESTABILIDADE) or b"").strip().upper()
            estavel = marcador in MARCADORES_ESTAVEL

        return LeituraPeso(peso=peso, unidade=unidade, estavel=estavel)
```

```python
# agente/scale_agente/parsers/__init__.py
"""Importa as famílias para que se auto-registrem no registry."""
from scale_agente.parsers import ohaus_adventurer, toledo_2090  # noqa: F401
```

> `__init__.py` importa módulos criados nas Tasks 5 e 6. Deixe-o **vazio** nesta task e adicione os imports ao final da Task 6, ou os testes desta task falham no import.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd agente && pytest tests/test_parsers_genericos.py -v`
Expected: 17 testes PASS

- [ ] **Step 7: Commit**

```bash
git add agente/scale_agente/parsers/ agente/tests/test_parsers_genericos.py
git commit -m "feat(agente): contrato de parser e decodificadores posicional e textual"
```

---

## Task 5: Família Toledo 2090

**Files:**
- Create: `agente/scale_agente/parsers/toledo_2090.py`
- Create: `agente/tests/test_parser_toledo.py`

**Interfaces:**
- Consumes: `DescritorPosicional`, `DecodificadorPosicional` (Task 4); fixtures da Task 2
- Produces: `criar_leitor() -> DecodificadorPosicional`, registrado como `"toledo_2090"`

**Procedimento antes de codar** (o descritor é dado extraído de evidência, não invenção):

1. Abra `agente/tests/fixtures/LEIA-ME.md` e recupere o peso real anotado para `toledo_2090_estavel.bin`.
2. Rode a inspeção do Step 6 da Task 2 e identifique no dump: o byte de início do frame, o comprimento total até o próximo início, as posições exatas dos dígitos do peso, e qual byte muda entre a captura `estavel` e a `instavel`.
3. Confirme cada um desses quatro achados contra o manual de comunicação do indicador Toledo 2090. Onde manual e byte real divergirem, **o byte real manda** — anote a divergência em `LEIA-ME.md`.
4. Só então preencha o descritor abaixo.

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_parser_toledo.py
from decimal import Decimal
from pathlib import Path

import pytest

from scale_agente.parsers.base import obter_leitor
from scale_agente.parsers.toledo_2090 import criar_leitor

D = Decimal
FIXTURES = Path(__file__).parent / "fixtures"

# Pesos reais anotados em fixtures/LEIA-ME.md durante a captura da Fase 0.
# AJUSTE estes três valores para o que o display da balança mostrava.
PESO_REAL_ZERO = D("0.00")
PESO_REAL_ESTAVEL = D("12.48")


def carregar(nome: str) -> bytearray:
    caminho = FIXTURES / nome
    if not caminho.is_file():
        pytest.skip(f"fixture ausente: {nome} — rode a Fase 0 (Task 2)")
    return bytearray(caminho.read_bytes())


def decodificar_todas(buffer: bytearray):
    leitor = criar_leitor()
    leituras = []
    while True:
        antes = len(buffer)
        leitura = leitor.parse(buffer)
        if leitura is not None:
            leituras.append(leitura)
        if len(buffer) == antes:
            break
    return leituras


def test_registrado_no_registry():
    assert obter_leitor("toledo_2090") is not None


def test_emite_frames_em_modo_continuo():
    leitor = criar_leitor()
    assert leitor.modo_saida == "continuo"
    assert leitor.comando_envio is None


def test_decodifica_a_captura_de_prato_vazio():
    leituras = decodificar_todas(carregar("toledo_2090_zero.bin"))

    assert leituras, "nenhum frame decodificado — descritor incorreto"
    assert all(l.unidade == "kg" for l in leituras)
    assert all(abs(l.peso - PESO_REAL_ZERO) <= D("0.02") for l in leituras)


def test_decodifica_a_captura_estavel_com_o_peso_real():
    leituras = decodificar_todas(carregar("toledo_2090_estavel.bin"))

    assert leituras
    # Tolerância de 1 divisão (0,02 kg) contra o valor lido no display.
    assert all(abs(l.peso - PESO_REAL_ESTAVEL) <= D("0.02") for l in leituras)
    assert any(l.estavel for l in leituras), "nenhum frame marcado estável"


def test_captura_instavel_produz_frames_nao_estaveis():
    leituras = decodificar_todas(carregar("toledo_2090_instavel.bin"))

    assert leituras
    assert any(l.estavel is False for l in leituras), (
        "nenhum frame instável: o bit de estabilidade do descritor está errado"
    )


def test_taxa_de_aproveitamento_dos_frames():
    """Um descritor correto decodifica a grande maioria dos bytes capturados.
    Aproveitamento baixo indica offset ou tamanho de frame errado."""
    bruto = carregar("toledo_2090_estavel.bin")
    total_bytes = len(bruto)
    leituras = decodificar_todas(bruto)

    leitor = criar_leitor()
    bytes_uteis = len(leituras) * leitor.descritor.tamanho
    assert bytes_uteis / total_bytes > 0.8, (
        f"apenas {bytes_uteis}/{total_bytes} bytes viraram frames"
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_parser_toledo.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.parsers.toledo_2090'`

- [ ] **Step 3: Write the descriptor**

Preencha os seis valores com o que você observou no Step 2 do procedimento acima. Os valores abaixo são o layout mais comum de indicador Toledo (STX + status + peso ASCII + ETX) e **precisam ser confirmados contra o fixture** — o teste `test_taxa_de_aproveitamento_dos_frames` é o que prova se estão certos.

```python
# agente/scale_agente/parsers/toledo_2090.py
"""
Indicador Toledo 2090 — família com maior presença no parque
(BAL-701012, BAL-701016, BAL-101005).

Frame de formato fixo, sem rótulo de unidade: a unidade vem do descritor,
porque o indicador emite apenas o número. O que varia entre as três balanças
é capacidade, divisão e casas decimais — tudo dado do cadastro, não do parser.

VALORES CALIBRADOS CONTRA: tests/fixtures/toledo_2090_*.bin (Fase 0)
Divergências entre o manual e o byte real estão anotadas em
tests/fixtures/LEIA-ME.md.
"""
from scale_agente.parsers.base import registrar
from scale_agente.parsers.posicional import DescritorPosicional, DecodificadorPosicional

DESCRITOR = DescritorPosicional(
    stx=b"\x02",
    etx=b"\x03",
    tamanho=14,
    fatia_peso=slice(2, 11),
    unidade="kg",
    indice_estabilidade=1,
    bit_estavel=0b00000001,
)


def criar_leitor() -> DecodificadorPosicional:
    return DecodificadorPosicional(
        DESCRITOR, modo_saida="continuo", comando_envio=None
    )


registrar("toledo_2090", criar_leitor)
```

- [ ] **Step 4: Calibrar até os testes passarem**

Run: `cd agente && pytest tests/test_parser_toledo.py -v`

Se falhar, ajuste **um** campo do descritor por vez e rode de novo. Guia de diagnóstico:

| Falha | Campo provável |
|---|---|
| `nenhum frame decodificado` | `stx` errado |
| `test_taxa_de_aproveitamento` baixo | `tamanho` errado |
| peso decodificado mas fora da tolerância | `fatia_peso` deslocada |
| `nenhum frame marcado estável` | `indice_estabilidade` ou `bit_estavel` errados |
| peso 100× ou 1000× do esperado | ponto decimal implícito: o frame não traz `.` — nesse caso a `fatia_peso` está certa mas o valor precisa de escala; registre isso em `LEIA-ME.md` e trate na Task 9 usando `casas_decimais` do cadastro |

- [ ] **Step 5: Commit**

```bash
git add agente/scale_agente/parsers/toledo_2090.py agente/tests/test_parser_toledo.py \
        agente/tests/fixtures/LEIA-ME.md
git commit -m "feat(agente): parser da familia Toledo 2090 calibrado contra frames reais"
```

---

## Task 6: Família Ohaus Adventurer

**Files:**
- Create: `agente/scale_agente/parsers/ohaus_adventurer.py`
- Create: `agente/tests/test_parser_ohaus.py`
- Modify: `agente/scale_agente/parsers/__init__.py` (adicionar os imports de auto-registro)

**Interfaces:**
- Consumes: `DecodificadorTextual` (Task 4); fixtures da Task 2
- Produces: `criar_leitor() -> DecodificadorTextual`, registrado como `"ohaus_adventurer"`

**Este é o caso divergente do parque** — gramas em vez de kg, provável modo sob comando, rótulo de unidade no frame. Se a interface `LeitorBalanca` estiver mal desenhada, é aqui que aparece.

**Procedimento antes de codar:** repita o procedimento da Task 5, mas sobre os fixtures `ohaus_ard110_*.bin`. Aqui o dump é texto legível, então o trabalho é identificar: o terminador de linha, se há marcador de estabilidade (tipicamente `S`/`ST` para estável, `US` para instável), e se a balança emitiu sozinha ou só respondeu a comando. Se as três capturas vieram **vazias**, a balança está em modo sob comando: confirme no manual o comando de envio (comumente `P` ou `IP`), configure-o e recapture com o sniffer emitindo o comando.

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_parser_ohaus.py
from decimal import Decimal
from pathlib import Path

import pytest

from scale_agente.parsers.base import obter_leitor
from scale_agente.parsers.ohaus_adventurer import criar_leitor
from scale_agente.unidades import para_kg

D = Decimal
FIXTURES = Path(__file__).parent / "fixtures"

# Pesos reais anotados em fixtures/LEIA-ME.md. AJUSTE para o display.
PESO_REAL_ESTAVEL_G = D("123.45")


def carregar(nome: str) -> bytearray:
    caminho = FIXTURES / nome
    if not caminho.is_file():
        pytest.skip(f"fixture ausente: {nome} — rode a Fase 0 (Task 2)")
    return bytearray(caminho.read_bytes())


def decodificar_todas(buffer: bytearray):
    leitor = criar_leitor()
    leituras = []
    while True:
        antes = len(buffer)
        leitura = leitor.parse(buffer)
        if leitura is not None:
            leituras.append(leitura)
        if len(buffer) == antes:
            break
    return leituras


def test_registrado_no_registry():
    assert obter_leitor("ohaus_adventurer") is not None


def test_decodifica_a_captura_estavel_com_o_peso_real():
    leituras = decodificar_todas(carregar("ohaus_ard110_estavel.bin"))

    assert leituras, "nenhum frame decodificado — padrão incorreto"
    assert all(abs(l.peso - PESO_REAL_ESTAVEL_G) <= D("0.05") for l in leituras)


def test_reporta_gramas_e_a_conversao_cabe_na_capacidade():
    """O caso que dói: 4100 g sem conversão seriam 4100 kg numa balança
    cuja capacidade é 4,1 kg."""
    leituras = decodificar_todas(carregar("ohaus_ard110_estavel.bin"))
    leitura = leituras[0]

    assert leitura.unidade in ("g", "kg")
    em_kg = para_kg(leitura.peso, leitura.unidade)
    assert em_kg <= D("4.1"), f"{em_kg} kg excede a capacidade da ARD110"


def test_captura_instavel_produz_frames_nao_estaveis():
    leituras = decodificar_todas(carregar("ohaus_ard110_instavel.bin"))

    assert leituras
    if leituras[0].estavel is None:
        pytest.skip("o protocolo desta revisão não informa estabilidade; "
                    "o fallback da Task 7 assume o papel")
    assert any(l.estavel is False for l in leituras)


def test_modo_sob_comando_declara_o_comando():
    leitor = criar_leitor()
    if leitor.modo_saida == "sob_comando":
        assert leitor.comando_envio, "modo sob_comando exige comando_envio"
    else:
        assert leitor.comando_envio is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_parser_ohaus.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.parsers.ohaus_adventurer'`

- [ ] **Step 3: Write the descriptor**

```python
# agente/scale_agente/parsers/ohaus_adventurer.py
"""
Ohaus Adventurer (BAL-701018, modelo ARD110).

Balança analítica de laboratório: frame ASCII com rótulo de unidade e
espaçamento variável, normalmente terminado em CRLF. Emite em GRAMAS — a
conversão para kg é feita por unidades.para_kg a partir do rótulo do próprio
frame, não da configuração.

VALORES CALIBRADOS CONTRA: tests/fixtures/ohaus_ard110_*.bin (Fase 0)
"""
import re

from scale_agente.parsers.base import registrar
from scale_agente.parsers.textual import DecodificadorTextual

# Grupos obrigatórios: peso. Opcionais reconhecidos: unidade, estab.
PADRAO = re.compile(
    rb"(?P<peso>[-+]?\s*\d+\.?\d*)\s*"
    rb"(?P<unidade>kg|g)\s*"
    rb"(?P<estab>ST|US|S)?\s*\r\n",
    re.IGNORECASE,
)

MODO_SAIDA = "sob_comando"
COMANDO_ENVIO = b"P\r\n"


def criar_leitor() -> DecodificadorTextual:
    return DecodificadorTextual(
        padrao=PADRAO,
        modo_saida=MODO_SAIDA,
        comando_envio=COMANDO_ENVIO,
        unidade_padrao="g",
    )


registrar("ohaus_adventurer", criar_leitor)
```

Agora popule `agente/scale_agente/parsers/__init__.py`:

```python
"""Importa as famílias para que se auto-registrem no registry."""
from scale_agente.parsers import ohaus_adventurer, toledo_2090  # noqa: F401
```

- [ ] **Step 4: Calibrar até os testes passarem**

Run: `cd agente && pytest tests/test_parser_ohaus.py tests/test_parsers_genericos.py -v`

Se `nenhum frame decodificado`, imprima o fixture como texto e ajuste `PADRAO`:

```bash
cd agente && python -c "
from pathlib import Path
d = Path('tests/fixtures/ohaus_ard110_estavel.bin').read_bytes()
print(repr(d[:200]))
"
```

Se o marcador de estabilidade da sua revisão de firmware não for `ST`/`US`/`S`, ajuste também `MARCADORES_ESTAVEL` em `parsers/textual.py` e o grupo `estab` do padrão.

- [ ] **Step 5: Commit**

```bash
git add agente/scale_agente/parsers/ agente/tests/test_parser_ohaus.py \
        agente/tests/fixtures/LEIA-ME.md
git commit -m "feat(agente): parser da familia Ohaus Adventurer calibrado contra frames reais"
```

---

## Task 7: Estabilidade por fallback

**Files:**
- Create: `agente/scale_agente/estabilidade.py`
- Create: `agente/tests/test_estabilidade.py`

**Interfaces:**
- Consumes: nada
- Produces: `AvaliadorEstabilidade(divisao: Decimal, amostras: int = 5)` com `avaliar(peso: Decimal, estavel_do_protocolo: bool | None) -> bool` e `reiniciar()`

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_estabilidade.py
from decimal import Decimal

from scale_agente.estabilidade import AvaliadorEstabilidade

D = Decimal


def test_flag_do_protocolo_tem_prioridade():
    """Se o indicador informa estabilidade, é nele que confiamos."""
    a = AvaliadorEstabilidade(divisao=D("0.02"))
    assert a.avaliar(D("12.48"), estavel_do_protocolo=True) is True
    assert a.avaliar(D("99.99"), estavel_do_protocolo=False) is False


def test_fallback_exige_amostras_consecutivas():
    a = AvaliadorEstabilidade(divisao=D("0.02"), amostras=5)
    for _ in range(4):
        assert a.avaliar(D("12.48"), None) is False
    assert a.avaliar(D("12.48"), None) is True


def test_fallback_aceita_variacao_de_uma_divisao():
    a = AvaliadorEstabilidade(divisao=D("0.02"), amostras=3)
    a.avaliar(D("12.48"), None)
    a.avaliar(D("12.49"), None)
    assert a.avaliar(D("12.50"), None) is True


def test_fallback_rejeita_variacao_maior_que_uma_divisao():
    a = AvaliadorEstabilidade(divisao=D("0.02"), amostras=3)
    a.avaliar(D("12.48"), None)
    a.avaliar(D("12.60"), None)
    assert a.avaliar(D("12.48"), None) is False


def test_janela_desliza_e_reestabiliza():
    a = AvaliadorEstabilidade(divisao=D("0.02"), amostras=3)
    a.avaliar(D("5.00"), None)
    a.avaliar(D("40.00"), None)   # carga caindo no prato
    assert a.avaliar(D("40.00"), None) is False
    assert a.avaliar(D("40.00"), None) is True  # janela já só tem 40.00

def test_reiniciar_zera_a_janela():
    a = AvaliadorEstabilidade(divisao=D("0.02"), amostras=2)
    a.avaliar(D("12.48"), None)
    a.reiniciar()
    assert a.avaliar(D("12.48"), None) is False


def test_divisao_ausente_usa_tolerancia_zero():
    """Sem divisão cadastrada, exige leituras idênticas."""
    a = AvaliadorEstabilidade(divisao=None, amostras=2)
    a.avaliar(D("12.48"), None)
    assert a.avaliar(D("12.49"), None) is False
    a.reiniciar()
    a.avaliar(D("12.48"), None)
    assert a.avaliar(D("12.48"), None) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_estabilidade.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.estabilidade'`

- [ ] **Step 3: Write minimal implementation**

```python
# agente/scale_agente/estabilidade.py
"""
Decide se uma leitura está estável.

O agente vê o stream completo (~10 Hz) e decide aqui. O frontend, que faz
polling a ~1 Hz, recebe um `estavel` já validado contra ~500 ms de leituras.
É isso que faz a cadência grossa do polling degradar apenas a fluidez do
display, nunca a correção da captura.
"""
from collections import deque
from decimal import Decimal


class AvaliadorEstabilidade:
    def __init__(self, divisao: Decimal | None, amostras: int = 5):
        self.tolerancia = Decimal(divisao) if divisao else Decimal(0)
        self.amostras = amostras
        self._janela: deque[Decimal] = deque(maxlen=amostras)

    def reiniciar(self) -> None:
        self._janela.clear()

    def avaliar(self, peso: Decimal, estavel_do_protocolo: bool | None) -> bool:
        if estavel_do_protocolo is not None:
            return estavel_do_protocolo

        if self._janela and abs(peso - self._janela[-1]) > self.tolerancia:
            # Salto acima de uma divisão: a janela anterior não vale mais.
            self._janela.clear()

        self._janela.append(peso)

        if len(self._janela) < self.amostras:
            return False

        return (max(self._janela) - min(self._janela)) <= self.tolerancia
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agente && pytest tests/test_estabilidade.py -v`
Expected: 7 testes PASS

- [ ] **Step 5: Commit**

```bash
git add agente/scale_agente/estabilidade.py agente/tests/test_estabilidade.py
git commit -m "feat(agente): avaliador de estabilidade com fallback por divisao"
```

---

## Task 8: Cliente da API

**Files:**
- Create: `agente/scale_agente/api.py`
- Create: `agente/tests/test_api.py`

**Interfaces:**
- Consumes: `ConfigAgente` (Task 1)
- Produces:
  - `@dataclass(frozen=True) BalancaConfig` com `id`, `identificador`, `protocolo`, `porta_serial`, `baud_rate`, `paridade`, `modo_saida`, `unidade_frame`, `capacidade_maxima: Decimal | None`, `divisao: Decimal | None`, `casas_decimais: int`
  - `ClienteScale(config)` com `obter_configuracao() -> list[BalancaConfig]` e `enviar_leituras(versao: str, leituras: list[dict]) -> dict`
  - `ApiErro(Exception)`

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_api.py
from decimal import Decimal

import httpx
import pytest

from scale_agente.api import ApiErro, ClienteScale
from scale_agente.config import ConfigAgente

D = Decimal

CONFIG = ConfigAgente(api_base="https://api.exemplo", env="prod", token="tok123")

RESPOSTA_CONFIG = {
    "agente": "EST-RECEB-01",
    "poll_intervalo_ms": 1000,
    "balancas": [{
        "id": 12, "identificador": "BAL-701012", "protocolo": "toledo_2090",
        "porta_serial": "COM3", "baud_rate": 9600, "paridade": "N",
        "modo_saida": "continuo", "unidade_frame": "kg",
        "capacidade_maxima": "100.000", "divisao": "0.020", "casas_decimais": 2,
    }],
}


def cliente_com(handler):
    cliente = ClienteScale(CONFIG)
    cliente._http = httpx.Client(transport=httpx.MockTransport(handler))
    return cliente


def test_obter_configuracao_envia_token_e_env():
    visto = {}

    def handler(request):
        visto["auth"] = request.headers.get("authorization")
        visto["url"] = str(request.url)
        return httpx.Response(200, json=RESPOSTA_CONFIG)

    balancas = cliente_com(handler).obter_configuracao()

    assert visto["auth"] == "Agente tok123"
    assert "env=prod" in visto["url"]
    assert visto["url"].startswith("https://api.exemplo/api/registro/agente/configuracao/")
    assert len(balancas) == 1


def test_obter_configuracao_converte_pesos_para_decimal():
    balanca = cliente_com(
        lambda r: httpx.Response(200, json=RESPOSTA_CONFIG)
    ).obter_configuracao()[0]

    assert balanca.capacidade_maxima == D("100.000")
    assert balanca.divisao == D("0.020")
    assert isinstance(balanca.capacidade_maxima, Decimal)
    assert balanca.casas_decimais == 2
    assert balanca.porta_serial == "COM3"


def test_obter_configuracao_tolera_capacidade_nula():
    resposta = {**RESPOSTA_CONFIG, "balancas": [
        {**RESPOSTA_CONFIG["balancas"][0], "capacidade_maxima": None, "divisao": None}
    ]}
    balanca = cliente_com(
        lambda r: httpx.Response(200, json=resposta)
    ).obter_configuracao()[0]

    assert balanca.capacidade_maxima is None
    assert balanca.divisao is None


def test_401_levanta_api_erro_com_mensagem_clara():
    cliente = cliente_com(lambda r: httpx.Response(401, json={"detail": "inválido"}))
    with pytest.raises(ApiErro, match="401"):
        cliente.obter_configuracao()


def test_enviar_leituras_serializa_peso_como_string():
    visto = {}

    def handler(request):
        import json
        visto["corpo"] = json.loads(request.content)
        return httpx.Response(200, json={"aceitas": 1, "poll_intervalo_ms": 1000})

    resposta = cliente_com(handler).enviar_leituras("1.0.0", [{
        "balanca_id": 12, "peso_kg": "12.485", "estavel": True,
        "lido_em": "2026-09-03T14:32:10-03:00", "status": "online",
    }])

    assert resposta["aceitas"] == 1
    assert visto["corpo"]["versao_agente"] == "1.0.0"
    # String, nunca número JSON.
    assert visto["corpo"]["leituras"][0]["peso_kg"] == "12.485"
    assert isinstance(visto["corpo"]["leituras"][0]["peso_kg"], str)


def test_erro_de_rede_levanta_api_erro():
    def handler(request):
        raise httpx.ConnectError("sem rota para o host")

    with pytest.raises(ApiErro, match="sem rota"):
        cliente_com(handler).enviar_leituras("1.0.0", [])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_api.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.api'`

- [ ] **Step 3: Write minimal implementation**

```python
# agente/scale_agente/api.py
"""
Cliente HTTP da API do SCALE.

Só faz chamadas outbound: o agente nunca abre porta de escuta. Toda requisição
leva ?env=<env>, porque o EnvSwitchMiddleware do Django usa esse parâmetro
como prioridade 1 para escolher o banco — sem ele o agente de produção
escreveria no banco default silenciosamente.
"""
from dataclasses import dataclass
from decimal import Decimal

import httpx

from scale_agente.config import ConfigAgente

TIMEOUT_SEGUNDOS = 10.0


class ApiErro(Exception):
    pass


@dataclass(frozen=True)
class BalancaConfig:
    id: int
    identificador: str
    protocolo: str
    porta_serial: str
    baud_rate: int
    paridade: str
    modo_saida: str
    unidade_frame: str
    capacidade_maxima: Decimal | None
    divisao: Decimal | None
    casas_decimais: int


def _decimal_ou_none(valor) -> Decimal | None:
    return Decimal(valor) if valor not in (None, "") else None


class ClienteScale:
    def __init__(self, config: ConfigAgente):
        self.config = config
        self._http = httpx.Client(timeout=TIMEOUT_SEGUNDOS)

    def _url(self, caminho: str) -> str:
        return f"{self.config.api_base}/api/registro/{caminho}"

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"Agente {self.config.token}"}

    def _requisitar(self, metodo: str, caminho: str, **kwargs) -> dict:
        try:
            resposta = self._http.request(
                metodo, self._url(caminho),
                params={"env": self.config.env}, headers=self._headers, **kwargs
            )
        except httpx.HTTPError as e:
            raise ApiErro(f"falha de rede em {caminho}: {e}") from e

        if resposta.status_code >= 400:
            raise ApiErro(
                f"{caminho} respondeu {resposta.status_code}: {resposta.text[:200]}"
            )
        return resposta.json()

    def obter_configuracao(self) -> list[BalancaConfig]:
        dados = self._requisitar("GET", "agente/configuracao/")
        return [
            BalancaConfig(
                id=b["id"],
                identificador=b["identificador"],
                protocolo=b["protocolo"],
                porta_serial=b["porta_serial"],
                baud_rate=b["baud_rate"],
                paridade=b["paridade"],
                modo_saida=b["modo_saida"],
                unidade_frame=b["unidade_frame"],
                capacidade_maxima=_decimal_ou_none(b["capacidade_maxima"]),
                divisao=_decimal_ou_none(b["divisao"]),
                casas_decimais=b["casas_decimais"],
            )
            for b in dados["balancas"]
        ]

    def enviar_leituras(self, versao: str, leituras: list[dict]) -> dict:
        return self._requisitar(
            "POST", "agente/leituras/",
            json={"versao_agente": versao, "leituras": leituras},
        )

    def fechar(self) -> None:
        self._http.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agente && pytest tests/test_api.py -v`
Expected: 6 testes PASS

- [ ] **Step 5: Commit**

```bash
git add agente/scale_agente/api.py agente/tests/test_api.py
git commit -m "feat(agente): cliente HTTP da API do SCALE"
```

---

## Task 9: Worker serial e publicador

**Files:**
- Create: `agente/scale_agente/serial_worker.py`, `agente/scale_agente/publicador.py`
- Create: `agente/tests/test_serial_worker.py`, `agente/tests/test_publicador.py`

**Interfaces:**
- Consumes: `BalancaConfig` (Task 8), `obter_leitor` (Task 4), `para_kg` (Task 3), `AvaliadorEstabilidade` (Task 7), `ClienteScale` (Task 8)
- Produces:
  - `@dataclass LeituraPublicavel` com `balanca_id: int`, `peso_kg: Decimal | None`, `estavel: bool`, `lido_em: datetime`, `status: str`
  - `avaliar_frame(balanca: BalancaConfig, leitura, avaliador) -> LeituraPublicavel` — aplica os gates
  - `SerialWorker(balanca, cliente_serial_factory, deposito)` com `.executar_uma_iteracao()` e `.executar()`
  - `Publicador(cliente, deposito, versao)` com `.publicar_uma_vez() -> int`
  - `Deposito` — dict thread-safe `balanca_id -> LeituraPublicavel`
  - Constantes `BACKOFF_SEGUNDOS = (2, 5, 10, 30)`

- [ ] **Step 1: Write the failing test for the gates**

```python
# agente/tests/test_serial_worker.py
from decimal import Decimal

from scale_agente.api import BalancaConfig
from scale_agente.estabilidade import AvaliadorEstabilidade
from scale_agente.parsers.base import LeituraPeso
from scale_agente.serial_worker import BACKOFF_SEGUNDOS, Deposito, avaliar_frame

D = Decimal


def balanca(**kwargs):
    base = dict(
        id=12, identificador="BAL-701012", protocolo="toledo_2090",
        porta_serial="COM3", baud_rate=9600, paridade="N",
        modo_saida="continuo", unidade_frame="kg",
        capacidade_maxima=D("100.000"), divisao=D("0.020"), casas_decimais=2,
    )
    base.update(kwargs)
    return BalancaConfig(**base)


def avaliador():
    return AvaliadorEstabilidade(divisao=D("0.020"), amostras=1)


def test_frame_em_kg_passa_direto():
    resultado = avaliar_frame(
        balanca(), LeituraPeso(D("12.485"), "kg", True), avaliador()
    )
    assert resultado.peso_kg == D("12.485")
    assert resultado.status == "online"
    assert resultado.estavel is True


def test_frame_em_gramas_e_convertido():
    ohaus = balanca(
        identificador="BAL-701018", unidade_frame="g",
        capacidade_maxima=D("4.100"), divisao=D("0.0001"), casas_decimais=5,
    )
    resultado = avaliar_frame(ohaus, LeituraPeso(D("4100.00"), "g", True), avaliador())
    assert resultado.peso_kg == D("4.10000")
    assert resultado.status == "online"


def test_peso_acima_da_capacidade_reporta_erro_e_nao_o_valor():
    """O gate que pega o bug de unidade: 4100 g interpretado como kg."""
    ohaus = balanca(capacidade_maxima=D("4.100"), unidade_frame="kg")
    resultado = avaliar_frame(ohaus, LeituraPeso(D("4100.00"), "kg", True), avaliador())

    assert resultado.status == "erro_leitura"
    assert resultado.peso_kg is None


def test_peso_negativo_nunca_e_estavel():
    resultado = avaliar_frame(
        balanca(), LeituraPeso(D("-0.020"), "kg", True), avaliador()
    )
    assert resultado.status == "online"
    assert resultado.estavel is False


def test_unidade_desconhecida_reporta_erro_leitura():
    resultado = avaliar_frame(
        balanca(), LeituraPeso(D("1.0"), "lb", True), avaliador()
    )
    assert resultado.status == "erro_leitura"
    assert resultado.peso_kg is None


def test_capacidade_nao_cadastrada_nao_bloqueia():
    resultado = avaliar_frame(
        balanca(capacidade_maxima=None), LeituraPeso(D("9999"), "kg", True), avaliador()
    )
    assert resultado.status == "online"


def test_backoff_e_crescente_com_teto():
    assert BACKOFF_SEGUNDOS == (2, 5, 10, 30)
    assert list(BACKOFF_SEGUNDOS) == sorted(BACKOFF_SEGUNDOS)


class TestDeposito:
    def test_guarda_a_ultima_leitura_por_balanca(self):
        d = Deposito()
        r1 = avaliar_frame(balanca(), LeituraPeso(D("1.00"), "kg", True), avaliador())
        r2 = avaliar_frame(balanca(), LeituraPeso(D("2.00"), "kg", True), avaliador())

        d.guardar(r1)
        d.guardar(r2)

        assert [r.peso_kg for r in d.drenar()] == [D("2.00")]

    def test_drenar_esvazia(self):
        d = Deposito()
        d.guardar(avaliar_frame(balanca(), LeituraPeso(D("1.00"), "kg", True), avaliador()))

        assert len(d.drenar()) == 1
        assert d.drenar() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_serial_worker.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.serial_worker'`

- [ ] **Step 3: Write `serial_worker.py`**

```python
# agente/scale_agente/serial_worker.py
"""
Uma thread por porta serial: ler, decodificar, validar, depositar.

Os gates aplicados aqui são baratos e evitam que frame ruim chegue à API.
O mais importante é o de capacidade: ele é a rede de segurança contra erro de
unidade, que é o modo de falha mais perigoso deste projeto (4100 g lidos como
4100 kg numa balança de 4,1 kg).
"""
import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

import serial

from scale_agente.api import BalancaConfig
from scale_agente.estabilidade import AvaliadorEstabilidade
from scale_agente.parsers.base import LeituraPeso, obter_leitor
from scale_agente.unidades import UnidadeDesconhecida, para_kg

logger = logging.getLogger(__name__)

BACKOFF_SEGUNDOS = (2, 5, 10, 30)

STATUS_ONLINE = "online"
STATUS_OFFLINE = "offline"
STATUS_ERRO_LEITURA = "erro_leitura"

PARIDADES = {"N": serial.PARITY_NONE, "E": serial.PARITY_EVEN, "O": serial.PARITY_ODD}


@dataclass
class LeituraPublicavel:
    balanca_id: int
    peso_kg: Decimal | None
    estavel: bool
    lido_em: datetime
    status: str

    def para_payload(self) -> dict:
        return {
            "balanca_id": self.balanca_id,
            # str, nunca float: o peso não passa por ponto flutuante em
            # nenhum ponto do caminho.
            "peso_kg": str(self.peso_kg) if self.peso_kg is not None else None,
            "estavel": self.estavel,
            "lido_em": self.lido_em.isoformat(),
            "status": self.status,
        }


def _erro(balanca_id: int, momento: datetime) -> LeituraPublicavel:
    return LeituraPublicavel(
        balanca_id=balanca_id, peso_kg=None, estavel=False,
        lido_em=momento, status=STATUS_ERRO_LEITURA,
    )


def avaliar_frame(
    balanca: BalancaConfig, leitura: LeituraPeso, avaliador: AvaliadorEstabilidade
) -> LeituraPublicavel:
    agora = datetime.now().astimezone()

    unidade = leitura.unidade or balanca.unidade_frame
    try:
        peso_kg = para_kg(leitura.peso, unidade)
    except UnidadeDesconhecida:
        logger.warning("%s: unidade não suportada %r", balanca.identificador, unidade)
        return _erro(balanca.id, agora)

    if balanca.capacidade_maxima is not None and abs(peso_kg) > balanca.capacidade_maxima:
        logger.warning(
            "%s: leitura %s kg excede a capacidade %s kg — provável erro de unidade",
            balanca.identificador, peso_kg, balanca.capacidade_maxima,
        )
        return _erro(balanca.id, agora)

    estavel = avaliador.avaliar(peso_kg, leitura.estavel)

    # Peso negativo é transitório e legítimo (prato em movimento), mas nunca
    # deve ser oferecido ao operador como valor capturável.
    if peso_kg < 0:
        estavel = False

    return LeituraPublicavel(
        balanca_id=balanca.id, peso_kg=peso_kg, estavel=estavel,
        lido_em=agora, status=STATUS_ONLINE,
    )


class Deposito:
    """Última leitura conhecida por balança, compartilhada entre threads.

    Guarda só a última de propósito: o publicador envia a ~1 Hz e leitura
    antiga não tem valor algum.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._itens: dict[int, LeituraPublicavel] = {}

    def guardar(self, leitura: LeituraPublicavel) -> None:
        with self._lock:
            self._itens[leitura.balanca_id] = leitura

    def drenar(self) -> list[LeituraPublicavel]:
        with self._lock:
            itens = list(self._itens.values())
            self._itens.clear()
            return itens


class SerialWorker(threading.Thread):
    def __init__(self, balanca: BalancaConfig, deposito: Deposito,
                 abrir_porta=None, parar: threading.Event | None = None):
        super().__init__(name=f"serial-{balanca.identificador}", daemon=True)
        self.balanca = balanca
        self.deposito = deposito
        self.parar = parar or threading.Event()
        self._abrir_porta = abrir_porta or self._abrir_porta_real
        self._leitor = obter_leitor(balanca.protocolo)
        self._avaliador = AvaliadorEstabilidade(divisao=balanca.divisao)
        self._buffer = bytearray()

    def _abrir_porta_real(self):
        return serial.Serial(
            port=self.balanca.porta_serial,
            baudrate=self.balanca.baud_rate,
            parity=PARIDADES.get(self.balanca.paridade, serial.PARITY_NONE),
            bytesize=serial.EIGHTBITS, stopbits=serial.STOPBITS_ONE, timeout=0.2,
        )

    def executar_uma_iteracao(self, porta) -> None:
        if self._leitor.modo_saida == "sob_comando" and self._leitor.comando_envio:
            porta.write(self._leitor.comando_envio)

        self._buffer.extend(porta.read(256))

        while True:
            antes = len(self._buffer)
            leitura = self._leitor.parse(self._buffer)
            if leitura is not None:
                self.deposito.guardar(
                    avaliar_frame(self.balanca, leitura, self._avaliador)
                )
            if len(self._buffer) == antes:
                break

    def run(self) -> None:
        tentativa = 0
        while not self.parar.is_set():
            try:
                with self._abrir_porta() as porta:
                    logger.info(
                        "%s: porta %s aberta", self.balanca.identificador,
                        self.balanca.porta_serial,
                    )
                    tentativa = 0
                    while not self.parar.is_set():
                        self.executar_uma_iteracao(porta)
            except Exception as e:
                espera = BACKOFF_SEGUNDOS[min(tentativa, len(BACKOFF_SEGUNDOS) - 1)]
                logger.error(
                    "%s: porta %s indisponível (%s). Nova tentativa em %ss.",
                    self.balanca.identificador, self.balanca.porta_serial, e, espera,
                )
                self.deposito.guardar(LeituraPublicavel(
                    balanca_id=self.balanca.id, peso_kg=None, estavel=False,
                    lido_em=datetime.now().astimezone(), status=STATUS_OFFLINE,
                ))
                self._avaliador.reiniciar()
                self._buffer.clear()
                tentativa += 1
                self.parar.wait(espera)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agente && pytest tests/test_serial_worker.py -v`
Expected: 10 testes PASS

- [ ] **Step 5: Write the failing test for the publisher**

```python
# agente/tests/test_publicador.py
from datetime import datetime
from decimal import Decimal

from scale_agente.api import ApiErro
from scale_agente.publicador import Publicador
from scale_agente.serial_worker import Deposito, LeituraPublicavel

D = Decimal


class ClienteFake:
    def __init__(self, erro=None):
        self.enviados = []
        self.erro = erro

    def enviar_leituras(self, versao, leituras):
        if self.erro:
            raise self.erro
        self.enviados.append((versao, leituras))
        return {"aceitas": len(leituras), "poll_intervalo_ms": 1000}


def leitura(balanca_id=12, peso="12.485", status="online"):
    return LeituraPublicavel(
        balanca_id=balanca_id,
        peso_kg=D(peso) if peso else None,
        estavel=True,
        lido_em=datetime.now().astimezone(),
        status=status,
    )


def test_publica_o_que_esta_no_deposito():
    deposito, cliente = Deposito(), ClienteFake()
    deposito.guardar(leitura())

    enviadas = Publicador(cliente, deposito, "1.0.0").publicar_uma_vez()

    assert enviadas == 1
    versao, payload = cliente.enviados[0]
    assert versao == "1.0.0"
    assert payload[0]["peso_kg"] == "12.485"
    assert isinstance(payload[0]["peso_kg"], str)


def test_deposito_vazio_nao_chama_a_api():
    cliente = ClienteFake()
    assert Publicador(cliente, Deposito(), "1.0.0").publicar_uma_vez() == 0
    assert cliente.enviados == []


def test_erro_de_api_nao_derruba_o_publicador():
    """Falha de rede é esperada: o peso é dado volátil e a próxima iteração
    envia a leitura seguinte. Nada a reenfileirar."""
    deposito = Deposito()
    deposito.guardar(leitura())
    publicador = Publicador(ClienteFake(erro=ApiErro("sem rede")), deposito, "1.0.0")

    assert publicador.publicar_uma_vez() == 0


def test_publica_status_offline_sem_peso():
    deposito, cliente = Deposito(), ClienteFake()
    deposito.guardar(leitura(peso=None, status="offline"))

    Publicador(cliente, deposito, "1.0.0").publicar_uma_vez()

    payload = cliente.enviados[0][1]
    assert payload[0]["status"] == "offline"
    assert payload[0]["peso_kg"] is None


def test_publica_lote_de_varias_balancas():
    deposito, cliente = Deposito(), ClienteFake()
    deposito.guardar(leitura(balanca_id=12))
    deposito.guardar(leitura(balanca_id=13, peso="0.12345"))

    assert Publicador(cliente, deposito, "1.0.0").publicar_uma_vez() == 2
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd agente && pytest tests/test_publicador.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.publicador'`

- [ ] **Step 7: Write `publicador.py`**

```python
# agente/scale_agente/publicador.py
"""
Agrega o que os workers depositaram e envia em lote à API.

Envia a ~1 Hz, não a cada frame: os indicadores emitem ~10 Hz, e postar 10x
por segundo por balança seria desperdício de rede e de throttle sem nenhum
ganho — o operador não percebe diferença abaixo de ~1 Hz no display.

Falha de rede NÃO é reenfileirada: peso é dado volátil, e uma leitura de 30
segundos atrás não tem valor. O que precisa sobreviver a queda de rede é a
Pesagem, que é gravada pelo navegador por outro caminho.
"""
import logging
import threading

from scale_agente.api import ApiErro

logger = logging.getLogger(__name__)

INTERVALO_PADRAO_SEGUNDOS = 1.0


class Publicador:
    def __init__(self, cliente, deposito, versao: str):
        self.cliente = cliente
        self.deposito = deposito
        self.versao = versao
        self.intervalo = INTERVALO_PADRAO_SEGUNDOS

    def publicar_uma_vez(self) -> int:
        leituras = self.deposito.drenar()
        if not leituras:
            return 0

        payload = [l.para_payload() for l in leituras]
        try:
            resposta = self.cliente.enviar_leituras(self.versao, payload)
        except ApiErro as e:
            logger.warning("falha ao publicar %d leitura(s): %s", len(payload), e)
            return 0

        # O backend pode reduzir a cadência remotamente, sem tocar na estação.
        novo = resposta.get("poll_intervalo_ms")
        if novo:
            self.intervalo = max(0.2, novo / 1000)

        return resposta.get("aceitas", len(payload))

    def executar(self, parar: threading.Event) -> None:
        while not parar.is_set():
            self.publicar_uma_vez()
            parar.wait(self.intervalo)
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd agente && pytest tests/test_publicador.py -v`
Expected: 5 testes PASS

- [ ] **Step 9: Commit**

```bash
git add agente/scale_agente/serial_worker.py agente/scale_agente/publicador.py \
        agente/tests/test_serial_worker.py agente/tests/test_publicador.py
git commit -m "feat(agente): worker serial com gates de validacao e publicador em lote"
```

---

## Task 10: Serviço, empacotamento e geração de token

**Files:**
- Create: `agente/scale_agente/servico.py`, `agente/INSTALACAO.md`, `agente/scale-agente.spec`
- Create: `backend/registro/management/commands/criar_agente.py`
- Create: `agente/tests/test_servico.py`

**Interfaces:**
- Consumes: tudo das Tasks 1-9
- Produces: `main() -> int`, `montar(config) -> tuple[list[SerialWorker], Publicador, Event]`, comando `manage.py criar_agente`

- [ ] **Step 1: Write the failing test**

```python
# agente/tests/test_servico.py
from decimal import Decimal

from scale_agente.api import BalancaConfig
from scale_agente.servico import VERSAO, montar

D = Decimal


class ClienteFake:
    def __init__(self, balancas):
        self._balancas = balancas

    def obter_configuracao(self):
        return self._balancas

    def enviar_leituras(self, versao, leituras):
        return {"aceitas": len(leituras), "poll_intervalo_ms": 1000}


def bal(id, identificador, protocolo="toledo_2090", porta="COM3"):
    return BalancaConfig(
        id=id, identificador=identificador, protocolo=protocolo,
        porta_serial=porta, baud_rate=9600, paridade="N",
        modo_saida="continuo", unidade_frame="kg",
        capacidade_maxima=D("100.000"), divisao=D("0.020"), casas_decimais=2,
    )


def test_versao_e_semantica():
    assert VERSAO.count(".") == 2


def test_monta_um_worker_por_balanca():
    cliente = ClienteFake([
        bal(12, "BAL-701012", porta="COM3"),
        bal(13, "BAL-701018", protocolo="ohaus_adventurer", porta="COM5"),
    ])

    workers, publicador, parar = montar(cliente)

    assert len(workers) == 2
    assert {w.balanca.identificador for w in workers} == {"BAL-701012", "BAL-701018"}
    assert publicador.versao == VERSAO
    assert not parar.is_set()


def test_sem_balancas_configuradas_nao_monta_worker():
    workers, _, _ = montar(ClienteFake([]))
    assert workers == []


def test_protocolo_desconhecido_e_ignorado_sem_derrubar_o_agente():
    """Uma balança mal cadastrada não pode impedir as outras de funcionar."""
    cliente = ClienteFake([
        bal(12, "BAL-701012"),
        bal(14, "BAL-BUGADA", protocolo="fabricante_inexistente"),
    ])

    workers, _, _ = montar(cliente)

    assert [w.balanca.identificador for w in workers] == ["BAL-701012"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agente && pytest tests/test_servico.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'scale_agente.servico'`

- [ ] **Step 3: Write `servico.py`**

```python
# agente/scale_agente/servico.py
"""
Entrypoint do agente: monta os workers, sobe o publicador e mantém tudo vivo.

Roda como serviço Windows (ver INSTALACAO.md). Loga tudo em arquivo
rotacionado — requisito da ERU: as leituras e os eventos de reconexão precisam
ser auditáveis em caso de disputa sobre um valor registrado.
"""
import argparse
import logging
import logging.handlers
import os
import signal
import threading
from pathlib import Path

import scale_agente.parsers  # noqa: F401  (auto-registro das famílias)
from scale_agente.api import ApiErro, ClienteScale
from scale_agente.config import ConfigErro, carregar_config
from scale_agente.parsers.base import obter_leitor
from scale_agente.publicador import Publicador
from scale_agente.serial_worker import Deposito, SerialWorker

VERSAO = "1.0.0"

CAMINHO_LOG_PADRAO = Path(os.environ.get("PROGRAMDATA", ".")) / "ScaleAgente" / "agente.log"
CAMINHO_CONFIG_PADRAO = Path(os.environ.get("PROGRAMDATA", ".")) / "ScaleAgente" / "config.json"

logger = logging.getLogger("scale_agente")


def configurar_log(caminho: Path, verboso: bool) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    formato = logging.Formatter(
        "%(asctime)s %(levelname)-7s [%(threadName)s] %(name)s: %(message)s"
    )

    arquivo = logging.handlers.RotatingFileHandler(
        caminho, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    arquivo.setFormatter(formato)

    console = logging.StreamHandler()
    console.setFormatter(formato)

    raiz = logging.getLogger()
    raiz.setLevel(logging.DEBUG if verboso else logging.INFO)
    raiz.handlers = [arquivo, console]


def montar(cliente) -> tuple[list[SerialWorker], Publicador, threading.Event]:
    deposito = Deposito()
    parar = threading.Event()
    workers: list[SerialWorker] = []

    for balanca in cliente.obter_configuracao():
        try:
            obter_leitor(balanca.protocolo)
        except KeyError:
            # Cadastro aponta um protocolo que este agente não conhece
            # (provável agente desatualizado). Ignora esta balança e segue
            # com as outras em vez de derrubar a estação inteira.
            logger.error(
                "%s: protocolo %r desconhecido nesta versão do agente (%s). Ignorada.",
                balanca.identificador, balanca.protocolo, VERSAO,
            )
            continue

        workers.append(SerialWorker(balanca, deposito, parar=parar))

    return workers, Publicador(cliente, deposito, VERSAO), parar


def main() -> int:
    p = argparse.ArgumentParser(description="Agente local de leitura de balanças do SCALE")
    p.add_argument("--config", type=Path, default=CAMINHO_CONFIG_PADRAO)
    p.add_argument("--log", type=Path, default=CAMINHO_LOG_PADRAO)
    p.add_argument("-v", "--verboso", action="store_true")
    args = p.parse_args()

    configurar_log(args.log, args.verboso)
    logger.info("scale-agente %s iniciando", VERSAO)

    try:
        config = carregar_config(args.config)
    except ConfigErro as e:
        logger.critical("configuração inválida: %s", e)
        return 2

    cliente = ClienteScale(config)
    try:
        workers, publicador, parar = montar(cliente)
    except ApiErro as e:
        logger.critical("não foi possível obter a configuração da API: %s", e)
        return 3

    if not workers:
        logger.warning(
            "nenhuma balança configurada para esta estação. Verifique se as "
            "balanças estão vinculadas a este agente e têm protocolo definido."
        )

    def encerrar(*_):
        logger.info("encerrando")
        parar.set()

    signal.signal(signal.SIGINT, encerrar)
    signal.signal(signal.SIGTERM, encerrar)

    for w in workers:
        w.start()
    logger.info("%d worker(s) serial ativo(s)", len(workers))

    publicador.executar(parar)

    for w in workers:
        w.join(timeout=5)
    cliente.fechar()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agente && pytest tests/test_servico.py -v`
Expected: 4 testes PASS

- [ ] **Step 5: Run the whole agent suite**

Run: `cd agente && pytest -v`
Expected: todos os testes PASS (os de parser dão `skip` se os fixtures da Fase 0 não existirem)

- [ ] **Step 6: Comando de geração de token no backend**

```python
# backend/registro/management/commands/criar_agente.py
"""
Cria (ou renova o token de) um agente de estação.

O token é exibido UMA ÚNICA VEZ: só o sha256 é persistido, então não há como
recuperá-lo depois. Se for perdido, rode o comando de novo com --renovar.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from registro.agente_models import AgenteEstacao

User = get_user_model()


class Command(BaseCommand):
    help = "Cria um agente de estação e emite seu token."

    def add_arguments(self, parser):
        parser.add_argument("nome", help="Nome da estação, ex.: EST-RECEB-01")
        parser.add_argument(
            "--usuario",
            help="Username da conta de serviço. Default: svc-agente-<nome em minúsculas>",
        )
        parser.add_argument(
            "--renovar", action="store_true",
            help="Emite um token novo para um agente já existente, invalidando o anterior.",
        )

    def handle(self, *args, **opts):
        nome = opts["nome"].strip()
        username = opts["usuario"] or f"svc-agente-{nome.lower()}"

        usuario, criado_usuario = User.objects.get_or_create(username=username)
        if criado_usuario:
            usuario.set_unusable_password()
            usuario.is_active = True
            usuario.save()
            self.stdout.write(f"conta de serviço criada: {username}")

        agente, criado = AgenteEstacao.objects.get_or_create(
            nome=nome, defaults={"usuario": usuario}
        )

        if not criado and not opts["renovar"]:
            raise CommandError(
                f"agente {nome!r} já existe. Use --renovar para emitir um token novo "
                f"(o token anterior deixa de funcionar)."
            )

        agente, token = agente.gerar_token()

        self.stdout.write(self.style.SUCCESS(f"\nagente: {agente.nome}"))
        self.stdout.write(self.style.WARNING(
            "\nTOKEN (copie agora — não é recuperável):\n"
        ))
        self.stdout.write(token)
        self.stdout.write(
            "\nCole no config.json da estação, no campo \"token\".\n"
            "Depois vincule as balanças a este agente no cadastro "
            "(campo Agente da Balança) e confirme protocolo e porta serial.\n"
        )
```

Verifique:

Run: `cd backend && python manage.py criar_agente EST-RECEB-01`
Expected: imprime um token; rodar de novo sem `--renovar` dá `CommandError`; com `--renovar` emite outro.

- [ ] **Step 7: Empacotamento**

```python
# agente/scale-agente.spec
# PyInstaller: gera um executável único, sem exigir Python na estação.
# Build:  pyinstaller scale-agente.spec --clean
a = Analysis(
    ["scale_agente/servico.py"],
    pathex=["."],
    hiddenimports=[
        # Importados dinamicamente pelo registry: o PyInstaller não os detecta.
        "scale_agente.parsers.toledo_2090",
        "scale_agente.parsers.ohaus_adventurer",
    ],
    datas=[],
    hookspath=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas,
    name="scale-agente",
    console=True,
    upx=False,
)
```

Run: `cd agente && pyinstaller scale-agente.spec --clean`
Expected: gera `dist/scale-agente.exe`. Verifique que os parsers foram embarcados:

Run: `cd agente && dist/scale-agente.exe --config config.exemplo.json -v`
Expected: falha na configuração (token de exemplo) mas **sem** `ModuleNotFoundError` de parser — se aparecer, os `hiddenimports` não pegaram.

- [ ] **Step 8: Documentar a instalação**

```markdown
# agente/INSTALACAO.md

## Pré-requisitos na estação

- Windows 10/11
- Conversor USB-serial com driver instalado (FTDI, CH340 ou Prolific)
- Saída HTTPS liberada para `apiscale.laboratoriosobral.com.br`. Nenhuma porta
  de entrada é necessária: o agente não escuta em porta alguma.

## Fixar o número da porta COM

Ao replugar um conversor USB, o Windows pode reenumerar a porta com outro
número, e o agente passaria a apontar para uma porta que não existe. Fixe:

1. Gerenciador de Dispositivos → Portas (COM e LPT) → o conversor
2. Propriedades → Configurações de Porta → Avançado
3. Escolha um número de COM livre e fixo, e anote-o

## Instalar

1. Copie `scale-agente.exe` para `C:\Program Files\ScaleAgente\`
2. Crie `C:\ProgramData\ScaleAgente\config.json` a partir de
   `config.exemplo.json`, com o token emitido por:
   `python manage.py criar_agente EST-RECEB-01`
3. No SCALE, cadastro de Balanças: para cada balança da estação, preencha
   **Agente**, **Protocolo**, **Porta serial** (a COM fixada acima),
   **Baud rate**, **Paridade**, **Modo de saída** e **Unidade do frame**.
4. Registre o serviço com NSSM:

```
nssm install ScaleAgente "C:\Program Files\ScaleAgente\scale-agente.exe"
nssm set ScaleAgente Start SERVICE_AUTO_START
nssm set ScaleAgente AppExit Default Restart
nssm set ScaleAgente AppRestartDelay 5000
nssm start ScaleAgente
```

## Verificar

- Log: `C:\ProgramData\ScaleAgente\agente.log` deve mostrar
  `porta COMx aberta` para cada balança.
- No SCALE, cadastro de Balanças: `status_conexao` deve virar `online`.
- Na tela Nova Pesagem, selecione a balança: o peso deve aparecer ao vivo.

## Diagnóstico

| Sintoma | Verificar |
|---|---|
| `nenhuma balança configurada` | balanças vinculadas ao agente e com protocolo preenchido |
| `porta COMx indisponível` | número de COM, cabo, e se outro programa está com a porta aberta |
| `status: erro_leitura` constante | unidade do frame e capacidade cadastrada; rode o sniffer e compare com o fixture de referência |
| nenhum byte chegando | baud rate, e se o indicador está em modo de saída contínua |
| `401` no log | token inválido: reemita com `criar_agente --renovar` |
```

- [ ] **Step 9: Commit**

```bash
git add agente/ backend/registro/management/commands/criar_agente.py
git commit -m "feat(agente): servico Windows, empacotamento e comando de emissao de token"
```

---

## Verificação final do Plano 2

- [ ] **Suíte do agente verde**

Run: `cd agente && pytest -v`

- [ ] **Suíte do backend ainda verde** (o comando novo não deve ter quebrado nada)

Run: `cd backend && python manage.py test -v 1`

- [ ] **Nenhum parser dando skip**

Run: `cd agente && pytest -v -rs`
Expected: nenhum `SKIPPED`. Skip aqui significa que os fixtures da Fase 0 não foram capturados — os parsers estão, na prática, sem validação nenhuma.

- [ ] **Teste de ponta a ponta com uma balança real** (Fase 3 da spec)

Com o Plano 1 implantado e uma balança física ligada:

1. `criar_agente EST-PILOTO`, cole o token no `config.json`
2. Vincule **BAL-701012** ao agente no cadastro, com protocolo `toledo_2090` e a COM correta
3. Rode `scale-agente.exe -v` em primeiro plano
4. Ponha peso conhecido no prato e confirme, nesta ordem:
   - o log mostra as leituras decodificadas com o valor correto em kg
   - `GET /api/registro/balancas/<id>/leitura-atual/` devolve o mesmo peso como string
   - o `status_conexao` da balança virou `online` no cadastro
   - retirar o cabo USB faz o log entrar em backoff e o endpoint passar a `offline` em até 15 s
   - religar o cabo faz voltar a `online` sem reiniciar o serviço
