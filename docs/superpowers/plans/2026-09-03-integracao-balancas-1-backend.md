# Integração das Balanças — Plano 1: Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a camada Django que recebe leituras de peso de agentes locais, serve a última leitura ao frontend e registra a procedência do peso gravado — tudo testável sem hardware.

**Architecture:** O agente local faz `POST` HTTPS outbound com as leituras; o Django guarda a última leitura e uma janela de leituras no Redis (dado volátil, nunca em Postgres) e o frontend consulta por polling. Postgres é escrito apenas em transição de status de conexão. A procedência do peso (`origem_peso`) é classificada comparando o valor submetido contra a janela de leituras, o que só é possível porque a leitura chega ao backend por um caminho independente do navegador.

**Tech Stack:** Python 3.11+, Django 5.2.5, DRF 3.16.1, PostgreSQL, Redis (via `django.core.cache.backends.redis.RedisCache`, nativo do Django 4.0+ — **sem nova dependência**)

**Spec:** `docs/superpowers/specs/2026-09-03-integracao-balancas-design.md`

## Global Constraints

- **Nunca `float` para peso.** Todo peso é `Decimal`. Valores trafegam em JSON como **string** (`"12.485"`), nunca como número JSON.
- **Nenhuma nova dependência Python.** O cache Redis usa backend nativo do Django.
- **Plaintext de token nunca é armazenado.** Só `sha256`. O token é exibido uma única vez, na criação.
- **O agente sempre envia `?env=prod`** (ou `?env=hml`). Sem isso o `EnvSwitchMiddleware` (`backend/registro/middleware_env.py:29-33`) cai em `"default"` silenciosamente e o agente escreveria no banco errado.
- **Postgres só em transição de estado.** `status_conexao` grava quando o valor muda; `ultima_leitura_em`, no máximo 1×/60 s.
- **Nenhuma regra de negócio nova.** Tolerância ±5%, bloqueio por calibração e cálculo do bruto permanecem intocados.
- `origem_peso` **nunca bloqueia** uma pesagem. É evidência, não trava.
- Padrão de testes: `django.test.TestCase`, seguindo `backend/registro/tests/test_models.py`.
- Padrão de views de API: `rest_framework.views.APIView`, seguindo `backend/registro/api/backups.py`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/registro/agente_models.py` *(criar)* | Modelo `AgenteEstacao` e geração/verificação de token. Módulo separado seguindo o padrão de `audit_models.py` e `backup.py`. |
| `backend/registro/models.py` *(modificar)* | Campos novos em `Balanca` e `Pesagem.origem_peso` |
| `backend/registro/services/leituras.py` *(criar)* | Toda a interação com o Redis: gravar leitura, ler leitura, ler janela, classificar procedência, decidir se grava status no Postgres. Única unidade que conhece as chaves de cache. |
| `backend/registro/api/agente_auth.py` *(criar)* | `AgenteAuthentication` — autenticação por token de agente |
| `backend/registro/api/agente.py` *(criar)* | As duas views do agente (`configuracao`, `leituras`) |
| `backend/registro/api/leitura.py` *(criar)* | View de leitura atual consumida pelo frontend (auth de operador, não de agente — por isso arquivo separado) |
| `backend/registro/urls.py` *(modificar)* | Rotas novas |
| `backend/registro/serializers.py` *(modificar)* | `origem_peso` no `PesagemSerializer`; campos novos no `BalancaSerializer` |
| `backend/conf/settings.py` *(modificar)* | `CACHES` + escopos de throttle |
| `docker-compose.yml` *(modificar)* | `REDIS_URL` no db 1 |
| `backend/registro/tests/test_leituras.py` *(criar)* | Testes do store e da classificação |
| `backend/registro/tests/test_api_agente.py` *(criar)* | Testes de auth e dos 3 endpoints |

---

## Task 1: Modelo `AgenteEstacao`

**Files:**
- Create: `backend/registro/agente_models.py`
- Create: `backend/registro/tests/test_agente_models.py`
- Modify: `backend/registro/models.py` (import ao final, para o Django registrar o modelo)

**Interfaces:**
- Consumes: nada
- Produces:
  - `AgenteEstacao` (model) com campos `nome`, `token_hash`, `usuario`, `ativo`, `ultimo_contato_em`, `versao_agente`, `criado_em`
  - `AgenteEstacao.gerar_token() -> tuple[AgenteEstacao, str]` (classmethod-like em instância; devolve `(self, plaintext)`)
  - `AgenteEstacao.hash_token(plaintext: str) -> str`
  - `AgenteEstacao.autenticar(plaintext: str) -> AgenteEstacao | None` (classmethod)

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_agente_models.py
from django.contrib.auth import get_user_model
from django.test import TestCase

from registro.agente_models import AgenteEstacao

User = get_user_model()


class AgenteEstacaoTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="svc-agente-receb", password="x")

    def test_gerar_token_devolve_plaintext_e_armazena_somente_hash(self):
        agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user)
        agente, plaintext = agente.gerar_token()

        self.assertTrue(plaintext)
        self.assertNotEqual(agente.token_hash, plaintext)
        self.assertEqual(agente.token_hash, AgenteEstacao.hash_token(plaintext))
        self.assertNotIn(plaintext, agente.token_hash)

    def test_gerar_token_produz_valores_distintos(self):
        a1 = AgenteEstacao.objects.create(nome="EST-01", usuario=self.user)
        a2 = AgenteEstacao.objects.create(nome="EST-02", usuario=self.user)
        _, p1 = a1.gerar_token()
        _, p2 = a2.gerar_token()
        self.assertNotEqual(p1, p2)

    def test_autenticar_com_token_valido(self):
        agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user)
        agente, plaintext = agente.gerar_token()
        self.assertEqual(AgenteEstacao.autenticar(plaintext), agente)

    def test_autenticar_com_token_invalido_devolve_none(self):
        agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user)
        agente.gerar_token()
        self.assertIsNone(AgenteEstacao.autenticar("token-que-nao-existe"))

    def test_autenticar_ignora_agente_inativo(self):
        agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user, ativo=False)
        agente, plaintext = agente.gerar_token()
        self.assertIsNone(AgenteEstacao.autenticar(plaintext))

    def test_autenticar_com_string_vazia_devolve_none(self):
        self.assertIsNone(AgenteEstacao.autenticar(""))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_agente_models -v 2`
Expected: FAIL com `ModuleNotFoundError: No module named 'registro.agente_models'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/registro/agente_models.py
"""
Estação de pesagem que roda o agente local de leitura de balanças.

O token do agente é uma credencial de longa duração (não expira como JWT),
porque o agente é um serviço sem operador para renovar sessão. Por isso o
plaintext nunca é armazenado: só o sha256, e a exibição acontece uma única
vez, na criação.
"""
import hashlib
import secrets

from django.conf import settings
from django.db import models


class AgenteEstacao(models.Model):
    nome = models.CharField(max_length=100, unique=True)
    token_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="agentes_estacao",
        help_text="Conta de serviço. AgenteAuthentication devolve este usuário, "
                  "para que AuditLog e as permissões existentes sigam funcionando.",
    )

    ativo = models.BooleanField(default=True)
    ultimo_contato_em = models.DateTimeField(null=True, blank=True)
    versao_agente = models.CharField(max_length=20, blank=True, default="")
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Agente de estação"
        verbose_name_plural = "Agentes de estação"
        ordering = ["nome"]

    def __str__(self):
        return self.nome

    @staticmethod
    def hash_token(plaintext: str) -> str:
        return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()

    def gerar_token(self) -> tuple["AgenteEstacao", str]:
        """Gera um token novo, persiste apenas o hash e devolve (self, plaintext).

        O plaintext é a única oportunidade de copiar o token — não há como
        recuperá-lo depois.
        """
        plaintext = secrets.token_urlsafe(32)
        self.token_hash = self.hash_token(plaintext)
        self.save(update_fields=["token_hash"])
        return self, plaintext

    @classmethod
    def autenticar(cls, plaintext: str) -> "AgenteEstacao | None":
        if not plaintext:
            return None
        return cls.objects.filter(
            token_hash=cls.hash_token(plaintext), ativo=True
        ).select_related("usuario").first()
```

Ao final de `backend/registro/models.py`, adicione o import para o Django descobrir o modelo:

```python
# Agente local de leitura de balanças (modelo em módulo separado,
# seguindo o padrão de audit_models.py e backup.py)
from .agente_models import AgenteEstacao  # noqa: E402,F401
```

- [ ] **Step 4: Gerar e aplicar a migration**

Run: `cd backend && python manage.py makemigrations registro && python manage.py migrate`
Expected: cria `registro/migrations/00XX_agenteestacao.py` e aplica sem erro.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_agente_models -v 2`
Expected: 6 testes PASS

- [ ] **Step 6: Commit**

```bash
git add backend/registro/agente_models.py backend/registro/models.py \
        backend/registro/tests/test_agente_models.py backend/registro/migrations/
git commit -m "feat(balancas): modelo AgenteEstacao com token hasheado"
```

---

## Task 2: Campos de conexão em `Balanca`

**Files:**
- Modify: `backend/registro/models.py:90-141` (classe `Balanca`)
- Create: migration de schema + migration de dados para `protocolo`
- Create: `backend/registro/tests/test_balanca_conexao.py`

**Interfaces:**
- Consumes: `AgenteEstacao` (Task 1)
- Produces: em `Balanca` — `status_conexao`, `ultima_leitura_em`, `agente` (FK), `baud_rate`, `paridade`, `modo_saida`, `unidade_frame`, e `protocolo` com `choices`. Constantes de classe `Balanca.STATUS_ONLINE`, `STATUS_OFFLINE`, `STATUS_ERRO_LEITURA`, `STATUS_NAO_CONFIGURADA`, `PROTOCOLO_TOLEDO_2090`, `PROTOCOLO_OHAUS_ADVENTURER`.

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_balanca_conexao.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from registro.agente_models import AgenteEstacao
from registro.models import Balanca

User = get_user_model()


class BalancaConexaoTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="svc-agente", password="x")
        self.agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user)

    def test_defaults_de_conexao(self):
        b = Balanca.objects.create(nome="Toledo 100kg", identificador="BAL-701012")
        self.assertEqual(b.status_conexao, Balanca.STATUS_NAO_CONFIGURADA)
        self.assertIsNone(b.ultima_leitura_em)
        self.assertIsNone(b.agente)
        self.assertEqual(b.baud_rate, 9600)
        self.assertEqual(b.paridade, "N")
        self.assertEqual(b.modo_saida, "continuo")
        self.assertEqual(b.unidade_frame, "kg")
        self.assertEqual(b.protocolo, "")

    def test_vincula_agente_e_permite_listar_balancas_da_estacao(self):
        b = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012",
            agente=self.agente, protocolo=Balanca.PROTOCOLO_TOLEDO_2090,
            porta_serial="COM3",
        )
        self.assertEqual(list(self.agente.balancas.all()), [b])

    def test_protocolo_fora_das_choices_e_rejeitado(self):
        b = Balanca(nome="X", identificador="BAL-X", protocolo="filizola_generico")
        with self.assertRaises(ValidationError):
            b.full_clean()

    def test_unidade_frame_aceita_gramas_para_ohaus(self):
        b = Balanca.objects.create(
            nome="Ohaus ARD110", identificador="BAL-701018",
            protocolo=Balanca.PROTOCOLO_OHAUS_ADVENTURER,
            unidade_frame="g", modo_saida="sob_comando",
            capacidade_maxima=Decimal("4.100"), casas_decimais=5,
        )
        b.full_clean()
        self.assertEqual(b.unidade_frame, "g")

    def test_remover_agente_nao_apaga_balanca(self):
        b = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", agente=self.agente
        )
        self.agente.delete()
        b.refresh_from_db()
        self.assertIsNone(b.agente)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_balanca_conexao -v 2`
Expected: FAIL com `AttributeError: type object 'Balanca' has no attribute 'STATUS_NAO_CONFIGURADA'`

- [ ] **Step 3: Write minimal implementation**

Em `backend/registro/models.py`, dentro da classe `Balanca`, adicione as constantes e choices logo após `TIPO_CHOICES` (`:94-98`):

```python
    STATUS_ONLINE = 'online'
    STATUS_OFFLINE = 'offline'
    STATUS_ERRO_LEITURA = 'erro_leitura'
    STATUS_NAO_CONFIGURADA = 'nao_configurada'
    STATUS_CHOICES = (
        (STATUS_ONLINE, 'Online'),
        (STATUS_OFFLINE, 'Offline'),
        (STATUS_ERRO_LEITURA, 'Erro de leitura'),
        (STATUS_NAO_CONFIGURADA, 'Não configurada'),
    )

    PROTOCOLO_TOLEDO_2090 = 'toledo_2090'
    PROTOCOLO_OHAUS_ADVENTURER = 'ohaus_adventurer'
    PROTOCOLO_CHOICES = (
        ('', 'Não configurado'),
        (PROTOCOLO_TOLEDO_2090, 'Toledo indicador 2090'),
        (PROTOCOLO_OHAUS_ADVENTURER, 'Ohaus Adventurer'),
    )

    PARIDADE_CHOICES = (('N', 'Nenhuma'), ('E', 'Par'), ('O', 'Ímpar'))
    MODO_CONTINUO = 'continuo'
    MODO_SOB_COMANDO = 'sob_comando'
    MODO_SAIDA_CHOICES = (
        (MODO_CONTINUO, 'Contínuo'),
        (MODO_SOB_COMANDO, 'Sob comando'),
    )
    UNIDADE_FRAME_CHOICES = (('kg', 'Quilogramas'), ('g', 'Gramas'))
```

Substitua a linha `protocolo = models.CharField(max_length=50, blank=True, default='')` (`:119`) por:

```python
    protocolo = models.CharField(
        max_length=50, choices=PROTOCOLO_CHOICES, blank=True, default='',
        help_text="Família de protocolo usada pelo agente local para decodificar o frame de peso.",
    )
```

E adicione, após `protocolo`:

```python
    # --- Parâmetros da porta serial, lidos pelo agente local ---
    baud_rate = models.PositiveIntegerField(
        default=9600,
        help_text="Velocidade da porta serial. Confirmar no manual do equipamento.",
    )
    paridade = models.CharField(max_length=1, choices=PARIDADE_CHOICES, default='N')
    modo_saida = models.CharField(
        max_length=20, choices=MODO_SAIDA_CHOICES, default=MODO_CONTINUO,
        help_text="Contínuo: o indicador emite frames sem ser solicitado. "
                  "Sob comando: o agente precisa enviar o comando de envio.",
    )
    unidade_frame = models.CharField(
        max_length=2, choices=UNIDADE_FRAME_CHOICES, default='kg',
        help_text="Unidade em que o frame vem quando o protocolo NÃO rotula a unidade "
                  "(caso da Toledo 2090). Ignorado quando o frame traz o rótulo (Ohaus).",
    )

    # --- Estado de conexão, alimentado pelo agente local ---
    agente = models.ForeignKey(
        'registro.AgenteEstacao', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='balancas',
        help_text="Estação à qual esta balança está fisicamente ligada. "
                  "Define quem pode reportar leituras dela.",
    )
    status_conexao = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_NAO_CONFIGURADA
    )
    ultima_leitura_em = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 4: Gerar a migration de schema**

Run: `cd backend && python manage.py makemigrations registro`
Expected: cria migration com os 7 campos e a alteração de `protocolo`.

- [ ] **Step 5: Escrever a migration de dados para `protocolo`**

`protocolo` era `CharField` livre; valores existentes podem não casar com as novas choices. Crie a migration vazia e preencha:

Run: `cd backend && python manage.py makemigrations registro --empty -n normaliza_protocolo_balanca`

```python
# backend/registro/migrations/00XX_normaliza_protocolo_balanca.py
from django.db import migrations


def normaliza(apps, schema_editor):
    """Mapeia o texto livre anterior para as choices novas.

    Valor não reconhecido vira '' (não configurado), que é o estado correto:
    o agente ignora balança sem protocolo em vez de tentar decodificar às cegas.
    """
    Balanca = apps.get_model("registro", "Balanca")
    for balanca in Balanca.objects.exclude(protocolo=""):
        atual = (balanca.protocolo or "").strip().lower()
        if "toledo" in atual or "2090" in atual:
            novo = "toledo_2090"
        elif "ohaus" in atual:
            novo = "ohaus_adventurer"
        else:
            novo = ""
        if novo != balanca.protocolo:
            balanca.protocolo = novo
            balanca.save(update_fields=["protocolo"])


def reverter(apps, schema_editor):
    """Sem reversão: o texto livre original não é recuperável."""
    pass


class Migration(migrations.Migration):
    dependencies = [("registro", "00XX_previous")]  # ajustar para a migration do Step 4
    operations = [migrations.RunPython(normaliza, reverter)]
```

- [ ] **Step 6: Aplicar as migrations**

Run: `cd backend && python manage.py migrate`
Expected: ambas aplicam sem erro.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_balanca_conexao -v 2`
Expected: 5 testes PASS

- [ ] **Step 8: Verificar que nada regrediu no cadastro existente**

Run: `cd backend && python manage.py test registro -v 1`
Expected: toda a suíte de `registro` PASS. `BalancaSerializer` usa `fields = "__all__"` (`serializers.py:54-57`), então os campos novos passam a ser expostos automaticamente — confirme que nenhum teste de contrato de API quebrou.

- [ ] **Step 9: Commit**

```bash
git add backend/registro/models.py backend/registro/migrations/ \
        backend/registro/tests/test_balanca_conexao.py
git commit -m "feat(balancas): parametros de porta serial e estado de conexao em Balanca"
```

---

## Task 3: `Pesagem.origem_peso`

**Files:**
- Modify: `backend/registro/models.py:260-320` (classe `Pesagem`)
- Create: migration
- Create: `backend/registro/tests/test_pesagem_origem.py`

**Interfaces:**
- Consumes: nada
- Produces: `Pesagem.origem_peso` e as constantes `Pesagem.ORIGEM_AUTOMATICA`, `ORIGEM_MANUAL`, `ORIGEM_AUTOMATICA_AJUSTADA`

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_pesagem_origem.py
from django.test import TestCase

from registro.models import Pesagem


class PesagemOrigemTests(TestCase):
    def test_constantes_de_origem(self):
        self.assertEqual(Pesagem.ORIGEM_MANUAL, "manual")
        self.assertEqual(Pesagem.ORIGEM_AUTOMATICA, "automatica")
        self.assertEqual(Pesagem.ORIGEM_AUTOMATICA_AJUSTADA, "automatica_ajustada")

    def test_default_e_manual(self):
        """Pesagens existentes e qualquer criação que não informe origem são
        manuais — é o comportamento de produção antes desta feature."""
        campo = Pesagem._meta.get_field("origem_peso")
        self.assertEqual(campo.default, Pesagem.ORIGEM_MANUAL)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_pesagem_origem -v 2`
Expected: FAIL com `AttributeError: type object 'Pesagem' has no attribute 'ORIGEM_MANUAL'`

- [ ] **Step 3: Write minimal implementation**

Em `backend/registro/models.py`, na classe `Pesagem`, adicione as constantes no topo do corpo da classe (antes de `op = models.ForeignKey(...)`, `:268`):

```python
    ORIGEM_AUTOMATICA = 'automatica'
    ORIGEM_MANUAL = 'manual'
    ORIGEM_AUTOMATICA_AJUSTADA = 'automatica_ajustada'
    ORIGEM_CHOICES = (
        (ORIGEM_AUTOMATICA, 'Capturada da balança'),
        (ORIGEM_AUTOMATICA_AJUSTADA, 'Capturada e ajustada manualmente'),
        (ORIGEM_MANUAL, 'Digitada manualmente'),
    )
```

E o campo, junto aos metadados adicionais (após `codigo_interno`, `:309`):

```python
    origem_peso = models.CharField(
        max_length=20, choices=ORIGEM_CHOICES, default=ORIGEM_MANUAL,
        help_text="Procedência dos valores de tara/líquido. Registro de auditoria: "
                  "nunca bloqueia a gravação, apenas documenta a origem.",
    )
```

- [ ] **Step 4: Gerar e aplicar a migration**

Run: `cd backend && python manage.py makemigrations registro && python manage.py migrate`
Expected: adiciona a coluna com default `manual`; linhas existentes ficam `manual`, que é factualmente correto.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_pesagem_origem -v 2`
Expected: 2 testes PASS

- [ ] **Step 6: Commit**

```bash
git add backend/registro/models.py backend/registro/migrations/ \
        backend/registro/tests/test_pesagem_origem.py
git commit -m "feat(pesagem): campo origem_peso para rastrear procedencia do valor"
```

---

## Task 4: Redis e o store de leituras

**Files:**
- Create: `backend/registro/services/leituras.py`
- Create: `backend/registro/tests/test_leituras.py`
- Modify: `backend/conf/settings.py` (adicionar `CACHES`)
- Modify: `docker-compose.yml` (adicionar `REDIS_URL` aos serviços `backend`, `worker`, `beat`)

**Interfaces:**
- Consumes: `Balanca` (Task 2)
- Produces:
  - `registrar_leitura(balanca_id: int, peso_kg: Decimal, estavel: bool, lido_em: datetime) -> None`
  - `obter_leitura(balanca_id: int) -> dict | None` — chaves `peso_kg` (str), `estavel` (bool), `lido_em` (str ISO)
  - `obter_janela(balanca_id: int) -> list[Decimal]`
  - `classificar_origem(balanca_id: int, casas_decimais: int, tara: Decimal, liquido: Decimal) -> str`
  - `deve_gravar_ultima_leitura(balanca) -> bool`
  - Constantes `LEITURA_TTL = 15`, `JANELA_TTL = 600`, `JANELA_MAX = 120`, `INTERVALO_GRAVACAO_SEGUNDOS = 60`

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_leituras.py
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from registro.models import Balanca, Pesagem
from registro.services import leituras

D = Decimal

# LocMemCache isola os testes do Redis real e ainda exercita a mesma API de cache.
CACHE_LOCMEM = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-leituras",
    }
}


@override_settings(CACHES=CACHE_LOCMEM)
class StoreLeiturasTests(TestCase):
    def setUp(self):
        cache.clear()
        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", casas_decimais=2
        )

    def test_obter_leitura_sem_nada_gravado_devolve_none(self):
        self.assertIsNone(leituras.obter_leitura(self.balanca.id))

    def test_registrar_e_obter_leitura_preserva_precisao_como_string(self):
        agora = timezone.now()
        leituras.registrar_leitura(self.balanca.id, D("12.485"), True, agora)

        atual = leituras.obter_leitura(self.balanca.id)
        self.assertEqual(atual["peso_kg"], "12.485")
        self.assertIsInstance(atual["peso_kg"], str)
        self.assertTrue(atual["estavel"])

    def test_janela_guarda_somente_leituras_estaveis(self):
        agora = timezone.now()
        leituras.registrar_leitura(self.balanca.id, D("1.00"), True, agora)
        leituras.registrar_leitura(self.balanca.id, D("2.00"), False, agora)
        leituras.registrar_leitura(self.balanca.id, D("3.00"), True, agora)

        self.assertEqual(leituras.obter_janela(self.balanca.id), [D("1.00"), D("3.00")])

    def test_janela_limita_o_tamanho(self):
        agora = timezone.now()
        for i in range(leituras.JANELA_MAX + 20):
            leituras.registrar_leitura(self.balanca.id, D(i), True, agora)

        janela = leituras.obter_janela(self.balanca.id)
        self.assertEqual(len(janela), leituras.JANELA_MAX)
        # mantém as MAIS RECENTES
        self.assertEqual(janela[-1], D(leituras.JANELA_MAX + 19))


@override_settings(CACHES=CACHE_LOCMEM)
class ClassificarOrigemTests(TestCase):
    def setUp(self):
        cache.clear()
        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", casas_decimais=2
        )
        self.agora = timezone.now()

    def test_janela_vazia_e_manual(self):
        origem = leituras.classificar_origem(self.balanca.id, 2, D("0.50"), D("12.49"))
        self.assertEqual(origem, Pesagem.ORIGEM_MANUAL)

    def test_tara_e_liquido_casam_apos_quantizar_e_automatica(self):
        """O ponto crítico: a janela guarda precisão cheia (0.499996) e o
        frontend arredonda na captura (0.50). Comparação exata falharia."""
        leituras.registrar_leitura(self.balanca.id, D("0.499996"), True, self.agora)
        leituras.registrar_leitura(self.balanca.id, D("12.485111"), True, self.agora)

        origem = leituras.classificar_origem(self.balanca.id, 2, D("0.50"), D("12.49"))
        self.assertEqual(origem, Pesagem.ORIGEM_AUTOMATICA)

    def test_apenas_tara_casa_e_ajustada(self):
        leituras.registrar_leitura(self.balanca.id, D("0.499996"), True, self.agora)

        origem = leituras.classificar_origem(self.balanca.id, 2, D("0.50"), D("99.99"))
        self.assertEqual(origem, Pesagem.ORIGEM_AUTOMATICA_AJUSTADA)

    def test_apenas_liquido_casa_e_ajustada(self):
        leituras.registrar_leitura(self.balanca.id, D("12.485111"), True, self.agora)

        origem = leituras.classificar_origem(self.balanca.id, 2, D("77.77"), D("12.49"))
        self.assertEqual(origem, Pesagem.ORIGEM_AUTOMATICA_AJUSTADA)

    def test_nenhum_casa_mas_havia_leituras_e_ajustada(self):
        leituras.registrar_leitura(self.balanca.id, D("5.00"), True, self.agora)

        origem = leituras.classificar_origem(self.balanca.id, 2, D("77.77"), D("88.88"))
        self.assertEqual(origem, Pesagem.ORIGEM_AUTOMATICA_AJUSTADA)


class DeveGravarUltimaLeituraTests(TestCase):
    def setUp(self):
        self.balanca = Balanca.objects.create(nome="B", identificador="BAL-X")

    def test_grava_quando_nunca_gravou(self):
        self.assertTrue(leituras.deve_gravar_ultima_leitura(self.balanca))

    def test_nao_grava_quando_gravou_agora(self):
        self.balanca.ultima_leitura_em = timezone.now()
        self.assertFalse(leituras.deve_gravar_ultima_leitura(self.balanca))

    def test_grava_quando_passou_do_intervalo(self):
        self.balanca.ultima_leitura_em = timezone.now() - timedelta(
            seconds=leituras.INTERVALO_GRAVACAO_SEGUNDOS + 5
        )
        self.assertTrue(leituras.deve_gravar_ultima_leitura(self.balanca))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_leituras -v 2`
Expected: FAIL com `ImportError: cannot import name 'leituras' from 'registro.services'`

- [ ] **Step 3: Write the store**

```python
# backend/registro/services/leituras.py
"""
Store das leituras de peso reportadas pelos agentes locais.

A leitura de peso é dado volátil: vale por segundos e não tem valor histórico
(o registro de verdade é a Pesagem gravada). Por isso vive no Redis, não no
Postgres — gravar ~86 mil leituras por balança por dia num campo que ninguém
consulta depois seria puro desperdício de I/O.

Esta é a única unidade do backend que conhece as chaves de cache.
"""
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone

from registro.models import Pesagem

# A ausência da chave `leitura` É o detector de offline: se o agente parou de
# reportar, a chave expira e o frontend passa a ver `offline` sem precisar de
# nenhum job de varredura.
LEITURA_TTL = 15

# A janela precisa cobrir o intervalo real entre capturar a tara, encher a
# embalagem e capturar o líquido. 180s bastariam para o display, mas não para
# a classificação de procedência.
JANELA_TTL = 600
JANELA_MAX = 120

INTERVALO_GRAVACAO_SEGUNDOS = 60


def _chave_leitura(balanca_id: int) -> str:
    return f"balanca:{balanca_id}:leitura"


def _chave_janela(balanca_id: int) -> str:
    return f"balanca:{balanca_id}:janela"


def _quantizar(valor: Decimal, casas_decimais: int) -> Decimal:
    return Decimal(valor).quantize(Decimal(1).scaleb(-casas_decimais))


def registrar_leitura(balanca_id: int, peso_kg: Decimal, estavel: bool, lido_em) -> None:
    """Grava a leitura como última e, se estável, acrescenta à janela.

    O peso é serializado como str para que o valor atravesse o cache e o JSON
    sem passar por float em nenhum ponto.
    """
    cache.set(
        _chave_leitura(balanca_id),
        {"peso_kg": str(peso_kg), "estavel": bool(estavel), "lido_em": lido_em.isoformat()},
        LEITURA_TTL,
    )

    if not estavel:
        return

    janela = cache.get(_chave_janela(balanca_id)) or []
    janela.append(str(peso_kg))
    cache.set(_chave_janela(balanca_id), janela[-JANELA_MAX:], JANELA_TTL)


def obter_leitura(balanca_id: int) -> dict | None:
    return cache.get(_chave_leitura(balanca_id))


def obter_janela(balanca_id: int) -> list[Decimal]:
    return [Decimal(v) for v in (cache.get(_chave_janela(balanca_id)) or [])]


def classificar_origem(
    balanca_id: int, casas_decimais: int, tara: Decimal, liquido: Decimal
) -> str:
    """Classifica a procedência do par (tara, líquido).

    A comparação é feita APÓS quantizar para as casas decimais da balança: a
    janela guarda precisão cheia, mas o frontend arredonda na captura. Sem o
    quantize, a igualdade falharia quase sempre e toda pesagem seria
    classificada como manual, tornando o campo inútil.
    """
    janela = obter_janela(balanca_id)
    if not janela:
        return Pesagem.ORIGEM_MANUAL

    vistos = {_quantizar(v, casas_decimais) for v in janela}
    tara_casa = _quantizar(tara, casas_decimais) in vistos
    liquido_casa = _quantizar(liquido, casas_decimais) in vistos

    if tara_casa and liquido_casa:
        return Pesagem.ORIGEM_AUTOMATICA
    return Pesagem.ORIGEM_AUTOMATICA_AJUSTADA


def deve_gravar_ultima_leitura(balanca) -> bool:
    """Limita a escrita de `ultima_leitura_em` a 1x por INTERVALO_GRAVACAO_SEGUNDOS."""
    if balanca.ultima_leitura_em is None:
        return True
    idade = timezone.now() - balanca.ultima_leitura_em
    return idade >= timedelta(seconds=INTERVALO_GRAVACAO_SEGUNDOS)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_leituras -v 2`
Expected: 12 testes PASS

- [ ] **Step 5: Configurar o Redis como cache**

Em `backend/conf/settings.py`, após o bloco `REST_FRAMEWORK` (`:155`), adicione:

```python
# Cache — obrigatoriamente compartilhado entre processos.
# Com múltiplos workers gunicorn, LocMemCache seria por processo: o worker que
# atende o GET do frontend não veria a leitura gravada pelo worker que atendeu
# o POST do agente. Backend nativo do Django 4.0+, sem dependência nova.
# Usa o db 1 para não compartilhar keyspace com a fila do Celery (db 0).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", "redis://redis:6379/1"),
    }
}
```

Em `docker-compose.yml`, adicione a variável nos três serviços que rodam código Django (`backend`, `worker`, `beat`), ao lado das `CELERY_*` já existentes:

```yaml
      REDIS_URL: redis://:${REDIS_PASSWORD:-changeme}@redis:6379/1
```

- [ ] **Step 6: Verificar o Redis real de ponta a ponta**

Run:
```bash
docker compose up -d redis backend
docker compose exec backend python -c "
from django.core.cache import cache
import django, os
cache.set('smoke', 'ok', 10)
print('cache:', cache.get('smoke'))
"
```
Expected: imprime `cache: ok`. Se imprimir `None`, o `REDIS_URL` não chegou ao container ou a senha está errada.

- [ ] **Step 7: Run the full suite**

Run: `cd backend && python manage.py test registro -v 1`
Expected: PASS. Confirma que definir `CACHES` não regrediu nada — não havia nenhum uso de `django.core.cache` no projeto antes desta task.

- [ ] **Step 8: Commit**

```bash
git add backend/registro/services/leituras.py backend/registro/tests/test_leituras.py \
        backend/conf/settings.py docker-compose.yml
git commit -m "feat(balancas): store de leituras em Redis e classificacao de procedencia"
```

---

## Task 5: `AgenteAuthentication`

**Files:**
- Create: `backend/registro/api/agente_auth.py`
- Create: `backend/registro/tests/test_agente_auth.py`

**Interfaces:**
- Consumes: `AgenteEstacao.autenticar` (Task 1)
- Produces: `AgenteAuthentication` (classe DRF de autenticação). `request.auth` recebe a instância de `AgenteEstacao`; `request.user` recebe a conta de serviço.

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_agente_auth.py
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import AuthenticationFailed

from registro.agente_models import AgenteEstacao
from registro.api.agente_auth import AgenteAuthentication

User = get_user_model()


class AgenteAuthenticationTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.user = User.objects.create_user(username="svc-agente", password="x")
        self.agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user)
        self.agente, self.token = self.agente.gerar_token()
        self.auth = AgenteAuthentication()

    def _req(self, header=None):
        kwargs = {"HTTP_AUTHORIZATION": header} if header else {}
        return self.factory.get("/api/registro/agente/configuracao/", **kwargs)

    def test_token_valido_devolve_usuario_de_servico_e_agente(self):
        user, agente = self.auth.authenticate(self._req(f"Agente {self.token}"))
        self.assertEqual(user, self.user)
        self.assertEqual(agente, self.agente)

    def test_sem_header_devolve_none_para_delegar_a_outros_autenticadores(self):
        self.assertIsNone(self.auth.authenticate(self._req()))

    def test_outro_esquema_devolve_none(self):
        self.assertIsNone(self.auth.authenticate(self._req("Bearer abc.def.ghi")))

    def test_token_invalido_levanta_authentication_failed(self):
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(self._req("Agente token-errado"))

    def test_agente_inativo_levanta_authentication_failed(self):
        self.agente.ativo = False
        self.agente.save(update_fields=["ativo"])
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(self._req(f"Agente {self.token}"))

    def test_header_sem_token_levanta_authentication_failed(self):
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(self._req("Agente"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_agente_auth -v 2`
Expected: FAIL com `ModuleNotFoundError: No module named 'registro.api.agente_auth'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/registro/api/agente_auth.py
"""
Autenticação dos agentes locais de leitura de balanças.

O agente é um serviço sem operador, então não pode usar JWT (que expira e
exige renovação interativa). Usa token de longa duração, transportado como
`Authorization: Agente <token>`.

Devolve a CONTA DE SERVIÇO como request.user, de propósito: assim AuditLog e
as permissões existentes seguem funcionando sem alteração.
"""
from rest_framework import authentication, exceptions

from registro.agente_models import AgenteEstacao

ESQUEMA = "agente"


class AgenteAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        if not header:
            return None

        partes = header.split()
        if partes[0].lower() != ESQUEMA:
            # Outro esquema (ex.: Bearer): devolve None para que o
            # JWTAuthentication tenha sua chance.
            return None

        if len(partes) != 2:
            raise exceptions.AuthenticationFailed(
                "Header Authorization mal formado para o esquema Agente."
            )

        agente = AgenteEstacao.autenticar(partes[1])
        if agente is None:
            raise exceptions.AuthenticationFailed("Token de agente inválido ou inativo.")

        return (agente.usuario, agente)

    def authenticate_header(self, request):
        return "Agente"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_agente_auth -v 2`
Expected: 6 testes PASS

- [ ] **Step 5: Commit**

```bash
git add backend/registro/api/agente_auth.py backend/registro/tests/test_agente_auth.py
git commit -m "feat(balancas): autenticacao por token para agentes de estacao"
```

---

## Task 6: `GET /agente/configuracao/`

**Files:**
- Create: `backend/registro/api/agente.py`
- Modify: `backend/registro/urls.py`
- Create: `backend/registro/tests/test_api_agente.py`

**Interfaces:**
- Consumes: `AgenteAuthentication` (Task 5), `Balanca` (Task 2)
- Produces: `AgenteConfiguracaoView`, rota `agente/configuracao/` (name `agente-configuracao`), e o `throttle_scope = "agente"`

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_api_agente.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from registro.agente_models import AgenteEstacao
from registro.models import Balanca

User = get_user_model()
D = Decimal


class AgenteConfiguracaoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="svc-agente", password="x")
        self.agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user)
        self.agente, self.token = self.agente.gerar_token()

        self.minha = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", agente=self.agente,
            protocolo=Balanca.PROTOCOLO_TOLEDO_2090, porta_serial="COM3",
            baud_rate=9600, paridade="N", modo_saida="continuo", unidade_frame="kg",
            capacidade_maxima=D("100.000"), divisao=D("0.020"), casas_decimais=2,
        )
        # De outra estação: NÃO pode aparecer na configuração deste agente.
        outro_user = User.objects.create_user(username="svc-agente-2", password="x")
        outro = AgenteEstacao.objects.create(nome="EST-MANUT-01", usuario=outro_user)
        self.alheia = Balanca.objects.create(
            nome="Toledo backup", identificador="BAL-101005", agente=outro,
            protocolo=Balanca.PROTOCOLO_TOLEDO_2090, porta_serial="COM9",
        )
        # Sem agente: nunca aparece para ninguém.
        self.orfa = Balanca.objects.create(nome="Sem agente", identificador="BAL-999")

        self.url = reverse("agente-configuracao")

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Agente {self.token}")

    def test_sem_token_retorna_401(self):
        resp = self.client.get(self.url, {"env": "prod"})
        self.assertEqual(resp.status_code, 401)

    def test_token_invalido_retorna_401(self):
        self.client.credentials(HTTP_AUTHORIZATION="Agente errado")
        resp = self.client.get(self.url, {"env": "prod"})
        self.assertEqual(resp.status_code, 401)

    def test_devolve_apenas_balancas_da_propria_estacao(self):
        self._auth()
        resp = self.client.get(self.url, {"env": "prod"})

        self.assertEqual(resp.status_code, 200)
        identificadores = [b["identificador"] for b in resp.data["balancas"]]
        self.assertEqual(identificadores, ["BAL-701012"])

    def test_payload_traz_os_parametros_de_porta_e_pesos_como_string(self):
        self._auth()
        resp = self.client.get(self.url, {"env": "prod"})
        balanca = resp.data["balancas"][0]

        self.assertEqual(balanca["porta_serial"], "COM3")
        self.assertEqual(balanca["baud_rate"], 9600)
        self.assertEqual(balanca["paridade"], "N")
        self.assertEqual(balanca["modo_saida"], "continuo")
        self.assertEqual(balanca["unidade_frame"], "kg")
        self.assertEqual(balanca["casas_decimais"], 2)
        # Peso NUNCA como número JSON — evita float no caminho.
        self.assertEqual(balanca["capacidade_maxima"], "100.000")
        self.assertEqual(balanca["divisao"], "0.020")

    def test_resposta_traz_nome_do_agente_e_cadencia(self):
        self._auth()
        resp = self.client.get(self.url, {"env": "prod"})
        self.assertEqual(resp.data["agente"], "EST-RECEB-01")
        self.assertEqual(resp.data["poll_intervalo_ms"], 1000)

    def test_balanca_sem_protocolo_e_omitida(self):
        """O agente não deve tentar decodificar às cegas."""
        self.minha.protocolo = ""
        self.minha.save(update_fields=["protocolo"])
        self._auth()
        resp = self.client.get(self.url, {"env": "prod"})
        self.assertEqual(resp.data["balancas"], [])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_api_agente -v 2`
Expected: FAIL com `NoReverseMatch: Reverse for 'agente-configuracao' not found`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/registro/api/agente.py
"""
Endpoints consumidos pelos agentes locais de leitura de balanças.

Autenticados por token de agente (não por JWT de operador). O agente sempre
envia ?env=prod: o EnvSwitchMiddleware usa esse parâmetro como prioridade 1
para escolher o banco, e o registro AgenteEstacao vive no banco daquele
ambiente — um token de produção simplesmente não existe no banco de HML,
então adulterar o parâmetro resulta em 401, não em escrita no banco errado.
"""
from rest_framework import permissions, serializers, views
from rest_framework.response import Response

from registro.api.agente_auth import AgenteAuthentication
from registro.models import Balanca

POLL_INTERVALO_MS = 1000


class BalancaConfigSerializer(serializers.ModelSerializer):
    # Pesos como string: nenhum valor de massa atravessa float.
    capacidade_maxima = serializers.CharField()
    divisao = serializers.CharField()

    class Meta:
        model = Balanca
        fields = [
            "id", "identificador", "protocolo", "porta_serial",
            "baud_rate", "paridade", "modo_saida", "unidade_frame",
            "capacidade_maxima", "divisao", "casas_decimais",
        ]
        read_only_fields = fields


class AgenteConfiguracaoView(views.APIView):
    authentication_classes = [AgenteAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "agente"

    def get(self, request):
        agente = request.auth
        balancas = (
            agente.balancas
            .exclude(protocolo="")
            .filter(ativo=True)
            .order_by("identificador")
        )
        return Response({
            "agente": agente.nome,
            "poll_intervalo_ms": POLL_INTERVALO_MS,
            "balancas": BalancaConfigSerializer(balancas, many=True).data,
        })
```

Em `backend/registro/urls.py`, adicione o import e a rota:

```python
from .api.agente import AgenteConfiguracaoView
```

E em `urlpatterns`:

```python
    # Agente local de balanças
    path("agente/configuracao/", AgenteConfiguracaoView.as_view(), name="agente-configuracao"),
```

- [ ] **Step 4: Adicionar o escopo de throttle**

Em `backend/conf/settings.py:150-154`, o `"user": "2000/day"` bloquearia o agente em ~33 minutos. Adicione os escopos dedicados (o `"user"` permanece protegendo o resto da API):

```python
    "DEFAULT_THROTTLE_RATES": {
        "anon": "200/day",
        "user": "2000/day",
        "login": "5/min",
        # O agente reporta ~1x/s: 3.600/h. Folga para lotes e retentativas.
        "agente": "10000/hour",
        # Frontend faz polling a ~1 Hz enquanto a tela de pesagem está aberta.
        "leitura": "7200/hour",
    },
```

Para que `throttle_scope` funcione, as views novas precisam de `ScopedRateThrottle`. Adicione em `AgenteConfiguracaoView`:

```python
from rest_framework.throttling import ScopedRateThrottle
```
```python
    throttle_classes = [ScopedRateThrottle]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_api_agente -v 2`
Expected: 6 testes PASS

- [ ] **Step 6: Commit**

```bash
git add backend/registro/api/agente.py backend/registro/urls.py \
        backend/conf/settings.py backend/registro/tests/test_api_agente.py
git commit -m "feat(balancas): endpoint de configuracao do agente e escopos de throttle"
```

---

## Task 7: `POST /agente/leituras/`

**Files:**
- Modify: `backend/registro/api/agente.py`
- Modify: `backend/registro/urls.py`
- Modify: `backend/registro/tests/test_api_agente.py`

**Interfaces:**
- Consumes: `leituras.registrar_leitura`, `leituras.deve_gravar_ultima_leitura` (Task 4); `AgenteAuthentication` (Task 5)
- Produces: `AgenteLeiturasView`, rota `agente/leituras/` (name `agente-leituras`)

- [ ] **Step 1: Write the failing test**

Acrescente a `backend/registro/tests/test_api_agente.py`:

```python
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

from registro.services import leituras as store

CACHE_LOCMEM = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-api-agente",
    }
}


@override_settings(CACHES=CACHE_LOCMEM)
class AgenteLeiturasTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(username="svc-agente", password="x")
        self.agente = AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=self.user)
        self.agente, self.token = self.agente.gerar_token()

        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", agente=self.agente,
            protocolo=Balanca.PROTOCOLO_TOLEDO_2090, casas_decimais=2,
        )
        outro_user = User.objects.create_user(username="svc-agente-2", password="x")
        outro = AgenteEstacao.objects.create(nome="EST-MANUT-01", usuario=outro_user)
        self.alheia = Balanca.objects.create(
            nome="Backup", identificador="BAL-101005", agente=outro,
        )

        self.url = reverse("agente-leituras")
        self.client.credentials(HTTP_AUTHORIZATION=f"Agente {self.token}")

    def _payload(self, balanca_id, peso="12.485", estavel=True, status="online"):
        return {
            "versao_agente": "1.0.0",
            "leituras": [{
                "balanca_id": balanca_id,
                "peso_kg": peso,
                "estavel": estavel,
                "lido_em": timezone.now().isoformat(),
                "status": status,
            }],
        }

    def test_grava_leitura_no_store(self):
        resp = self.client.post(
            self.url + "?env=prod", self._payload(self.balanca.id), format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["aceitas"], 1)

        atual = store.obter_leitura(self.balanca.id)
        self.assertEqual(atual["peso_kg"], "12.485")
        self.assertTrue(atual["estavel"])

    def test_recusa_balanca_de_outra_estacao(self):
        resp = self.client.post(
            self.url + "?env=prod", self._payload(self.alheia.id), format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIsNone(store.obter_leitura(self.alheia.id))

    def test_peso_como_numero_json_e_rejeitado(self):
        """Peso precisa vir como string para não passar por float."""
        payload = self._payload(self.balanca.id)
        payload["leituras"][0]["peso_kg"] = 12.485
        resp = self.client.post(self.url + "?env=prod", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_atualiza_status_conexao_e_versao_do_agente(self):
        self.client.post(self.url + "?env=prod", self._payload(self.balanca.id), format="json")

        self.balanca.refresh_from_db()
        self.agente.refresh_from_db()
        self.assertEqual(self.balanca.status_conexao, Balanca.STATUS_ONLINE)
        self.assertIsNotNone(self.balanca.ultima_leitura_em)
        self.assertEqual(self.agente.versao_agente, "1.0.0")

    def test_nao_regrava_status_quando_nao_houve_transicao(self):
        self.client.post(self.url + "?env=prod", self._payload(self.balanca.id), format="json")
        self.balanca.refresh_from_db()
        primeiro = self.balanca.ultima_leitura_em

        self.client.post(self.url + "?env=prod", self._payload(self.balanca.id), format="json")
        self.balanca.refresh_from_db()
        # Mesmo status e dentro do intervalo de 60s: nada foi reescrito.
        self.assertEqual(self.balanca.ultima_leitura_em, primeiro)

    def test_status_erro_leitura_nao_grava_peso(self):
        resp = self.client.post(
            self.url + "?env=prod",
            self._payload(self.balanca.id, status="erro_leitura"),
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.balanca.refresh_from_db()
        self.assertEqual(self.balanca.status_conexao, Balanca.STATUS_ERRO_LEITURA)
        self.assertIsNone(store.obter_leitura(self.balanca.id))

    def test_lote_com_varias_leituras(self):
        b2 = Balanca.objects.create(
            nome="Ohaus", identificador="BAL-701018", agente=self.agente,
            protocolo=Balanca.PROTOCOLO_OHAUS_ADVENTURER, casas_decimais=5,
        )
        payload = self._payload(self.balanca.id)
        payload["leituras"].append({
            "balanca_id": b2.id, "peso_kg": "0.12345", "estavel": True,
            "lido_em": timezone.now().isoformat(), "status": "online",
        })

        resp = self.client.post(self.url + "?env=prod", payload, format="json")
        self.assertEqual(resp.data["aceitas"], 2)
        self.assertEqual(store.obter_leitura(b2.id)["peso_kg"], "0.12345")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_api_agente.AgenteLeiturasTests -v 2`
Expected: FAIL com `NoReverseMatch: Reverse for 'agente-leituras' not found`

- [ ] **Step 3: Write minimal implementation**

Acrescente a `backend/registro/api/agente.py`:

```python
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from registro.services import leituras as store


class LeituraEntradaSerializer(serializers.Serializer):
    balanca_id = serializers.IntegerField()
    # CharField, não DecimalField: recusa número JSON e obriga string,
    # impedindo que o peso passe por float em qualquer ponto.
    peso_kg = serializers.CharField(required=False, allow_null=True)
    estavel = serializers.BooleanField(default=False)
    lido_em = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=Balanca.STATUS_CHOICES)

    def validate_peso_kg(self, valor):
        if valor is None:
            return None
        try:
            Decimal(valor)
        except (InvalidOperation, TypeError):
            raise serializers.ValidationError("peso_kg deve ser um decimal em string.")
        return valor

    def validate(self, attrs):
        if attrs["status"] == Balanca.STATUS_ONLINE and not attrs.get("peso_kg"):
            raise serializers.ValidationError(
                "peso_kg é obrigatório quando status é online."
            )
        return attrs


class LoteLeiturasSerializer(serializers.Serializer):
    versao_agente = serializers.CharField(required=False, allow_blank=True, default="")
    leituras = LeituraEntradaSerializer(many=True, allow_empty=True)


class AgenteLeiturasView(views.APIView):
    authentication_classes = [AgenteAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "agente"

    def post(self, request):
        agente = request.auth
        lote = LoteLeiturasSerializer(data=request.data)
        lote.is_valid(raise_exception=True)
        dados = lote.validated_data

        # Escopo: um agente só reporta pelas balanças da própria estação.
        permitidas = {b.id: b for b in agente.balancas.all()}
        entradas = dados["leituras"]

        alheias = [e["balanca_id"] for e in entradas if e["balanca_id"] not in permitidas]
        if alheias:
            raise serializers.ValidationError({
                "leituras": f"Balanças fora do escopo deste agente: {sorted(alheias)}"
            })

        for entrada in entradas:
            balanca = permitidas[entrada["balanca_id"]]

            if entrada["status"] == Balanca.STATUS_ONLINE:
                store.registrar_leitura(
                    balanca.id,
                    Decimal(entrada["peso_kg"]),
                    entrada["estavel"],
                    entrada["lido_em"],
                )

            self._persistir_status(balanca, entrada["status"])

        if dados["versao_agente"] and dados["versao_agente"] != agente.versao_agente:
            agente.versao_agente = dados["versao_agente"]
            agente.save(update_fields=["versao_agente"])

        agente.ultimo_contato_em = timezone.now()
        agente.save(update_fields=["ultimo_contato_em"])

        return Response({"aceitas": len(entradas), "poll_intervalo_ms": POLL_INTERVALO_MS})

    @staticmethod
    def _persistir_status(balanca, status_novo):
        """Grava em Postgres apenas em transição de status, ou quando
        `ultima_leitura_em` passou do intervalo mínimo.

        Sem isso seriam ~86 mil UPDATEs por balança por dia num campo que
        ninguém lê em tempo real.
        """
        campos = []

        if balanca.status_conexao != status_novo:
            balanca.status_conexao = status_novo
            campos.append("status_conexao")

        if status_novo == Balanca.STATUS_ONLINE and store.deve_gravar_ultima_leitura(balanca):
            balanca.ultima_leitura_em = timezone.now()
            campos.append("ultima_leitura_em")

        if campos:
            balanca.save(update_fields=campos)
```

Em `backend/registro/urls.py`:

```python
from .api.agente import AgenteConfiguracaoView, AgenteLeiturasView
```
```python
    path("agente/leituras/", AgenteLeiturasView.as_view(), name="agente-leituras"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_api_agente -v 2`
Expected: 13 testes PASS (6 de configuração + 7 de leituras)

- [ ] **Step 5: Commit**

```bash
git add backend/registro/api/agente.py backend/registro/urls.py \
        backend/registro/tests/test_api_agente.py
git commit -m "feat(balancas): endpoint de ingestao de leituras do agente"
```

---

## Task 8: `GET /balancas/{id}/leitura-atual/`

**Files:**
- Create: `backend/registro/api/leitura.py`
- Modify: `backend/registro/urls.py`
- Create: `backend/registro/tests/test_api_leitura_atual.py`

**Interfaces:**
- Consumes: `leituras.obter_leitura` (Task 4)
- Produces: `LeituraAtualView`, rota `balancas/<int:pk>/leitura-atual/` (name `balanca-leitura-atual`). Resposta: `{"status": str, "peso_kg": str|None, "estavel": bool, "idade_ms": int|None}`

Arquivo separado de `agente.py` de propósito: esta view é autenticada por **JWT de operador**, não por token de agente. Misturar os dois regimes de autenticação no mesmo módulo convida a erro de configuração.

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_api_leitura_atual.py
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from registro.models import Balanca
from registro.services import leituras as store

User = get_user_model()
D = Decimal

CACHE_LOCMEM = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-leitura-atual",
    }
}


@override_settings(CACHES=CACHE_LOCMEM)
class LeituraAtualTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.operador = User.objects.create_user(username="operador", password="x")
        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", casas_decimais=2
        )
        self.url = reverse("balanca-leitura-atual", args=[self.balanca.id])

    def test_exige_autenticacao(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_sem_leitura_no_store_responde_offline(self):
        self.client.force_authenticate(self.operador)
        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "offline")
        self.assertIsNone(resp.data["peso_kg"])

    def test_com_leitura_responde_peso_como_string_e_idade(self):
        store.registrar_leitura(
            self.balanca.id, D("12.485"), True, timezone.now() - timedelta(milliseconds=340)
        )
        self.client.force_authenticate(self.operador)
        resp = self.client.get(self.url)

        self.assertEqual(resp.data["status"], "online")
        self.assertEqual(resp.data["peso_kg"], "12.485")
        self.assertIsInstance(resp.data["peso_kg"], str)
        self.assertTrue(resp.data["estavel"])
        self.assertGreaterEqual(resp.data["idade_ms"], 300)

    def test_balanca_inexistente_responde_404(self):
        self.client.force_authenticate(self.operador)
        resp = self.client.get(reverse("balanca-leitura-atual", args=[99999]))
        self.assertEqual(resp.status_code, 404)

    def test_status_de_erro_da_balanca_e_refletido_sem_leitura(self):
        self.balanca.status_conexao = Balanca.STATUS_ERRO_LEITURA
        self.balanca.save(update_fields=["status_conexao"])
        self.client.force_authenticate(self.operador)
        resp = self.client.get(self.url)

        self.assertEqual(resp.data["status"], "erro_leitura")
        self.assertIsNone(resp.data["peso_kg"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_api_leitura_atual -v 2`
Expected: FAIL com `NoReverseMatch: Reverse for 'balanca-leitura-atual' not found`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/registro/api/leitura.py
"""
Leitura atual de uma balança, consumida pelo frontend por polling.

Autenticada por JWT de operador (ao contrário de api/agente.py, que usa token
de agente). Lê só do cache: nenhuma query em Postgres no caminho quente, a não
ser a checagem de existência da balança.
"""
from datetime import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, views
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from registro.models import Balanca
from registro.services import leituras as store


class LeituraAtualView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "leitura"

    def get(self, request, pk):
        balanca = get_object_or_404(Balanca, pk=pk)
        atual = store.obter_leitura(balanca.id)

        if atual is None:
            # Chave expirada = agente calado. Se a balança tem um status de erro
            # persistido, ele é mais informativo que um "offline" genérico.
            status = (
                balanca.status_conexao
                if balanca.status_conexao == Balanca.STATUS_ERRO_LEITURA
                else Balanca.STATUS_OFFLINE
            )
            return Response({
                "status": status, "peso_kg": None, "estavel": False, "idade_ms": None,
            })

        lido_em = datetime.fromisoformat(atual["lido_em"])
        idade_ms = int((timezone.now() - lido_em).total_seconds() * 1000)

        return Response({
            "status": Balanca.STATUS_ONLINE,
            "peso_kg": atual["peso_kg"],
            "estavel": atual["estavel"],
            "idade_ms": max(0, idade_ms),
        })
```

Em `backend/registro/urls.py`:

```python
from .api.leitura import LeituraAtualView
```
```python
    path(
        "balancas/<int:pk>/leitura-atual/",
        LeituraAtualView.as_view(),
        name="balanca-leitura-atual",
    ),
```

> A rota precisa ficar **antes** de `path('', include(router.urls))` em `urlpatterns`, ou o `DefaultRouter` do `BalancaViewSet` captura a URL primeiro.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_api_leitura_atual -v 2`
Expected: 5 testes PASS

- [ ] **Step 5: Commit**

```bash
git add backend/registro/api/leitura.py backend/registro/urls.py \
        backend/registro/tests/test_api_leitura_atual.py
git commit -m "feat(balancas): endpoint de leitura atual para o frontend"
```

---

## Task 9: `origem_peso` no `PesagemSerializer` e exposição no admin

**Files:**
- Modify: `backend/registro/serializers.py:195-263` (`PesagemSerializer`)
- Modify: `backend/registro/admin.py`
- Create: `backend/registro/tests/test_serializer_origem_peso.py`

**Interfaces:**
- Consumes: `leituras.classificar_origem` (Task 4), `Pesagem.ORIGEM_*` (Task 3)
- Produces: `PesagemSerializer` passa a expor `origem_peso` como somente-leitura e a classificá-lo em `create()`

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_serializer_origem_peso.py
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from registro.models import Balanca, Pesagem
from registro.serializers import PesagemSerializer
from registro.services import leituras as store
from registro.tests.test_models import BaseSetupMixin

D = Decimal

CACHE_LOCMEM = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-origem-peso",
    }
}


@override_settings(CACHES=CACHE_LOCMEM)
class OrigemPesoTests(BaseSetupMixin, TestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", casas_decimais=2,
            calibracao_realizada=True, ultima_calibracao=timezone.localdate(),
        )

    def _dados(self, tara="0.50", liquido="0.10"):
        return {
            "op_id": self.op.id,
            "item_op_id": self.item_op1.id,
            "balanca_id": self.balanca.id,
            "tara": D(tara),
            "liquido": D(liquido),
        }

    def _criar(self, **kwargs):
        ser = PesagemSerializer(data=self._dados(**kwargs))
        ser.is_valid(raise_exception=True)
        return ser.save(pesador="operador-teste")

    def test_sem_leitura_no_store_a_origem_e_manual(self):
        pesagem = self._criar()
        self.assertEqual(pesagem.origem_peso, Pesagem.ORIGEM_MANUAL)

    def test_tara_e_liquido_capturados_resultam_em_automatica(self):
        agora = timezone.now()
        store.registrar_leitura(self.balanca.id, D("0.499996"), True, agora)
        store.registrar_leitura(self.balanca.id, D("0.100004"), True, agora)

        pesagem = self._criar(tara="0.50", liquido="0.10")
        self.assertEqual(pesagem.origem_peso, Pesagem.ORIGEM_AUTOMATICA)

    def test_valor_editado_apos_captura_resulta_em_ajustada(self):
        store.registrar_leitura(self.balanca.id, D("0.499996"), True, timezone.now())

        pesagem = self._criar(tara="0.50", liquido="0.10")
        self.assertEqual(pesagem.origem_peso, Pesagem.ORIGEM_AUTOMATICA_AJUSTADA)

    def test_pesagem_sem_balanca_e_manual_sem_estourar(self):
        ser = PesagemSerializer(data={
            "op_id": self.op.id,
            "item_op_id": self.item_op1.id,
            "tara": D("0.50"),
            "liquido": D("0.10"),
        })
        ser.is_valid(raise_exception=True)
        pesagem = ser.save(pesador="operador-teste")
        self.assertEqual(pesagem.origem_peso, Pesagem.ORIGEM_MANUAL)

    def test_origem_peso_e_somente_leitura_no_payload(self):
        """Cliente não pode declarar a própria procedência."""
        dados = self._dados()
        dados["origem_peso"] = Pesagem.ORIGEM_AUTOMATICA
        ser = PesagemSerializer(data=dados)
        ser.is_valid(raise_exception=True)
        pesagem = ser.save(pesador="operador-teste")
        self.assertEqual(pesagem.origem_peso, Pesagem.ORIGEM_MANUAL)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_serializer_origem_peso -v 2`
Expected: FAIL — `origem_peso` fica `manual` nos casos automáticos, porque nada o classifica ainda.

> Se `BaseSetupMixin` não expuser `self.op` / `self.item_op1` com esses nomes, abra `backend/registro/tests/test_models.py` e use os nomes reais definidos lá. Não invente atributos.

- [ ] **Step 3: Write minimal implementation**

Em `backend/registro/serializers.py`, no `PesagemSerializer`:

Adicione `"origem_peso"` à lista `fields` (após `"lote_mp"`, `:240`) e também a `read_only_fields` (`:247-252`):

```python
            "lote_mp",
            "origem_peso",
```
```python
        read_only_fields = [
            "id", "data_hora",
            "bruto",            # calculado no model.save()
            "pesador",          # sempre backend
            "origem_peso",      # classificado no create(), nunca declarado pelo cliente
            "op", "item_op", "balanca"
        ]
```

Adicione o import no topo do arquivo:

```python
from registro.services import leituras as store
```

E o `create()` na classe (após `validate()`):

```python
    def create(self, validated_data):
        """Classifica a procedência do peso antes de gravar.

        A classificação NUNCA bloqueia: a ERU exige que os campos de peso
        permaneçam editáveis, então isto é evidência de auditoria, não trava.
        """
        balanca = validated_data.get("balanca")
        if balanca is not None:
            validated_data["origem_peso"] = store.classificar_origem(
                balanca.id,
                balanca.casas_decimais,
                validated_data["tara"],
                validated_data["liquido"],
            )
        else:
            validated_data["origem_peso"] = Pesagem.ORIGEM_MANUAL

        return super().create(validated_data)
```

Confirme que `Pesagem` está importado em `serializers.py` (já está, usado no `Meta` do serializer).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_serializer_origem_peso -v 2`
Expected: 5 testes PASS

- [ ] **Step 5: Expor `origem_peso` e os campos de conexão no admin**

Em `backend/registro/admin.py`, localize o `ModelAdmin` de `Pesagem` e acrescente `origem_peso` a `list_display` e a `readonly_fields`. No `ModelAdmin` de `Balanca`, acrescente `status_conexao` e `ultima_leitura_em` a `list_display` e a `readonly_fields` (são alimentados pelo agente, não editáveis à mão), e registre `AgenteEstacao`:

```python
from registro.agente_models import AgenteEstacao


@admin.register(AgenteEstacao)
class AgenteEstacaoAdmin(admin.ModelAdmin):
    list_display = ("nome", "ativo", "versao_agente", "ultimo_contato_em")
    readonly_fields = ("token_hash", "ultimo_contato_em", "versao_agente", "criado_em")
```

> O token só pode ser gerado por código (`agente.gerar_token()`), nunca digitado no admin — `token_hash` é readonly de propósito. A geração pelo admin ou por comando de gerenciamento fica para o Plano 2, que é quem precisa do token.

- [ ] **Step 6: Run the full suite**

Run: `cd backend && python manage.py test -v 1`
Expected: toda a suíte PASS. `PesagemSerializer` ganhou um `create()` — confirme que nenhum teste existente de criação de pesagem regrediu.

- [ ] **Step 7: Commit**

```bash
git add backend/registro/serializers.py backend/registro/admin.py \
        backend/registro/tests/test_serializer_origem_peso.py
git commit -m "feat(pesagem): classifica origem_peso na criacao e expoe no admin"
```

---

## Verificação final do Plano 1

- [ ] **Suíte completa verde**

Run: `cd backend && python manage.py test -v 1`

- [ ] **Migrations consistentes e sem pendências**

Run: `cd backend && python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`

- [ ] **Smoke manual do contrato completo**

Com o compose de pé, crie um agente e uma balança vinculada via shell, e exercite os três endpoints:

```bash
docker compose exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
from registro.agente_models import AgenteEstacao
from registro.models import Balanca
U = get_user_model()
u, _ = U.objects.get_or_create(username='svc-agente-smoke')
a, _ = AgenteEstacao.objects.get_or_create(nome='EST-SMOKE', usuario=u)
a, token = a.gerar_token()
b, _ = Balanca.objects.get_or_create(
    identificador='BAL-SMOKE',
    defaults=dict(nome='Smoke', protocolo='toledo_2090', porta_serial='COM3', casas_decimais=2),
)
b.agente = a; b.save()
print('TOKEN=', token); print('BALANCA_ID=', b.id)
"
```

Então, com os valores impressos:

```bash
curl -s -H "Authorization: Agente $TOKEN" \
  "http://localhost/api/registro/agente/configuracao/?env=prod"

curl -s -X POST -H "Authorization: Agente $TOKEN" -H "Content-Type: application/json" \
  -d "{\"versao_agente\":\"1.0.0\",\"leituras\":[{\"balanca_id\":$BALANCA_ID,\"peso_kg\":\"12.485\",\"estavel\":true,\"lido_em\":\"$(date -Iseconds)\",\"status\":\"online\"}]}" \
  "http://localhost/api/registro/agente/leituras/?env=prod"
```

Expected: a configuração lista `BAL-SMOKE` com `capacidade_maxima` e `divisao` como **strings**; o POST devolve `{"aceitas":1,...}`; e um `GET .../leitura-atual/` autenticado como operador devolve `peso_kg: "12.485"` com `idade_ms` pequeno. Após 15 s sem novo POST, o mesmo GET passa a `status: "offline"`.

- [ ] **Limpar o agente de smoke**

```bash
docker compose exec backend python manage.py shell -c "
from registro.agente_models import AgenteEstacao
from registro.models import Balanca
Balanca.objects.filter(identificador='BAL-SMOKE').delete()
AgenteEstacao.objects.filter(nome='EST-SMOKE').delete()
print('limpo')
"
```

**Ao fim deste plano o backend está completo e implantável.** Não há dependência de hardware, do agente ou do frontend: o contrato da API está fechado e testado, o que desbloqueia os Planos 2 e 3 para rodarem em paralelo.
