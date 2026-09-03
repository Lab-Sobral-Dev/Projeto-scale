# Integração das Balanças — Plano 3: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a digitação manual de Tara e Peso Líquido por captura sob demanda da leitura da balança, mantendo os campos sempre editáveis, e expor os campos de conexão no cadastro e o status no relatório.

**Architecture:** Um hook faz polling de `GET /registro/balancas/{id}/leitura-atual/` a 1 Hz enquanto uma balança está selecionada e a aba está visível; um painel mostra o peso ao vivo e oferece dois botões de captura, habilitados só quando a leitura está estável. Se o agente não responder, o painel cai para modo manual e a tela se comporta exatamente como a produção de hoje.

**Tech Stack:** React 19, Vite, Tailwind 4, Radix UI, Vitest + Testing Library (novo)

**Spec:** `docs/superpowers/specs/2026-09-03-integracao-balancas-design.md`

**Depende de:** Plano 1 (endpoint `balanca-leitura-atual` e campos novos em `Balanca`). A Task 1 não depende de nada.

## Global Constraints

- **Os inputs de Tara e Peso Líquido são SEMPRE editáveis.** Exigência da ERU, e caminho normal para balança fora do parque configurado. Nenhum estado do painel pode desabilitá-los.
- **Auto-preenchimento acontece apenas por clique explícito.** Preencher continuamente sobrescreveria o que o operador estivesse digitando, tecla por tecla.
- **Nenhum caminho de falha bloqueia a pesagem.** Agente morto, Redis fora, rede oscilando: a tela volta a ser dois inputs manuais.
- **Chip de status usa texto + ícone, nunca cor sozinha** (acessibilidade).
- **Peso vem da API como string** e é convertido para exibição/captura com as `casas_decimais` da balança. Nunca reinterpretar como float antes de arredondar.
- **`NovaPesagem.jsx` não é refatorado.** Já tem 903 linhas; ele só recebe o painel e duas linhas no `previewData`.
- Reaproveitar os helpers locais que já existem no `NovaPesagem.jsx`: `normalizeDecimalInput`, `formatNumberWithComma`, `toNumber`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/vitest.config.js` *(criar)* | Configuração do runner |
| `frontend/src/test/setup.js` *(criar)* | Setup do Testing Library |
| `frontend/src/services/api.js` *(modificar)* | Método `getLeituraBalanca(id)` |
| `frontend/src/hooks/useLeituraBalanca.js` *(criar)* | Polling, pausa, backoff, timeout→manual |
| `frontend/src/components/PainelLeituraBalanca.jsx` *(criar)* | Peso ao vivo, chip de status, dois botões |
| `frontend/src/components/NovaPesagem.jsx` *(modificar)* | Inserir painel, receber capturas, procedência no modal |
| `frontend/src/components/CadastroBalanca.jsx` *(modificar)* | Campos de conexão e vínculo com agente |
| `frontend/src/pages/reports/Balancas.jsx` *(modificar)* | Coluna de status de conexão |

---

## Task 1: Vitest e Testing Library

**Files:**
- Create: `frontend/vitest.config.js`, `frontend/src/test/setup.js`, `frontend/src/test/smoke.test.jsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: nada
- Produces: scripts `npm test` e `npm run test:run`; alias `@` funcionando nos testes

O frontend não tem runner hoje. O `useLeituraBalanca` tem lógica de verdade — o fallback por timeout é justamente o caminho de contingência exigido pela ERU — e testá-lo à mão em cada release não se sustenta.

- [ ] **Step 1: Install the dependencies**

Run:
```bash
cd frontend
npm install -D vitest@^2.1.8 jsdom@^25.0.1 \
  @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 \
  @testing-library/user-event@^14.5.2
```

- [ ] **Step 2: Write the config**

```js
// frontend/vitest.config.js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
```

```js
// frontend/src/test/setup.js
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.restoreAllMocks()
})
```

Em `frontend/package.json`, adicione aos `scripts`:

```json
    "test": "vitest",
    "test:run": "vitest run"
```

> Se o projeto não tiver `@vitejs/plugin-react` nas devDependencies, confira `vite.config.js`: se ele usa outro plugin de React (ex.: `@vitejs/plugin-react-swc`), use o mesmo aqui em vez de instalar um segundo.

- [ ] **Step 3: Write the smoke test**

```jsx
// frontend/src/test/smoke.test.jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { cn } from '@/lib/utils'

describe('setup do Vitest', () => {
  it('renderiza JSX', () => {
    render(<p>ok</p>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('resolve o alias @', () => {
    expect(cn('a', 'b')).toContain('a')
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test:run`
Expected: 2 testes PASS. Se o alias falhar, o `resolve.alias` do `vitest.config.js` não está apontando para `./src`.

- [ ] **Step 5: Commit**

```bash
git add frontend/vitest.config.js frontend/src/test/ frontend/package.json frontend/package-lock.json
git commit -m "test(frontend): configura Vitest e Testing Library"
```

---

## Task 2: Cliente da API e hook `useLeituraBalanca`

**Files:**
- Modify: `frontend/src/services/api.js` (junto ao bloco de Balanças, `:350-372`)
- Create: `frontend/src/hooks/useLeituraBalanca.js`
- Create: `frontend/src/hooks/useLeituraBalanca.test.jsx`

**Interfaces:**
- Consumes: `GET /registro/balancas/{id}/leitura-atual/` (Plano 1, Task 8)
- Produces:
  - `api.getLeituraBalanca(id)` → `{ status, peso_kg, estavel, idade_ms }`
  - `useLeituraBalanca(balancaId)` → `{ pesoKg, estavel, status, idadeMs, modo }`
  - `modo` ∈ `'automatico' | 'manual'`; `status` ∈ `'online' | 'offline' | 'erro_leitura' | 'aguardando'`
  - Constantes exportadas: `INTERVALO_MS = 1000`, `TIMEOUT_INICIAL_MS = 3000`, `INTERVALO_OFFLINE_MS = 5000`, `TENTATIVAS_ATE_BACKOFF = 3`

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/hooks/useLeituraBalanca.test.jsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import {
  INTERVALO_MS,
  INTERVALO_OFFLINE_MS,
  TENTATIVAS_ATE_BACKOFF,
  TIMEOUT_INICIAL_MS,
  useLeituraBalanca,
} from '@/hooks/useLeituraBalanca'

const ONLINE_ESTAVEL = { status: 'online', peso_kg: '12.485', estavel: true, idade_ms: 120 }

describe('useLeituraBalanca', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('não chama a API quando nenhuma balança está selecionada', () => {
    const spy = vi.spyOn(api, 'getLeituraBalanca')
    const { result } = renderHook(() => useLeituraBalanca(''))

    expect(spy).not.toHaveBeenCalled()
    expect(result.current.modo).toBe('manual')
    expect(result.current.status).toBe('aguardando')
  })

  it('expõe a leitura estável em modo automático', async () => {
    vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue(ONLINE_ESTAVEL)
    const { result } = renderHook(() => useLeituraBalanca('12'))

    await waitFor(() => expect(result.current.status).toBe('online'))
    expect(result.current.pesoKg).toBe('12.485')
    expect(result.current.estavel).toBe(true)
    expect(result.current.modo).toBe('automatico')
    expect(result.current.idadeMs).toBe(120)
  })

  it('mantém o peso como string, sem passar por float', async () => {
    vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue({
      ...ONLINE_ESTAVEL, peso_kg: '0.100000',
    })
    const { result } = renderHook(() => useLeituraBalanca('12'))

    await waitFor(() => expect(result.current.pesoKg).toBe('0.100000'))
    expect(typeof result.current.pesoKg).toBe('string')
  })

  it('faz polling no intervalo configurado', async () => {
    const spy = vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue(ONLINE_ESTAVEL)
    renderHook(() => useLeituraBalanca('12'))

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS) })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('cai para modo manual quando a API não responde no timeout inicial', async () => {
    vi.spyOn(api, 'getLeituraBalanca').mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useLeituraBalanca('12'))

    await act(async () => { await vi.advanceTimersByTimeAsync(TIMEOUT_INICIAL_MS + 50) })

    expect(result.current.modo).toBe('manual')
    expect(result.current.estavel).toBe(false)
  })

  it('cai para modo manual quando a API devolve erro', async () => {
    vi.spyOn(api, 'getLeituraBalanca').mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useLeituraBalanca('12'))

    await waitFor(() => expect(result.current.modo).toBe('manual'))
  })

  it('reflete erro_leitura sem virar modo manual', async () => {
    vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue({
      status: 'erro_leitura', peso_kg: null, estavel: false, idade_ms: null,
    })
    const { result } = renderHook(() => useLeituraBalanca('12'))

    await waitFor(() => expect(result.current.status).toBe('erro_leitura'))
    expect(result.current.modo).toBe('automatico')
    expect(result.current.pesoKg).toBeNull()
    expect(result.current.estavel).toBe(false)
  })

  it('desacelera o polling depois de N respostas offline', async () => {
    const spy = vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue({
      status: 'offline', peso_kg: null, estavel: false, idade_ms: null,
    })
    renderHook(() => useLeituraBalanca('12'))

    for (let i = 0; i < TENTATIVAS_ATE_BACKOFF; i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS) })
    }
    const chamadasAntes = spy.mock.calls.length

    // No intervalo rápido não deve haver nova chamada: já está em backoff.
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS) })
    expect(spy.mock.calls.length).toBe(chamadasAntes)

    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_OFFLINE_MS) })
    expect(spy.mock.calls.length).toBeGreaterThan(chamadasAntes)
  })

  it('pausa o polling quando a aba fica oculta', async () => {
    const spy = vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue(ONLINE_ESTAVEL)
    renderHook(() => useLeituraBalanca('12'))

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    const chamadas = spy.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3) })
    expect(spy.mock.calls.length).toBe(chamadas)
  })

  it('para de chamar a API ao desmontar', async () => {
    const spy = vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue(ONLINE_ESTAVEL)
    const { unmount } = renderHook(() => useLeituraBalanca('12'))

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    unmount()

    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3) })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('reinicia o estado ao trocar de balança', async () => {
    const spy = vi.spyOn(api, 'getLeituraBalanca').mockResolvedValue(ONLINE_ESTAVEL)
    const { result, rerender } = renderHook(({ id }) => useLeituraBalanca(id), {
      initialProps: { id: '12' },
    })

    await waitFor(() => expect(result.current.pesoKg).toBe('12.485'))

    spy.mockResolvedValue({ ...ONLINE_ESTAVEL, peso_kg: '0.500' })
    rerender({ id: '13' })

    await waitFor(() => expect(result.current.pesoKg).toBe('0.500'))
    expect(spy).toHaveBeenLastCalledWith('13')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/hooks/useLeituraBalanca.test.jsx`
Expected: FAIL — não resolve `@/hooks/useLeituraBalanca`

- [ ] **Step 3: Add the API method**

Em `frontend/src/services/api.js`, no bloco de Balanças (após `getBalancas`, `:351-353`):

```js
  // Leitura atual da balança, alimentada pelo agente local via Redis.
  // Chamado em polling (~1 Hz) enquanto a tela de pesagem está aberta.
  async getLeituraBalanca(id) {
    return this.request(`${this.baseRegistro}/balancas/${id}/leitura-atual/`);
  },
```

> Confirme se os métodos do `ApiService` são declarados como métodos de classe (`async getBalancas(...) {}`) e siga exatamente essa forma — o trecho acima usa vírgula de objeto literal, que só vale se o arquivo declarar os métodos assim.

- [ ] **Step 4: Write the hook**

```js
// frontend/src/hooks/useLeituraBalanca.js
import { useCallback, useEffect, useRef, useState } from 'react'

import api from '@/services/api'

export const INTERVALO_MS = 1000
export const TIMEOUT_INICIAL_MS = 3000
export const INTERVALO_OFFLINE_MS = 5000
export const TENTATIVAS_ATE_BACKOFF = 3

const ESTADO_INICIAL = {
  pesoKg: null,
  estavel: false,
  status: 'aguardando',
  idadeMs: null,
  modo: 'manual',
}

/**
 * Faz polling da leitura atual da balança selecionada.
 *
 * Contingência (requisito da ERU): se o agente não responder dentro de
 * TIMEOUT_INICIAL_MS, ou se a API falhar, `modo` volta a 'manual' e a tela
 * segue operando com digitação — sem bloquear a pesagem.
 *
 * Economia de requisições: pausa quando a aba está oculta e desacelera para
 * INTERVALO_OFFLINE_MS depois de TENTATIVAS_ATE_BACKOFF respostas offline.
 */
export function useLeituraBalanca(balancaId) {
  const [leitura, setLeitura] = useState(ESTADO_INICIAL)

  const timerRef = useRef(null)
  const timeoutInicialRef = useRef(null)
  const offlinesRef = useRef(0)
  const ativoRef = useRef(false)

  const limparTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (timeoutInicialRef.current) clearTimeout(timeoutInicialRef.current)
    timerRef.current = null
    timeoutInicialRef.current = null
  }, [])

  useEffect(() => {
    limparTimers()
    offlinesRef.current = 0

    if (!balancaId) {
      ativoRef.current = false
      setLeitura(ESTADO_INICIAL)
      return undefined
    }

    ativoRef.current = true
    setLeitura(ESTADO_INICIAL)

    // Se o agente não responder nada nos primeiros segundos, assume que não
    // existe agente nesta estação e libera a tela para o modo manual.
    timeoutInicialRef.current = setTimeout(() => {
      if (!ativoRef.current) return
      setLeitura((atual) =>
        atual.status === 'aguardando' ? { ...ESTADO_INICIAL, modo: 'manual' } : atual
      )
    }, TIMEOUT_INICIAL_MS)

    const agendar = (atraso) => {
      if (!ativoRef.current) return
      timerRef.current = setTimeout(consultar, atraso)
    }

    async function consultar() {
      if (!ativoRef.current) return

      if (document.hidden) {
        agendar(INTERVALO_MS)
        return
      }

      try {
        const dados = await api.getLeituraBalanca(balancaId)
        if (!ativoRef.current) return

        if (timeoutInicialRef.current) {
          clearTimeout(timeoutInicialRef.current)
          timeoutInicialRef.current = null
        }

        offlinesRef.current = dados.status === 'offline' ? offlinesRef.current + 1 : 0

        setLeitura({
          pesoKg: dados.peso_kg ?? null,
          estavel: Boolean(dados.estavel),
          status: dados.status,
          idadeMs: dados.idade_ms ?? null,
          modo: 'automatico',
        })

        agendar(
          offlinesRef.current >= TENTATIVAS_ATE_BACKOFF ? INTERVALO_OFFLINE_MS : INTERVALO_MS
        )
      } catch {
        if (!ativoRef.current) return
        // Erro de rede ou 5xx: não é papel desta tela resolver. Cai para
        // manual e segue tentando devagar.
        setLeitura({ ...ESTADO_INICIAL, modo: 'manual' })
        agendar(INTERVALO_OFFLINE_MS)
      }
    }

    consultar()

    const aoMudarVisibilidade = () => {
      if (!document.hidden && ativoRef.current && !timerRef.current) consultar()
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade)

    return () => {
      ativoRef.current = false
      limparTimers()
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [balancaId, limparTimers])

  return leitura
}

export default useLeituraBalanca
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/hooks/useLeituraBalanca.test.jsx`
Expected: 11 testes PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/api.js frontend/src/hooks/
git commit -m "feat(pesagem): hook de leitura ao vivo da balanca com fallback manual"
```

---

## Task 3: `PainelLeituraBalanca`

**Files:**
- Create: `frontend/src/components/PainelLeituraBalanca.jsx`
- Create: `frontend/src/components/PainelLeituraBalanca.test.jsx`

**Interfaces:**
- Consumes: nada (recebe tudo por props — mantém o componente puro e testável sem rede)
- Produces:
  ```
  <PainelLeituraBalanca
    pesoKg={string|null} estavel={bool} status={string} modo={string}
    casasDecimais={number} onCapturarTara={fn} onCapturarLiquido={fn} />
  ```
  Callbacks recebem o peso já arredondado, como **string** pt-BR compatível com os inputs.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/PainelLeituraBalanca.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import PainelLeituraBalanca from '@/components/PainelLeituraBalanca'

function montar(props = {}) {
  const onCapturarTara = vi.fn()
  const onCapturarLiquido = vi.fn()
  render(
    <PainelLeituraBalanca
      pesoKg="12.485"
      estavel
      status="online"
      modo="automatico"
      casasDecimais={2}
      onCapturarTara={onCapturarTara}
      onCapturarLiquido={onCapturarLiquido}
      {...props}
    />
  )
  return { onCapturarTara, onCapturarLiquido }
}

describe('PainelLeituraBalanca', () => {
  it('não renderiza nada em modo manual', () => {
    const { container } = render(
      <PainelLeituraBalanca
        pesoKg={null} estavel={false} status="aguardando" modo="manual"
        casasDecimais={2} onCapturarTara={vi.fn()} onCapturarLiquido={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('exibe o peso arredondado nas casas decimais da balança', () => {
    montar({ pesoKg: '12.48533', casasDecimais: 2 })
    expect(screen.getByText(/12,49/)).toBeInTheDocument()
  })

  it('exibe cinco casas para a balança analítica', () => {
    montar({ pesoKg: '0.123454', casasDecimais: 5 })
    expect(screen.getByText(/0,12345/)).toBeInTheDocument()
  })

  it('habilita os dois botões quando a leitura está estável', () => {
    montar()
    expect(screen.getByRole('button', { name: /capturar tara/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /capturar líquido/i })).toBeEnabled()
  })

  it('captura a tara com o valor arredondado como string', async () => {
    const { onCapturarTara } = montar({ pesoKg: '0.499996', casasDecimais: 2 })

    await userEvent.click(screen.getByRole('button', { name: /capturar tara/i }))

    expect(onCapturarTara).toHaveBeenCalledWith('0,50')
  })

  it('captura o líquido com o valor arredondado', async () => {
    const { onCapturarLiquido } = montar({ pesoKg: '12.485111', casasDecimais: 3 })

    await userEvent.click(screen.getByRole('button', { name: /capturar líquido/i }))

    expect(onCapturarLiquido).toHaveBeenCalledWith('12,485')
  })

  it('desabilita os botões e explica o motivo quando instável', () => {
    montar({ estavel: false })

    expect(screen.getByRole('button', { name: /capturar tara/i })).toBeDisabled()
    expect(screen.getByText(/aguardando estabilizar/i)).toBeInTheDocument()
  })

  it('mostra motivo de erro de leitura e desabilita a captura', () => {
    montar({ status: 'erro_leitura', estavel: false, pesoKg: null })

    expect(screen.getByRole('button', { name: /capturar tara/i })).toBeDisabled()
    expect(screen.getByText(/erro de leitura/i)).toBeInTheDocument()
  })

  it('oculta os botões quando o agente está offline', () => {
    montar({ status: 'offline', estavel: false, pesoKg: null })

    expect(screen.queryByRole('button', { name: /capturar tara/i })).not.toBeInTheDocument()
    expect(screen.getByText(/sem comunica/i)).toBeInTheDocument()
  })

  it('o status é comunicado por texto, não apenas por cor', () => {
    montar({ status: 'online', estavel: true })
    expect(screen.getByText(/estável/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/components/PainelLeituraBalanca.test.jsx`
Expected: FAIL — não resolve `@/components/PainelLeituraBalanca`

- [ ] **Step 3: Write the component**

```jsx
// frontend/src/components/PainelLeituraBalanca.jsx
import { AlertTriangle, CheckCircle2, Loader2, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Peso ao vivo da balança selecionada, com captura sob demanda.
 *
 * Os dois botões são a razão de o auto-preenchimento não sobrescrever a
 * digitação do operador: o valor só entra no formulário por clique explícito.
 *
 * Este painel nunca desabilita os inputs de Tara/Líquido do formulário —
 * a ERU exige que permaneçam editáveis em qualquer estado.
 */

// Arredonda a string vinda da API e devolve no formato dos inputs (vírgula).
function formatarParaInput(pesoKg, casasDecimais) {
  if (pesoKg === null || pesoKg === undefined || pesoKg === '') return null
  const numero = Number(pesoKg)
  if (!Number.isFinite(numero)) return null
  return numero.toFixed(casasDecimais).replace('.', ',')
}

const ESTADOS = {
  online_estavel: {
    Icone: CheckCircle2,
    rotulo: 'Conectada — leitura estável',
    classe: 'text-emerald-700',
    mostrarBotoes: true,
  },
  online_instavel: {
    Icone: Loader2,
    rotulo: 'Conectada — aguardando estabilizar',
    classe: 'text-amber-700',
    mostrarBotoes: true,
  },
  erro_leitura: {
    Icone: AlertTriangle,
    rotulo: 'Erro de leitura — verifique a balança',
    classe: 'text-red-700',
    mostrarBotoes: true,
  },
  offline: {
    Icone: WifiOff,
    rotulo: 'Sem comunicação com a balança — informe os pesos manualmente',
    classe: 'text-slate-600',
    mostrarBotoes: false,
  },
}

function resolverEstado(status, estavel) {
  if (status === 'erro_leitura') return ESTADOS.erro_leitura
  if (status === 'online') return estavel ? ESTADOS.online_estavel : ESTADOS.online_instavel
  return ESTADOS.offline
}

export default function PainelLeituraBalanca({
  pesoKg,
  estavel,
  status,
  modo,
  casasDecimais,
  onCapturarTara,
  onCapturarLiquido,
}) {
  // Sem agente na estação: a tela volta a ser a de sempre, sem ruído visual.
  if (modo !== 'automatico') return null

  const estado = resolverEstado(status, estavel)
  const { Icone } = estado
  const valorFormatado = formatarParaInput(pesoKg, casasDecimais)
  const podeCapturar = status === 'online' && estavel && valorFormatado !== null

  return (
    <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Leitura da balança</span>
        <span
          className={cn('flex items-center gap-1.5 text-sm', estado.classe)}
          role="status"
          aria-live="polite"
        >
          {/* Ícone é reforço: o estado é comunicado pelo texto ao lado. */}
          <Icone className="h-4 w-4" aria-hidden="true" />
          {estado.rotulo}
        </span>
      </div>

      <div className="text-3xl font-bold tabular-nums text-slate-900">
        {valorFormatado !== null ? `${valorFormatado} kg` : '—'}
      </div>

      {estado.mostrarBotoes && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!podeCapturar}
            onClick={() => onCapturarTara(valorFormatado)}
          >
            Capturar Tara
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!podeCapturar}
            onClick={() => onCapturarLiquido(valorFormatado)}
          >
            Capturar Líquido
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/components/PainelLeituraBalanca.test.jsx`
Expected: 11 testes PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PainelLeituraBalanca.jsx \
        frontend/src/components/PainelLeituraBalanca.test.jsx
git commit -m "feat(pesagem): painel de leitura ao vivo com captura de tara e liquido"
```

---

## Task 4: Integração no `NovaPesagem.jsx`

**Files:**
- Modify: `frontend/src/components/NovaPesagem.jsx` (imports `:3-25`; render `:697-723`; `previewData` `:398-408`)
- Create: `frontend/src/components/NovaPesagem.captura.test.jsx`

**Interfaces:**
- Consumes: `useLeituraBalanca` (Task 2), `PainelLeituraBalanca` (Task 3)
- Produces: nada consumido por outras tasks

- [ ] **Step 1: Write the failing test**

Este teste exercita apenas a fatia de captura, sem montar o formulário inteiro (que depende de OP, itens e catálogos).

```jsx
// frontend/src/components/NovaPesagem.captura.test.jsx
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useState } from 'react'

/**
 * Testa o contrato entre o painel e o formulário: capturar escreve no campo,
 * marca-o como capturado, e editar à mão limpa a marcação.
 *
 * A lógica vive no NovaPesagem; aqui ela é reproduzida no mesmo formato para
 * travar o comportamento esperado. Se divergir do componente, o teste falha
 * na revisão manual do Step 5.
 */
function useCampoCapturavel() {
  const [valor, setValor] = useState('')
  const [capturado, setCapturado] = useState(false)

  return {
    valor,
    capturado,
    capturar: (v) => { setValor(v); setCapturado(true) },
    editar: (v) => { setValor(v); setCapturado(false) },
  }
}

describe('captura de peso no formulário', () => {
  it('capturar preenche o campo e marca como capturado', () => {
    const { result } = renderHook(() => useCampoCapturavel())

    act(() => result.current.capturar('0,50'))

    expect(result.current.valor).toBe('0,50')
    expect(result.current.capturado).toBe(true)
  })

  it('editar manualmente limpa a marcação de capturado', () => {
    const { result } = renderHook(() => useCampoCapturavel())

    act(() => result.current.capturar('0,50'))
    act(() => result.current.editar('0,55'))

    expect(result.current.valor).toBe('0,55')
    expect(result.current.capturado).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/components/NovaPesagem.captura.test.jsx`
Expected: 2 testes PASS (o teste trava o contrato; a integração real é verificada no Step 5)

- [ ] **Step 3: Wire the hook and the panel**

Em `frontend/src/components/NovaPesagem.jsx`:

**a)** Adicione os imports, junto aos existentes (`:24`):

```jsx
import PainelLeituraBalanca from '@/components/PainelLeituraBalanca'
import useLeituraBalanca from '@/hooks/useLeituraBalanca'
```

**b)** Adicione o estado de marcação, junto aos outros `useState` (após `:131`):

```jsx
  // Quais campos vieram de captura. Some quando o operador edita à mão —
  // é a contraparte visual de Pesagem.origem_peso.
  const [capturados, setCapturados] = useState({ tara: false, liquido: false })
```

**c)** Chame o hook após `balancaSelecionada` e `casasDecimais` estarem definidos (após `:223`):

```jsx
  const leitura = useLeituraBalanca(formData.balanca)

  const capturarEm = (campo) => (valorFormatado) => {
    setFormData(prev => ({
      ...prev,
      [campo]: normalizeDecimalInput(valorFormatado, casasDecimais),
    }))
    setCapturados(prev => ({ ...prev, [campo]: true }))
  }
```

**d)** Faça os `onChange` dos dois inputs limparem a marcação. Substitua o `onChange` da Tara (`:730`):

```jsx
                  onChange={(e) => {
                    handleChange('tara', normalizeDecimalInput(e.target.value, casasDecimais))
                    setCapturados(prev => ({ ...prev, tara: false }))
                  }}
```

E o do Líquido (`:743`):

```jsx
                  onChange={(e) => {
                    handleChange('liquido', normalizeDecimalInput(e.target.value, casasDecimais))
                    setCapturados(prev => ({ ...prev, liquido: false }))
                  }}
```

**e)** Insira o painel entre o bloco do Select de Balança e o de Tara (após o `</div>` que fecha o bloco da Balança, `:721`):

```jsx
              {/* Leitura ao vivo — só aparece quando há agente na estação */}
              {formData.balanca && (
                <div className="md:col-span-2">
                  <PainelLeituraBalanca
                    pesoKg={leitura.pesoKg}
                    estavel={leitura.estavel}
                    status={leitura.status}
                    modo={leitura.modo}
                    casasDecimais={casasDecimais}
                    onCapturarTara={capturarEm('tara')}
                    onCapturarLiquido={capturarEm('liquido')}
                  />
                </div>
              )}
```

> Confira se o container é um `grid` de 2 colunas em `md`. Se for de 1 coluna, remova o `md:col-span-2`.

**f)** Adicione a marcação visual ao lado de cada label. Junto ao `<RequiredLabel htmlFor="tara">` (`:724`):

```jsx
                <div className="flex items-center gap-2">
                  <RequiredLabel htmlFor="tara">Tara (kg)</RequiredLabel>
                  {capturados.tara && (
                    <span className="text-xs text-emerald-700">capturado da balança</span>
                  )}
                </div>
```

Faça o equivalente para o Líquido (`:736`).

**g)** Adicione a procedência ao `previewData` (após `liquidoKg`, `:407`):

```jsx
      origemPeso:
        capturados.tara && capturados.liquido ? 'Capturado automaticamente da balança'
        : capturados.tara || capturados.liquido ? 'Capturado da balança e ajustado manualmente'
        : 'Digitado manualmente',
```

E renderize essa linha no modal de confirmação, junto às demais linhas de `previewData` — o operador precisa confirmar sabendo a origem do valor.

**h)** Limpe a marcação junto com os campos, no reset após salvar (`:376-378`):

```jsx
      setCapturados({ tara: false, liquido: false })
```

- [ ] **Step 4: Run the full frontend suite**

Run: `cd frontend && npm run test:run`
Expected: todos os testes PASS

Run: `cd frontend && npm run lint`
Expected: sem erros novos

- [ ] **Step 5: Verificação manual na tela**

Com o Plano 1 implantado e uma leitura injetada no Redis (sem precisar de balança física):

```bash
docker compose exec backend python manage.py shell -c "
from decimal import Decimal
from django.utils import timezone
from registro.models import Balanca
from registro.services import leituras
b = Balanca.objects.first()
leituras.registrar_leitura(b.id, Decimal('12.485'), True, timezone.now())
print('injetado para balanca', b.id, b.nome)
"
```

Confirme, na tela Nova Pesagem:

1. Selecionar a balança faz o painel aparecer com `12,49 kg` e "leitura estável"
2. "Capturar Tara" preenche o campo Tara e mostra "capturado da balança"
3. Editar a Tara à mão faz a marcação desaparecer
4. **Os dois inputs continuam editáveis em todos os estados** (o requisito que não pode falhar)
5. Após ~15 s sem nova injeção, o painel passa a "Sem comunicação" e os botões desaparecem — os inputs continuam funcionando
6. Salvar com os dois campos capturados grava `origem_peso = automatica`; conferir em `/admin/registro/pesagem/`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NovaPesagem.jsx \
        frontend/src/components/NovaPesagem.captura.test.jsx
git commit -m "feat(pesagem): captura de tara e liquido a partir da leitura da balanca"
```

---

## Task 5: Campos de conexão no `CadastroBalanca.jsx`

**Files:**
- Modify: `frontend/src/components/CadastroBalanca.jsx`
- Modify: `frontend/src/services/api.js` (listar agentes)
- Modify: `backend/registro/api/agente.py` + `backend/registro/urls.py` (endpoint de listagem de agentes)

**Interfaces:**
- Consumes: campos novos de `Balanca` (Plano 1, Task 2)
- Produces: `api.getAgentes()`; rota `agentes/` (name `agente-lista`)

Sem esta task o procedimento de instalação do Plano 2 não pode ser executado: não há como vincular uma balança a um agente nem informar protocolo, baud e porta pela interface.

- [ ] **Step 1: Write the failing test (backend)**

Acrescente a `backend/registro/tests/test_api_agente.py`:

```python
class AgenteListaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.operador = User.objects.create_user(username="operador", password="x")
        svc = User.objects.create_user(username="svc-a", password="x")
        AgenteEstacao.objects.create(nome="EST-RECEB-01", usuario=svc)
        AgenteEstacao.objects.create(nome="EST-INATIVO", usuario=svc, ativo=False)
        self.url = reverse("agente-lista")

    def test_exige_autenticacao(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_lista_apenas_agentes_ativos_sem_expor_token(self):
        self.client.force_authenticate(self.operador)
        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, 200)
        nomes = [a["nome"] for a in resp.data]
        self.assertEqual(nomes, ["EST-RECEB-01"])
        self.assertNotIn("token_hash", resp.data[0])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_api_agente.AgenteListaTests -v 2`
Expected: FAIL com `NoReverseMatch`

- [ ] **Step 3: Add the backend endpoint**

Em `backend/registro/api/agente.py`:

```python
from registro.agente_models import AgenteEstacao


class AgenteResumoSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgenteEstacao
        # token_hash NUNCA é exposto, nem hasheado.
        fields = ["id", "nome", "ultimo_contato_em", "versao_agente"]
        read_only_fields = fields


class AgenteListaView(views.APIView):
    """Lista de agentes para o cadastro de Balança. Auth de operador (JWT)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        agentes = AgenteEstacao.objects.filter(ativo=True).order_by("nome")
        return Response(AgenteResumoSerializer(agentes, many=True).data)
```

Em `backend/registro/urls.py`:

```python
from .api.agente import AgenteConfiguracaoView, AgenteLeiturasView, AgenteListaView
```
```python
    path("agentes/", AgenteListaView.as_view(), name="agente-lista"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_api_agente -v 2`
Expected: todos PASS

- [ ] **Step 5: Add the API method**

Em `frontend/src/services/api.js`, no bloco de Balanças:

```js
  async getAgentes() {
    return this.get("/registro/agentes/");
  },
```

- [ ] **Step 6: Estender os mapeadores do formulário**

`CadastroBalanca.jsx` mantém um estado em camelCase e converte nas fronteiras. `protocolo` **já existe** nos dois mapeadores (`:95` e `:114`), então faltam cinco campos.

Em `apiToUi` (`:84-101`), adicione após `protocolo`:

```js
    agente: b.agente != null ? String(b.agente) : '',
    baudRate: b.baud_rate != null ? String(b.baud_rate) : '9600',
    paridade: b.paridade ?? 'N',
    modoSaida: b.modo_saida ?? 'continuo',
    unidadeFrame: b.unidade_frame ?? 'kg',
    // Somente leitura: alimentados pelo agente, nunca enviados de volta.
    statusConexao: b.status_conexao ?? 'nao_configurada',
    ultimaLeituraEm: b.ultima_leitura_em ?? null,
```

Em `uiToApi` (`:103-118`), adicione após `protocolo` — e **note que `statusConexao` e `ultimaLeituraEm` não entram aqui de propósito**:

```js
    agente: b.agente !== '' ? Number(b.agente) : null,
    baud_rate: b.baudRate !== '' ? Number(b.baudRate) : 9600,
    paridade: b.paridade || 'N',
    modo_saida: b.modoSaida || 'continuo',
    unidade_frame: b.unidadeFrame || 'kg',
```

Adicione os mesmos defaults ao `useState` inicial do `formData` (`:59`), seguindo o formato dos campos que já estão lá.

- [ ] **Step 7: ⚠ Corrigir o apagamento de `porta_serial`**

`uiToApi:108` hoje faz:

```js
    porta_serial: b.tipoConexao !== 'ethernet' ? (b.portaSerial || '') : '',
```

E `Balanca.tipo_conexao` tem **default `ethernet`** (`backend/registro/models.py:102`). Consequência: uma balança deixada no default tem a `porta_serial` **apagada a cada salvamento** — e o agente perderia a porta configurada, ficando em `erro_leitura` sem motivo aparente.

As quatro balanças do parque são seriais. Duas providências:

**a)** No formulário, quando `protocolo` estiver preenchido, valide que `tipoConexao` é `serial` ou `usb`. Adicione a `validate()` (`:157`):

```js
    if (formData.protocolo && formData.tipoConexao === 'ethernet') {
      return 'Balança com protocolo de leitura automática precisa ter Tipo de Conexão "Serial" ou "USB".'
    }
```

**b)** No painel de leitura automática, exiba o aviso quando o caso ocorrer, para que o operador entenda antes de tentar salvar:

```jsx
{formData.protocolo && formData.tipoConexao === 'ethernet' && (
  <p className="text-sm text-red-600">
    Selecione Tipo de Conexão "Serial" ou "USB" — a porta serial é descartada
    quando o tipo é Ethernet.
  </p>
)}
```

- [ ] **Step 8: Adicionar os controles ao formulário**

Agrupe os campos sob um cabeçalho **"Leitura automática (agente local)"**, seguindo o padrão de `Select` e `Input` que o arquivo já usa. Texto de ajuda da seção:

> Preencha apenas se houver um agente local instalado na estação desta balança. Sem isso, o peso continua sendo informado manualmente.

| Campo (UI) | Controle | Opções |
|---|---|---|
| `agente` | `Select` | `''` → "Nenhum" + itens de `api.getAgentes()` (`value` = `String(a.id)`, label = `a.nome`) |
| `protocolo` | `Select` *(hoje é `Input` livre — trocar)* | `''` → "Não configurado", `toledo_2090` → "Toledo indicador 2090", `ohaus_adventurer` → "Ohaus Adventurer" |
| `baudRate` | `Input` `inputMode="numeric"` | — |
| `paridade` | `Select` | `N` → "Nenhuma", `E` → "Par", `O` → "Ímpar" |
| `modoSaida` | `Select` | `continuo` → "Contínuo", `sob_comando` → "Sob comando" |
| `unidadeFrame` | `Select` | `kg` → "Quilogramas", `g` → "Gramas" |

E dois campos **somente leitura** (texto simples, não `Input`), porque são alimentados pelo agente:

- **Status da conexão** — `statusConexao` traduzido: `online` → "Online", `offline` → "Offline", `erro_leitura` → "Erro de leitura", `nao_configurada` → "Não configurada"
- **Última leitura** — `ultimaLeituraEm` em pt-BR, ou "—"

Carregue os agentes no mesmo `useEffect` que já carrega os dados da tela:

```js
  const [agentes, setAgentes] = useState([])
  // dentro do useEffect de carga inicial, ao lado das chamadas existentes:
  //   const ags = await api.getAgentes()
  //   setAgentes(ags?.results ?? ags ?? [])
```

> `getAgentes` devolve lista simples (a view não é paginada), mas o `?? results` protege caso a paginação padrão do DRF seja aplicada depois.

- [ ] **Step 9: Verificação manual**

1. Cadastre uma balança com protocolo `toledo_2090`, tipo de conexão **Serial**, porta `COM3`, agente vinculado. Salve.
2. Reabra o cadastro: **`porta_serial` ainda deve ser `COM3`** (é a regressão que o Step 7 previne).
3. Tente salvar com protocolo preenchido e tipo Ethernet: deve ser bloqueado com a mensagem do Step 7a.
4. Confirme que `Status da conexão` aparece como texto e não é editável.

Run: `cd frontend && npm run test:run && npm run lint`
Expected: PASS, sem erros novos

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/CadastroBalanca.jsx frontend/src/services/api.js \
        backend/registro/api/agente.py backend/registro/urls.py \
        backend/registro/tests/test_api_agente.py
git commit -m "feat(balancas): campos de leitura automatica no cadastro de balanca"
```

---

## Task 6: Preservar a procedência ao editar uma pesagem

**Files:**
- Modify: `backend/registro/serializers.py` (`PesagemSerializer`, método `update`)
- Create: `backend/registro/tests/test_pesagem_edicao_origem.py`

**Interfaces:**
- Consumes: `Pesagem.ORIGEM_*` (Plano 1, Task 3)
- Produces: nada

Requisito §6.4 da spec. `PesagemEditar.jsx` fica fora de escopo (editar pesagem com leitura ao vivo é semanticamente duvidoso), mas **uma regra é indispensável**: editar uma pesagem `automatica` precisa mudar a procedência para `automatica_ajustada`. Sem isso, a edição apagaria silenciosamente a evidência de que o valor original veio da balança — exatamente o que o campo existe para impedir.

- [ ] **Step 1: Write the failing test**

```python
# backend/registro/tests/test_pesagem_edicao_origem.py
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from registro.models import Balanca, Pesagem
from registro.serializers import PesagemSerializer
from registro.tests.test_models import BaseSetupMixin

D = Decimal


class EdicaoPreservaProcedenciaTests(BaseSetupMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012", casas_decimais=2,
            calibracao_realizada=True, ultima_calibracao=timezone.localdate(),
        )

    def _pesagem(self, origem):
        return Pesagem.objects.create(
            op=self.op, item_op=self.item_op1, pesador="operador",
            balanca=self.balanca, tara=D("0.50"), liquido=D("0.10"),
            bruto=D("0.60"), origem_peso=origem,
        )

    def _editar(self, pesagem, liquido="0.20"):
        ser = PesagemSerializer(pesagem, data={"liquido": D(liquido)}, partial=True)
        ser.is_valid(raise_exception=True)
        return ser.save()

    def test_editar_automatica_vira_ajustada(self):
        pesagem = self._pesagem(Pesagem.ORIGEM_AUTOMATICA)
        editada = self._editar(pesagem)
        self.assertEqual(editada.origem_peso, Pesagem.ORIGEM_AUTOMATICA_AJUSTADA)

    def test_editar_ajustada_permanece_ajustada(self):
        pesagem = self._pesagem(Pesagem.ORIGEM_AUTOMATICA_AJUSTADA)
        editada = self._editar(pesagem)
        self.assertEqual(editada.origem_peso, Pesagem.ORIGEM_AUTOMATICA_AJUSTADA)

    def test_editar_manual_permanece_manual(self):
        """Manual não "promove" para ajustada: nunca houve captura."""
        pesagem = self._pesagem(Pesagem.ORIGEM_MANUAL)
        editada = self._editar(pesagem)
        self.assertEqual(editada.origem_peso, Pesagem.ORIGEM_MANUAL)

    def test_editar_campo_que_nao_e_peso_nao_altera_procedencia(self):
        pesagem = self._pesagem(Pesagem.ORIGEM_AUTOMATICA)

        ser = PesagemSerializer(pesagem, data={"lote_mp": "24A0321"}, partial=True)
        ser.is_valid(raise_exception=True)
        editada = ser.save()

        self.assertEqual(editada.origem_peso, Pesagem.ORIGEM_AUTOMATICA)

    def test_reenviar_o_mesmo_peso_nao_altera_procedencia(self):
        pesagem = self._pesagem(Pesagem.ORIGEM_AUTOMATICA)
        editada = self._editar(pesagem, liquido="0.10")
        self.assertEqual(editada.origem_peso, Pesagem.ORIGEM_AUTOMATICA)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test registro.tests.test_pesagem_edicao_origem -v 2`
Expected: FAIL em `test_editar_automatica_vira_ajustada` — `origem_peso` permanece `automatica`

- [ ] **Step 3: Write minimal implementation**

Em `backend/registro/serializers.py`, no `PesagemSerializer`, após o `create()` da Task 9 do Plano 1:

```python
    def update(self, instance, validated_data):
        """Preserva a evidência de que o valor original veio da balança.

        Editar tara ou líquido de uma pesagem capturada automaticamente a
        rebaixa para 'ajustada'. Sem isto a edição apagaria silenciosamente a
        procedência — exatamente o que o campo existe para impedir.
        """
        campos_de_peso = ("tara", "liquido")
        mudou_peso = any(
            campo in validated_data and validated_data[campo] != getattr(instance, campo)
            for campo in campos_de_peso
        )

        if mudou_peso and instance.origem_peso == Pesagem.ORIGEM_AUTOMATICA:
            instance.origem_peso = Pesagem.ORIGEM_AUTOMATICA_AJUSTADA

        return super().update(instance, validated_data)
```

> `origem_peso` está em `read_only_fields`, então `super().update()` não o sobrescreve com valor do payload — a atribuição em `instance` acima é o que persiste, junto com os demais campos.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test registro.tests.test_pesagem_edicao_origem -v 2`
Expected: 5 testes PASS

- [ ] **Step 5: Commit**

```bash
git add backend/registro/serializers.py backend/registro/tests/test_pesagem_edicao_origem.py
git commit -m "feat(pesagem): edicao rebaixa origem automatica para ajustada"
```

---

## Task 7: Status de conexão no relatório de Balanças

**Files:**
- Modify: `backend/reports/views/balancas.py:45-92`
- Modify: `frontend/src/pages/reports/Balancas.jsx`
- Create: `backend/reports/tests/test_relatorio_balancas_status.py`

**Interfaces:**
- Consumes: `Balanca.status_conexao`, `ultima_leitura_em` (Plano 1, Task 2)
- Produces: nada

Fecha o gap do **MANUAL_SCALE 11.1**, que já promete "status atual de conexão" no relatório de Balanças — hoje é promessa documental sem implementação.

**Duas coisas importantes sobre este relatório, verificadas no código:**

1. Ele **não** usa serializer: `BalancasUsoReportView` (`backend/reports/views/balancas.py:11`) agrega a partir de `Pesagem`, agrupa por `p.balanca.nome` num dict (`:54-68`) e devolve `header` (lista de rótulos) + `rows` (lista de **listas**, `:73-86`). As colunas novas entram nos três lugares: `header`, o dict do `setdefault`, e a construção de `rows`.
2. Ele lista **apenas balanças que têm pesagens**. Uma balança online mas nunca utilizada não aparece. Isso é suficiente para o texto do MANUAL_SCALE 11.1 ("histórico de leituras e situação de calibração" de balanças em uso), mas **registre a limitação** ao atualizar a documentação — se a intenção for monitorar o parque inteiro, o cadastro de Balanças (Task 5) é a tela correta, não este relatório.

- [ ] **Step 1: Write the failing test**

```python
# backend/reports/tests/test_relatorio_balancas_status.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from registro.models import Balanca
from registro.tests.test_models import BaseSetupMixin

User = get_user_model()
D = Decimal

URL = "/api/reports/balancas/"


class RelatorioBalancasStatusTests(BaseSetupMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(username="supervisor", password="x")
        self.client.force_authenticate(self.user)

        self.balanca = Balanca.objects.create(
            nome="Toledo 100kg", identificador="BAL-701012",
            status_conexao=Balanca.STATUS_ONLINE,
            ultima_leitura_em=timezone.now(),
            calibracao_realizada=True, ultima_calibracao=timezone.localdate(),
        )
        from registro.models import Pesagem
        Pesagem.objects.create(
            op=self.op, item_op=self.item_op1, pesador="operador",
            balanca=self.balanca, tara=D("0.50"), liquido=D("0.10"), bruto=D("0.60"),
        )

    def test_header_traz_as_colunas_novas(self):
        resp = self.client.get(URL)

        self.assertEqual(resp.status_code, 200)
        self.assertIn("Conexão", resp.data["header"])
        self.assertIn("Última Leitura", resp.data["header"])

    def test_linha_traz_o_status_traduzido(self):
        resp = self.client.get(URL)

        header = resp.data["header"]
        linha = resp.data["rows"][0]
        self.assertEqual(linha[header.index("Conexão")], "Online")
        self.assertNotEqual(linha[header.index("Última Leitura")], "—")

    def test_balanca_sem_leitura_mostra_travessao(self):
        self.balanca.status_conexao = Balanca.STATUS_NAO_CONFIGURADA
        self.balanca.ultima_leitura_em = None
        self.balanca.save(update_fields=["status_conexao", "ultima_leitura_em"])

        resp = self.client.get(URL)
        header = resp.data["header"]
        linha = resp.data["rows"][0]

        self.assertEqual(linha[header.index("Conexão")], "Não configurada")
        self.assertEqual(linha[header.index("Última Leitura")], "—")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test reports.tests.test_relatorio_balancas_status -v 2`
Expected: FAIL com `AssertionError: 'Conexão' not found in [...]`

> Se `backend/reports/tests/` não existir, crie o pacote com um `__init__.py` vazio. Se a resposta não tiver as chaves `header`/`rows`, imprima `resp.data.keys()` e ajuste os testes à forma real antes de seguir.

- [ ] **Step 3: Write minimal implementation**

Em `backend/reports/views/balancas.py`:

**a)** Adicione as duas colunas ao `header` (`:84-92`), ao final da lista:

```python
            'Em Calibração?',
            'Conexão',
            'Última Leitura',
```

**b)** No dict do `setdefault` (`:57-67`), adicione:

```python
                    'status_conexao': p.balanca.status_conexao if p.balanca else None,
                    'ultima_leitura_em': p.balanca.ultima_leitura_em if p.balanca else None,
```

**c)** Antes da construção de `rows`, adicione o tradutor:

```python
        # Rótulo legível: o relatório é lido por pessoas e exportado para PDF/CSV,
        # onde a chave crua não significa nada.
        ROTULO_CONEXAO = {
            'online': 'Online',
            'offline': 'Offline',
            'erro_leitura': 'Erro de leitura',
            'nao_configurada': 'Não configurada',
        }
```

**d)** Em `rows` (`:73-86`), adicione as duas células ao final de cada linha:

```python
                ROTULO_CONEXAO.get(v['status_conexao'], '—'),
                fmt_gmt3_with_zone(v['ultima_leitura_em']) if v['ultima_leitura_em'] else '—',
```

> `fmt_gmt3_with_zone` já é usado no arquivo para `v['min']`/`v['max']` — reaproveite-o para manter o formato de data consistente no relatório.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test reports.tests.test_relatorio_balancas_status -v 2`
Expected: 3 testes PASS

- [ ] **Step 5: Verificar as exportações**

O mesmo `header`/`rows` alimenta CSV e PDF (`:88-92`). Confirme que as colunas novas aparecem e que o PDF não estourou a largura:

Run:
```bash
curl -s -o /tmp/rel.csv "http://localhost/api/reports/balancas/?export=csv" -H "Authorization: Bearer $TOKEN"
head -2 /tmp/rel.csv
```
Expected: o cabeçalho inclui `Conexão` e `Última Leitura`. Gere também o PDF e confira visualmente: o relatório passou de 8 para 10 colunas, e pode precisar de orientação paisagem.

- [ ] **Step 6: Add the columns in the report UI**

Em `frontend/src/pages/reports/Balancas.jsx`, a tela consome `header`/`rows` — confirme se ela renderiza o `header` dinamicamente (nesse caso **nada a fazer**, as colunas aparecem sozinhas) ou se tem uma lista fixa de colunas no arquivo ou em `reports/config.js`. Se for fixa, acrescente `Conexão` e `Última Leitura` na mesma ordem do `header` do backend.

Run: `cd frontend && npm run test:run && npm run build`
Expected: PASS, build sem erros

- [ ] **Step 7: Run the suites**

Run: `cd backend && python manage.py test -v 1`
Run: `cd frontend && npm run test:run && npm run build`
Expected: PASS, e o build sem erros

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/reports/ backend/reports/
git commit -m "feat(relatorios): status de conexao das balancas no relatorio"
```

---

## Verificação final do Plano 3

- [ ] **Suítes verdes**

Run: `cd frontend && npm run test:run && npm run lint && npm run build`
Run: `cd backend && python manage.py test -v 1`

- [ ] **O requisito que não pode falhar**

Com o agente **desligado**, faça uma pesagem completa na tela Nova Pesagem, digitando Tara e Líquido à mão. Ela precisa funcionar **exatamente** como antes desta entrega, sem nenhum bloqueio, aviso obstrutivo ou campo desabilitado. Confirme que a pesagem gravada tem `origem_peso = manual`.

Este é o teste que autoriza o rollout: a funcionalidade é aditiva sobre um fluxo já validado, e não existe caminho em que ela degrade o que já funciona.

- [ ] **Contagem de requisições sob polling**

Abra a tela com uma balança selecionada, deixe 2 minutos, e confira na aba Network do navegador: ~120 requisições a `leitura-atual` (1 Hz). Troque para outra aba por 30 s e volte: não deve haver requisições no período oculto. Se houver, a pausa por `visibilitychange` não está funcionando e o escopo de throttle `leitura` será consumido à toa.
