# Impactos de registrar a pesagem diretamente em gramas

**Data:** 2026-11-10
**Base:** código da branch `producao`, commit `faab752`
**Status:** análise — nenhuma alteração de código feita

---

## 1. Resumo executivo

Hoje o sistema já é **todo em gramas internamente**. O quilograma sobrevive em
três lugares apenas: no campo que o operador digita, nos campos `Pesagem.bruto`
e `Pesagem.tara` do banco, e na semântica de `Balanca.casas_decimais`. Tudo o
mais — estrutura, OP, saldo, tolerância, relatórios, etiqueta, histórico — já
trabalha e exibe em g.

A mudança, portanto, **não é uma troca de unidade do sistema; é a remoção do
último trecho de conversão**. Isso a torna menor do que parece em superfície de
código e maior do que parece em risco de dado histórico: `bruto` e `tara` têm
anos de registros gravados em kg que passam a conviver com registros em g na
mesma coluna, dentro de um sistema farmacêutico com trilha de auditoria.

**Três conclusões que mudam o planejamento:**

1. **Mover a entrada para gramas sozinho não resolve o caso B12.** Dos cinco
   bloqueios medidos em 2026-09-16, a entrada em g resolve três. Restam
   `ItemOP.quantidade_pesada` com 3 casas decimais e o teto de precisão de
   `Balanca.casas_decimais`, que em gramas equivale hoje a 3 casas (1 mg) — e
   0,01548 g precisa de 5. Sem redefinir esse campo, a mudança entrega metade
   do objetivo.
2. **A migração de dados tem uma armadilha no roteador de banco.** O padrão
   usado na migration `0003_units_to_grams` escreve sempre no banco `default`,
   independentemente do `--database` passado. Repetir aquele padrão converteria
   a produção duas vezes e o hml nenhuma.
3. **Restaurar um backup anterior ao corte reintroduz kg em `bruto`/`tara`**
   sem nenhum aviso, e o restore é uma função exposta na aplicação.

---

## 2. Mapa de unidades hoje

| Onde | Campo | Unidade atual | Tipo |
|---|---|---|---|
| Estrutura (BOM) | `ItemEstrutura.quantidade_por_lote` | **g** | `numeric(14,6)` |
| OP | `ItemOP.quantidade_necessaria` | **g** | `numeric(14,6)` |
| OP | `ItemOP.quantidade_pesada` | **g** | `numeric(14,3)` |
| Pesagem | `Pesagem.liquido` | **g** (gravado) / **kg** (recebido na API) | `numeric(14,6)` |
| Pesagem | `Pesagem.bruto` | **kg** | `numeric(14,6)` |
| Pesagem | `Pesagem.tara` | **kg** | `numeric(14,6)` |
| Balança | `Balanca.casas_decimais` | nº de casas **em kg** | `smallint 0..6` |
| Balança | `Balanca.capacidade_maxima`, `divisao` | **kg** | metadado, sem uso em regra |
| Tela Nova Pesagem | inputs Tara / Líquido | **kg** | — |
| Relatórios, etiqueta, histórico, dashboard | exibição | **g** | — |

O ponto mais frágil da situação atual é a **assimetria do campo `liquido`**: a
API recebe kg e devolve g no mesmo nome de campo (`backend/registro/serializers.py:189`,
conversão em `backend/registro/models.py:381`). Cada consumidor precisa saber de
que lado da transação está. Já custou um bug (seção 7.1).

---

## 3. O que muda e o que não muda

**Muda**

- Os inputs de Tara e Líquido passam a ser em g.
- `Pesagem.bruto` e `Pesagem.tara` passam a ser armazenados em g.
- A constante `KG_TO_G` e todas as multiplicações/divisões por 1000 somem.
- A semântica de `Balanca.casas_decimais` (decisão da seção 6.1).

**Não muda**

- Estrutura, OP, saldos, tolerância de ±5%, conclusão da OP: já em g.
- Formato de exibição dos relatórios e da etiqueta: já em g, pt-BR.
- `Pesagem.liquido` no banco: **já está em g — não pode ser convertido.**
- `capacidade_maxima` e `divisao`: recomenda-se manter em kg (seção 6.3).

---

## 4. Inventário de impacto

### 4.1 Banco de dados e migrations

| Item | Ação |
|---|---|
| `Pesagem.bruto`, `Pesagem.tara` | `RunPython`: `valor * 1000`. O schema `numeric(14,6)` continua servindo (100 kg = 100.000,000000 g, 12 dos 14 dígitos). Só muda o `help_text`. |
| `Pesagem.liquido` | **nada.** Já está em g. Converter aqui multiplica o erro por 1000. |
| `ItemOP.quantidade_pesada` | `numeric(14,3)` → `numeric(14,6)`. Sem isso o saldo trunca micro-ingredientes em 1 mg (bloqueio nº 5 do incidente B12). |
| `Balanca.casas_decimais` | conforme a decisão 6.1: se virar "casas em g", `RunPython` com `max(casas - 3, 0)`. |
| Reversibilidade | a migration precisa de `backwards` funcional — requisito prático de rollback em sistema validado. |
| Dois bancos | `EnvRouter.allow_migrate` devolve `True` sempre; `scale` e `scale_hml` recebem o schema. **Todo `RunPython` precisa de `.using(schema_editor.connection.alias)`** (ver 5.2). |

### 4.2 Backend

| Arquivo | Linhas | O que fazer |
|---|---|---|
| `backend/registro/models.py` | 12 | remover `KG_TO_G` |
| | 120–126 | `capacidade_maxima` e `casas_decimais`: revisar comentário e `help_text` |
| | 240 | `quantidade_pesada` → `decimal_places=6` |
| | 274–311 | docstring da `Pesagem` e `help_text` de `bruto`/`tara`/`liquido` |
| | 341–349 | `clean()`: mensagem "tara (kg) ≥ 0 e líquido (kg) > 0" |
| | 377–386 | remover a conversão; `bruto = tara_g + liquido_g` |
| | 405–423 | trava de duplicidade: variável `tara_kg` e a mensagem com "kg" |
| | 437–447 | mensagens de tolerância (já em g, apenas conferir) |
| `backend/registro/views.py` | 729–734 | etiqueta PDF: remover `* KG_TO_G` de `bruto_g` e `tara_g` |
| `backend/reports/serializers.py` | 29–34 | `origem="kg"` → `origem="g"` em `get_bruto` e `get_tara` |
| `backend/reports/views/pesagens.py` | 68–78 | idem, nas linhas do CSV/PDF |
| `backend/reports/services/formatters.py` | 19–33 | `KG_TO_G`, `casas_gramas()` e o parâmetro `origem` perdem o propósito; ver 6.1 |
| `backend/registro/management/commands/import_oficiais.py` | 288–304 | não converte unidade na importação; bug pré-existente (7.3) |

### 4.3 Frontend

| Arquivo | O que fazer |
|---|---|
| `NovaPesagem.jsx` | `KG_IN_G` e `kgToG` (l. 29–32) somem; `liquidoKg`/`taraKg`/`brutoCalculadoKg` (l. 205–216) passam a g; payload (l. 370–372) manda g; `placeholderKg` (l. 89–91); labels "Tara (kg)" / "Peso Líquido (kg)" (l. 736, 748); bruto exibido (l. 771); modal de confirmação (l. 880–882) |
| `PesagemEditar.jsx` | mesmas mudanças + **remover `gToKg` na carga (l. 184–185)**, que hoje compensa a assimetria da API; `liquidoOriginalG` com `Math.round` (l. 289–291) perde precisão de micro e deve sair; labels e validações (l. 350–351, 596–625, 656) |
| `PesagemDetalhe.jsx` | `kgToG` em `brutoG`/`taraG` (l. 35–37, 98–99); `casasGramas` (l. 41) conforme 6.1 |
| `Historico.jsx` | `kgToG` em `normalizePesagem` (l. 43–45, 103–107) |
| `GeracaoEtiqueta.jsx` | **já trata `bruto`/`tara` como gramas (l. 14–20) — a mudança conserta o bug sem tocar no arquivo** (ver 7.1) |
| `CadastroBalanca.jsx` | texto "casas decimais (em kg)" (l. 493) e label "Capacidade Máx. (kg)" (l. 456) |
| `LogsAuditoria.jsx` | `FIELD_LABELS`: `bruto: 'Bruto (kg)'`, `tara: 'Tara (kg)'` (l. 198) — ver 5.3, o rótulo passa a ser ambíguo entre registros antigos e novos |

Não há testes de frontend no projeto; a verificação dessa camada é manual ou E2E.

### 4.4 Testes

| Arquivo | Impacto |
|---|---|
| `backend/registro/tests/test_models.py` | 21 testes; ~6 constroem `Pesagem` com `liquido=valor_g / KG_TO_G` (l. 136, 156, 176–197) |
| `backend/registro/tests/test_api_permissions.py` | 39 testes; payload de pesagem em kg (l. 403) |
| `backend/registro/tests/test_serializers.py` | 11 testes; precisão da estrutura — não muda, mas é a rede de segurança do caso B12 |
| `backend/reports/test_formatters.py` | 10 testes; os casos `origem="kg"` (l. 34–36, 54) e `casas_gramas` (l. 19–29) deixam de existir ou mudam de significado |
| `backend/reports/test_auditoria_pdf.py`, `backend/reports/tests.py` | 22 testes; conferir fixtures com peso |

Recomenda-se **adicionar antes da mudança** um teste que reproduza a pesagem de
15,48 mg de ponta a ponta (RED), que hoje falha e deve passar ao fim — é a
evidência objetiva de que o objetivo foi atingido.

Lembrete de ambiente: a suíte roda com `DB_ENGINE=sqlite` e `AUDIT_ENABLED=false`;
as migrations 0009 e 0016 duplicadas impedem `manage.py test` direto.

### 4.5 Documentação

| Arquivo | Trecho |
|---|---|
| `MANUAL_OPERACAO_E_ESPECIFICACOES.md` | l. 186, 194, 271–272 (entrada em kg) e l. 477 — **já hoje incorreto**, diz que tara/bruto estão em g |
| `README.md` | l. 257, tabela de unidades |
| `docs/superpowers/specs/2026-09-03-integracao-balancas-design.md` | seção 7.3 e o contrato `peso_kg` (ver seção 8) |
| `CLAUDE.md` | nada a mudar |

---

## 5. Riscos

### 5.1 Coluna com duas unidades (crítico)

Depois do corte, `registro_pesagem.bruto` e `.tara` contêm gramas. Qualquer dado
que **não passe pela migration** volta em kg e é indistinguível: a diferença é
um fator 1000 em um número plausível (0,2 lido como 0,2 g em vez de 200 g). Não
há coluna de versão nem carimbo de unidade por linha.

Mitigações possíveis, em ordem de robustez:

- coluna `unidade_massa` por registro (mais caro, elimina a ambiguidade);
- data/hora de corte registrada no dossiê de validação, mais um `CHECK` que
  rejeite novos registros abaixo de um limiar;
- no mínimo, um relatório de conferência pós-migration comparando
  `bruto ≈ tara + liquido` linha a linha — a identidade só fecha se as três
  colunas estiverem na mesma unidade, o que dá um **verificador automático
  exato** da migration.

A terceira mitigação é barata e deve entrar de qualquer forma.

### 5.2 Migração de dados escrevendo no banco errado (crítico)

`EnvRouter.db_for_write` consulta `get_db()`, que é thread-local e **retorna
`"default"` quando nada o definiu** (`backend/registro/db_context.py:19`) — que
é o caso de um comando `migrate`. A migration `0003_units_to_grams` usa o
manager padrão (`ItemEstrutura.objects.all()`), ou seja, escreve em `default`
mesmo quando executada com `--database=hml`.

Consequência de repetir o padrão: rodar as duas migrations converte **duas
vezes a produção** (fator 1.000.000) e **nenhuma vez o hml**. Toda query do
`RunPython` precisa de `.using(schema_editor.connection.alias)`.

### 5.3 Trilha de auditoria (alto — regulatório)

`AuditLog.changes` guarda `{"old": ..., "new": ...}` de `bruto` e `tara` de
todas as edições passadas, em kg (`backend/registro/views.py:541-556`), e o
`destroy` guarda um `model_to_dict` completo. A trilha é evidência imutável:
**não pode ser reescrita pela migration.**

Decorre daí que a tela de Logs passa a exibir, no mesmo rótulo, valores em kg
(antigos) e em g (novos). Caminhos:

- rotular por data do registro, usando a data/hora de corte;
- registrar um `AuditLog` sintético de "mudança de unidade" no momento do
  deploy, com escopo e horário exatos;
- documentar o corte no dossiê e deixar os rótulos como estão.

A escolha é da validação, não técnica. O que a engenharia precisa garantir é
que **o horário do corte seja conhecido e registrado**.

### 5.4 Restore de backup atravessando o corte (alto)

`run_restore` (`backend/registro/services/backup_db.py:223`) faz restore
integral via `psql`. Restaurar um dump anterior ao corte sobre o schema novo
traz `bruto` e `tara` de volta em kg — silenciosamente, e a função está exposta
na aplicação (console de backups), não só na linha de comando.

Mitigação mínima: marcar os `BackupRecord` anteriores ao corte e bloquear (ou
exigir confirmação explícita mais conversão pós-restore) quando o dump for mais
antigo que ele. A retenção mantém dumps por bastante tempo, então a janela de
risco não se fecha sozinha em dias.

### 5.5 Erro de digitação do operador (médio)

Em kg, errar a vírgula para menos resulta em valor baixo demais — reprovado
pelo limite inferior ou visivelmente errado. Em g, o mesmo deslize produz
números maiores, e a trava superior de +5% é a única defesa.

Por outro lado, o incidente B12 foi exatamente o inverso: o operador copiou o
valor em g (que lê na tela, no campo "Necessário") para um campo em kg.
**Unificar as duas unidades elimina a classe inteira de erro de transposição**
— este é o ganho operacional principal e deve constar da justificativa à
validação.

Ponto de atenção na transição: o operador tem memória muscular de digitar
"0,250". Recomenda-se marcar a unidade dentro do próprio input (sufixo "g", não
só no label) e avisar a produção com antecedência.

### 5.6 Dependência do projeto de balanças (médio)

Ver seção 8.

### 5.7 Precisão de ponto flutuante no frontend (baixo)

O frontend deixa de multiplicar por 1000 em JavaScript. Hoje
`Math.round(kg * 1000)` descarta qualquer coisa abaixo de 1 g na validação da
tela (bloqueio nº 4 do incidente B12). Remover isso é ganho líquido; só é
preciso garantir que o valor siga ao backend como **string**, não como `Number`,
para micro-valores.

---

## 6. Decisões a tomar

### 6.1 Semântica de `Balanca.casas_decimais` — decisão principal

Hoje significa "casas decimais em kg", com teto de 6, e o sistema deriva as
casas em gramas por `casas_gramas(casas) = max(casas - 3, 0)` — teto efetivo de
**3 casas em g, ou 1 mg**.

| Opção | Efeito no caso B12 (0,01548 g = 5 casas em g) | Custo |
|---|---|---|
| A. Manter em kg, derivar em g | **não resolve** — teto de 1 mg | baixo |
| **B. Redefinir como casas em g**, migrando `max(casas-3, 0)`, teto 6 (1 µg) | resolve | médio: migration de dados + revisão do cadastro das balanças |
| C. Manter em kg e elevar o teto para 8–9 | resolve, mas mantém a unidade dupla que a mudança quer eliminar | médio |

**Recomendação: B.** É a única que elimina o kg do modelo de dados sem deixar o
teto de precisão pela metade. O campo passa a descrever a leitura do visor na
unidade em que o sistema trabalha. A migração é determinística e os valores
atuais (praticamente todos 3) viram 0 — resolução de 1 g, que é o que as Toledo
2090 de fato entregam.

Consequência: `casas_gramas()` e o parâmetro `origem` de `fmt_massa_g()` deixam
de ter função e devem ser removidos, não mantidos "por garantia".

### 6.2 Existe balança analítica separada?

Continua **sem resposta operacional** desde setembro: não se sabe se a pesagem
de 15,48 mg de B12 acontece na mesma balança que pesa 73 kg de glicerina. Se
for a mesma, nenhuma mudança de software entrega o resultado — uma balança de
100 kg com divisão de 20 g não mede 15 mg. Essa informação precisa vir **antes**
da implementação, porque muda o que se promete à validação.

### 6.3 `capacidade_maxima` e `divisao`

Nenhuma regra de negócio os consome hoje; são metadados de cadastro. Como
reproduzem a ficha técnica do fabricante, que fala em kg, **a recomendação é
mantê-los em kg** e explicitar a unidade no label. Converter traria um segundo
`RunPython` sem benefício.

### 6.4 Estratégia de corte

Por ser um sistema validado com dois ambientes, o caminho natural é: hml
primeiro, período de conferência com os relatórios de identidade da seção 5.1,
e só então produção, em janela sem OP em andamento. OPs abertas no momento do
corte não quebram (os saldos estão em g desde sempre), mas as pesagens de uma
mesma OP ficam com `bruto`/`tara` em unidades diferentes se a migration falhar
no meio — mais um motivo para o verificador automático.

---

## 7. Bugs existentes que a mudança atravessa

### 7.1 Etiqueta na tela mostra bruto e tara 1000x menores

`frontend/src/components/GeracaoEtiqueta.jsx:14-20` lê `p.bruto` e `p.tara` da
API como se já fossem gramas — o comentário no código diz literalmente
"valores do backend já estão em gramas" — mas eles estão em kg. A tela rotula a
seção "Pesos (g)" (l. 276). Uma pesagem com tara de 0,080 kg aparece como "0 g".

O PDF gerado pelo backend está correto
(`backend/registro/views.py:731-732`), então **a etiqueta impressa diverge da
pré-visualização na tela**. Em sistema farmacêutico isso é um achado de
auditoria por si só.

A mudança para gramas **conserta este bug sem alterar o arquivo** — a premissa
errada do componente vira verdadeira. Vale registrar isso explicitamente no
dossiê: o bug existe hoje e tem origem anterior ao corte.

### 7.2 Manual de operação descreve unidades erradas

`MANUAL_OPERACAO_E_ESPECIFICACOES.md:477` afirma que `Pesagem` guarda tara,
líquido e bruto em g. É verdade só para o líquido. Documento de operação
divergente do sistema é não-conformidade documental independente deste projeto.

### 7.3 Importador não converte unidade

`import_oficiais.py` aceita `unidade=kg` na planilha e grava
`quantidade_por_lote` com o número cru (l. 288–304), violando a regra
"estrutura sempre em g". Não é atingido pela mudança, mas é a mesma classe de
problema e este é o momento de fechá-lo.

### 7.4 Pendência aberta no hml

Sete valores de vitaminas no `scale_hml` seguem truncados em 3 casas desde
antes da migration 0025. Convém corrigi-los **antes** de validar o caso B12
ponta a ponta no hml, senão o teste mede o dado errado.

---

## 8. Efeito sobre a integração de balanças

O design aprovado em
`docs/superpowers/specs/2026-09-03-integracao-balancas-design.md` fixa o
contrato do agente em quilogramas:

- o agente normaliza toda leitura para kg (`unidades.py`, seção 7.3);
- o payload é `{"peso_kg": "12.485"}` nos três endpoints (seções 5.2 e 5.3);
- o campo `Balanca.unidade_frame` tem default `kg`;
- o gate de sanidade compara contra `capacidade_maxima` em kg;
- o frontend arredonda a captura usando `casasDecimais` como casas em kg
  (seção 7.3, referência a `NovaPesagem.jsx:223`).

Se a pesagem passar a gramas, **esse contrato precisa ser revisto antes de o
agente ser escrito**, ou ele nasce com uma conversão que o projeto acabou de
remover — e justamente no caminho da Ohaus ARD110, que é a balança que reporta
em gramas e a única com precisão compatível com micro-ingredientes.

A ordem importa: fazer a mudança de unidade **antes** custa a revisão de um
documento. Fazê-la depois custa retrabalho em código de agente, endpoints,
schema do Redis e testes de parser.

`unidade_frame` continua necessário — ele descreve o que a balança fala, não o
que o sistema armazena.

---

## 9. Esforço e sequência sugerida

| Etapa | Conteúdo | Risco |
|---|---|---|
| 0 | Responder 6.2 (existe balança analítica?) e obter parecer da validação | bloqueante |
| 1 | Teste RED ponta a ponta de 15,48 mg | baixo |
| 2 | Migration de schema: `quantidade_pesada` → `(14,6)`; `casas_decimais` conforme 6.1 | baixo |
| 3 | Migration de dados `bruto`/`tara` **com `.using(alias)`** + script de conferência da identidade `bruto = tara + liquido` | **alto** |
| 4 | Backend: modelos, serializers, etiqueta, relatórios | médio |
| 5 | Frontend: 6 componentes | médio |
| 6 | Testes: ~8 casos reescritos, novos casos de micro | baixo |
| 7 | Guarda no restore de backups pré-corte (5.4) | médio |
| 8 | Documentação: manual, README, design de balanças | baixo |
| 9 | Deploy hml → conferência → deploy produção | alto |

As etapas 4 e 5 **não podem ser deployadas separadamente** — frontend em kg
contra backend em g grava 1000x a menos, abaixo da tolerância de qualquer item.
Ou vão juntas na mesma imagem, ou o backend precisa aceitar as duas unidades
temporariamente, o que acrescenta um estado ambíguo que ninguém quer em sistema
validado. Como o deploy da VPS reconstrói a imagem com o código dentro, o
deploy atômico já acontece naturalmente — desde que backend e frontend estejam
no mesmo commit.

---

## 10. Checklist de verificação pós-corte

- [ ] `SELECT count(*) FROM registro_pesagem WHERE abs(bruto - (tara + liquido)) > 0.000001` devolve 0
- [ ] Nenhuma pesagem com `bruto < liquido`
- [ ] Soma de `liquido` por OP inalterada antes e depois (a coluna não foi tocada)
- [ ] `ItemOP.quantidade_pesada` de todas as OPs abertas inalterada
- [ ] Etiqueta PDF e pré-visualização na tela mostram os mesmos três valores
- [ ] Relatório de pesagens (tela, CSV e PDF) bate com a tela de detalhe
- [ ] Pesagem de 15,48 mg registra, grava e aparece sem arredondamento em todas as telas
- [ ] Trilha de auditoria anterior ao corte intacta, byte a byte
- [ ] Data/hora exata do corte registrada no dossiê, nos dois bancos
- [ ] Backups anteriores ao corte marcados ou bloqueados para restore direto

---

## 11. Referências

- `backend/registro/models.py` — modelo de dados e regra de conversão
- `backend/registro/migrations/0003_units_to_grams.py` — precedente de conversão (e do defeito de roteamento)
- `backend/reports/services/formatters.py` — formatação compartilhada tela/export
- `docs/superpowers/specs/2026-09-03-integracao-balancas-design.md` — contrato do agente de balanças
- Incidente B12 de 2026-09-16 — os cinco bloqueios medidos
- Pendência de micro-ingredientes truncados no `scale_hml` (migration 0025)
