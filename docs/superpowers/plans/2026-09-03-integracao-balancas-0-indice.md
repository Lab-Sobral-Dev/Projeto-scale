# Integração das Balanças — Índice dos Planos

**Spec:** `docs/superpowers/specs/2026-09-03-integracao-balancas-design.md`

A spec foi decomposta em três planos porque cada um produz software funcionando e testável por si só. Não é redução de escopo: é o mesmo desenho, dividido pelo eixo em que a própria spec se fasea.

| Plano | Arquivo | Tasks | Precisa de hardware? | Depende de |
|---|---|---|---|---|
| **1 — Backend** | `2026-09-03-integracao-balancas-1-backend.md` | 9 | não | — |
| **2 — Agente local** | `2026-09-03-integracao-balancas-2-agente.md` | 10 | Task 2 e verificação final | Plano 1 (só da Task 8 em diante) |
| **3 — Frontend** | `2026-09-03-integracao-balancas-3-frontend.md` | 7 | não | Plano 1 |

## Ordem de execução recomendada

```
Plano 2, Task 2  ──►  fixtures reais (Fase 0)  ──►  Plano 2, Tasks 3-7
   (acesso físico)                                       │
                                                         ▼
Plano 1 (completo, sem hardware)  ────────►  Plano 2, Tasks 8-10
   │                                                     │
   ▼                                                     ▼
Plano 3 (completo, sem hardware)  ────────►  Piloto BAL-701012 (Fase 3)
                                                         │
                                                         ▼
                                              BAL-701018 Ohaus (Fase 4)
                                                         │
                                                         ▼
                                       BAL-701016 e BAL-101005 (Fase 5)
```

**Comece pela Task 2 do Plano 2** (o sniffer). Ela exige apenas acesso físico às balanças, não código pronto, e os fixtures que ela produz destravam as Tasks 5 e 6 do mesmo plano. Enquanto isso, o Plano 1 roda em paralelo sem depender de nada.

**Planos 1 e 3 são inteiramente testáveis sem hardware.** O Plano 3 traz um comando de injeção de leitura no Redis (Task 4, Step 5) que permite exercitar a tela de ponta a ponta com uma balança fictícia.

## Bloqueadores que estes planos corrigem

Descobertos ao ler o código, nenhum deles estava no rascunho técnico original:

1. **`"user": "2000/day"`** em `backend/conf/settings.py:151` inviabiliza tanto o POST do agente (~86 mil req/dia) quanto o polling do frontend (~33 min de tela). → Plano 1, Task 6, Step 4.
2. **`EnvSwitchMiddleware` cai em `"default"` silenciosamente** para qualquer header que não seja `Bearer` — o agente de produção escreveria no banco errado. → Plano 1, Task 5.
3. **`CACHES` não existe** e Redis é obrigatório (não preferência): com múltiplos workers gunicorn, `LocMemCache` seria por processo e o worker do `GET` não veria o que o worker do `POST` gravou. → Plano 1, Task 4.
4. **`uiToApi` apaga `porta_serial` quando `tipo_conexao === 'ethernet'`**, que é o *default* do model — a porta configurada seria perdida a cada salvamento do cadastro. → Plano 3, Task 5, Step 7.
5. **Comparação de `origem_peso` por igualdade exata nunca casaria** (janela guarda precisão cheia, frontend arredonda na captura), tornando o campo inútil. → Plano 1, Task 4, `classificar_origem` com `quantize`.

## Fora do escopo destes planos

A seção 10 da spec lista o impacto em documentos de qualidade que vivem **fora deste repositório** — DQ 4413/4412 (arquitetura), DQ 4415 (telas), POP 4412 (usabilidade), MANUAL_SCALE (seções 8 e 11.1) e ERU Anexo 7. Não há task para eles porque não são código; entram como entrega de documentação depois do piloto estabilizado (Fase 3 da spec).

Duas limitações a registrar nesses documentos quando forem atualizados:

- O relatório de Balanças lista **apenas balanças que têm pesagens** (agrega a partir de `Pesagem`). Uma balança online mas nunca utilizada não aparece — para monitorar o parque inteiro, a tela correta é o cadastro de Balanças.
- A leitura do agente **não é registro de verdade**: o dado que não pode ser perdido é a Pesagem, gravada pelo navegador por caminho independente. É essa distinção que torna a conformidade com a ERU defensável.
