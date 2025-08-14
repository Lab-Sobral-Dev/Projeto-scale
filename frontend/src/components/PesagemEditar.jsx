import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Save } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Headers com JWT
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('access') || ''}`,
  'Content-Type': 'application/json',
})

// GET genérico com unwrap de paginação DRF (results)
const apiGet = async (path) => {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'results' in data) return data.results
  return data
}

const apiPatch = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

export default function PesagemEditar() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')   // 👈 novo estado

  const [produtos, setProdutos] = useState([])
  const [mps, setMps] = useState([])
  const [balancas, setBalancas] = useState([])

  const [form, setForm] = useState({
    produto_id: null,
    materia_prima_id: null,
    op: '',
    lote: '',
    bruto: '',
    tara: '',
    volume: '',
    balanca_id: null,
    codigo_interno: '',
  })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const [p, prods, mats, bals] = await Promise.all([
          apiGet(`/api/registro/pesagens/${id}/`),
          apiGet(`/api/registro/produtos/`),
          apiGet(`/api/registro/materias-primas/`),
          apiGet(`/api/registro/balancas/`),
        ])
        if (!mounted) return

        setProdutos(Array.isArray(prods) ? prods : [])
        setMps(Array.isArray(mats) ? mats : [])
        setBalancas(Array.isArray(bals) ? bals : [])

        setForm({
          produto_id: p.produto?.id || null,
          materia_prima_id: p.materia_prima?.id || null,
          op: p.op || '',
          lote: p.lote || '',
          bruto: String(p.bruto ?? ''),
          tara: String(p.tara ?? ''),
          volume: p.volume ?? '',
          balanca_id: p.balanca?.id || null,
          codigo_interno: p.codigo_interno ?? '',
        })
      } catch (e) {
        console.error(e)
        setError('Não foi possível carregar a pesagem para edição.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [id])

  // Auto-ocultar o sucesso após 4s
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 4000)
    return () => clearTimeout(t)
  }, [success])

  const onChange = (name, value) => {
    setError('')
    setSuccess('')
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const onSave = async () => {
    try {
      setSaving(true)
      setError('')
      const payload = {
        produto_id: form.produto_id,
        materia_prima_id: form.materia_prima_id,
        op: form.op,
        lote: form.lote,
        bruto: form.bruto === '' ? null : Number(form.bruto),
        tara: form.tara === '' ? null : Number(form.tara),
        volume: form.volume?.toString() ?? '',
        balanca_id: form.balanca_id ?? null,
        codigo_interno: form.codigo_interno,
      }
      await apiPatch(`/api/registro/pesagens/${id}/`, payload)

      // 👉 mostra mensagem de sucesso e fica na página
      setSuccess('Pesagem atualizada com sucesso!')
      // Se preferir ir para a página de detalhes:
      // navigate(`/pesagens/${id}`)
    } catch (e) {
      console.error(e)
      setError('Falha ao salvar. Verifique os campos e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Editar Pesagem</h1>
          <p className="text-gray-600">ID #{id}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <Button onClick={onSave} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {!!error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!!success && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dados da Pesagem</CardTitle>
          <CardDescription>Atualize apenas o necessário</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Produto */}
          <div className="space-y-2">
            <Label>Produto</Label>
            <Select
              value={form.produto_id ? String(form.produto_id) : '__none__'}
              onValueChange={(v) => onChange('produto_id', v === '__none__' ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>Selecione…</SelectItem>
                {produtos.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Matéria-prima */}
          <div className="space-y-2">
            <Label>Matéria-prima</Label>
            <Select
              value={form.materia_prima_id ? String(form.materia_prima_id) : '__none__'}
              onValueChange={(v) => onChange('materia_prima_id', v === '__none__' ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>Selecione…</SelectItem>
                {mps.map(mp => (
                  <SelectItem key={mp.id} value={String(mp.id)}>{mp.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* OP */}
          <Field label="OP">
            <Input value={form.op} onChange={(e) => onChange('op', e.target.value)} />
          </Field>

          {/* Lote */}
          <Field label="Lote">
            <Input value={form.lote} onChange={(e) => onChange('lote', e.target.value)} />
          </Field>

          {/* Bruto */}
          <Field label="Peso Bruto (kg)">
            <Input type="number" step="0.001" value={form.bruto} onChange={(e) => onChange('bruto', e.target.value)} />
          </Field>

          {/* Tara */}
          <Field label="Tara (kg)">
            <Input type="number" step="0.001" value={form.tara} onChange={(e) => onChange('tara', e.target.value)} />
          </Field>

          {/* Volume */}
          <Field label="Volume">
            <Input value={form.volume} onChange={(e) => onChange('volume', e.target.value)} />
          </Field>

          {/* Balança (Select) */}
          <div className="space-y-2">
            <Label>Balança</Label>
            <Select
              value={form.balanca_id ? String(form.balanca_id) : '__none__'}
              onValueChange={(v) => onChange('balanca_id', v === '__none__' ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem balança</SelectItem>
                {balancas.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Código Interno */}
          <Field label="Código Interno">
            <Input value={form.codigo_interno} onChange={(e) => onChange('codigo_interno', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-gray-500">Carregando…</p>}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
