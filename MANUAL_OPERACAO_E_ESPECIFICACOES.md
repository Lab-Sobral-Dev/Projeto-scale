# Manual de Operação do Sistema e Especificações Técnicas/Funcionais

> **Versão:** 2.0 — Atualizado em 27/04/2026  
> **Branch de referência:** `producao` | **Último commit:** `82ca0a8`

---

## 1) Visão geral

O **Sistema SCALE** é uma plataforma web industrial desenvolvida para digitalizar e padronizar o processo de pesagem de matérias-primas vinculadas a Ordens de Produção (OPs). Consolidado neste documento:

- Manual de uso por perfil de acesso.
- Fluxos operacionais críticos (cadastros, OP e pesagem).
- Regras funcionais implementadas no código.
- Especificações técnicas de arquitetura, dados, segurança e APIs.

---

## 2) Objetivo do sistema

Controlar o processo de pesagem de matéria-prima por **Ordem de Produção (OP)**, garantindo:

- Rastreabilidade por lote de MP e por operador.
- Controle de saldo por item da OP.
- Tolerância de pesagem de ±5% por item.
- Geração de etiqueta em PDF para cada pesagem.
- Controle de acesso por autenticação JWT com três perfis de usuário.
- Auditoria completa de todas as ações realizadas no sistema.
- Backup automático diário com política de retenção configurável.

---

## 3) Perfis de acesso

### 3.1 Operador
- Acessa rotas privadas autenticadas.
- Consulta catálogos (produtos, MPs, balanças, estruturas).
- Registra novas pesagens.
- Consulta histórico de pesagens e acessa detalhes.
- Gera etiquetas a partir de pesagens existentes.
- Não pode criar, editar ou excluir cadastros administrativos.

### 3.2 Supervisor
- Possui todos os acessos do Operador.
- Pode criar e editar produtos, matérias-primas, estruturas e balanças.
- Pode criar e gerenciar Ordens de Produção.
- Pode editar pesagens já registradas mediante **motivo obrigatório** (rastreado em auditoria).
- Acessa módulo de balanças com controle de calibração.
- Não acessa relatórios de administração nem gestão de usuários.

### 3.3 Administrador
- Possui todos os acessos do Supervisor.
- Gerencia usuários, perfis, roles e telas de acesso (RBAC).
- Acessa logs de auditoria, exclusões e logs do sistema.
- Acessa e executa backups e restaurações.
- Acessa relatórios de administração, segurança e continuidade.
- Pode bloquear/desbloquear contas e forçar reset de senha.
- Acessa URL do Django Admin (configurável via ambiente).

---

## 4) Pré-requisitos e inicialização

### 4.1 Ambiente com Docker (recomendado — produção e homologação)

```bash
# Copiar e preencher variáveis de ambiente
cp .env.example .env

# Subir todos os serviços
docker compose up -d

# Aplicar migrações
docker compose exec backend python manage.py migrate

# Criar superusuário inicial
docker compose exec backend python manage.py createsuperuser
```

**Serviços iniciados:**

| Serviço | Container | Função |
|---|---|---|
| `backend` | `scale_backend` | Django + Gunicorn |
| `worker` | `scale_worker` | Celery Worker (tarefas assíncronas) |
| `beat` | `scale_beat` | Celery Beat (agendador — backup diário) |
| `redis` | `scale_redis` | Message broker e result backend |
| `frontend` | `scale_frontend` | React (Vite build) |
| `nginx` | `scale_nginx` | Reverse proxy + SSL |
| `db` | `scale_db` | PostgreSQL 15 |

### 4.2 Ambiente local (desenvolvimento)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
pnpm install      # gerenciador: pnpm (não npm)
pnpm run dev
```

### 4.3 Endereços padrão (desenvolvimento local)
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000/api`

### 4.4 Variáveis de ambiente críticas

| Variável | Descrição |
|---|---|
| `SECRET_KEY` | Chave secreta Django (gerar com `openssl rand -hex 50`) |
| `DEBUG` | `False` em produção |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Banco principal (produção) |
| `DB_NAME_HML` ... `DB_PORT_HML` | Banco de homologação (opcional) |
| `CELERY_BROKER_URL` | URL do Redis para Celery |
| `DJANGO_HTTPS_PROXY` | `true` quando TLS termina em proxy externo |
| `AUDIT_ENABLED` | `true` para habilitar auditoria de ações |
| `BACKUP_ALERT_EMAILS` | Emails que recebem alertas de falha de backup |
| `DJANGO_ADMIN_URL` | URL do Django Admin (obscurecer em produção) |
| `ACCESS_TOKEN_MINUTES` | Validade do access token (padrão: 60 min) |
| `REFRESH_TOKEN_DAYS` | Validade do refresh token (padrão: 7 dias) |

---

## 5) Manual de Operação (passo a passo)

### 5.1 Login
1. Acessar `/login`.
2. Informar usuário e senha.
3. Sistema autentica em `POST /api/usuarios/auth/login/` e retorna tokens JWT.
4. Tokens `access` e `refresh` são armazenados localmente no frontend.
5. Sessão é validada via `GET /api/usuarios/auth/me/`.

> **Segurança:** O endpoint de login tem rate limiting de **5 tentativas por minuto**. Após múltiplas falhas, a conta pode ser bloqueada e requer desbloqueio pelo Administrador.

> Se o access token expirar, o frontend executa refresh automático via `POST /api/usuarios/auth/refresh/`.

### 5.2 Cadastro de Produto (Supervisor/Admin)
1. Ir em **Cadastrar Produto**.
2. Informar nome e código interno (único no sistema).
3. Definir status ativo/inativo.
4. Salvar.

### 5.3 Cadastro de Matéria-Prima (Supervisor/Admin)
1. Ir em **Cadastrar Matéria-Prima**.
2. Informar nome e código interno (único).
3. Definir status ativo/inativo.
4. Salvar.

### 5.4 Cadastro de Balança (Supervisor/Admin)
1. Ir em **Balanças**.
2. Informar nome, identificador (TAG), tipo de conexão (Ethernet/Serial/USB).
3. Configurar endereço IP, porta, localização e protocolo conforme o tipo.
4. Definir capacidade máxima e frequência de calibração (em dias).
5. Registrar data da última calibração.

> **Atenção:** Balanças com calibração vencida não aparecem na lista de seleção da tela de pesagem.

### 5.5 Estrutura de Produto — BOM/Receita (Supervisor/Admin)
1. Ir em **Estrutura de Produtos**.
2. Criar nova estrutura vinculando ao produto desejado.
3. Adicionar itens: selecionar MP e informar quantidade por lote.
4. Regra do sistema: quantidades de MP armazenadas em **gramas (g)**.

### 5.6 Criação de OP (Supervisor/Admin)
1. Ir em **Nova OP**.
2. Informar número da OP, produto, estrutura e lote.
3. Adicionar observações opcionais.
4. Salvar — o sistema gera automaticamente os itens de pesagem a partir da estrutura.

> O sistema não permite recriar itens de uma OP sem o parâmetro `forcar=True` (evita duplicação acidental).

### 5.7 Pesagem — Fluxo Principal (Operador/Supervisor/Admin)
1. Ir em **Nova Pesagem**.
2. Selecionar OP ativa (aberta ou em andamento).
3. Produto e Lote da OP são preenchidos automaticamente.
4. Selecionar o **Item da OP** (matéria-prima específica).
5. Informar **Lote MP** (lote do fornecedor).
6. Selecionar a **Balança** disponível e calibrada.
7. Informar **Tara (kg)** e **Peso Líquido (kg)**.
8. O sistema calcula **Peso Bruto** automaticamente (`tara + líquido`).
9. O painel de **Saldo do Item** exibe em tempo real: Necessário / Pesado / Restante / Limites.
10. Clicar em **Revisar e Salvar** — conferir dados no modal de confirmação.
11. Confirmar para gravar a pesagem.
12. Após gravação, clicar em **Gerar Etiqueta** para imprimir o PDF de identificação.

#### Resultado esperado
- Backend converte líquido de kg para g para validação interna.
- Sistema valida que `quantidade_pesada + liquido_atual` não ultrapassa o teto (quantidade necessária × 1,05).
- Se válido, grava pesagem e atualiza `quantidade_pesada` do item.
- OP avança de status automaticamente: `ABERTA → EM_ANDAMENTO → CONCLUÍDA`.

### 5.8 Histórico de Pesagens (todos os perfis)
1. Acessar **Histórico**.
2. Filtrar por Produto, MP, OP, Pesador ou período.
3. Abrir detalhes de qualquer registro (visualização completa).
4. (Supervisor/Admin) Editar pesagem mediante motivo obrigatório.
5. (Admin) Excluir pesagem mediante motivo obrigatório.

> Edições e exclusões são registradas na auditoria com o estado antes e depois da alteração.

### 5.9 Etiqueta
1. A partir de uma pesagem (nova ou no histórico), clicar em **Gerar Etiqueta**.
2. PDF gerado com dados completos de rastreabilidade.
3. Endpoint: `GET /api/registro/etiqueta/<id>/`.
4. A etiqueta identifica o **ambiente** (PRODUÇÃO ou HOMOLOGAÇÃO) no cabeçalho.

### 5.10 Relatórios (Supervisor/Admin)
Acessar em **Relatórios**. Todos permitem filtros avançados e exportação em **CSV** e **PDF**.

**Relatórios de Produção:**
- Pesagens — detalhado por OP, produto, MP, pesador, pesos e balança
- Balanças — status de conexão, histórico de leituras e calibração
- Estrutura — BOM de produtos com quantidades padrão por receita
- Lotes — rastreamento de lotes e vínculos entre OPs e MPs

**Relatórios de Cadastros:**
- Produtos — lista com código interno e status
- Matérias-Primas — lista com código interno e status
- Usuários — perfis, e-mails e último login *(Supervisor/Admin)*
- Permissões — matriz de acesso por perfil e tela *(Supervisor/Admin)*

**Relatórios de Administração** *(Admin exclusivo):*
- Administração — Ações: inserções, edições e exclusões com before/after
- Administração — Erros/Login: tentativas de acesso com resultado e motivo de falha
- Administração — Exclusões: registros deletados com responsável e motivo
- Administração — Logs do Sistema: logs técnicos com nível de severidade

**Relatórios de Segurança e Continuidade** *(Admin exclusivo):*
- Backups — histórico de backups automáticos e manuais com status
- Restaurações — histórico de restores com arquivo de origem e responsável

### 5.11 Auditoria (Admin)
1. Acessar **Auditoria**.
2. Filtrar por ação, método HTTP, modelo, usuário, rota, período ou motivo.
3. Exportar em CSV ou PDF.

### 5.12 Gerenciamento de Usuários e Permissões (Admin)
1. Acessar **Usuários** no menu administrativo.
2. Criar novo usuário informando: usuário, senha, nome, e-mail, perfil (operador/supervisor/admin).
3. Definir telas acessíveis via seleção de roles e extra screens.
4. Editar ou desativar contas existentes.

### 5.13 Segurança de Usuários (Admin)
1. Na listagem de usuários, acessar a seção de **Segurança**.
2. Visualizar: tentativas de login, status de bloqueio e data do evento.
3. **Desbloquear conta:** restaura acesso de usuário bloqueado por excesso de tentativas falhas.
4. **Reset forçado de senha:** força o usuário a definir nova senha no próximo login.

### 5.14 Backup e Restauração (Admin)
1. Acessar **Backups** no menu administrativo.
2. Para backup manual: clicar em **Backup Agora** — executa imediatamente via API.
3. O backup automático é executado **diariamente** pelo Celery Beat.
4. Para restaurar: selecionar o backup desejado e clicar em **Restaurar**.
5. O sistema cria um **safety backup** automaticamente antes de qualquer restauração.
6. Após restauração, safety backup é removido automaticamente.

> Antes de qualquer manutenção técnica, execute um backup manual preventivo.

---

## 6) Regras de negócio (especificação funcional)

### 6.1 Unidade padrão
- Entrada do operador para pesagem: **kg**.
- Armazenamento interno: **gramas (g)**.
- Conversão aplicada no backend antes de qualquer validação.

### 6.2 Coerência OP × Item da OP
- O ItemOP selecionado na pesagem deve pertencer exatamente à OP informada.
- Se não pertencer, a operação é rejeitada com erro de validação.

### 6.3 Tolerância de pesagem
- Faixa permitida por item: **quantidade necessária × (1 ± 0,05)**.
- Mínimo: `quantidade_necessaria × 0,95`.
- Máximo (teto): `quantidade_necessaria × 1,05`.
- O sistema bloqueia a gravação de pesagens fora dessa faixa.
- O painel de saldo exibe os limites em tempo real antes de salvar.

### 6.4 Cálculo de peso bruto
- `bruto = tara + liquido` — calculado exclusivamente no backend.
- Valor enviado pelo frontend é ignorado para fins de persistência.

### 6.5 Validações de campo na pesagem
- Tara negativa: rejeitada.
- Peso líquido zero ou negativo: rejeitado.
- Lote da MP vazio: rejeitado.
- ItemOP de OP diferente: rejeitado.
- Pesagem que ultrapasse o teto de tolerância: rejeitada.

### 6.6 Controle de exclusão com vínculo
- Exclusão de produto, MP ou balança com uso existente retorna HTTP 409 (Conflict).
- Operação bloqueada para preservar integridade referencial.

### 6.7 Status da OP
| Status | Condição |
|---|---|
| `ABERTA` | OP criada, nenhuma pesagem registrada |
| `EM_ANDAMENTO` | Pelo menos uma pesagem registrada |
| `CONCLUÍDA` | Todos os itens atingiram o mínimo de tolerância |
| `CANCELADA` | OP sem itens gerados |

### 6.8 Rastreabilidade
- Cada pesagem registra: lote da MP, pesador, data/hora, balança utilizada.
- Histórico filtrável por lote de MP para rastreamento de insumos.
- Auditoria registra todas as ações com IP do solicitante, método e status HTTP.

### 6.9 Balanças e calibração
- Somente balanças com calibração vigente aparecem na seleção durante a pesagem.
- O sistema calcula automaticamente se a calibração está vencida com base na frequência (dias) e data da última calibração.

### 6.10 Edição de pesagem
- Permitida apenas para Supervisor e Admin.
- Exige motivo obrigatório selecionado entre opções predefinidas.
- O estado antes e depois da edição é registrado na auditoria.

---

## 7) Especificação técnica

### 7.1 Arquitetura geral

```
[Browser]
    |
    v
[Nginx — SSL/TLS + proxy reverso]
    |           |
    v           v
[Frontend]   [Backend (Gunicorn)]
 React 19      Django 5.2.5
 Vite 6.3.5    DRF 3.16.1
    |
    v
[PostgreSQL 15]   [Redis]
                     |
               [Celery Worker]
               [Celery Beat]
```

### 7.2 Stack de tecnologias

**Backend:**
| Tecnologia | Versão |
|---|---|
| Python | 3.12.7 |
| Django | 5.2.5 |
| Django REST Framework | 3.16.1 |
| djangorestframework-simplejwt | 5.5.1 |
| Celery | 5.5.3 |
| django-celery-beat | última compatível |
| PostgreSQL | 15 |
| Redis | alpine |

**Frontend:**
| Tecnologia | Versão |
|---|---|
| React | 19.1.0 |
| React Router DOM | 7.14.2 |
| Vite | 6.3.5 |
| Tailwind CSS | 4.1.7 |
| Radix UI | ~1.x (múltiplos componentes) |
| Zod | 3.24.4 |
| React Hook Form | 7.56.3 |
| pnpm | 10.4.1 |

### 7.3 Apps do backend

#### App `registro`
- **Catálogos:** `Produto`, `MateriaPrima`, `UnidadeMedida`
- **Estrutura (BOM):** `EstruturaProduto`, `ItemEstrutura`
- **Produção:** `OrdemProducao`, `ItemOP`
- **Operação:** `Pesagem`, etiqueta PDF via ReportLab
- **Equipamentos:** `Balanca` (com controle de calibração)
- **Auditoria:** `AuditLog`
- **Backup:** `BackupRecord`, `BackupConfig`

#### App `usuarios`
- **Identidade:** `User` (Django auth) + `PerfilUsuario` (OneToOne)
- **RBAC:** `Role` (agrupa telas) + `Screen` (telas do sistema)
- **Perfis disponíveis:** `operador`, `supervisor`, `admin`

#### App `reports`
- Sem modelos próprios.
- Views que agregam dados dos outros apps para geração de relatórios com filtros e exportação CSV/PDF.

### 7.4 Segurança e autenticação

- **Autenticação:** JWT (SimpleJWT) com access token e refresh token.
- **Perfis:** 3 níveis (operador, supervisor, admin) com permissões distintas por endpoint.
- **RBAC granular:** permissão por tela (`Screen`) atribuída via `Role` ou `extra_screens` no perfil.
- **Rate limiting:**
  - Anônimos: 200 req/dia
  - Autenticados: 2.000 req/dia
  - Login: **5 tentativas/minuto** (bloqueio automático)
- **Headers de segurança:** HSTS, X-Content-Type, X-Frame-Options configurados via Nginx.
- **HTTPS:** SSL/TLS ativo em produção e homologação com renovação automática.
- **Proxy confiável:** `DJANGO_HTTPS_PROXY=true` + `TRUSTED_PROXIES` para auditoria de IP real.
- **Admin Django:** URL obscurecível via variável `DJANGO_ADMIN_URL`.

### 7.5 Endpoints principais

#### Autenticação
```
POST   /api/usuarios/auth/login/          Autenticação (rate limited: 5/min)
POST   /api/usuarios/auth/refresh/        Renovar access token
GET    /api/usuarios/auth/me/             Dados do usuário autenticado
POST   /api/usuarios/auth/change-password/ Trocar senha
```

#### Usuários e RBAC
```
GET/POST   /api/usuarios/usuarios/        CRUD usuários (admin)
GET/POST   /api/usuarios/perfis/          CRUD perfis (admin)
GET/POST   /api/usuarios/roles/           CRUD roles (admin)
GET/POST   /api/usuarios/screens/         CRUD telas (admin)
GET/POST   /api/usuarios/security/<pk>/   Status de segurança (admin)
POST       /api/usuarios/security/<pk>/unlock/       Desbloquear conta (admin)
POST       /api/usuarios/security/<pk>/force-reset/  Reset forçado de senha (admin)
```

#### Cadastros e Produção
```
GET/POST   /api/registro/produtos/
GET/POST   /api/registro/materias-primas/
GET/POST   /api/registro/balancas/
GET/POST   /api/registro/estruturas/
GET/POST   /api/registro/itens-estrutura/
GET/POST   /api/registro/ops/
GET/POST   /api/registro/itens-op/
GET/POST   /api/registro/pesagens/
GET        /api/registro/etiqueta/<pk>/   Etiqueta PDF de pesagem
GET/POST   /api/registro/auditoria/       Log de auditoria
```

#### Backup e Restauração
```
POST   /api/registro/backups/execute/       Executar backup manual
GET    /api/registro/backups/               Listar backups
GET    /api/registro/backups/<pk>/download/ Download do arquivo de backup
POST   /api/registro/backups/<pk>/restore/  Restaurar backup
```

#### Relatórios
```
GET /api/reports/pesagens/
GET /api/reports/balancas/
GET /api/reports/estrutura/
GET /api/reports/produtos/
GET /api/reports/materias-primas/
GET /api/reports/usuarios/           (admin)
GET /api/reports/permissoes/         (admin)
GET /api/reports/auditoria/acoes/    (admin)
GET /api/reports/auditoria/exclusoes/ (admin)
GET /api/reports/auditoria/auth-erros/ (admin)
GET /api/reports/auditoria/logs-sistema/ (admin)
GET /api/reports/backups/            (admin)
GET /api/reports/restores/           (admin)
```

### 7.6 Dados críticos de domínio

| Entidade | Campos críticos |
|---|---|
| `Produto` | nome, código interno (único), ativo |
| `MateriaPrima` | nome, código interno (único), ativo |
| `EstruturaProduto` | produto (FK), descrição, ativa |
| `ItemEstrutura` | estrutura (FK), MP (FK), quantidade por lote (g) |
| `OrdemProducao` | número (único), lote, produto, estrutura, status |
| `ItemOP` | op (FK), MP (FK), quantidade necessária (g), quantidade pesada (g) |
| `Pesagem` | item_op (FK), balanca (FK), tara (g), liquido (g), bruto (g), lote_mp, pesador (FK), data/hora |
| `AuditLog` | usuário, ação (criado/editado/deletado/request), modelo, objeto_pk, dados before/after, IP, motivo |
| `BackupRecord` | alias do banco, tipo (automático/manual/safety), tamanho, status, data/hora, hash SHA256 |

### 7.7 Política de backup

| Tipo | Frequência | Disparado por | Retenção |
|---|---|---|---|
| Automático | Diário | Celery Beat | Configurável via `BackupConfig` |
| Manual | Sob demanda | API / Django Admin | Configurável |
| Safety backup | Antes de cada restore | Sistema (automático) | Removido após restore bem-sucedido |
| Snapshot VPS | Semanal | Hostinger | Conforme contrato |

---

## 8) Requisitos funcionais (RF)

- **RF-01:** Autenticar usuário por login/senha e emitir JWT com perfil e permissões.
- **RF-02:** Permitir cadastro e manutenção de produtos (Supervisor/Admin).
- **RF-03:** Permitir cadastro e manutenção de matérias-primas (Supervisor/Admin).
- **RF-04:** Permitir cadastro e manutenção de balanças com controle de calibração (Supervisor/Admin).
- **RF-05:** Permitir criação de estrutura de produto (BOM) e itens de estrutura (Supervisor/Admin).
- **RF-06:** Permitir criação de OP e geração automática de itens a partir da estrutura (Supervisor/Admin).
- **RF-07:** Permitir registro de pesagem vinculada a OP e item da OP com validação de limites.
- **RF-08:** Validar tolerância de ±5% na pesagem acumulada do item.
- **RF-09:** Permitir consulta de histórico de pesagens com filtros múltiplos.
- **RF-10:** Gerar etiqueta PDF por pesagem com dados de rastreabilidade e identificação de ambiente.
- **RF-11:** Permitir gestão de usuários com três perfis e RBAC granular por tela (Admin).
- **RF-12:** Registrar auditoria completa de todas as ações com before/after (Admin).
- **RF-13:** Executar backup automático diário com retenção configurável e safety backup antes de restore.
- **RF-14:** Permitir geração de relatórios operacionais, de cadastro, administrativos e de segurança.
- **RF-15:** Exibir badge visual e watermark "HML" no ambiente de homologação.
- **RF-16:** Controlar segurança de contas: bloqueio automático, desbloqueio manual e reset de senha (Admin).

---

## 9) Requisitos não funcionais (RNF)

- **RNF-01 (Segurança):** APIs protegidas por JWT com access/refresh; rate limiting no login; HTTPS em produção.
- **RNF-02 (Autorização):** RBAC com 3 perfis (operador, supervisor, admin) e controle por tela.
- **RNF-03 (Rastreabilidade):** Auditoria de todas as ações com usuário, IP, método, before/after e motivo.
- **RNF-04 (Integridade):** Validação de coerência OP × ItemOP; bloqueio de exclusão com vínculo; hash SHA256 em backups.
- **RNF-05 (Usabilidade):** Interface web responsiva com badge de ambiente visível em homologação.
- **RNF-06 (Disponibilidade):** Backup automático diário + snapshot VPS semanal; safety backup antes de restore.
- **RNF-07 (Manutenibilidade):** Separação frontend/backend; apps Django independentes; variáveis de ambiente para todos os parâmetros críticos.
- **RNF-08 (Isolamento):** Ambientes PROD e HML completamente independentes (bancos, builds, credenciais, JWT secrets).
- **RNF-09 (Observabilidade):** Logs segregados por ambiente; auditoria de requisições; relatório de erros de autenticação.

---

## 10) Procedimentos operacionais recomendados

### 10.1 Abertura de turno
1. Validar acesso dos operadores (contas ativas).
2. Confirmar OPs abertas e itens pendentes no Dashboard.
3. Verificar balanças ativas e calibração vigente.

### 10.2 Durante operação
1. Registrar pesagens sempre com `lote_mp` preenchido.
2. Selecionar o item correto da OP para evitar rejeições por consistência.
3. Em caso de erro de faixa, revisar o saldo já pesado antes de nova tentativa.
4. Não compartilhar credenciais de acesso — cada operador deve ter conta individual.

### 10.3 Fechamento de turno
1. Conferir OPs concluídas e em andamento.
2. Emitir/arquivar etiquetas e relatórios necessários.
3. Revisar itens com pendências (`restante > 0`).

### 10.4 Antes de manutenção técnica
1. Executar backup manual via painel de Backups ou API.
2. Aguardar confirmação de status `success`.
3. Notificar a equipe de Qualidade se o impacto envolver dados regulados por BPF.

---

## 11) Tratamento de erros comuns

| Erro | Causa provável | Ação |
|---|---|---|
| `401 Unauthorized` | Token expirado ou ausente | Refazer login |
| `403 Forbidden` | Perfil sem permissão para a ação | Verificar se o perfil é adequado; solicitar ao Admin |
| `409 Conflict` ao excluir | Registro possui vínculo em uso | Remover vínculos antes de excluir |
| Erro de tolerância | Pesagem excede ±5% do item | Verificar saldo já pesado; ajustar peso |
| Item não pertence à OP | OP errada selecionada | Revisar seleção de OP antes de salvar |
| Login bloqueado | Excesso de tentativas falhas | Aguardar cooldown ou solicitar desbloqueio ao Admin |
| Balança não listada | Calibração vencida | Atualizar data de calibração no cadastro da balança |
| `500` em backup | Falta de espaço em disco ou permissão | Verificar logs do Celery Worker; acionar TI |

---

## 12) Infraestrutura e deploy

### 12.1 VPS (Hostinger)
| Recurso | Especificação |
|---|---|
| Processador | 2 vCPUs |
| Memória RAM | 8 GB |
| Armazenamento | 100 GB SSD |
| Sistema Operacional | Debian 12 |
| Localização | São Paulo, Brasil |
| Banda | 8 TB/mês |

### 12.2 URLs de acesso
- **Produção:** `https://scale.laboratoriosobral.com.br`
- **Homologação:** `https://hml-scale.laboratoriosobral.com.br`
- **API Produção:** `https://apiscale.laboratoriosobral.com.br/api/`
- **API Homologação:** `https://apihml-scale.laboratoriosobral.com.br/api/`

### 12.3 Diferenças entre ambientes

| Camada | PRODUÇÃO | HOMOLOGAÇÃO |
|---|---|---|
| Banco | `scale_prod` | `scale_hml` |
| JWT Secret | `PROD_JWT_SECRET` | `HML_JWT_SECRET` |
| Badge HML | Desativado | **Ativo** na UI |
| Watermark PDF | Sem watermark | **"HML"** em todos os PDFs |
| Dados | Produção real | Fictícios ou anonimizados |
