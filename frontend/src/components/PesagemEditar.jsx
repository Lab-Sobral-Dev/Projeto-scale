import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Save, Printer, Package2, Layers, Factory, Scale, QrCode, Weight } from 'lucide-react'
import api from '@/services/api'

const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const tz = 'America/Fortaleza'
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: tz }) : '-')

// unidades
const KG_IN_G = 1000
const toNum = (x) => (x == null || x === '' ? null : Number(x))
const gToKg = (g) => (g == null ? null : Number(g) / KG_IN_G)

export default function PesagemEditar() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [pesagem, setPesagem] = useState(null)
  const [produtos, setProdutos] = useState([])
  const [mps, setMps] = useState([])
  const [balancas, setBalancas] = useState([])

  // form controlado
  const [form, setForm] = useState({
    // vínculos (se for legado)
    produto_id: null,
    materia_prima_id: null,
    // vínculos OP (somente leitura)
    op_id: null,
    item_op_id: null,

    op_numero: '',
    lote: '',
    // ENTRADAS DO OPERADOR (kg):
    liquido: '', // <— novo campo editável
    tara: '',
    // DERIVADOS / METADADOS
    volume: '',
    balanca_id: null,
    codigo_interno: '',
  })

  const isOPLinked = useMemo(() => !!(form.op_id || form.item_op_id), [form.op_id, form.item_op_id])

  // bruto derivado (kg) = tara + líquido
  const brutoCalcKg = useMemo(() => {
    const l = Number(form.liquido || 0)
    const t = Number(form.tara || 0)
    const b = l + t
    return Number.isFinite(b) ? b : null
  }, [form.liquido, form.tara])

  useEffect(() => {
    let alive = true
      ; (async () => {
        try {
          setLoading(true); setError('')
          const [p, prods, mats, bals] = await Promise.all([
            api.getPesagem(id),
            api.getProdutos(),
            api.getMateriasPrimas(),
            api.getBalancas(),
          ])
          if (!alive) return

          setPesagem(p)
          setProdutos(Array.isArray(prods) ? prods : (prods?.results ?? []))
          setMps(Array.isArray(mats) ? mats : (mats?.results ?? []))
          setBalancas(Array.isArray(bals) ? bals : (bals?.results ?? []))

          // IDs legados
          const produtoId = p?.produto?.id ?? (typeof p?.produto === 'number' ? p.produto : null)
          const mpId = p?.materia_prima?.id ?? (typeof p?.materia_prima === 'number' ? p.materia_prima : null)

          // backend atual:
          // - bruto: kg (p.bruto)
          // - tara: kg (p.tara)
          // - liquido: g (p.liquido)  -> converter para kg na UI
          const taraKg = toNum(p?.tara)
          const liquidoKg =
            gToKg(toNum(p?.liquido ?? p?.liquido_g ?? p?.peso_liquido)) ??
            (p?.bruto != null && p?.tara != null ? Number(p.bruto) - Number(p.tara) : null)

          setForm({
            produto_id: produtoId,
            materia_prima_id: mpId,

            op_id: p?.op?.id ?? null,
            item_op_id: p?.item_op?.id ?? null,

            op_numero: p?.op?.numero || p?.op_numero || p?.op || '',
            lote: p?.lote || p?.op?.lote || '',

            liquido: liquidoKg != null ? String(liquidoKg) : '',   // input (kg)
            tara: taraKg != null ? String(taraKg) : '',             // input (kg)

            volume: p?.volume ?? '',
            balanca_id: p?.balanca?.id ?? null,
            codigo_interno: p?.codigo_interno ?? '',
          })
        } catch (e) {
          console.error(e)
          setError('Não foi possível carregar a pesagem para edição.')
        } finally {
          if (alive) setLoading(false)
        }
      })()
    return () => { alive = false }
  }, [id])

  // auto limpar mensagem de sucesso
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 3500)
    return () => clearTimeout(t)
  }, [success])

  const onChange = (name, value) => {
    setError('')
    setSuccess('')
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const onSave = async () => {
    try {
      setSaving(true); setError(''); setSuccess('')

      // payload: operador informa LÍQUIDO (kg) + TARA (kg); NÃO enviamos bruto
      const payload = {
        lote: form.lote,
        liquido: form.liquido === '' ? null : Number(form.liquido), // kg — backend converte para g
        tara: form.tara === '' ? null : Number(form.tara),           // kg
        volume: form.volume?.toString() ?? '',
        balanca_id: form.balanca_id ?? null,
        codigo_interno: form.codigo_interno,
      }

      // se for legado (sem OP/ItemOP), permite ajustar vínculos e OP textual
      if (!isOPLinked) {
        payload.produto_id = form.produto_id ?? null
        payload.materia_prima_id = form.materia_prima_id ?? null
        payload.op = form.op_numero || ''
      }

      await api.updatePesagem(id, payload)
      setSuccess('Pesagem atualizada com sucesso!')
    } catch (e) {
      console.error(e)
      const msg =
        e?.response?.data?.detail ||
        e?.payload?.detail ||
        'Falha ao salvar. Verifique os campos e tente novamente.'
      setError(String(msg))
    } finally {
      setSaving(false)
    }
  }

  const onEtiqueta = async () => {
    try {
      const blob = await api.gerarEtiquetaPDF(id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error(e)
      setError('Falha ao gerar etiqueta.')
    }
  }

  // labels resolvidos (para cabeçalho)
  const header = useMemo(() => {
    if (!pesagem) return { produto: '-', mp: '-' }
    const produto =
      pesagem?.op?.produto?.nome ||
      pesagem?.produto?.nome ||
      pesagem?.produto_nome || '-'
    const mp =
      pesagem?.item_op?.materia_prima?.nome ||
      pesagem?.materia_prima?.nome ||
      pesagem?.materia_prima_nome || '-'
    return { produto, mp }
  }, [pesagem])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Editar Pesagem</h1>
          <p className="text-gray-600">
            ID #{id} • {header.produto} • {header.mp}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <Button onClick={onSave} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          <Button variant="secondary" onClick={onEtiqueta}>
            <Printer className="h-4 w-4 mr-2" /> Etiqueta
          </Button>
        </div>
      </div>

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
          <CardDescription>
            {isOPLinked ? 'Vinculada a OP/ItemOP (campos de vínculo bloqueados)' : 'Pesagem legada (pode ajustar vínculos)'}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Produto / Matéria-prima */}
          <div className="space-y-2">
            <Label>Produto</Label>
            {isOPLinked ? (
              <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
                <Package2 className="h-4 w-4 opacity-70" />
                <span className="truncate">
                  {pesagem?.op?.produto?.nome || pesagem?.produto?.nome || pesagem?.produto_nome || '—'}
                </span>
              </div>
            ) : (
              <Select
                value={form.produto_id ? String(form.produto_id) : '__none__'}
                onValueChange={(v) => onChange('produto_id', v === '__none__' ? null : Number(v))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Selecione…</SelectItem>
                  {produtos.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Matéria-prima</Label>
            {isOPLinked ? (
              <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
                <Layers className="h-4 w-4 opacity-70" />
                <span className="truncate">
                  {pesagem?.item_op?.materia_prima?.nome || pesagem?.materia_prima?.nome || pesagem?.materia_prima_nome || '—'}
                </span>
              </div>
            ) : (
              <Select
                value={form.materia_prima_id ? String(form.materia_prima_id) : '__none__'}
                onValueChange={(v) => onChange('materia_prima_id', v === '__none__' ? null : Number(v))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Selecione…</SelectItem>
                  {mps.map(mp => <SelectItem key={mp.id} value={String(mp.id)}>{mp.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* OP / Lote */}
          <div className="space-y-2">
            <Label>OP</Label>
            {isOPLinked ? (
              <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
                <Factory className="h-4 w-4 opacity-70" />
                <span className="truncate">{form.op_numero || '—'}</span>
              </div>
            ) : (
              <Input value={form.op_numero} onChange={(e) => onChange('op_numero', e.target.value)} placeholder="Número da OP (opcional)" />
            )}
          </div>

          <div className="space-y-2">
            <Label>Lote</Label>
            <Input value={form.lote} onChange={(e) => onChange('lote', e.target.value)} placeholder="Lote" />
          </div>

          {/* Pesos — entradas em kg, bruto é auto */}
          <div className="space-y-2">
            <Label>Líquido (kg)</Label>
            <Input type="number" step="0.001" value={form.liquido} onChange={(e) => onChange('liquido', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Tara (kg)</Label>
            <Input type="number" step="0.001" value={form.tara} onChange={(e) => onChange('tara', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Bruto (auto)</Label>
            <div className="rounded border px-3 py-2 bg-blue-50 flex items-center gap-2 text-blue-900">
              <Weight className="h-4 w-4" />
              {brutoCalcKg == null ? '—' : `${nf3.format(brutoCalcKg)} kg`}
            </div>
          </div>

          {/* Volume / Balança / Código */}
          <div className="space-y-2">
            <Label>Volume</Label>
            <Input value={form.volume} onChange={(e) => onChange('volume', e.target.value)} placeholder="Ex.: Balde 5L" />
          </div>

          <div className="space-y-2">
            <Label>Balança</Label>
            <Select
              value={form.balanca_id ? String(form.balanca_id) : '__none__'}
              onValueChange={(v) => onChange('balanca_id', v === '__none__' ? null : Number(v))}
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem balança</SelectItem>
                {balancas.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Código Interno</Label>
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-gray-500" />
              <Input value={form.codigo_interno} onChange={(e) => onChange('codigo_interno', e.target.value)} placeholder="Ex.: CI-0001" />
            </div>
          </div>

          {/* Metadados (leitura) */}
          <div className="space-y-2">
            <Label>Pesador</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Scale className="h-4 w-4 opacity-70" />
              <span className="truncate">{pesagem?.pesador || '—'}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data/Hora</Label>
            <div className="rounded border px-3 py-2 bg-muted/30">
              {fmtDT(pesagem?.data_hora)}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-gray-500">Carregando…</p>}
    </div>
  )
}
