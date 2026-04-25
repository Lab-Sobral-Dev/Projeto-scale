# TEST_REPORT.md — Projeto Scale

Gerado em: 2026-04-25
Executor: Claude (Engenheiro Sênior de Testes automatizados)

---

## Resumo Executivo

| Métrica | Valor |
|---|---|
| Arquivos de teste analisados | 2 (existentes) |
| Bugs encontrados em testes existentes | 6 (3 em cada arquivo) |
| Testes novos criados | 78 |
| Cobertura adicionada | RBAC/API, permissões unitárias, PerfilUsuario |

---

## 1. Análise dos Testes Existentes

### 1.1 `backend/registro/tests.py`

Total: **16 testes**

| # | ID do Teste | Objetivo | Status (antes da correção) | Causa |
|---|---|---|---|---|
| 1 | `test_gerar_itens_a_partir_da_estrutura_*` | Geração de ItemOPs com unidade g | **PASSA** | — |
| 2 | `test_recriar_itens_sem_forcar_dispara_erro` | ValidationError ao recriar sem forcar | **PASSA** | — |
| 3 | `test_recriar_itens_com_forcar_true_*` | Recriar com forcar=True substitui itens | **PASSA** | — |
| 4 | `test_itemop_props_min_max_com_5_por_cento` | Limites de tolerância +/-5% em ItemOP | **PASSA** | — |
| 5 | `test_clean_rejeita_liquido_kg_*` | clean() rejeita tara negativa e líquido zero | **PASSA** | — |
| 6 | `test_coerencia_itemop_na_mesma_op` | item_op deve pertencer à mesma OP | **PASSA** | — |
| 7 | `test_save_converte_kg_para_g_*` | Conversão kg→g, cálculo de bruto, trim lote | **PASSA** | — |
| 8 | `test_save_bloqueia_ultrapassar_teto` | Bloquear pesagem acima de +5% | **ERRO** | Bug A + Bug B (ver §2) |
| 9 | `test_permite_parciais_e_conclui_*` | Parciais OK; conclui ao atingir mínimo | **ERRO** | Bug A (ver §2) |
| 10 | `test_saldo_por_mp_anota_campos` | saldo_por_mp() retorna campos corretos | **ERRO** | Bug A (ver §2) |
| 11 | `test_lote_mp_obrigatorio_e_normalizado` | lote_mp é obrigatório e normalizado | **PASSA** | — |
| 12 | `test_bloqueia_balanca_fora_da_calibracao` | Balança fora da calibração bloqueia | **PASSA** | — |
| 13 | `test_permite_balanca_dentro_da_calibracao` | Balança na calibração permite pesagem | **PASSA** | — |
| 14 | `test_bloqueia_produto_duplicado_por_nome_*` | Serializer valida nome duplicado (iexact) | **PASSA** | — |
| 15 | `test_bloqueia_produto_duplicado_por_codigo_*` | Serializer valida código duplicado (iexact) | **PASSA** | — |
| 16 | `test_normaliza_nome_e_codigo_ao_criar` | Serializer faz strip em nome e código | **PASSA** | — |

### 1.2 `backend/registro/tests/test_models.py`

Total: **13 testes** — espelho quase idêntico do arquivo acima, com os mesmos 3 bugs.

> **Problema adicional de descoberta:** a coexistência de `registro/tests.py` (módulo) e `registro/tests/` (diretório) pode causar conflito de importação Python. O runner do Django pode descobrir ambos, resultando em duplicação. **Solução recomendada:** mover todos os testes para `registro/tests/` (pacote) e deletar `registro/tests.py`.

---

## 2. Bugs Encontrados e Correções Aplicadas

### Bug A — `lote_mp` obrigatório ausente em `Pesagem.objects.create()`

**Arquivos afetados:**
- `backend/registro/tests.py` — linhas 154, 173, 176, 186, 190, 206, 207
- `backend/registro/tests/test_models.py` — linhas 151, 170, 173, 183, 187, 198, 199

**Causa:** O model `Pesagem.clean()` exige `lote_mp` não vazio. Chamadas a `Pesagem.objects.create()` sem o campo fazem `full_clean()` → `clean()` lançar `ValidationError("Informe o lote da matéria-prima (lote_mp).")`, quebrando os testes antes de chegarem ao ponto de validação desejado.

**Status:** **CORRIGIDO** — adicionado `lote_mp="LOTE-xxx"` em todas as chamadas afetadas.

**Testes afetados (agora passam):**
- `test_save_bloqueia_ultrapassar_teto`
- `test_permite_parciais_e_conclui_quando_todos_atingem_minimo`
- `test_saldo_por_mp_anota_campos`
- Equivalentes em `test_models.py`

---

### Bug B — Assertion com mensagem de erro incorreta

**Arquivos afetados:**
- `backend/registro/tests.py` — linha 168 (original)
- `backend/registro/tests/test_models.py` — linha 163 (original)

**Causa:** O modelo levanta:
```
"Quantidade excede o limite superior de tolerância (+5%) para ..."
```
Mas o teste assertava:
```python
self.assertIn("Ultrapassa o limite superior", str(ctx.exception))  # ERRADO
```
A string "Ultrapassa" não existe na mensagem real.

**Status:** **CORRIGIDO** — assertion alterada para `assertIn("limite superior", ...)`, que é uma substring presente na mensagem real e resiliente a reformulações futuras.

**Linha de código do model que define a mensagem:**
`backend/registro/models.py`, método `Pesagem._save_atomic()`, trecho:
```python
raise ValidationError(
    f"Quantidade excede o limite superior de tolerância (+5%) para {item.materia_prima}. "
    ...
)
```

---

## 3. Novos Testes Criados

### 3.1 `backend/registro/tests/test_api_permissions.py` — 45 testes de integração RBAC

**Execução:** `python manage.py test registro.tests.test_api_permissions`

#### Grupo: Acesso Anônimo (T-001 a T-004)

| ID | Objetivo | Payload de Teste | Status Esperado |
|---|---|---|---|
| T-001 | GET /produtos/ sem auth | — | 401 |
| T-002 | POST /produtos/ sem auth | `{}` | 401 |
| T-003 | GET /pesagens/ sem auth | — | 401 |
| T-004 | GET /auditoria/ sem auth | — | 401 |

#### Grupo: Operador (T-010 a T-018)

| ID | Objetivo | Payload de Teste | Status Esperado |
|---|---|---|---|
| T-010 | Leitura de produtos | GET | 200 |
| T-011 | Criação de produto bloqueada | POST nome/codigo | **403** |
| T-012 | Edição de produto bloqueada | PUT nome/codigo | **403** |
| T-013 | Deleção de produto bloqueada | DELETE + motivo | **403** |
| T-014 | Criação de pesagem permitida | POST op_id/item_op_id/tara/liquido/lote_mp | **201** |
| T-015 | Edição de pesagem bloqueada | PUT + motivo_edicao | **403** |
| T-016 | Deleção de pesagem bloqueada | DELETE + motivo_exclusao | **403** |
| T-017 | Acesso a auditoria bloqueado | GET | **403** |
| T-018 | Leitura de pesagens | GET | 200 |

#### Grupo: Supervisor (T-020 a T-028)

| ID | Objetivo | Payload de Teste | Status Esperado |
|---|---|---|---|
| T-020 | Criação de produto | POST | **201** |
| T-021 | Edição de produto | PUT | **200** |
| T-022 | Delete produto sem motivo | DELETE sem body | **400** |
| T-023 | Delete produto motivo inválido | DELETE motivo inexistente | **400** |
| T-024 | Delete produto motivo válido | DELETE `descontinuacao` | **204** |
| T-025 | Criação de pesagem | POST | **201** |
| T-026 | Deleção de pesagem bloqueada | DELETE + motivo | **403** |
| T-027 | Acesso a auditoria bloqueado | GET | **403** |
| T-028 | Edição de pesagem com motivo válido | PUT + `erro_digitacao` | **200** |

#### Grupo: Admin (T-030 a T-037)

| ID | Objetivo | Payload de Teste | Status Esperado |
|---|---|---|---|
| T-030 | Acesso a auditoria | GET | **200** |
| T-031 | Criação de produto | POST | **201** |
| T-032 | Delete produto sem OP vinculada | DELETE + `descontinuacao` | **204** |
| T-033 | Delete produto com OP vinculada (ProtectedError) | DELETE | **409** |
| T-034 | Delete pesagem sem motivo | DELETE | **400** |
| T-035 | Delete pesagem motivo inválido | DELETE motivo inexistente | **400** |
| T-036 | Delete pesagem motivo válido | DELETE `duplicidade` | **204** |
| T-037 | Delete pesagem reverte `quantidade_pesada` do ItemOP | DELETE | **204** + verificação |

#### Grupo: Motivo de Edição de Pesagem (T-040 a T-043)

| ID | Objetivo | Payload de Teste | Status Esperado |
|---|---|---|---|
| T-040 | PUT sem motivo_edicao | PUT sem campo | **400** |
| T-041 | PUT com motivo inválido | PUT `motivo_inexistente_abc` | **400** |
| T-042 | PUT com motivo válido | PUT `erro_digitacao` | **200** |
| T-043 | PATCH sem motivo | PATCH parcial | **400** |

#### Grupo: Edge Cases de Validação (T-050 a T-054)

| ID | Objetivo | Payload de Teste | Status Esperado |
|---|---|---|---|
| T-050 | Líquido zero rejeitado | `liquido: '0.000'` | **400** |
| T-051 | Tara negativa rejeitada | `tara: '-0.001'` | **400** |
| T-052 | lote_mp vazio rejeitado | `lote_mp: ''` | **400** |
| T-053 | item_op de outra OP rejeitado | item_op pertence a op2, mas op=op1 | **400** |
| T-054 | Excesso de tolerância (+5%) rejeitado | `liquido > 1050g` | **400** |

---

### 3.2 `backend/usuarios/tests/test_permissions.py` — 20 testes unitários

**Execução:** `python manage.py test usuarios.tests.test_permissions`

Testa diretamente as classes de permissão usando `MagicMock` e `APIRequestFactory` — sem banco de dados.

| Classe Testada | Cenários |
|---|---|
| `IsAdmin` | anônimo, sem perfil, operador, supervisor, admin |
| `IsSupervisorOrAdmin` | anônimo, operador, supervisor, admin |
| `IsAdminOrReadOnly` | GET (operador/supervisor/admin), POST (operador/supervisor/admin), DELETE anônimo |
| `IsSupervisorOrAdminOrReadOnly` | GET operador (200), POST operador (403), POST supervisor/admin (200) |
| `IsOperatorCreateOrSupervisorEdit` | GET/POST operador (200), PUT/DELETE operador (403), PUT supervisor/admin (200), sem auth (403), sem perfil em escrita (403) |

---

### 3.3 `backend/usuarios/tests/test_perfil.py` — 13 testes unitários

**Execução:** `python manage.py test usuarios.tests.test_perfil`

| Grupo | Testes | Objetivo |
|---|---|---|
| `PerfilCriadoAutomaticamenteTests` | 3 | Signal `post_save` cria perfil operador; sem duplicação; papel alterável |
| `SyncRolesTests` | 4 | Role base sincronizado ao criar usuário; troca de papel remove role anterior; seed ausente não falha |
| `HasScreenTests` | 6 | has_screen via role; sem role → False; tela inexistente → False; via extra_screens; acumulação; lista ordenada |

---

## 4. Matriz de Permissões Validada

| Endpoint | Anon | Operador | Supervisor | Admin |
|---|---|---|---|---|
| GET /produtos/ | 401 | 200 | 200 | 200 |
| POST /produtos/ | 401 | **403** | 201 | 201 |
| PUT /produtos/{pk}/ | 401 | **403** | 200 | 200 |
| DELETE /produtos/{pk}/ (sem motivo) | 401 | **403** | 400 | 400 |
| DELETE /produtos/{pk}/ (motivo válido) | 401 | **403** | 204 | 204 |
| DELETE /produtos/{pk}/ (OP vinculada) | — | — | 409 | **409** |
| GET /pesagens/ | 401 | 200 | 200 | 200 |
| POST /pesagens/ | 401 | **201** | 201 | 201 |
| PUT /pesagens/{pk}/ (motivo válido) | 401 | **403** | 200 | 200 |
| DELETE /pesagens/{pk}/ (qualquer) | 401 | **403** | **403** | 204 |
| GET /auditoria/ | 401 | **403** | **403** | **200** |

---

## 5. Como Executar os Testes

```bash
# Todos os testes do projeto
cd backend
python manage.py test registro usuarios

# Apenas os novos (integração RBAC)
python manage.py test registro.tests.test_api_permissions

# Apenas permissões unitárias
python manage.py test usuarios.tests.test_permissions

# Apenas PerfilUsuario
python manage.py test usuarios.tests.test_perfil

# Apenas os testes de modelo existentes (corrigidos)
python manage.py test registro.tests.test_models

# Com verbosidade
python manage.py test registro usuarios --verbosity=2
```

### Pré-requisitos
- `.env` configurado com `SECRET_KEY`, `DATABASE_URL` apontando para banco de **teste** (não produção)
- `python manage.py migrate` executado antes da primeira rodada

---

## 6. Pendências e Recomendações

| # | Prioridade | Recomendação |
|---|---|---|
| 1 | Alta | Deletar `registro/tests.py` e usar apenas o pacote `registro/tests/` para evitar conflito de importação Python |
| 2 | Alta | Adicionar `pytest.ini` ou `setup.cfg` com `[tool:pytest] DJANGO_SETTINGS_MODULE=conf.settings` para uso com pytest |
| 3 | Média | Criar `.env.test` isolado (banco de testes separado) e documentar no README |
| 4 | Média | Adicionar testes de integração para `reports/` (views de auditoria, exportação) — cobertura zero no momento |
| 5 | Média | Cobertura frontend: nenhum teste JS/TS configurado — considerar Vitest para hooks e componentes críticos |
| 6 | Baixa | Adicionar `coveragerc` e configurar threshold mínimo de 80% para módulos de negócio |
