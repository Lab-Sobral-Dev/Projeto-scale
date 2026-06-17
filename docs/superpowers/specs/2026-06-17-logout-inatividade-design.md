# Logout por inatividade (10 min) — Design

**Data:** 2026-06-17
**Status:** Aprovado

## Objetivo

Desconectar o usuário após 10 minutos de inatividade na área autenticada e, ao
redirecioná-lo para o login, exibir a mensagem "Você foi desconectado por
inatividade. Faça login novamente."

## Decisões

- **Critério:** inatividade (não tempo fixo de sessão). Qualquer interação do
  usuário reinicia a contagem de 10 min.
- **Aviso prévio:** nenhum. Ao atingir o limite, desconecta direto.
- **Backend:** inalterado. `ACCESS_TOKEN_LIFETIME` permanece 60 min; a expiração
  por inatividade é responsabilidade do frontend.

## Estado atual

- Não existe logout por inatividade hoje.
- A sessão só cai quando o token JWT expira e o refresh falha
  (`RequireAuth.jsx`), setando `sessionStorage['session_expired']`.
- `Login.jsx:35` exibe "Seção expirada. Faça login novamente." (com typo em
  "Seção").
- `Layout.jsx` é a casca única da área autenticada e recebe `onLogout`
  (`App.jsx:83`), que limpa o `localStorage` e o estado `user` — sem navegar
  nem exibir mensagem.

## Arquitetura

### 1. Hook `frontend/src/hooks/useIdleLogout.js`

- Assinatura: `useIdleLogout({ timeoutMs = IDLE_TIMEOUT_MS, onIdle })`.
- Constante `IDLE_TIMEOUT_MS = 10 * 60 * 1000`.
- Escuta eventos de atividade na `window`: `mousemove`, `mousedown`,
  `keydown`, `scroll`, `touchstart`, `click`.
- Reset do timer com *throttle* (~1s) para não reagendar a cada movimento de
  mouse.
- Um único `setTimeout`; reiniciado a cada atividade. Ao expirar, chama
  `onIdle()`.
- Cleanup de listeners e timer no unmount.
- Escopo por aba (sem sincronização cross-tab — YAGNI).

### 2. Montagem em `Layout.jsx`

- Usa o hook. No `onIdle`:
  1. `sessionStorage.setItem('inactivity_logout', '1')` (com try/catch).
  2. `onLogout()` — reaproveita a limpeza de sessão existente.
  3. `navigate('/login', { replace: true })`.

### 3. `Login.jsx`

- Lê a flag `inactivity_logout` (além da `session_expired` existente).
- Se `inactivity_logout === '1'`: mensagem "Você foi desconectado por
  inatividade. Faça login novamente." e remove a flag.
- Corrige o typo da mensagem existente: "Seção expirada" → "Sessão expirada".

## Fluxo

```
atividade do usuário ─► reinicia timer
sem atividade por 10 min ─► onIdle ─► flag inactivity_logout + onLogout() + navigate('/login')
tela de login ─► lê flag ─► exibe mensagem + remove flag
```

## Tratamento de erro

- `try/catch` em torno de `sessionStorage`, espelhando o padrão de `api.js`
  (`_flagSessionExpired`).
- Cleanup garantido do timer e listeners no unmount do `Layout`.

## Testes

Framework de testes do frontend não definido no projeto
(`[FRAMEWORK DE TESTES]` no CLAUDE.md). Verificação manual:

1. Logar e ficar 10 min sem interagir → confirma redirect para `/login` com a
   mensagem de inatividade.
2. Interagir antes dos 10 min → confirma que a contagem reinicia e não
   desconecta.

## Fora de escopo

- Modal de aviso/contagem regressiva antes do logout.
- Alteração do `ACCESS_TOKEN_LIFETIME` no backend.
- Sincronização de inatividade entre abas.
