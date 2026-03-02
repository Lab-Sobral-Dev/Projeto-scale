# Manual de Operação do Sistema e Especificações Técnicas/Funcionais

## 1) Visão geral

Este documento consolida a operação do **Sistema de Pesagem** (frontend React + backend Django/DRF), incluindo:

- Manual de uso por perfil.
- Fluxos operacionais críticos (cadastros, OP e pesagem).
- Regras funcionais implementadas no código.
- Especificações técnicas de arquitetura, dados, segurança e APIs.

---

## 2) Objetivo do sistema

Controlar o processo de pesagem de matéria-prima por **Ordem de Produção (OP)**, garantindo:

- Rastreabilidade por lote de MP.
- Controle de saldo por item da OP.
- Tolerância de pesagem de ±5% por item.
- Geração de etiqueta em PDF para cada pesagem.
- Controle de acesso por autenticação JWT e perfil de usuário.

---

## 3) Perfis de acesso

### 3.1 Operador
- Acessa rotas privadas autenticadas.
- Pode consultar catálogos e registrar pesagens.
- Não pode criar/editar/excluir cadastros administrativos (produtos, MPs, balanças, usuários etc.).

### 3.2 Administrador
- Possui todos os acessos do operador.
- Pode executar operações de escrita nos cadastros e OPs.
- Pode gerenciar usuários e perfis.

---

## 4) Pré-requisitos e inicialização

## 4.1 Backend (Django)
1. Instalar dependências Python.
2. Rodar migrações.
3. Subir servidor backend (porta padrão 8000).

Exemplo:

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

## 4.2 Frontend (React + Vite)
1. Instalar dependências Node.
2. Iniciar servidor de desenvolvimento (porta padrão 5173).

Exemplo:

```bash
cd frontend
npm install
npm run dev
```

## 4.3 Endereços padrão
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000/api`

---

## 5) Manual de Operação (passo a passo)

## 5.1 Login
1. Acessar `/login`.
2. Informar usuário e senha.
3. Sistema solicita token em `/api/usuarios/auth/login/`.
4. Tokens são armazenados localmente (`access` e `refresh`).
5. Sessão do usuário é validada por `/api/usuarios/auth/me/`.

> Se o token expirar, o frontend tenta refresh automático pelo endpoint `/api/usuarios/auth/refresh/`.

## 5.2 Cadastro de Produto (admin)
1. Ir em **Cadastrar Produto**.
2. Informar nome e código interno (único).
3. Salvar.
4. Produto pode ser ativado/desativado conforme necessidade de operação.

## 5.3 Cadastro de Matéria-Prima (admin)
1. Ir em **Cadastrar Matéria-Prima**.
2. Informar nome e código interno (único).
3. Salvar.
4. Usar status ativo para controlar disponibilidade.

## 5.4 Cadastro de Balança (admin)
1. Ir em **Balanças**.
2. Informar nome, identificador, tipo de conexão e parâmetros (IP/porta ou serial/USB).
3. Salvar.

## 5.5 Estrutura de Produto (BOM/Receita)
1. Criar estrutura para o produto.
2. Inserir itens da estrutura com matéria-prima e quantidade por lote.
3. Regra do sistema: quantidades de MP em **gramas (g)**.

## 5.6 Criação de OP
1. Ir em **Nova OP**.
2. Informar número da OP, produto, estrutura e lote.
3. Salvar OP.
4. Gerar itens da OP a partir da estrutura (ação `gerar-itens`).

## 5.7 Pesagem (fluxo principal)
1. Ir em **Nova Pesagem**.
2. Selecionar OP aberta/em andamento.
3. Selecionar item de MP da OP.
4. Informar:
   - Tara (kg)
   - Líquido (kg)
   - Balança (opcional)
   - Código interno
   - Lote da MP
5. Salvar pesagem.

### Resultado esperado
- Backend calcula `bruto = tara + liquido` (em kg).
- Backend converte líquido para gramas para regra interna.
- Sistema valida tolerância de ±5% no acumulado do item da OP.
- Se válido, grava pesagem e atualiza `quantidade_pesada` do item.
- OP pode evoluir de status automaticamente conforme progresso.

## 5.8 Histórico
1. Acessar **Histórico**.
2. Filtrar por OP, lote, pesador, matéria-prima etc.
3. Abrir detalhes da pesagem.
4. (Admin) editar/excluir conforme política de operação.

## 5.9 Etiqueta
1. A partir de uma pesagem, abrir geração de etiqueta.
2. Endpoint PDF: `/api/registro/etiqueta/<id>/`.
3. Imprimir ou salvar PDF.

## 5.10 Gestão de usuários (admin)
1. Acessar cadastro de usuários.
2. Criar/editar contas.
3. Definir permissões administrativas (`is_staff`) e perfil.

---

## 6) Regras de negócio (especificação funcional)

## 6.1 Unidade padrão
- Entrada do operador para pesagem: **kg**.
- Regra interna para MP: **g**.
- Conversão aplicada no backend antes da validação de saldo.

## 6.2 Coerência OP x Item da OP
- O item selecionado na pesagem deve pertencer à OP informada.
- Se não pertencer, a operação é rejeitada.

## 6.3 Tolerância de pesagem
- Faixa permitida: **quantidade necessária ± 5%** por item.
- O sistema bloqueia gravação que extrapole faixa mínima/máxima permitida.

## 6.4 Cálculo de bruto
- Campo bruto é calculado no backend.
- Valor informado pelo frontend não é confiado para persistência.

## 6.5 Controle de exclusão com vínculo
- Exclusões de entidades vinculadas (produto/MP/balança com uso) retornam conflito e são bloqueadas.

## 6.6 Status de OP
- Pode iniciar como aberta.
- Em andamento conforme pesagens.
- Concluída quando atingir critérios de fechamento (itens atendidos).
- Cancelada quando não houver itens gerados.

## 6.7 Rastreabilidade
- Cada pesagem registra lote da MP (`lote_mp`) e pesador.
- Permite busca por lote de MP no histórico.

---

## 7) Especificação técnica

## 7.1 Arquitetura
- **Frontend**: React + Vite + React Router + UI componentizada.
- **Backend**: Django + Django REST Framework.
- **Auth**: JWT (SimpleJWT) com access/refresh.
- **Banco de dados**: SQLite (configuração atual).
- **CORS**: liberado para origem local do frontend (`localhost:5173`).

## 7.2 Módulos principais

### Backend
- App `registro`:
  - Catálogos: Produto, Matéria-Prima, Balança.
  - Estruturas (BOM): EstruturaProduto e ItemEstrutura.
  - Produção: OrdemProducao e ItemOP.
  - Operação: Pesagem + Etiqueta PDF.
- App `usuarios`:
  - Usuários, perfil (`operador`/`admin`) e endpoints de autenticação/perfil.

### Frontend
- Rotas públicas: login.
- Rotas privadas autenticadas: dashboard, OP, pesagem, histórico, etiqueta, perfil.
- Rotas de admin: cadastros e manutenção.

## 7.3 Segurança e permissões
- Permissão global DRF: autenticado por padrão.
- Escrita em cadastros/OP restrita a `is_staff`.
- Pesagem exige autenticação.
- Endpoint `/auth/me/` normaliza tipo de usuário para uso no frontend.

## 7.4 Endpoints principais (resumo)

### Usuários
- `POST /api/usuarios/auth/login/`
- `POST /api/usuarios/auth/refresh/`
- `GET /api/usuarios/auth/me/`
- `GET/POST /api/usuarios/usuarios/` (admin)
- `GET/POST /api/usuarios/perfis/` (admin)
- `GET /api/usuarios/perfis/me/`

### Registro
- `GET/POST /api/registro/produtos/`
- `GET/POST /api/registro/materias-primas/`
- `GET/POST /api/registro/balancas/`
- `GET/POST /api/registro/estruturas/`
- `GET/POST /api/registro/itens-estrutura/`
- `GET/POST /api/registro/ops/`
- `POST /api/registro/ops/{id}/gerar-itens/`
- `POST /api/registro/ops/{id}/concluir-se-possivel/`
- `GET /api/registro/ops/{id}/itens/`
- `GET/POST /api/registro/pesagens/`
- `GET /api/registro/etiqueta/{id}/`

## 7.5 Dados críticos de domínio
- **Produto**: nome, código interno único, ativo.
- **Matéria-Prima**: nome, código interno único, ativo.
- **Estrutura/ItemEstrutura**: composição de MPs por lote (em g).
- **OrdemProducao**: número único, lote único, status.
- **ItemOP**: quantidade necessária, pesada e restante.
- **Pesagem**: op, item_op, bruto, tara, líquido (persistido em g), lote_mp, balança, pesador, data/hora.

## 7.6 Integrações e saída
- Geração de etiqueta em PDF via ReportLab.
- Inclusão opcional de logomarca em arquivo estático.

---

## 8) Requisitos funcionais (RF)

- **RF-01**: Autenticar usuário por login/senha e emitir JWT.
- **RF-02**: Permitir cadastro e manutenção de produtos (admin).
- **RF-03**: Permitir cadastro e manutenção de matérias-primas (admin).
- **RF-04**: Permitir cadastro e manutenção de balanças (admin).
- **RF-05**: Permitir criação de estrutura de produto e itens de estrutura (admin).
- **RF-06**: Permitir criação de OP e geração automática de itens da OP.
- **RF-07**: Permitir registrar pesagem vinculada a OP e item da OP.
- **RF-08**: Validar tolerância de ±5% na pesagem acumulada do item.
- **RF-09**: Permitir consulta de histórico com filtros.
- **RF-10**: Gerar etiqueta PDF por pesagem.
- **RF-11**: Permitir gestão de usuários e perfis (admin).

## 9) Requisitos não funcionais (RNF)

- **RNF-01 (Segurança)**: APIs protegidas por JWT.
- **RNF-02 (Autorização)**: Escrita restrita a administradores em módulos críticos.
- **RNF-03 (Rastreabilidade)**: Registro de pesador, data/hora e lote da MP.
- **RNF-04 (Integridade)**: Validação de coerência OP x ItemOP e bloqueio de exclusão com vínculo.
- **RNF-05 (Usabilidade)**: Interface web responsiva para operação de chão de fábrica/escritório.
- **RNF-06 (Manutenibilidade)**: Separação frontend/backend e APIs REST versionáveis.

---

## 10) Procedimentos operacionais recomendados

## 10.1 Abertura de turno
1. Validar acesso dos operadores.
2. Confirmar OPs abertas e itens pendentes.
3. Verificar disponibilidade das balanças ativas.

## 10.2 Durante operação
1. Registrar pesagens sempre com `lote_mp` preenchido.
2. Usar item correto da OP para evitar rejeições por consistência.
3. Em caso de erro de faixa, revisar saldo já pesado antes de nova tentativa.

## 10.3 Fechamento
1. Conferir OPs concluídas.
2. Emitir/arquivar etiquetas e relatórios necessários.
3. Revisar itens com pendências (restante > 0).

---

## 11) Tratamento de erros comuns

- **401 Não autenticado**: refazer login.
- **403 Sem permissão**: usuário sem perfil admin para ação de escrita.
- **409 Conflito ao excluir**: registro possui vínculo e não pode ser removido.
- **Erro de tolerância**: pesagem excede faixa permitida (±5% do item).
- **Item não pertence à OP**: revisar seleção de OP/item antes de salvar.

---

## 12) Observações finais

- Este documento descreve o comportamento observado no código atual.
- Em produção, recomenda-se:
  - Banco robusto (PostgreSQL).
  - Rotina de backup.
  - HTTPS e rotação segura de chaves/tokens.
  - Monitoramento de API e trilha de auditoria operacional.

