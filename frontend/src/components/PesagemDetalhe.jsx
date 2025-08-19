// src/pages/NovaPesagem.jsx
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Printer, RotateCcw, Calculator } from 'lucide-react'

// -------------------- Config API --------------------
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const REG = `${API}/api/registro`

const authHeaders = () => {
  const token = localStorage.getItem('access') || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Utilitário: lê todos os itens de um endpoint paginado (DRF) ou array simples
async function fetchAllPaginated(path, { preferLimit = 200 } = {}) {
  const headers = authHeaders()

  // 1) tenta padrão DRF com page_size
  let url = `${API}${path}${path.includes('?') ? '&' : '?'}page_size=${preferLimit}`
  const all = []

  // tentativa A: results/next
  while (url) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
    const json = await res.json()

    if (Array.isArray(json)) {
      // array puro: não há "next"; cai para tentativa B (manual)
      if (json.length > 0) {
        all.push(...json)
      }
      url = null
      break
    }

    const pageItems = Array.isArray(json.results) ? json.results : []
    all.push(...pageItems)
    url = json?.next || null
  }

  // Se já preencheu via results/next, retorna
  if (all.length > 0) return all

  // 2) Tentativa B: iteração manual usando limit/offset quando a API devolve array sem 'next'
  //    Fazemos requisições em blocos até vir menos que 'limit' ou 0.
  //    Só roda se a primeira chamada acima retornou array puro (sem 'next').
  let offset = 0
  const limit = preferLimit
  // primeira chamada manual
  while (true) {
    const manualUrl = `${API}${path}${path.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`
    const res = await fetch(manualUrl, { headers })
    if (!res.ok) throw new Error(`GET ${manualUrl} -> HTTP ${res.status}`)
    const json = await res.json()

    // cobre tanto array puro quanto esquema {results, count}
    const chunk = Array.isArray(json) ? json
      : (Array.isArray(json.results) ? json.results : [])

    if (!chunk || chunk.length === 0) break

    all.push(...chunk)
    offset += chunk.length
    if (chunk.length < limit) break
  }

  return all
}

// -------------------- Componente --------------------
export default function NovaPesagem() {
  const [me, setMe] = useState(null)

  const [produtos, setProdutos] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [balancas, setBalancas] = useState([]) // opcional (FK de balança)

  const [loadingProdutos, setLoadingProdutos] = useState(false)
  const [loadingMPs, setLoadingMPs] = useState(false)
  const [loadingBalancas, setLoadingBalancas] = useState(false)

  const [errorProdutos, setErrorProdutos] = useState('')
  const [errorMPs, setErrorMPs] = useState('')
  const [errorBalancas, setErrorBalancas] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [createdId, setCreatedId] = useState(null) // habilita etiqueta após salvar

  // Estado do formulário
  const [form, setForm] = useState({
    produto: '',         // id (number)
    materia_prima: '',   // id (number)
    op: '',
    lote: '',
    bruto: '',           // string para input controlado
    tara: '',
    liquido: '',         // calculado
    volume: '',
    balanca: '',         // id (number) - opcional
    codigo_interno: '',
    pesador: ''          // preenchido com me?.nome ou username
  })

  // Helpers
  const setField = (name, value) =>
    setForm(prev => ({ ...prev, [name]: value }))

  const toNumberOrZero = (v) => {
    const n = typeof v === 'string' ? v.replace(',', '.') : v
    const parsed = Number(n)
    return Number.isFinite(parsed) ? parsed : 0
  }

  // Calcula líquido quando bruto/tara mudarem
  useEffect(() => {
    const b = toNumberOrZero(form.bruto)
    const t = toNumberOrZero(form.tara)
    const liq = b - t
    // mantém como string para exibir no input
    setForm(prev => ({ ...prev, liquido: Number.isFinite(liq) ? String(liq) : '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bruto, form.tara])

  // Carrega usuário logado e pré-preenche "pesador"
  useEffect(() => {
    let mounted = true
      ; (async () => {
        try {
          const res = await fetch(`${API}/api/usuarios/auth/me/`, { headers: authHeaders() })
          if (!res.ok) throw new Error(`GET me -> HTTP ${res.status}`)
          const u = await res.json()
          if (!mounted) return
          setMe(u)
          const nome = u?.nome || u?.first_name || u?.username || ''
          setForm(prev => ({ ...prev, pesador: nome }))
        } catch (e) {
          console.error(e)
        }
      })()
    return () => { mounted = false }
  }, [])

  // Carrega Produtos (ativos) para o select
  useEffect(() => {
    let mounted = true
      ; (async () => {
        setLoadingProdutos(true); setErrorProdutos('')
        try {
          const list = await fetchAllPaginated('/api/registro/produtos/?ativo=true')
          if (!mounted) return
          setProdutos(list.map(p => ({ id: p.id, nome: p.nome })))
        } catch (e) {
          console.error(e)
          if (mounted) setErrorProdutos('Não foi possível carregar os produtos.')
        } finally {
          if (mounted) setLoadingProdutos(false)
        }
      })()
    return () => { mounted = false }
  }, [])

  // Carrega Matérias‑Primas (ativas) para o select

  useEffect(() => {
    let mounted = true
      ; (async () => {
        setMpLoading(true); setMpError('')
        try {
          // se quiser TODAS (ativas e inativas), remova "?ativo=true"
          const list = await fetchAllPaginated('/api/registro/materias-primas/?ativo=true', { preferLimit: 200 })
          if (!mounted) return
          setMateriasPrimas(list.map(mp => ({ id: mp.id, nome: mp.nome })))
        } catch (e) {
          console.error(e)
          if (mounted) setMpError('Não foi possível carregar as matérias-primas.')
        } finally {
          if (mounted) setMpLoading(false)
        }
      })()
    return () => { mounted = false }
  }, [])


  // (Opcional) Carrega Balanças
  useEffect(() => {
    let mounted = true
      ; (async () => {
        setLoadingBalancas(true); setErrorBalancas('')
        try {
          // Se não existir o endpoint, pode remover este bloco
          const list = await fetchAllPaginated('/api/registro/balancas/?ativo=true')
          if (!mounted) return
          setBalancas(list.map(b => ({ id: b.id, nome: b.nome })))
        } catch (e) {
          // Se sua API ainda não tem balanças, ignore o erro
          console.warn('Balanças não carregadas (opcional):', e?.message)
        } finally {
          if (mounted) setLoadingBalancas(false)
        }
      })()
    return () => { mounted = false }
  }, [])

  const handleReset = () => {
    setForm({
      produto: '',
      materia_prima: '',
      op: '',
      lote: '',
      bruto: '',
      tara: '',
      liquido: '',
      volume: '',
      balanca: '',
      codigo_interno: '',
      pesador: me?.nome || me?.first_name || me?.username || ''
    })
    setError('')
    setSuccess('')
    setCreatedId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setCreatedId(null)

    // Validações mínimas
    if (!form.produto || !form.materia_prima) {
      setError('Selecione o Produto e a Matéria-prima.')
      return
    }

    setLoading(true)
    try {
      // monta payload em snake_case
      const payload = {
        produto: Number(form.produto),
        materia_prima: Number(form.materia_prima),
        op: form.op || '',
        lote: form.lote || '',
        bruto: toNumberOrZero(form.bruto),
        tara: toNumberOrZero(form.tara),
        liquido: toNumberOrZero(form.liquido),
        volume: form.volume || '',
        balanca: form.balanca ? Number(form.balanca) : null,
        codigo_interno: form.codigo_interno || '',
        pesador: form.pesador || ''
      }

      const res = await fetch(`${REG}/pesagens/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        let msg = `POST pesagem: ${res.status}`
        try {
          const j = await res.json()
          // tenta extrair erro mais amigável
          for (const k of ['produto', 'materia_prima', 'op', 'lote', 'bruto', 'tara', 'liquido', 'volume', 'balanca', 'codigo_interno', 'pesador', 'detail', 'non_field_errors']) {
            if (j?.[k]) {
              const v = Array.isArray(j[k]) ? j[k][0] : j[k]
              if (typeof v === 'string') { msg = v; break }
            }
          }
        } catch { /* ignore */ }
        throw new Error(msg)
      }

      const saved = await res.json()
      setSuccess('Pesagem registrada com sucesso!')
      setCreatedId(saved?.id || null)
    } catch (err) {
      console.error(err)
      setError(typeof err?.message === 'string' ? err.message : 'Erro ao salvar a pesagem. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleEtiqueta = () => {
    if (!createdId) return
    window.open(`${REG.replace('/registro', '/registro')}/etiqueta/${createdId}/`, '_blank', 'noopener')
  }

  // -------------- UI --------------
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nova Pesagem</h1>
          <p className="text-gray-600">Registre uma nova pesagem com cálculo automático de líquido</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Formulário</CardTitle>
          <CardDescription>Preencha os campos abaixo e salve para gerar a etiqueta</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" onSubmit={handleSubmit}>
            {/* Produto */}
            <div className="space-y-2">
              <Label>Produto *</Label>
              <Select
                value={String(form.produto || '')}
                onValueChange={(v) => setField('produto', Number(v))}
                disabled={loadingProdutos}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingProdutos ? 'Carregando…' : 'Selecione o produto'} />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorProdutos && <p className="text-sm text-red-600">{errorProdutos}</p>}
            </div>

            {/* Matéria‑prima */}
            <div className="space-y-2">
              <Label>Matéria-prima *</Label>
              <Select
                value={String(form.materia_prima || '')}
                onValueChange={(v) => setForm(s => ({ ...s, materia_prima: Number(v) }))}
                disabled={mpLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={mpLoading ? 'Carregando…' : 'Selecione a matéria-prima'} />
                </SelectTrigger>
                <SelectContent /* garante scroll */ className="max-h-80 overflow-auto">
                  {materiasPrimas.map(mp => (
                    <SelectItem key={mp.id} value={String(mp.id)}>
                      {mp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mpError && <p className="text-sm text-red-600">{mpError}</p>}

            </div>

            {/* OP */}
            <div className="space-y-2">
              <Label>OP</Label>
              <Input
                value={form.op}
                onChange={e => setField('op', e.target.value)}
                placeholder="Ex.: 240321"
              />
            </div>

            {/* Lote */}
            <div className="space-y-2">
              <Label>Lote</Label>
              <Input
                value={form.lote}
                onChange={e => setField('lote', e.target.value)}
                placeholder="Ex.: 22448/22449"
              />
            </div>

            {/* Bruto */}
            <div className="space-y-2">
              <Label>Peso Bruto (kg)</Label>
              <Input
                inputMode="decimal"
                value={form.bruto}
                onChange={e => setField('bruto', e.target.value)}
                placeholder="0.000"
              />
            </div>

            {/* Tara */}
            <div className="space-y-2">
              <Label>Tara (kg)</Label>
              <Input
                inputMode="decimal"
                value={form.tara}
                onChange={e => setField('tara', e.target.value)}
                placeholder="0.000"
              />
            </div>

            {/* Líquido */}
            <div className="space-y-2">
              <Label>Peso Líquido (kg)</Label>
              <Input value={form.liquido} readOnly />
            </div>

            {/* Volume */}
            <div className="space-y-2">
              <Label>Volume</Label>
              <Input
                value={form.volume}
                onChange={e => setField('volume', e.target.value)}
                placeholder="Ex.: 200 mL"
              />
            </div>

            {/* Balança (opcional, FK) */}
            <div className="space-y-2">
              <Label>Balança</Label>
              <Select
                value={String(form.balanca || '')}
                onValueChange={(v) => setField('balanca', Number(v))}
                disabled={loadingBalancas}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingBalancas ? 'Carregando…' : 'Selecione a balança'} />
                </SelectTrigger>
                <SelectContent>
                  {balancas.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorBalancas && <p className="text-sm text-red-600">{errorBalancas}</p>}
            </div>

            {/* Código Interno */}
            <div className="space-y-2">
              <Label>Código Interno</Label>
              <Input
                value={form.codigo_interno}
                onChange={e => setField('codigo_interno', e.target.value)}
                placeholder="Ex.: CI-0001"
              />
            </div>

            {/* Pesador */}
            <div className="space-y-2">
              <Label>Pesador</Label>
              <Input
                value={form.pesador}
                onChange={e => setField('pesador', e.target.value)}
                placeholder="Nome do operador"
              />
            </div>

            {/* Ações */}
            <div className="col-span-full flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={loading} className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                {loading ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Limpar
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!createdId}
                onClick={handleEtiqueta}
                className="flex items-center gap-2"
                title={createdId ? 'Abrir etiqueta' : 'Salve a pesagem para liberar a etiqueta'}
              >
                <Printer className="h-4 w-4" />
                Etiqueta
              </Button>
            </div>

            {/* Alertas */}
            {error && (
              <div className="col-span-full">
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            )}
            {success && (
              <div className="col-span-full">
                <Alert className="border-green-200 bg-green-50">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
