# Integração Física das Balanças ao SCALE — Design

**Data:** 2026-09-03
**Status:** design aprovado, pronto para plano de implementação
**Escopo:** 4 balanças (2 famílias de protocolo), Logística de Recebimento + Manutenção
**Antecede:** `RASCUNHO_TECNICO_Integracao_Balancas_SCALE.md` (este documento substitui as decisões arquiteturais do rascunho; o rascunho permanece válido como levantamento de contexto)

---

## 1. Objetivo

Eliminar a digitação manual de Tara e Peso Líquido na tela "Nova Pesagem", substituindo-a por captura sob demanda da leitura da balança, **sem alterar nenhuma regra de negócio já validada** (cálculo de bruto no backend, tolerância ±5%, bloqueio por calibração vencida, trilha de auditoria).

Entrega também o status de conexão por balança, fechando o gap do **MANUAL_SCALE 11.1**, que já promete "status atual de conexão" no relatório de Balanças.

**Fora de escopo:** fluxo de OP/ItemOP, geração de etiqueta, `PesagemEditar.jsx` (exceto a preservação de procedência descrita em 6.4), refatoração do `NovaPesagem.jsx` além da inserção do painel novo.

---

## 2. Parque a integrar

| TAG | Modelo | Faixa | Conexão | Setor | Família de parser |
|---|---|---|---|---|---|
| BAL-701012 | Toledo 2090 (2003/20-2090) | 0,2 – 100 kg | RS-232 / RS-485 | Log. Recebimento | `toledo_2090` |
| BAL-701016 | Toledo 2090 analítica (2003/1-2090) | 0,02 – 10 kg | Serial | Log. Recebimento | `toledo_2090` |
| BAL-701018 | Ohaus Adventurer ARD110 | 0,5 g – 4,1 kg | RS-232 DB9 | Log. Recebimento | `ohaus_adventurer` |
| BAL-101005 | Toledo 2090 (2003/20-2090) | 0,2 – 100 kg | RS-232 / RS-485 | Manutenção (backup) | `toledo_2090` |

**São 4 unidades, mas apenas 2 parsers.** As três Toledo compartilham o mesmo indicador 2090; o que varia (capacidade, divisão, casas decimais) já é dado do cadastro `Balanca` (`backend/registro/models.py:112-118`).

---

## 3. Arquitetura

```
ESTAÇÃO DE PESAGEM (rede da fábrica)          VPS Hostinger (nuvem)
┌────────────────────────────────┐            ┌──────────────────────────────┐
│ Balança ──serial/USB──┐        │            │  Django (WSGI/gunicorn)      │
│ Balança ──serial/USB──┤        │            │                              │
│ Balança ──serial/USB──┤        │            │  ┌────────────────────────┐  │
│                       ▼        │  HTTPS     │  │ Redis: última leitura  │  │
│              ┌─────────────┐   │  outbound  │  │ por balança (TTL 15s)  │  │
│              │ AGENTE      │───┼───POST────►│  └────────────────────────┘  │
│              │ (serviço)   │   │  ~1 Hz     │             │                │
│              └─────────────┘   │            │             ▼                │
│                                │            │  Postgres: status_conexao,   │
│  ┌──────────────────────────┐  │  HTTPS     │  ultima_leitura_em (só em    │
│  │ Navegador (Chrome/Edge)  │──┼───GET─────►│  transição de estado)        │
│  │ NovaPesagem.jsx          │  │  ~1 Hz     │                              │
│  └──────────────────────────┘  │            └──────────────────────────────┘
└────────────────────────────────┘
        O agente e o navegador NUNCA se falam diretamente.
```

### 3.1 Unidades e responsabilidades

| Unidade | Faz | Não faz | Depende de |
|---|---|---|---|
| **Agente** (`agente/`, projeto novo) | Lê serial, decodifica frame, normaliza para kg, decide estabilidade, reporta leitura e status | Não valida regra de negócio, não grava pesagem, não escuta em porta nenhuma | Cadastro de `Balanca` via API |
| **Backend** (Django) | Guarda última leitura (Redis), persiste status, serve leitura ao frontend, classifica `origem_peso` | Não lê serial, não conhece protocolo de fabricante | Redis (já existe no compose) |
| **Frontend** (React) | Mostra peso ao vivo, captura Tara/Líquido por clique, cai para manual | Não conhece agente, porta COM nem protocolo | `GET /api/registro/balancas/{id}/leitura-atual/` |

### 3.2 Decisão: relay pela API, não canal em loopback

O rascunho propunha o agente expondo WebSocket em `127.0.0.1` para o React da mesma máquina. **Rejeitado.** Razões, em ordem de peso:

1. **Auditoria.** No desenho aprovado a leitura chega ao backend por um caminho independente do navegador, o que permite classificar a procedência do valor gravado (`origem_peso`, seção 5.5). Com canal loopback o navegador é a única testemunha do valor — não há como distinguir peso lido de peso digitado.
2. **O loopback não daria vantagem de disponibilidade.** O frontend do SCALE é servido pela VPS: sem internet a página não abre. O argumento mais forte a favor do agente local (funcionar offline) não se aplica a esta topologia.
3. **Risco eliminado.** O SCALE é servido sob HTTPS com HSTS `preload` (`nginx/nginx.conf:56`). Se `ws://127.0.0.1` for bloqueado como mixed content, o fallback seria embarcar certificado TLS com chave privada no instalador de cada estação. A evidência pública é contraditória (a spec de Mixed Content trata loopback como *potentially trustworthy*, mas há bug aberto no Chromium especificamente para WebSocket). O desenho aprovado torna a questão irrelevante.
4. **Superfície de ataque menor.** O agente não abre porta alguma; só precisa de saída HTTPS.
5. **Um mecanismo, dois requisitos.** O mesmo canal entrega o auto-preenchimento e o `status_conexao` do MANUAL_SCALE 11.1.

**Custo aceito:** peso ao vivo por polling (~1 Hz) em vez de tempo real. Mitigado em 5.4 — a estabilidade é decidida no agente, sobre o stream completo, então a cadência grossa afeta a fluidez do display, não a correção da captura.

Se os operadores reclamarem da fluidez, um canal loopback pode ser adicionado depois **apenas para display**, sem alterar nada do que está especificado aqui.

### 3.3 Alternativa documentada e não adotada

Conversor serial→Ethernet (Moxa NPort, USR-TCP232) com serviço central na LAN: custo de hardware por balança, dependência de infra de rede, e o serviço central ainda precisaria entregar a leitura ao navegador — move o problema em vez de resolvê-lo. Permanece como o caminho da seção 7.3 do rascunho para balanças fisicamente distantes de qualquer PC. Não é Fase 1.

### 3.4 Premissas

- **Estações são Windows.** Define o empacotamento (PyInstaller + serviço via NSSM). Se houver Linux embarcado, muda apenas a camada de empacotamento, não o desenho. Confirmação está na Fase 0.
- **Linguagem do agente: Python 3.11+** (`pyserial` + `httpx`). Razão técnica, não preferência: `Decimal` nativo — o mesmo tipo que `Pesagem.bruto/tara/liquido` já usa — e parsers testáveis com o mesmo pytest do backend.
- Nenhuma regra de negócio migra para a estação. Tolerância ±5%, bloqueio por calibração e cálculo do bruto permanecem exatamente onde estão.

---

## 4. Fluxo operacional: dois botões de captura

A balança só sabe informar o que está sobre o prato. Quem decide se aquilo é tara, bruto ou líquido é o fluxo.

1. Operador põe a embalagem vazia no prato → clica **"Capturar Tara"**.
2. Enche com material → clica **"Capturar Líquido"**.
3. Backend calcula o bruto como já faz hoje.

**Independente do botão TARE da balança**, o que dá três vantagens: funciona igual nas duas famílias de protocolo, não depende de o operador lembrar de zerar, e cada valor gravado tem uma leitura correspondente com timestamp — o TARE físico não deixa rastro.

Auto-preenchimento acontece **apenas por clique explícito**. Ver 6.2 para o bug do rascunho que isso corrige.

---

## 5. Backend

### 5.1 Autenticação do agente e o `EnvSwitchMiddleware`

`backend/registro/middleware_env.py:29-33` resolve o banco ativo por `?env=` (prioridade 1) ou pelo claim `env` do JWT `Bearer` (prioridade 2). Um header `Authorization: Agente <token>` cairia no fallback `"default"` **silenciosamente** — o agente de produção poderia escrever no banco errado.

**Solução sem tocar o middleware:** o agente envia `?env=prod` explicitamente, e o registro `AgenteEstacao` vive no banco daquele ambiente. Token adulterado para `?env=hml` não existe naquele banco → 401. Autoconsistente pela prioridade 1 que já existe.

```
AgenteEstacao
  nome                CharField    "EST-RECEB-01"
  token_hash          CharField    sha256; plaintext nunca é armazenado
  usuario             FK(User)     service account
  ativo               BooleanField
  ultimo_contato_em   DateTimeField null
  versao_agente       CharField    reportado pelo agente
```

`usuario` é conta de serviço: `AgenteAuthentication` devolve um `User` real, então `AuditLog` e as permissões existentes continuam funcionando sem alteração.

> **A verificar na implementação:** se os signals de auditoria (`backend/registro/signals.py`) assumem algo além de `request.user` — por exemplo atributos de perfil que uma conta de serviço não teria.

**Escopo por balança via FK, não M2M:** uma balança está fisicamente ligada a exatamente uma estação, então `Balanca.agente = FK(AgenteEstacao, null=True, on_delete=SET_NULL)`. Isso serve duas coisas: impede que um agente comprometido em Manutenção falsifique leituras de Recebimento, **e** é a própria configuração que o agente busca.

### 5.2 Endpoints

Novo módulo `backend/registro/api/agente.py`, seguindo o padrão de `backend/registro/api/backups.py`.

| Endpoint | Auth | Cadência |
|---|---|---|
| `GET /api/registro/agente/configuracao/?env=prod` | Agente | boot + a cada 5 min |
| `POST /api/registro/agente/leituras/?env=prod` | Agente | ~1 Hz, em lote |
| `GET /api/registro/balancas/{id}/leitura-atual/` | JWT do operador | ~1 Hz na tela |

**`GET /agente/configuracao/`** devolve, para cada balança com `agente` apontando para o solicitante:

```jsonc
{ "agente": "EST-RECEB-01",
  "poll_intervalo_ms": 1000,
  "balancas": [
    { "id": 12, "identificador": "BAL-701012", "protocolo": "toledo_2090",
      "porta_serial": "COM3", "baud_rate": 9600, "paridade": "N",
      "modo_saida": "continuo", "unidade_frame": "kg",
      "capacidade_maxima": "100.000", "divisao": "0.020", "casas_decimais": 2 }
  ] }
```

**`POST /agente/leituras/`** — lote, nunca uma requisição por leitura:

```jsonc
{ "versao_agente": "1.0.0",
  "leituras": [
    { "balanca_id": 12, "peso_kg": "12.485", "estavel": true,
      "lido_em": "2026-09-03T14:32:10.120-03:00", "status": "online" }
  ] }
// resposta
{ "aceitas": 1, "poll_intervalo_ms": 1000 }
```

`poll_intervalo_ms` na resposta permite ao backend reduzir a cadência remotamente sem tocar na estação.

**`GET /balancas/{id}/leitura-atual/`** devolve `{"peso_kg": "12.485", "estavel": true, "status": "online", "idade_ms": 340}`, ou `{"status": "offline"}` quando a chave do Redis expirou.

**`peso_kg` trafega como string JSON, nunca como número.** Um `float` no caminho introduziria erro de arredondamento num valor que vai para etiqueta e auditoria. Django parseia com `Decimal`, coerente com `Pesagem.liquido` ser `DecimalField(decimal_places=6)`.

### 5.3 Throttle — bloqueador que precisa ser corrigido

`backend/conf/settings.py:151` define `"user": "2000/day"`. Um agente postando 1×/s faz 86.400 req/dia — bloqueado em ~33 minutos. O frontend em 1 Hz consome 2000 requisições em ~33 minutos de tela aberta. **Sem escopos dedicados, nada disso funciona em produção.**

```python
"DEFAULT_THROTTLE_RATES": {
    "anon": "200/day",
    "user": "2000/day",     # inalterado — segue protegendo o resto da API
    "login": "5/min",
    "agente": "10000/hour",   # novo: POST de leituras
    "leitura": "7200/hour",   # novo: polling do frontend, 2 Hz de folga
}
```

Aplicado via `throttle_scope` apenas nas views novas. O frontend economiza por conta própria (6.1): pausa quando a aba não está visível e quando nenhuma balança está selecionada.

### 5.4 Redis

`CACHES` não está definido no projeto hoje e **não há nenhum uso de `django.core.cache`** — configurar é risco zero de regressão.

```python
CACHES = {"default": {
    "BACKEND": "django.core.cache.backends.redis.RedisCache",  # nativo do Django 4.0+
    "LOCATION": os.environ["REDIS_URL"],                        # sem nova dependência
}}
```

Redis é **obrigatório**, não preferência: com múltiplos workers gunicorn, `LocMemCache` seria por processo — o worker que atende o `GET` do frontend não veria a leitura gravada pelo worker que atendeu o `POST` do agente.

| Chave | Conteúdo | TTL |
|---|---|---|
| `balanca:{id}:leitura` | última leitura | 15 s |
| `balanca:{id}:janela` | ring buffer das ~120 últimas leituras estáveis | 600 s (ver 5.5) |

O TTL **é** o detector de offline: chave ausente = agente calado. Não precisa de job de varredura.

### 5.5 Campos novos

**`Balanca`:**

| Campo | Tipo | Nota |
|---|---|---|
| `status_conexao` | choices: `online`, `offline`, `erro_leitura`, `nao_configurada` | default `nao_configurada` |
| `ultima_leitura_em` | DateTimeField null | |
| `agente` | FK(AgenteEstacao) null | escopo + configuração |
| `baud_rate` | PositiveInteger | default 9600 |
| `paridade` | choices `N`/`E`/`O` | default `N` (8N1) |
| `modo_saida` | choices `continuo`/`sob_comando` | default `continuo` |
| `unidade_frame` | choices `kg`/`g` | default `kg`. Usado só quando o protocolo não rotula a unidade (ver 7.3) |
| `protocolo` | **muda** de CharField livre para choices `toledo_2090`, `ohaus_adventurer`, `''` | requer data migration dos valores existentes |

**Postgres é escrito só em transição de estado.** `status_conexao` grava quando o valor muda; `ultima_leitura_em`, no máximo 1×/60 s. Sem isso seriam ~86 mil UPDATEs por balança por dia num campo que ninguém lê em tempo real.

**`Pesagem.origem_peso`** — choices `automatica`, `manual`, `automatica_ajustada`.

Classificado na criação, comparando `tara` e `liquido` submetidos contra o ring buffer `balanca:{id}:janela`.

**A comparação é feita após quantizar**, e isso não é detalhe: a janela guarda precisão cheia (7.3), mas o frontend arredonda para `casas_decimais` na captura. Igualdade exata entre os dois falharia quase sempre e classificaria toda pesagem como `manual`, tornando o campo inútil. Portanto: um valor submetido "casa" com uma leitura da janela quando `leitura.quantize(casas_decimais) == valor_submetido`.

A classificação vale para o **par** (tara e líquido são capturas em momentos distintos):

| Tara casa? | Líquido casa? | `origem_peso` |
|---|---|---|
| sim | sim | `automatica` |
| sim | não | `automatica_ajustada` |
| não | sim | `automatica_ajustada` |
| não | não, e a janela estava vazia | `manual` |
| não | não, mas havia leituras na janela | `automatica_ajustada` |

TTL da janela: **600 s**. Os 180 s que seriam suficientes para o display não cobrem o intervalo real entre capturar a tara, encher a embalagem e capturar o líquido.

**Nunca bloqueia.** A ERU exige que o campo permaneça editável; isto é evidência, não trava. É o que materializa o argumento de auditoria de 3.2 — sem este campo a leitura chegaria ao backend por caminho independente e ninguém usaria esse fato.

---

## 6. Frontend

### 6.1 Dois arquivos novos

`NovaPesagem.jsx` já tem 903 linhas; adicionar painel + polling ali passaria de 1.000 e violaria o *menos-é-mais* / anti-frankenstein do CLAUDE.md.

- `frontend/src/hooks/useLeituraBalanca.js` — polling, backoff, timeout→manual
- `frontend/src/components/PainelLeituraBalanca.jsx` — display do peso, chip de status, os dois botões

```js
const { peso, estavel, status, idadeMs, modo } = useLeituraBalanca(formData.balanca)
```

O hook pausa quando: nenhuma balança selecionada, `document.hidden` (Page Visibility API), ou offline por N tentativas consecutivas (desacelera para 5 s). Sem resposta em 3 s na primeira tentativa → `modo = 'manual'`.

**O `NovaPesagem.jsx` não é refatorado.** Ganha apenas o `<PainelLeituraBalanca>` entre o Select de Balança (`:698`) e o input de Tara (`:723`), mais a linha de procedência no `previewData` (`:398-408`).

### 6.2 Correção de um bug do rascunho

A seção 5 do rascunho especificava que o campo "é preenchido automaticamente quando `estavel: true` chega do agente". Com leituras estáveis chegando continuamente, isso **sobrescreveria o que o operador estivesse digitando**, tecla por tecla. O fluxo de dois botões (seção 4) elimina o problema pela raiz. Registrar quando o rascunho virar texto de DQ.

### 6.3 Estados da interface

Botões desabilitados enquanto `estavel !== true`, **com o motivo em texto visível** ("aguardando estabilizar"), não apenas cinza. Chip de status com **texto + ícone, nunca cor sozinha** (acessibilidade).

| Estado | Botões | Inputs |
|---|---|---|
| Conectada, estável | habilitados | editáveis |
| Conectada, instável | desabilitados + motivo | editáveis |
| `erro_leitura` (ex.: acima da capacidade) | desabilitados + motivo | editáveis |
| `offline` (agente calado) | ocultos | editáveis |
| Sem agente na estação | painel oculto, modo manual | editáveis |

Os inputs de Tara e Líquido são **sempre editáveis** — exigência da ERU e caminho normal para balança fora do parque configurado.

Marcador discreto ao lado do campo preenchido por captura, **que desaparece se o operador editar** — contraparte visual de `origem_peso`. O modal de confirmação ganha linha de procedência: "Peso capturado automaticamente" / "capturado e ajustado" / "digitado", para que o operador confirme sabendo a origem.

### 6.4 `PesagemEditar.jsx`

Fora de escopo — editar pesagem com leitura ao vivo é semanticamente duvidoso. Uma única regra se aplica: editar uma pesagem `automatica` muda `origem_peso` para `automatica_ajustada`. Sem isso, a edição apagaria a procedência silenciosamente.

### 6.5 Propriedade de segurança

Se qualquer parte falhar — agente morto, Redis fora, internet oscilando, parser errado — a tela se comporta **exatamente como a produção de hoje**: dois inputs manuais. A funcionalidade é puramente aditiva sobre um fluxo já validado. Não existe caminho em que esta entrega degrade o que já funciona, e é isso que torna o piloto de baixo risco.

---

## 7. Agente local

### 7.1 Estrutura

```
agente/                          ← projeto novo, na raiz do repo
  pyproject.toml
  scale_agente/
    config.py            # lê config.json (3 campos)
    api.py               # cliente httpx: configuracao(), enviar_leituras()
    serial_worker.py     # 1 thread por porta
    publicador.py        # agrega o stream e envia ~1 Hz
    estabilidade.py      # decide estável quando o frame não informa
    unidades.py          # normalização para kg em Decimal
    parsers/
      base.py            # Protocol LeitorBalanca + LeituraPeso
      toledo_2090.py
      ohaus_adventurer.py
    sniffer.py           # CLI de captura de bytes crus (Fase 0 + diagnóstico)
    servico.py           # entrypoint do serviço Windows
  tests/fixtures/        # frames REAIS gravados pelo sniffer (golden files)
```

### 7.2 Configuração local mínima

```json
{ "api_base": "https://apiscale.laboratoriosobral.com.br",
  "env": "prod",
  "token": "<gerado no cadastro, exibido uma única vez>" }
```

Três campos, nunca mais tocados. **Tudo o mais vem do cadastro**, inclusive a porta COM: `Balanca.porta_serial` já existe (`models.py:109`), e como a FK `Balanca.agente` garante que cada balança pertence a exatamente uma estação, a porta pode vir do cadastro sem ambiguidade. Trocar a COM da Ohaus passa a ser edição na tela, não visita à máquina do operador com editor de texto.

Porta errada no cadastro → o agente falha ao abrir e reporta `erro_leitura` com a mensagem do sistema. Erro visível, não silencioso.

### 7.3 Normalização de unidades

As quatro balanças não falam a mesma unidade, e isso é risco real, não detalhe:

| Balança | Faixa | Saída esperada do frame | Casas em kg |
|---|---|---|---|
| BAL-701012 / BAL-101005 | 0,2 – 100 kg, div. 0,02 kg | kg, formato fixo, **sem rótulo de unidade** | 2 |
| BAL-701016 | 0,02 – 10 kg | kg, formato fixo | 3 |
| BAL-701018 (ARD110) | 0,5 g – 4,1 kg | **gramas, com rótulo** (`   123.45 g`) | ~5 |

**Regra:** o parser lê a unidade do frame quando o protocolo a informa (Ohaus informa); cai para `unidade_frame` do cadastro quando não informa (Toledo 2090, formato fixo). Conversão de gramas: `Decimal(valor) / Decimal(1000)` — exata, sem arredondamento.

O peso trafega em **precisão cheia**. O arredondamento para `casas_decimais` acontece só na captura, no frontend, usando o `casasDecimais` que `NovaPesagem.jsx:223` já calcula.

Caso que dói se errarmos: a ARD110 reportando `4100.00` sem conversão viraria 4100 kg numa balança de 4,1 kg de capacidade — pego pelo gate 2 abaixo.

### 7.4 Gates no agente

1. Terminador/checksum do protocolo inválido → descarta o frame, não publica.
2. `peso > capacidade_maxima` → publica `erro_leitura`, **não** o valor.
3. Peso negativo → válido transitoriamente; marca instável, nunca publica como estável.
4. Salto implausível entre leituras consecutivas → marca instável (não descarta: pode ser carga real caindo no prato).

### 7.5 Estabilidade

Prioridade é o **flag de estabilidade do próprio protocolo** (as duas famílias têm — confirmar nos manuais). Sem ele, o fallback usa o campo `divisao` que já existe no cadastro: 5 leituras consecutivas dentro de ±1 divisão.

**Por que o polling de 1 Hz não prejudica a captura:** o agente vê o stream completo (~10 Hz) e decide a estabilidade ali. O frontend recebe um `estavel: true` já validado contra ~500 ms de leituras. A cadência grossa degrada a fluidez do display, não a correção da captura — o operador nunca captura um valor que o agente não tenha confirmado estável.

`modo_saida`: a Toledo 2090 tipicamente emite contínuo; a Ohaus normalmente exige comando de envio. No modo `sob_comando` o adaptador declara os bytes do comando e o agente os emite na cadência configurada.

### 7.6 Parsers: interface fechada agora, bytes só com evidência

```python
class LeitorBalanca(Protocol):
    modo_saida: Literal["continuo", "sob_comando"]
    comando_envio: bytes | None
    def parse(self, buffer: bytearray) -> LeituraPeso | None: ...

@dataclass(frozen=True)
class LeituraPeso:
    peso: Decimal          # no valor e unidade do frame
    unidade: Literal["kg", "g"]
    estavel: bool | None   # None = protocolo não informa; usar fallback de 7.5
```

**Este design não especifica o layout de bytes de nenhum dos dois protocolos, deliberadamente.** Há manuais *e* acesso físico: o layout sai do manual e os testes são construídos sobre `tests/fixtures/` com frames **reais** gravados pelo `sniffer.py`.

A Fase 0 de captura tem valor mesmo tendo os manuais porque manual de indicador industrial frequentemente descreve o formato de uma revisão de firmware diferente da que está instalada no equipamento. Parser escrito contra a spec, validado contra o byte real.

### 7.7 Contingência e logs

- Reconexão com backoff 2 s → 5 s → 10 s → 30 s (teto). Perda da porta (USB desplugado) levanta exceção no `pyserial`; o worker publica `offline` e reentra no backoff.
- **Gotcha operacional do Windows:** ao replugar, a COM pode reenumerar com outro número. Usar conversores FTDI com número de COM fixado no Gerenciador de Dispositivos; isso entra no procedimento de instalação.
- Log local rotacionado (`RotatingFileHandler`, 10 MB × 5) com todas as leituras e eventos de reconexão — atende a seção 8 do rascunho.
- Fila local durável **só para transições de status**, não para pesos. Peso de 30 s atrás não tem valor; status importa para o relatório.

**Sobre a exigência da ERU de "não perda de dados"** (a redigir no DQ): o dado que não pode ser perdido é a **pesagem**, e ela nunca depende do agente — o operador digita manualmente e o navegador grava pelo fluxo normal. A leitura do agente é conveniência, não registro de verdade. É essa distinção que torna a conformidade defensável.

### 7.8 Empacotamento

PyInstaller one-file → `scale-agente.exe`, registrado como serviço Windows via NSSM, com auto-restart e start automático no boot. O agente reporta `versao_agente` no POST, permitindo ao relatório mostrar estação com versão atrasada.

---

## 8. Testes

| Camada | O que | Como |
|---|---|---|
| **Parsers** ⭐ | frames reais → `LeituraPeso` | pytest contra `agente/tests/fixtures/` gravados pelo sniffer. **É o teste mais valioso do projeto.** |
| `unidades.py` | kg vs g, precisão | tabela, incluindo `4100.00 g → 4.1 kg` (ARD110) |
| Agente | abrir/perder porta, backoff | `pyserial` `loop://` no unit; `com0com` no integration |
| Backend | 3 endpoints; auth do agente (token inválido e `?env=` trocado → 401); escopo de throttle; status gravando só em transição; `origem_peso` nos 3 casos | pytest, padrão de `backend/registro/tests/` |
| Frontend | hook `useLeituraBalanca`: estável / instável / offline / timeout→manual; input permanece editável | **Vitest + Testing Library** (a adicionar) |

**Vitest entra no projeto.** O frontend não tem runner hoje (não há `vitest` nem `jest` no `package.json`). A configuração é pequena — o Vite já está lá — e o `useLeituraBalanca` tem lógica de verdade: o fallback por timeout é justamente o caminho de contingência exigido pela ERU, e testá-lo à mão em cada release não se sustenta.

Hardware não entra em CI. Validação com equipamento é roteiro manual nas Fases 3-5.

---

## 9. Faseamento

**Ganho da arquitetura escolhida:** o spike de mixed content deixou de existir. Não há canal loopback, não há certificado local, não há porta de escuta. Um risco inteiro saiu do projeto.

| Fase | Entrega | Hardware? |
|---|---|---|
| **0** | Levantamento de campo (SO das estações, nº de estações, conversores USB-serial, numeração de COM) + `sniffer.py` + captura de frames reais das 2 famílias → fixtures | acesso apenas |
| **1** | Backend completo: migrations, 3 endpoints, `AgenteAuthentication`, escopos de throttle, `CACHES`/Redis, `origem_peso` | **não** |
| **2** | Agente + os 2 parsers, verdes contra as fixtures da Fase 0 | não |
| **3** | **Piloto: BAL-701012** (Toledo 2090, Log. Recebimento) end-to-end | sim |
| **4** | **BAL-701018** (Ohaus ARD110) | sim |
| **5** | BAL-701016 e BAL-101005 — parser já validado, é só cadastro | sim |
| **6** | Coluna de status em `frontend/src/pages/reports/Balancas.jsx` (o relatório já existe) → fecha o gap do MANUAL_SCALE 11.1 | não |

Fases 1 e 2 rodam **em paralelo** e sem hardware — dependem só das fixtures da Fase 0.

**Por que a Ohaus é a segunda e não a última:** ela é o caso divergente do parque — gramas em vez de kg, provável modo sob comando em vez de contínuo, rótulo de unidade no frame. Se a interface `LeitorBalanca` estiver mal desenhada, é muito melhor descobrir na balança nº 2 do que na nº 4, com três estações já em produção. As duas Toledo restantes são repetição de um parser já provado, então ficam no fim por serem o trecho sem risco.

---

## 10. Impacto na documentação

- **DQ 4413 / DQ 4412** (arquitetura): incluir o componente "Agente local" no diagrama, com a fronteira rede-local vs. nuvem explicitada, e registrar que o agente não expõe porta de escuta.
- **DQ 4415** (especificação de telas): seções 3.4 (Cadastro de Balanças — campos novos, geração de token de agente) e 4.3 (Nova Pesagem — painel de leitura, dois botões de captura, chip de status).
- **POP 4412** (usabilidade): o passo "Tara / Peso Líquido: Inserção dos valores" passa a descrever a captura por clique, com ajuste manual permitido.
- **MANUAL_SCALE**: seção 8 (Operação de Pesagem) ganha o fluxo de captura; seção 11.1 deixa de ser promessa e passa a descrever funcionalidade real.
- **ERU Anexo 7**: registrar a distinção de 7.7 sobre qual dado é o que não pode ser perdido.

---

## 11. Decisões registradas

| # | Decisão | Alternativa rejeitada |
|---|---|---|
| 1 | Relay pela API Django | WebSocket em `127.0.0.1` (rascunho) — ver 3.2 |
| 2 | Dois botões de captura (Tara e Líquido) | Auto-preenchimento contínuo do Líquido — ver 6.2 |
| 3 | Fase 1 = auto-preenchimento + status + `origem_peso` | MVP só com auto-preenchimento |
| 4 | Agente em Python 3.11+ | Node.js |
| 5 | Configuração vinda do cadastro, `config.json` com 3 campos | Mapa `identificador → COM` local |
| 6 | `Balanca.agente` como FK | M2M agente↔balanças |
| 7 | Vitest entra no frontend | Verificação manual por roteiro |
| 8 | Conversor serial→Ethernet fica fora da Fase 1 | Serviço central na LAN |

---

## 12. Pendências que não bloqueiam o plano

1. **SO das estações** — confirmar na Fase 0. Afeta só empacotamento (7.8).
2. **Topologia física** — quantas estações atendem as 4 balanças. O agente é multi-porta por desenho, então qualquer resultado funciona; afeta só o número de instalações.
3. **Parâmetros seriais reais** (baud, paridade, modo de saída) de cada modelo — saem dos manuais na Fase 0 e vão para o cadastro, não para código.
4. **Layout de bytes dos 2 protocolos** — deliberadamente fora deste design (7.6).
5. **Signals de auditoria com conta de serviço** — verificar em 5.1.
