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
- **[C-10]** `PesagemDetalhe.jsx` reimplementava localmente toda a classe `ApiService` apontando para URL fixa de produção (`https://apiscale.laboratoriosobral.com.br/api`), ignorando `VITE_API_BASE_URL`. Substituída pela importação do serviço central `@/services/api`, que já expõe `getPesagem()` e `gerarEtiquetaPDF()`. (`frontend/src/components/PesagemDetalhe.jsx`)

### Pending (requer ação manual ou infraestrutura)

- **[C-1]** Credenciais reais (`DB_PASSWORD`, `EMAIL_HOST_PASSWORD`, `SECRET_KEY`) gravadas em commits históricos do `.env`. **Ação necessária:** revogar todas as credenciais, gerar nova `SECRET_KEY`, executar `git filter-repo --path .env --invert-paths` + force-push, adicionar `.env` ao `.gitignore`.
- **[C-8]** Nginx configurado apenas com `listen 80` (HTTP puro). **Ação necessária:** configurar terminação TLS (Let's Encrypt ou certificado próprio) ou documentar explicitamente que a terminação ocorre em proxy externo (Cloudflare) e garantir `SECURE_PROXY_SSL_HEADER` no Django.

---

## Referências

- Análise completa que originou estas correções: `docs/2026-04-23-analise-completa-do-projeto.md`
- Itens ainda pendentes (🟠 Altos, 🟡 Médios, 🟢 Baixos) estão documentados no relatório acima e serão incorporados em entradas futuras deste changelog.
