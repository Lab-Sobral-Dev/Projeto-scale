import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Save, Printer, Package2, Layers, Factory, Scale, QrCode, Weight } from 'lucide-react'

const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const tz = 'America/Fortaleza'
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: tz }) : '-')

// API base (para pegar motivos)
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const MOTIVOS_URL = `${API_BASE}/registro/pesagens/motivos/`

// unidades
const KG_IN_G = 1000
const toNum = (x) => (x == null || x === '' ? null : Number(x))
const gToKg = (g) => (g == null ? null : Number(g) / KG_IN_G)

// Acessa serviço (mantendo tua api existente)
import api from '@/services/api'

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

  // controle de permissão local (papel)
  const [userRole, setUserRole] = useState('operador')
  const canEdit = useMemo(() => ['supervisor', 'admin'].includes(userRole), [userRole])

  // motivos (do backend)
  const [motivosEditMap, setMotivosEditMap] = useState({})
  const motivosEditList = useMemo(
    () => Object.entries(motivosEditMap).map(([value, label]) => ({ value, label })),
    [motivosEditMap]
  )
  const [motivo, setMotivo] = useState('')           // value (chave)
  const [motivoObs, setMotivoObs] = useState('')     // observação (quando "outro")

  // form controlado
  const [form, setForm] = useState({
    produto_id: null,
    materia_prima_id: null,
    op_id: null,
    item_op_id: null,
    op_numero: '',
    lote_mp: '',
    liquido: '', // kg
    tara: '',    // kg
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
    // papel do usuário
    try {
      const raw = localStorage.getItem('user')
      if (raw) {
        const u = JSON.parse(raw)
        if (u?.papel) setUserRole(u.papel)
        else if (u?.is_staff) setUserRole('admin')
      }
    } catch { }
  }, [])

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

          const produtoId = p?.op?.produto?.id ?? p?.produto?.id ?? (typeof p?.produto === 'number' ? p.produto : null)
          const mpId = p?.item_op?.materia_prima?.id ?? p?.materia_prima?.id ?? (typeof p?.materia_prima === 'number' ? p.materia_prima : null)

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
            // PESAGEM: campo correto é lote_mp
            lote_mp: p?.lote_mp || '',
            liquido: liquidoKg != null ? String(liquidoKg) : '',
            tara: taraKg != null ? String(taraKg) : '',
            balanca_id: p?.balanca?.id ?? null,
            codigo_interno: p?.codigo_interno ?? '',
          })

          // buscar motivos
          try {
            const res = await fetch(MOTIVOS_URL, { headers: { Authorization: `Bearer ${localStorage.getItem('access') || ''}` } })
            if (res.ok) {
              const data = await res.json()
              setMotivosEditMap(data?.edit || {})
            }
          } catch { /* silencioso */ }
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
    if (!canEdit) {
      setError('Você não tem permissão para editar esta pesagem.')
      return
    }
    if (!motivo) {
      setError('Selecione o motivo da edição.')
      return
    }
    if (motivo === 'outro' && !motivoObs.trim()) {
      setError('Descreva o motivo no campo de observação.')
      return
    }

    // validações mínimas de UI para evitar 400 bobos
    if (!form.lote_mp?.trim()) {
      setError('Informe o Lote MP.')
      return
    }
    const liquido = Number(form.liquido ?? 0)
    const tara = Number(form.tara ?? 0)
    if (!(liquido > 0)) {
      setError('Peso Líquido (kg) deve ser > 0.')
      return
    }
    if (tara < 0) {
      setError('Tara (kg) deve ser ≥ 0.')
      return
    }

    try {
      setSaving(true); setError(''); setSuccess('')

      const payload = {
        lote_mp: form.lote_mp.trim(),
        liquido,                  // kg (backend converte para g)
        tara,                     // kg
        balanca_id: form.balanca_id ?? null,
        codigo_interno: form.codigo_interno?.trim() || null,
        // Motivo obrigatório conforme backend
        motivo_edicao: motivo,
        motivo_observacao: motivoObs?.trim() || null,
      }

      // IMPORTANTE: não enviar produto_id/materia_prima_id/op/op_numero no update.
      // O serializer de Pesagem só aceita op_id/item_op_id na criação, e são read_only na leitura aqui.

      await api.updatePesagem(id, payload)
      setSuccess('Pesagem atualizada com sucesso!')
    } catch (e) {
      console.error(e)
      const data = e?.response?.data || e?.payload
      let msg = 'Falha ao salvar. Verifique os campos e tente novamente.'
      if (data) {
        if (typeof data === 'string') {
          msg = data
        } else if (typeof data === 'object') {
          msg = Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : String(v)}`)
            .join(' | ')
        }
      }
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
          <Button onClick={onSave} disabled={saving || loading || !canEdit} className={!canEdit ? 'opacity-60 cursor-not-allowed' : ''}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          <Button variant="secondary" onClick={onEtiqueta}>
            <Printer className="h-4 w-4 mr-2" /> Etiqueta
          </Button>
        </div>
      </div>

      {!canEdit && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800">
            Seu perfil não permite editar pesagens. Contate um supervisor ou administrador.
          </AlertDescription>
        </Alert>
      )}

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
            {isOPLinked ? 'Vinculada a OP/ItemOP (campos de vínculo bloqueados)' : 'Pesagem legada (campos de vínculo bloqueados)'}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Produto / Matéria-prima */}
          <div className="space-y-2">
            <Label>Produto</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Package2 className="h-4 w-4 opacity-70" />
              <span className="truncate">
                {pesagem?.op?.produto?.nome || pesagem?.produto?.nome || pesagem?.produto_nome || '—'}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Matéria-prima</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Layers className="h-4 w-4 opacity-70" />
              <span className="truncate">
                {pesagem?.item_op?.materia_prima?.nome || pesagem?.materia_prima?.nome || pesagem?.materia_prima_nome || '—'}
              </span>
            </div>
          </div>

          {/* OP / Lote MP */}
          <div className="space-y-2">
            <Label>OP</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Factory className="h-4 w-4 opacity-70" />
              <span className="truncate">{form.op_numero || '—'}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lote MP</Label>
            <Input
              value={form.lote_mp}
              onChange={(e) => onChange('lote_mp', e.target.value)}
              placeholder="Ex.: 24A0321"
              disabled={!canEdit}
            />
          </div>

          {/* Pesos */}
          <div className="space-y-2">
            <Label>Líquido (kg)</Label>
            <Input type="number" step="0.001" value={form.liquido} onChange={(e) => onChange('liquido', e.target.value)} disabled={!canEdit} />
          </div>

          <div className="space-y-2">
            <Label>Tara (kg)</Label>
            <Input type="number" step="0.001" value={form.tara} onChange={(e) => onChange('tara', e.target.value)} disabled={!canEdit} />
          </div>

          <div className="space-y-2">
            <Label>Bruto (auto)</Label>
            <div className="rounded border px-3 py-2 bg-blue-50 flex items-center gap-2 text-blue-900">
              <Weight className="h-4 w-4" />
              {brutoCalcKg == null ? '—' : `${nf3.format(brutoCalcKg)} kg`}
            </div>
          </div>

          {/* Balança / Código */}
          <div className="space-y-2">
            <Label>Balança</Label>
            <Select
              value={form.balanca_id ? String(form.balanca_id) : '__none__'}
              onValueChange={(v) => onChange('balanca_id', v === '__none__' ? null : Number(v))}
              disabled={!canEdit}
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
              <Input value={form.codigo_interno} onChange={(e) => onChange('codigo_interno', e.target.value)} placeholder="Ex.: CI-0001" disabled={!canEdit} />
            </div>
          </div>

          {/* Metadados */}
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

      {/* Motivo da edição */}
      <Card>
        <CardHeader>
          <CardTitle>Motivo da edição</CardTitle>
          <CardDescription>Selecione um motivo padronizado. Se necessário, detalhe no campo de observação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {motivosEditList.length === 0 ? (
              <div className="text-sm text-gray-500">Carregando motivos…</div>
            ) : motivosEditList.map((m) => (
              <label key={m.value} className={`flex items-center gap-2 rounded border p-2 hover:bg-gray-50 ${!canEdit ? 'opacity-60' : ''}`}>
                <input
                  type="radio"
                  name="motivo_edicao"
                  value={m.value}
                  checked={motivo === m.value}
                  onChange={() => setMotivo(m.value)}
                  disabled={!canEdit}
                />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </div>

          {motivo === 'outro' && (
            <div className="space-y-2">
              <Label>Observação</Label>
              <Input
                placeholder="Descreva o motivo"
                value={motivoObs}
                onChange={(e) => setMotivoObs(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-gray-500">Carregando…</p>}
    </div>
  )
}
