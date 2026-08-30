# Sistema SCALE

Plataforma web industrial para controle de **pesagem de matérias-primas vinculadas a Ordens de Produção (OPs)**, desenvolvida para o Laboratório Theodoro F. Sobral.

O sistema digitaliza o processo de pesagem garantindo rastreabilidade por lote e por operador, controle de saldo por item da OP, tolerância de ±5% por item, emissão de etiqueta em PDF, auditoria completa das ações e backup automático com política de retenção.

**Stack:** Django 5.2.5 + DRF 3.16.1 · React 19 + Vite + Tailwind 4 · PostgreSQL 15 · Celery + Redis · Docker + Nginx

---

## Índice

- [Arquitetura](#arquitetura)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Ambientes: Produção e Homologação](#ambientes-produção-e-homologação)
- [Perfis de acesso](#perfis-de-acesso)
- [Regras de negócio](#regras-de-negócio)
- [API](#api)
- [Rotas do frontend](#rotas-do-frontend)
- [Etiquetas de pesagem](#etiquetas-de-pesagem)
- [Auditoria](#auditoria)
- [Backup e restauração](#backup-e-restauração)
- [Comandos de manutenção](#comandos-de-manutenção)
- [Problemas conhecidos](#problemas-conhecidos)
- [Documentação relacionada](#documentação-relacionada)

---

## Arquitetura

Sete serviços orquestrados por Docker Compose. O Nginx é o único ponto de entrada: serve o SPA e faz proxy de `/api/` para o Gunicorn.

```
                        ┌──────────────────────────────┐
   Browser ────────────▶│  nginx  (127.0.0.1:8091:80)  │
                        └───────────┬──────────────────┘
                            /       │        \
                    /api/  │   /static/,      │  /
                           │   /media/        │
                           ▼                  ▼
                  ┌─────────────────┐  ┌──────────────┐
                  │ backend         │  │ frontend     │
                  │ Django+Gunicorn │  │ build Vite   │
                  │ :8000           │  │ servido      │
                  └────┬───────┬────┘  │ por nginx    │
                       │       │       └──────────────┘
              ┌────────▼──┐ ┌──▼──────┐
              │ db        │ │ redis   │
              │ Postgres  │ │ broker  │
              │ 15        │ └──┬───┬──┘
              └───────────┘    │   │
                        ┌──────▼┐ ┌▼────────┐
                        │ worker│ │ beat    │
                        │Celery │ │ agenda  │
                        └───────┘ └─────────┘
```

| Serviço | Imagem / origem | Função |
|---|---|---|
| `nginx` | `nginx:stable-alpine` | Entrada única; roteia SPA, API, estáticos e mídia. Expõe `127.0.0.1:8091` |
| `backend` | `./backend` | API REST (Django + Gunicorn, 3 workers) |
| `frontend` | `./frontend` | Build estático do Vite servido por Nginx interno |
| `db` | `postgres:15` | Banco principal (`scale`) e de homologação (`scale_hml`) |
| `redis` | `redis:alpine` | Broker e result backend do Celery |
| `worker` | `./backend` | Executa tarefas assíncronas (backup) |
| `beat` | `./backend` | Agendador (`django-celery-beat`) |

**Volumes nomeados:** `db_data`, `static_volume`, `media_volume`, `backups_volume`, `redis_data`.

### Backend

Três apps Django:

| App | Responsabilidade |
|---|---|
| `registro` | Domínio central — produtos, MPs, balanças, estruturas (BOM), OPs, pesagens, auditoria e backups |
| `usuarios` | Autenticação JWT, perfis, RBAC (roles × telas) e segurança de conta |
| `reports` | Relatórios operacionais e administrativos em PDF/CSV |

Middlewares relevantes em `registro/`: `middleware.py` (auditoria), `middleware_env.py` (seleção de banco por ambiente) e `middleware_requestctx.py` (contexto da requisição).

---

## Estrutura do repositório

```
Projeto-scale/
├── backend/
│   ├── conf/                  # settings, urls, wsgi, celery
│   ├── registro/              # domínio: pesagem, OPs, catálogos, auditoria, backup
│   │   ├── models.py          # Produto, MateriaPrima, Balanca, EstruturaProduto,
│   │   │                      # ItemEstrutura, OrdemProducao, ItemOP, Pesagem
│   │   ├── audit_models.py    # AuditLog, BackupRecord, BackupConfig
│   │   ├── db_context.py      # contexto thread-local do banco ativo
│   │   ├── db_router.py       # EnvRouter — roteia ORM para default/hml
│   │   ├── views.py           # ViewSets + gerar_etiqueta_pdf
│   │   ├── tasks.py           # registro.auto_backup (Celery)
│   │   └── services/          # backup_db.py e afins
│   ├── usuarios/              # PerfilUsuario, Role, Screen, LoginSecurity
│   ├── reports/               # views de relatório + services/pdf_base.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/        # telas e componentes
│   │   ├── pages/reports/     # telas de relatório
│   │   ├── services/          # api.js, reports.js, auditoria.js
│   │   └── hooks/
│   ├── Dockerfile             # build Vite → Nginx
│   └── nginx.conf
├── docker/postgres-init/      # cria o banco de homologação no 1º boot
├── nginx/nginx.conf           # roteamento por domínio + X-Accel-Redirect
├── scripts/                   # utilitários operacionais (Node)
├── docs/                      # análises e notas técnicas
├── docker-compose.yml
├── CHANGELOG.md
└── MANUAL_OPERACAO_E_ESPECIFICACOES.md
```

---

## Como rodar localmente

### Pré-requisitos

- Docker + Docker Compose
- Git

Node e Python **não** precisam estar instalados no host: tudo roda em container.

### Passo a passo

```bash
# 1. Clonar com o submódulo de skills
git clone --recurse-submodules https://github.com/Lab-Sobral-Dev/Projeto-scale.git
cd Projeto-scale

# 2. Criar o .env a partir do exemplo e preencher
cp .env.example .env
```

Ajuste no `.env` os valores mínimos para desenvolvimento:

```ini
SECRET_KEY=<gere: python -c "import secrets; print(secrets.token_hex(32))">
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,backend,nginx
CORS_ALLOWED_ORIGINS=http://localhost:8091
CSRF_TRUSTED_ORIGINS=http://localhost:8091
DB_HOST=db
DB_NAME=scale
DB_USER=scale_user
DB_PASSWORD=<senha>
POSTGRES_DB=scale
POSTGRES_USER=scale_user
POSTGRES_PASSWORD=<mesma senha>
REDIS_PASSWORD=<senha>
CELERY_BROKER_URL=redis://:<senha>@redis:6379/0
CELERY_RESULT_BACKEND=redis://:<senha>@redis:6379/0
```

O frontend lê a URL da API em tempo de **build**. Para apontar ao backend local, crie `frontend/.env.production.local`:

```ini
VITE_API_BASE_URL=http://localhost:8091/api
```

```bash
# 3. Subir a stack (a primeira vez compila as imagens)
docker compose up -d --build

# 4. Aplicar migrações — ver "Problemas conhecidos" se o banco for novo
docker compose exec backend python manage.py migrate

# 5. Criar o usuário administrador
docker compose exec backend python manage.py create_admin

# 6. Popular os papéis padrão (RBAC)
docker compose exec backend python manage.py seed_roles
```

Acesse **http://localhost:8091**. O Django Admin fica em `/admin/` (caminho configurável por `DJANGO_ADMIN_URL`).

### Ciclo de desenvolvimento

O Dockerfile do backend copia o código para dentro da imagem (`COPY . .`), **sem bind mount**. Toda alteração de código exige rebuild:

```bash
docker compose up -d --build backend    # mudanças no Python
docker compose up -d --build frontend   # mudanças no React
```

Para iterar mais rápido, crie um `docker-compose.override.yml` local montando o código como volume e trocando o Gunicorn por `runserver`.

---

## Variáveis de ambiente

Definidas em `.env` na raiz (carregado tanto pelo Django quanto pelo Compose). O arquivo é ignorado pelo Git — use `.env.example` como referência.

| Grupo | Variáveis | Observação |
|---|---|---|
| Django | `SECRET_KEY`, `DEBUG`, `LANGUAGE_CODE`, `TIME_ZONE` | `SECRET_KEY` é obrigatória: sem ela o processo aborta na inicialização |
| Hosts | `ALLOWED_HOSTS` | Sem protocolo, separado por vírgula |
| CORS/CSRF | `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEXES` | Com protocolo. `CORS_ALLOW_CREDENTIALS` é ativo |
| Proxy | `DJANGO_HTTPS_PROXY`, `TRUSTED_PROXIES` | `TRUSTED_PROXIES` (CIDRs) define de quais proxies o IP de auditoria é confiável |
| JWT | `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS` | Padrão: 60 min e 7 dias |
| Banco | `DB_ENGINE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_CONN_MAX_AGE` | `DB_ENGINE=postgres` (padrão) ou qualquer outro valor para cair no SQLite |
| Banco HML | `DB_NAME_HML`, `DB_USER_HML`, `DB_PASSWORD_HML`, `DB_HOST_HML`, `DB_PORT_HML` | Alias `hml` do Django |
| Postgres | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Consumidas pelo container oficial; devem casar com as `DB_*` |
| Redis/Celery | `REDIS_PASSWORD`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` | |
| App | `APP_ENV`, `AUDIT_ENABLED` | `AUDIT_ENABLED=false` desliga o registro de auditoria |
| E-mail | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`, `DEFAULT_FROM_EMAIL` | |
| Backup | `BACKUP_ALERT_EMAILS`, `BACKUP_DIR`, `BACKUP_ACCEL_PREFIX` | CSV de e-mails que recebem alerta de falha |
| Segurança | `DJANGO_ADMIN_URL`, `PASSWORD_MIN_LENGTH` | `DJANGO_ADMIN_URL` move o Django Admin para um caminho não óbvio |

No frontend, apenas `VITE_API_BASE_URL` (e opcionalmente `VITE_APP_VERSION`, `VITE_BUILD_DATE`), lidas **em tempo de build**.

---

## Ambientes: Produção e Homologação

O sistema opera sobre **dois bancos no mesmo deploy**. A tela de login permite escolher entre *Produção* e *Homologação*, e a escolha é gravada como claim `env` no JWT.

Como funciona:

1. `middleware_env.py` lê a claim `env` do token e chama `set_db()` (`db_context.py`), gravando o alias em uma variável thread-local.
2. `EnvRouter` (`db_router.py`) roteia toda query do ORM para o alias ativo — `default` (prod) ou `hml`.
3. `BackupRecord` e `BackupConfig` são exceções: sempre usam `default`, para que o Celery e as duas interfaces enxerguem os mesmos registros.

O banco de homologação é criado no primeiro boot do Postgres por `docker/postgres-init/01_create_hml_db.sh`.

> **Atenção:** migrações precisam ser aplicadas **nos dois bancos**. O comando padrão atinge apenas o `default`; para o outro, use `--database=hml`.

---

## Perfis de acesso

Três papéis, definidos em `usuarios.PerfilUsuario`, com RBAC complementar por **roles × telas** (`Role`, `Screen`) — as telas liberadas viajam no JWT como `allowed_screens`.

| Perfil | Pode |
|---|---|
| **Operador** | Consultar catálogos, registrar pesagens, ver histórico e detalhes, gerar etiquetas |
| **Supervisor** | Tudo do Operador + criar/editar produtos, MPs, estruturas, balanças e OPs; editar pesagem **mediante motivo obrigatório** |
| **Administrador** | Tudo do Supervisor + gestão de usuários e RBAC, auditoria, relatórios administrativos, backup/restauração, bloqueio de conta e reset forçado de senha, Django Admin |

Segurança de conta (`LoginSecurity`): bloqueio, reset forçado, expiração e troca obrigatória de senha. A política de senha exige tamanho mínimo configurável e complexidade (maiúscula, minúscula, dígito e símbolo — `usuarios/validators.py`).

---

## Regras de negócio

| Regra | Comportamento |
|---|---|
| **Unidade** | O operador informa em **kg**; o sistema converte e armazena em **gramas** antes de qualquer validação |
| **Tolerância** | ±5% sobre a quantidade necessária do item (`TOLERANCIA_PERCENTUAL = 0.05`). Fora da faixa, a gravação é bloqueada |
| **Peso bruto** | `bruto = tara + liquido`, calculado **no backend**; o valor enviado pelo frontend é ignorado |
| **Coerência OP × Item** | O `ItemOP` deve pertencer à OP informada, senão a operação é rejeitada |
| **Validações** | Tara negativa, líquido ≤ 0 e lote de MP vazio são rejeitados |
| **Exclusão com vínculo** | Excluir produto, MP ou balança em uso retorna **HTTP 409** |
| **Calibração** | Apenas balanças com calibração vigente aparecem na seleção; o vencimento é calculado por `ultima_calibracao` + `frequencia_calibracao_dias` |
| **Edição de pesagem** | Restrita a Supervisor/Admin, com motivo obrigatório; estado antes e depois vai para a auditoria |

**Status da OP:** `ABERTA` (sem pesagens) → `EM_ANDAMENTO` (ao menos uma) → `CONCLUÍDA` (todos os itens atingiram o mínimo da tolerância). `CANCELADA` para OP sem itens.

---

## API

Base: `/api/`. Autenticação **JWT Bearer** em todas as rotas, exceto o login.

### Autenticação — `/api/usuarios/`

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `auth/login/?env=prod\|hml` | Emite access/refresh. O token carrega `env`, `allowed_screens`, `must_change_password` e `password_expired` |
| `POST` | `auth/refresh/` | Renova o access token |
| `GET` | `auth/me/` | Dados do usuário autenticado |
| `POST` | `auth/change-password/` | Troca de senha |
| `GET/POST` | `security/<pk>/`, `security/<pk>/unlock/`, `security/<pk>/force-reset/` | Segurança de conta (Admin) |

Recursos: `usuarios/`, `perfis/`, `screens/`, `roles/`.

### Domínio — `/api/registro/`

Recursos REST completos: `produtos/`, `materias-primas/`, `balancas/`, `estruturas/`, `itens-estrutura/`, `ops/`, `itens-op/`, `pesagens/`, `auditoria/` (somente leitura).

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `etiqueta/<pk>/` | PDF da etiqueta de pesagem (requer autenticação) |
| `POST` | `backups/execute/` | Dispara backup |
| `GET` | `backups/` | Lista backups |
| `GET` | `backups/<pk>/download/` | Download via `X-Accel-Redirect` |
| `POST` | `backups/<pk>/restore/` | Restaura backup |

### Relatórios — `/api/reports/`

`pesagens/`, `balancas/`, `produtos/`, `materias-primas/`, `estrutura/`, `usuarios/`, `permissoes/`, `auditoria/acoes/`, `auditoria/exclusoes/`, `auditoria/auth-erros/`, `auditoria/logs-sistema/`, `backups/`, `restores/`.

---

## Rotas do frontend

| Área | Rotas |
|---|---|
| Operação | `/` (dashboard), `/nova-pesagem`, `/historico`, `/pesagens/:id`, `/pesagens/:id/editar`, `/etiqueta/:id` |
| Ordens de produção | `/ops`, `/ops/nova` |
| Cadastros | `/cadastro-produto`, `/cadastro-materia-prima`, `/balancas`, `/estruturas`, `/estruturas/:id` |
| Administração | `/usuarios`, `/auditoria`, `/backups` |
| Relatórios | `/relatorios` e subrotas: `/pesagens`, `/balancas`, `/produtos`, `/mps`, `/estrutura`, `/usuarios`, `/permissoes`, `/auditoria/acoes`, `/auditoria/auth`, `/backups`, `/restores` |
| Conta | `/login`, `/perfil`, `/sobre` |

O acesso é filtrado pelas telas liberadas no JWT (`allowed_screens`).

---

## Etiquetas de pesagem

Geradas com **ReportLab** em `registro/views.py::gerar_etiqueta_pdf`, no formato **80 × 65 mm** (paisagem).

As dimensões ficam nas constantes `ETIQUETA_LARGURA_MM` e `ETIQUETA_ALTURA_MM`, no topo do módulo. A prévia em tela (`frontend/src/components/GeracaoEtiqueta.jsx`) espelha esses valores em `ETIQUETA_LARGURA` / `ETIQUETA_ALTURA` e define a regra `@page` usada pelo `window.print()`.

> Ao mudar o tamanho, **altere nos dois arquivos**. O layout se adapta por largura (a função `fit()` reduz a fonte até `sz_min`), mas o cabeçalho e o passo vertical `linha_h` são valores fixos que podem precisar de ajuste.

A etiqueta exibe uma faixa colorida com o ambiente ativo — azul para Produção, âmbar para Homologação.

---

## Auditoria

O middleware de auditoria registra em `AuditLog` cada ação com **usuário, IP, user-agent, rota, método, status HTTP, modelo afetado, PK, alterações (antes/depois) e criticidade**.

- Ativação: `AUDIT_ENABLED` no `.env`.
- IP real: obtido via `X-Forwarded-For` apenas quando a origem está em `TRUSTED_PROXIES`.
- Consulta: `/auditoria` na interface (Admin) ou `GET /api/registro/auditoria/` com filtros por ação, método, modelo, status, usuário, período e mais.
- Expurgo: `purge_audit` separa os logs por criticidade — **baixa** (`request`, `token_refresh`, `error`) com mínimo de 30 dias e **alta** (`create`, `update`, `delete`, `login`) com mínimo de 365 dias e padrão de 5 anos.

---

## Backup e restauração

Executados pelo Celery (`registro.auto_backup`) e configuráveis em `BackupConfig`:

- **Agendamento:** diário em horário fixo ou por intervalo de horas.
- **Retenção:** `retention_days` (padrão 30).
- **Destino:** `BACKUP_DIR` (`/var/backups/scale`), montado no volume `backups_volume`. Não há destino remoto — os arquivos ficam no host.
- **Download:** servido pelo Nginx via `X-Accel-Redirect` no bloco interno `/protected/backups/`, inacessível por URL direta.
- **Restauração:** exporta a auditoria antes de restaurar, preservando o histórico. Cada restauração é registrada em relatório durável, imune a novos restores.
- **Alertas:** falhas notificam os endereços em `BACKUP_ALERT_EMAILS`.

O backup depende do `postgresql-client` (`pg_dump`), já incluído na imagem do backend.

---

## Comandos de manutenção

```bash
docker compose exec backend python manage.py <comando>
```

| Comando | Função |
|---|---|
| `create_admin` | Cria o usuário administrador inicial |
| `seed_roles` | Popula os papéis e telas padrão do RBAC |
| `importar_produtos` | Importa produtos de planilha |
| `importar_mps` | Importa matérias-primas de planilha |
| `importar_tudo` | Importação completa |
| `import_oficiais` | Importa as bases oficiais |
| `inspecionar_planilha` | Inspeciona uma planilha antes de importar |
| `purge_audit` | Expurga auditoria **por criticidade** (ver abaixo) |

O expurgo de auditoria trata as duas faixas de criticidade separadamente:

```bash
# baixa (request / token_refresh / error): padrão 90 dias, mínimo 30
# alta  (create / update / delete / login): padrão 1825 dias (5 anos), mínimo 365
python manage.py purge_audit --dias-baixa 90 --dias-alta 1825
python manage.py purge_audit --dry-run     # simula, sem deletar
```

---

## Problemas conhecidos

### Banco novo não migra do zero

O histórico de migrações tem **grafos bifurcados** em que os dois ramos criam as mesmas tabelas:

- `registro`: `0009_auditlog → 0014_backupconfig` e `0009_backupconfig → 0018`, unidos pelo merge `0019`
- `usuarios`: os dois `0002_*`, unidos pelo `0006`

Deploys existentes não são afetados, porque o schema já foi criado historicamente. Mas **um banco vazio falha** com `relation "registro_auditlog" already exists`. Para destravar, aplique um ramo de verdade e marque o duplicado:

```bash
# banco vazio — usuarios primeiro (dependência de AUTH_USER_MODEL)
python manage.py migrate usuarios 0005_loginsecurity_last_password_change_and_more
python manage.py migrate usuarios 0002_role_screen_alter_perfilusuario_papel_loginsecurity_and_more --fake
python manage.py migrate registro 0018_backupconfig_default_enabled
python manage.py migrate registro 0014_backupconfig --fake
python manage.py migrate
```

Confirme o resultado com `python manage.py makemigrations --check --dry-run` — deve responder *No changes detected*.

### Volumes nascem com dono root

`static_volume`, `media_volume` e `backups_volume` são criados como `root`, enquanto o container roda como `appuser` (uid 100). No primeiro boot o `collectstatic` falha com `PermissionError: '/app/static/admin'`. Corrija uma vez:

```bash
docker run --rm \
  -v projeto-scale_static_volume:/s \
  -v projeto-scale_media_volume:/m \
  -v projeto-scale_backups_volume:/b \
  alpine chown -R 100:101 /s /m /b
```

### Init do Postgres não executa em checkout Windows

`docker/postgres-init/01_create_hml_db.sh` está com LF no repositório, mas o `core.autocrlf=true` do Git para Windows converte para CRLF no checkout, transformando o shebang em `/bin/bash\r`. O Postgres registra `cannot execute: required file not found` e o banco de homologação não é criado. Afeta **apenas ambientes Windows**. Soluções: adicionar um `.gitattributes` com `*.sh text eol=lf`, ou criar o banco manualmente.

### Migração das data migrations no banco HML

Migrações de dados (como `registro.0003_units_to_grams`) executam via ORM e passam pelo `EnvRouter`, que roteia para o banco do contexto — não para o alvo de `--database=hml`. Ao migrar o HML, defina o contexto antes:

```python
from registro.db_context import set_db
set_db('hml')
call_command('migrate', database='hml')
```

---

## Documentação relacionada

| Documento | Conteúdo |
|---|---|
| [`MANUAL_OPERACAO_E_ESPECIFICACOES.md`](MANUAL_OPERACAO_E_ESPECIFICACOES.md) | Manual de operação passo a passo por perfil e especificação técnica completa |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico de alterações (Keep a Changelog + SemVer) |
| [`TEST_REPORT.md`](TEST_REPORT.md) | Relatório de testes |
| [`docs/`](docs/) | Análises técnicas e notas de correção |
| [`CLAUDE.md`](CLAUDE.md) | Convenções do projeto e índice de skills para desenvolvimento assistido |

---

## Convenções

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/)
- **Branches:** `producao` é a branch de trabalho corrente; `main` é a branch principal
- **Versionamento:** Semantic Versioning
