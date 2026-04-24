# Changelog

Todas as alterações relevantes deste projeto serão documentadas aqui.  
Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)  
Versionamento: [Semantic Versioning](https://semver.org/lang/pt-BR/)

---

## [Unreleased]

### Security

- **[C-2]** `gerar_etiqueta_pdf` agora exige autenticação JWT via `@api_view(['GET'])` + `@permission_classes([IsAuthenticated])`. Antes, qualquer pessoa sem login podia acessar `GET /api/registro/etiqueta/<pk>/` e obter dados de pesagem por enumeração de PK. (`backend/registro/views.py`)
- **[C-3]** Restore de backup substituiu `subprocess.run(..., shell=True)` por pipeline `Popen` com lista de argumentos. As variáveis `host`, `port`, `user` e `name` não eram escapadas, permitindo injeção de comandos via `.env` comprometido. (`backend/registro/services/backup_db.py`)
- **[C-5]** Comando `purge_audit` agora impõe mínimo de 365 dias (`--days >= 365`) com `CommandError` explícito e registra o próprio purge como `AuditLog` antes de executar a deleção, garantindo rastreabilidade. (`backend/registro/management/commands/purge_audit.py`)
- **[C-9]** `react-router-dom` atualizado de `7.6.1` para `7.14.2`, corrigindo dois CVEs HIGH: `GHSA-2w69-qvjg-hvjx` (XSS via Open Redirect) e `GHSA-8v8x-cx79-35w7` (XSS em ScrollRestoration). (`frontend/package.json`)

### Fixed

- **[C-4]** Exportação de auditoria antes do restore usava `order_by("-created_at")` e `log.created_at`, campo inexistente no modelo `AuditLog` (campo correto: `timestamp`). O erro era silenciado por `except Exception`, fazendo o sistema exibir "backup de segurança criado" sem salvar nada. (`backend/registro/services/backup_db.py:154,166`)
- **[C-7]** `Pesagem._save_atomic()` agora chama `self.full_clean()` antes de persistir, invocando `Pesagem.clean()` que valida se a balança está dentro da calibração. Antes, a validação era ignorada pela API pois `model.save()` não chama `full_clean()` automaticamente. (`backend/registro/models.py`)
- **[C-10]** `PesagemDetalhe.jsx` reimplementava localmente toda a classe `ApiService` apontando para URL fixa de produção, ignorando `VITE_API_BASE_URL`. Substituída pela importação do serviço central `@/services/api`. (`frontend/src/components/PesagemDetalhe.jsx`)
- **[A-2]** `UserSecurityView` usava `IsAdminUser` (verifica `is_staff`) para operações de unlock/force-reset de senhas. Substituído por `IsAdmin` (verifica `perfil.papel == 'admin'`), alinhando com o modelo de permissões do projeto. (`backend/usuarios/views_security.py`)
- **[A-3/A-4]** `IsBackupAdmin` (baseada em `is_staff`) removida. Todas as views de backup — `BackupExecuteView`, `BackupListView` e `BackupRestoreView` — agora usam `IsAdmin`. `BackupListView` antes permitia qualquer usuário autenticado ver caminhos físicos dos backups. (`backend/registro/api/backups.py`)
- **[A-6]** `_before = {}` global nos signals de auditoria causava race condition: dois saves simultâneos da mesma instância em threads diferentes produziam diffs incorretos no `AuditLog`. Substituído por `threading.local()`. (`backend/registro/signals.py`)
- **[A-11]** `Backups.jsx` (reports): `const { data } = await api.get(...)` → `const data = await api.get(...)`. A tela de relatório de backups nunca exibia dados. (`frontend/src/pages/reports/Backups.jsx`)
- **[A-12]** `BackupCard.jsx` removido — componente não roteado em nenhum ponto da aplicação, duplicava lógica de `BackupConsole` com os mesmos bugs e referências a Axios. (`frontend/src/components/BackupCard.jsx`)
- **[A-13]** `LogsAuditoria.jsx` e `PesagemEditar.jsx` usavam `fetch` direto com token manual, bypassando o interceptor de refresh JWT do `api.js`. Token expirado resultava em silêncio ou tela travada. Substituídos por `api.get()`. 
- **[A-15]** `useApi.js`: sem cleanup no `useEffect`, `setState` era chamado em componentes já desmontados. Adicionada flag `cancelled` com função de cleanup `return () => { cancelled = true }`. (`frontend/src/hooks/useApi.js`)
- **[A-16]** `docker-compose.yml`: removido bind mount `./backend:/app` de `backend`, `worker` e `beat`. Containers agora usam o código imutável da imagem, não o diretório local.
- **[A-17]** `docker-compose.yml`: adicionado `healthcheck` com `pg_isready` no serviço `db` e `condition: service_healthy` no `depends_on` do `backend`, eliminando race condition no startup.
- **[A-18]** Redis: adicionado `requirepass` via variável `REDIS_PASSWORD` e volume `redis_data:/data` para persistência. `CELERY_BROKER_URL` e `CELERY_RESULT_BACKEND` atualizados em todos os serviços. **Ação necessária:** definir `REDIS_PASSWORD` no `.env` de produção.
- **[A-19]** `backend/Dockerfile`: criado usuário `appuser` (non-root) com `adduser --system`. Gunicorn, Celery worker e beat agora executam sem privilégios de root.

### Added

- **[A-5]** Rate limiting DRF: `AnonRateThrottle` (200/dia) + `UserRateThrottle` (2000/dia) como defaults globais. Endpoint de login (`TokenWithFlagsView`) usa `ScopedRateThrottle` com escopo `login` (5 tentativas/min). (`backend/conf/settings.py`, `backend/usuarios/auth.py`)
- **[A-14]** `Historico.jsx`: removida carga de 500+ pesagens para filtragem client-side. Agora usa filtros server-side via `PesagemFilter` (django-filters) com debounce de 400ms em campos de texto. Paginação controlada pelo backend (`count`/`results`). (`backend/registro/views.py`, `frontend/src/components/Historico.jsx`)
- **[M-12]** `ErrorBoundary` adicionado em `main.jsx` envolvendo toda a aplicação React. Qualquer erro JS não capturado exibe tela de erro amigável com botão de reload, em vez de tela branca total. (`frontend/src/components/ErrorBoundary.jsx`, `frontend/src/main.jsx`)
- **[M-21]** `LOGGING` agora ativo em todos os ambientes (WARNING para `django`, ERROR para `django.request`, WARNING para `django.security`). Quando `AUDIT_ENABLED=True`, adiciona handler de arquivo rotacionado e eleva `django.request` para INFO. (`backend/conf/settings.py`)

### Fixed (continuação)

- **[A-7]** `BackupExecuteView`: `run_full_backup()` (I/O de disco) não mais executa dentro de `transaction.atomic()`. Record criado com `status="running"` antes do I/O; atualizado com `update()` após conclusão. Elimina lock de transação durante operação longa. (`backend/registro/api/backups.py`)
- **[A-8]** `AuditoriaAcoesReportView`, `AuditoriaErrosLoginReportView`, `AuditoriaLogsSistemaReportView`: filtros de metadados substituíram iteração Python sobre todos os registros por `values_list().distinct()`, eliminando risco de OOM em tabelas grandes. (`backend/reports/views/auditoria.py`)
- **[A-9]** `auto_backup` (Celery task): adicionado `acks_late=True` (confirmação só após conclusão), `max_retries=3` e `default_retry_delay=300s`. Status inicial muda de `"success"` para `"running"`, evitando falso-positivo no registro. (`backend/registro/tasks.py`)
- **[M-3]** `PesagemViewSet.update()`: `save()` e `AuditLog.create()` agora envolvidos em `transaction.atomic()`, garantindo que pesagem editada sem log de auditoria seja impossível. (`backend/registro/views.py`)
- **[M-6]** `CELERY_ENABLE_UTC=True` + `CELERY_TIMEZONE="UTC"`: alinha Celery Beat com Django `USE_TZ=True`, eliminando inconsistência de timestamps nas tarefas agendadas. (`backend/conf/settings.py`)
- **[M-7]** `force_reset`: senha temporária agora enviada por e-mail (para o e-mail do usuário ou do admin como fallback) em vez de retornada no corpo da resposta HTTP, prevenindo exposição em logs de acesso e proxies. (`backend/usuarios/views_security.py`)

- **[B-2]** `usuarios/validators.py`: `get_help_text()` dizia "mínimo de 10 caracteres" enquanto `settings.py` define `MIN_PASSWORD_LENGTH = 8`. Corrigido para "8 caracteres". (`backend/usuarios/validators.py`)
- **[B-3]** `IsAdminOnly` (baseada em `is_staff`) era código morto em `registro/views.py` desde a migração para `IsAdmin`. Classe removida. (`backend/registro/views.py`)
- **[B-4]** `ReportShell.jsx`: `key={idx}` nas linhas da tabela substituído por `key={row?.id ?? idx}`, evitando re-renders desnecessários e warnings do React. (`frontend/src/pages/reports/components/ReportShell.jsx`)
- **[B-5]** `Login.jsx`: `escape()` + `decodeURIComponent()` para decodificar payload JWT estava usando API deprecated desde ES3. Substituído por `Uint8Array` + `TextDecoder`, suportando corretamente payloads UTF-8 com caracteres não-ASCII. (`frontend/src/components/Login.jsx`)
- **[M-1]** `Pesagem.item_op`: removido `null=True, blank=True`. Campo é obrigatório por design — não há pesagem sem item de OP. Migration `0017` reflete a constraint. (`backend/registro/models.py`, `backend/registro/migrations/0017_fix_pesagem_item_op_and_codigo_interno.py`)
- **[M-2]** `Pesagem.codigo_interno`: `default='TEMP'` substituído por `default='', blank=True`. O valor sentinela 'TEMP' poderia vazar para dados reais. Migration `0017` inclui esta alteração. (`backend/registro/models.py`)
- **[M-4]** `OP.gerar_itens_a_partir_da_estrutura()`: adicionada verificação de status (`CONCLUIDA`, `CANCELADA`) com `ValidationError` explícito. Antes, era possível recriar itens de OPs encerradas. (`backend/registro/models.py`)
- **[M-8]** `client_ip()`: substitui confiança cega no header `X-Forwarded-For` por verificação contra `TRUSTED_PROXIES` (variável de ambiente). IP do cliente falsificável externamente antes desta correção. (`backend/registro/utils/audit.py`)
- **[M-11]** `useMe.js`: `isAuthenticated` verificava apenas presença do token, não sua expiração. Agora decodifica o campo `exp` do JWT e compara com `Date.now()`, retornando `false` para tokens expirados. (`frontend/src/hooks/useMe.js`)
- **[M-13]** `RequireReportViewer` em `App.jsx`: adicionada verificação de presença do token antes de chamar `canViewReports()`. Sem token, redireciona para `/login`. (`frontend/src/App.jsx`)
- **[M-14]** `BackupConsole.jsx`: substituídos todos os 9 `alert()` por `toast.error/success/warning` (sonner) e o `window.confirm()` por `AlertDialog` (Radix UI). `handleRestore` migrado de raw `fetch()` para `api.restoreBackup()`, eliminando token manual e duplicação de URL. Removido `console.debug`. (`frontend/src/components/BackupConsole.jsx`, `frontend/src/services/api.js`)
- **[M-15]** `Pesagens.jsx`: dropdown de operadores não mais carrega até 5 páginas × 200 pesagens client-side. Substituído por chamada ao novo endpoint `/api/registro/pesagens/pesadores/` que retorna lista distinta server-side. (`frontend/src/pages/reports/Pesagens.jsx`, `frontend/src/services/api.js`, `backend/registro/views.py`)
- **[M-17]** Migration `0018`: cria `BackupConfig` com `enabled=True` via `get_or_create`. Após novo deploy, backup automático já fica ativo sem intervenção manual. (`backend/registro/migrations/0018_backupconfig_default_enabled.py`)
- **[M-20]** Download de backup agora registra `AuditLog` com `action="download"`, `model="BackupRecord"` e metadados (nome do arquivo, tamanho). Antes, não havia rastro de quem baixou o dump completo do banco. (`backend/registro/api/backup_download.py`)

- **[M-19]** `run_restore()`: adicionado `_cleanup_safety_backups()` chamado após restore bem-sucedido (PostgreSQL e SQLite). Mantém apenas os 5 últimos `safety_before_restore_*`; arquivos mais antigos são removidos automaticamente, evitando acúmulo ilimitado no disco. (`backend/registro/services/backup_db.py`)
- **[M-9]** URL do Django Admin agora lida da variável de ambiente `DJANGO_ADMIN_URL` (default: `admin/`). Em produção, definir como string aleatória para dificultar enumeração. (`backend/conf/urls.py`)
- **[M-10]** CORS no bloco `/protected/backups/` do Nginx: `$http_origin` (wildcard) substituído por origem fixa `https://scale.laboratoriosobral.com.br`. (`nginx/nginx.conf`)
- **[C-6]** `AUDIT_ENABLED` agora tem default `"true"`. Antes, sem `AUDIT_ENABLED=true` no `.env`, todos os signals de auditoria (`pre_save`/`post_save`) retornavam imediatamente sem gravar nada, criando falsa sensação de trilha de auditoria ativa. (`backend/conf/settings.py`)
- **[B-7]** `NovaPesagem.jsx`: `currentDateTime` envolto em `useMemo(() => ..., [])` — captura o instante do mount e não recalcula em cada re-render. (`frontend/src/components/NovaPesagem.jsx`)

### Pending (requer ação manual ou infraestrutura)

- **[C-1]** Credenciais reais (`DB_PASSWORD`, `EMAIL_HOST_PASSWORD`, `SECRET_KEY`) gravadas em commits históricos do `.env`. **Ação necessária:** revogar todas as credenciais, gerar nova `SECRET_KEY`, executar `git filter-repo --path .env --invert-paths` + force-push, adicionar `.env` ao `.gitignore`.
- **[C-8]** Nginx configurado apenas com `listen 80` (HTTP puro). **Ação necessária:** configurar terminação TLS (Let's Encrypt ou certificado próprio) ou documentar explicitamente que a terminação ocorre em proxy externo (Cloudflare) e garantir `SECURE_PROXY_SSL_HEADER` no Django.

---

## Referências

- Análise completa que originou estas correções: `docs/2026-04-23-analise-completa-do-projeto.md`
- Itens pendentes (🟡 Médios, 🟢 Baixos) documentados no relatório acima serão incorporados em entradas futuras.
