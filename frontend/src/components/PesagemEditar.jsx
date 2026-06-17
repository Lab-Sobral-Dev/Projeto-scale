import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from '@/components/ui/command'
import {
  ArrowLeft, Save, Printer, Package2, Factory, Scale, QrCode,
  Weight, Calculator, ChevronsUpDown, Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import { canEditPesagem } from '@/utils/authRoles'   // ⬅️ novo

// ---------- Constantes/Formatadores ----------
const KG_IN_G = 1000
const TOLERANCIA_PERCENTUAL = 0.05 // 5%

const kgToG = (kg) => Math.round((Number(kg) || 0) * KG_IN_G)
const gToKg = (g) => (Number(g) || 0) / KG_IN_G

const fmtG = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0 g'
  // preserva até 3 casas decimais (gramas); arredonda só para eliminar ruído de ponto flutuante
  const rounded = Number(n.toFixed(3))
  return rounded.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' g'
}

const toNumber = (v) => {
  if (typeof v !== 'string') return Number(v) || 0
  const s = v.trim()
  if (!s) return 0
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && !hasDot) return Number(s.replace(/\./g, '').replace(',', '.')) || 0
  if (!hasComma && hasDot) return Number(s) || 0
  return Number(s.replace(/\./g, '').replace(',', '.')) || 0
}

const tz = 'America/Fortaleza'
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: tz }) : '-')

// === HELPERS PARA VÍRGULA NA UI ===

// Normaliza digitação: força vírgula, tira caracteres estranhos, só deixa 1 vírgula
// e limita as casas decimais à precisão da balança (maxDecimals), sem arredondar.
const normalizeDecimalInput = (value, maxDecimals = 3) => {
  if (!value) return ''
  let v = value.replace(/\./g, ',')
  v = v.replace(/[^0-9,]/g, '')
  const parts = v.split(',')
  if (parts.length > 2) {
    v = parts[0] + ',' + parts.slice(1).join('')
  }
  if (maxDecimals <= 0) return v.split(',')[0]
  const [intPart, fracPart] = v.split(',')
  if (fracPart != null) return `${intPart},${fracPart.slice(0, maxDecimals)}`
  return v
}

// Formata número com vírgula para exibição
const formatNumberWithComma = (num, decimals = 3) => {
  if (num === null || num === undefined || isNaN(num)) return (0).toFixed(decimals).replace('.', ',')
  return num.toFixed(decimals).replace('.', ',')
}

// Placeholder dinâmico conforme a precisão (ex.: 3 -> "0,000 kg"; 0 -> "0 kg")
const placeholderKg = (decimals = 3) =>
  (decimals > 0 ? `0,${'0'.repeat(decimals)}` : '0') + ' kg'

const isBalancaCalibrada = (balanca) => {
  if (!balanca?.calibracao_realizada || !balanca?.ultima_calibracao) return false
  const dt = new Date(`${balanca.ultima_calibracao}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return false
  const limite = new Date(dt)
  const freqDias = Number(balanca?.frequencia_calibracao_dias || 365)
  limite.setDate(limite.getDate() + freqDias)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return hoje <= limite
}

// API base (motivos)
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const MOTIVOS_URL = `${API_BASE}/registro/pesagens/motivos/`

export default function PesagemEditar() {
  const { id } = useParams()
  const navigate = useNavigate()

  // 🔐 Guard: só supervisor ou admin entram aqui
  if (!canEditPesagem()) {
    return <Navigate to="/" replace />
  }

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [pesagem, setPesagem] = useState(null)
  const [ops, setOps] = useState([])
  const [itensOP, setItensOP] = useState([])
  const [balancas, setBalancas] = useState([])

  const [motivosEditMap, setMotivosEditMap] = useState({})
  const motivosEditList = useMemo(
    () => Object.entries(motivosEditMap).map(([value, label]) => ({ value, label })),
    [motivosEditMap]
  )
  const [motivo, setMotivo] = useState('')
  const [motivoObs, setMotivoObs] = useState('')

  const [form, setForm] = useState({
    op: '',
    itemOp: '',
    pesador: '',
    data_hora: '',
    produtoNome: '',
    mpNome: '',
    lote_mp: '',
    liquido: '',
    tara: '',
    balanca: '',
    codigoInterno: '',
  })

  const liquidoRef = useRef(null)

  const normalizeList = (data) => Array.isArray(data) ? data : (data?.results ?? [])

  const handleChange = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  useEffect(() => {
    let alive = true
      ; (async () => {
        try {
          setLoading(true); setError('')
          const [p, opsRes, balsRes] = await Promise.all([
            api.getPesagem(id),
            api.getOPs({ ordering: '-criada_em' }),
            api.getBalancas(),
          ])
          if (!alive) return

          setPesagem(p)

          const opsNorm = normalizeList(opsRes).map(o => ({
            id: o.id,
            numero: o.numero,
            lote: o.lote,
            status: o.status,
            produtoNome: o.produto?.nome ?? '',
          }))
          setOps(opsNorm)

          const balsNorm = normalizeList(balsRes).map(b => ({
            id: b.id,
            nome: b.nome,
            ultimaCalibracao: b.ultima_calibracao ?? null,
            emCalibracao: isBalancaCalibrada(b),
            casasDecimais: b.casas_decimais != null ? Number(b.casas_decimais) : 3,
          }))
          setBalancas(balsNorm)

          // Casas decimais da balança da pesagem (para formatar os valores iniciais sem arredondar).
          const casasIniciais = p?.balanca?.casas_decimais != null ? Number(p.balanca.casas_decimais) : 3

          const opId = p?.op?.id ?? ''
          const itemId = p?.item_op?.id ?? ''

          const liquidoKg =
            gToKg(p?.liquido ?? p?.liquido_g ?? 0) ||
            ((p?.bruto != null && p?.tara != null) ? (Number(p.bruto) - Number(p.tara)) : 0)

          setForm(prev => ({
            ...prev,
            op: opId ? String(opId) : '',
            itemOp: itemId ? String(itemId) : '',
            pesador: p?.pesador || '',
            data_hora: p?.data_hora || '',
            produtoNome: p?.op?.produto?.nome || '',
            mpNome: p?.item_op?.materia_prima?.nome || '',
            lote_mp: p?.lote_mp || '',
            // já formatados com vírgula, respeitando a precisão da balança (sem arredondar)
            liquido: liquidoKg ? formatNumberWithComma(liquidoKg, casasIniciais) : '',
            tara: p?.tara != null ? formatNumberWithComma(Number(p.tara), casasIniciais) : '',
            balanca: p?.balanca?.id ? String(p.balanca.id) : '',
            codigoInterno: p?.codigo_interno || '',
          }))

          if (opId) {
            const itens = await api.getOPItems(opId)
            const itensNorm = normalizeList(itens).map(it => ({
              id: it.id,
              mpNome: it.materia_prima?.nome ?? '',
              mpCodigo: it.materia_prima?.codigo_interno ?? '',
              quantidade_necessaria: it.quantidade_necessaria,
              quantidade_pesada: it.quantidade_pesada,         // inclui a pesagem atual
              quantidade_restante: it.quantidade_restante,
              unidade: it.unidade,
            }))
            if (alive) setItensOP(itensNorm)
          }

          try {
            const data = await api.get('/registro/pesagens/motivos/')
            setMotivosEditMap(data?.edit || {})
          } catch { }
        } catch (e) {
          console.error(e)
          setError('Não foi possível carregar a pesagem para edição.')
        } finally {
          if (alive) setLoading(false)
        }
      })()
    return () => { alive = false }
  }, [id])

  const handleOPChange = async (opId) => {
    handleChange('op', opId)
    handleChange('itemOp', '')
    handleChange('codigoInterno', '')
    const sel = ops.find(o => o.id.toString() === String(opId))
    handleChange('produtoNome', sel?.produtoNome || '')
    try {
      const resp = await api.getOPItems(opId)
      const itens = normalizeList(resp).map(it => ({
        id: it.id,
        mpNome: it.materia_prima?.nome ?? '',
        mpCodigo: it.materia_prima?.codigo_interno ?? '',
        quantidade_necessaria: it.quantidade_necessaria,
        quantidade_pesada: it.quantidade_pesada,
        quantidade_restante: it.quantidade_restante,
        unidade: it.unidade,
      }))
      setItensOP(itens)
    } catch (e) {
      console.error(e)
      setError('Falha ao carregar itens da OP.')
    }
  }

  const itemSelecionado = useMemo(() => {
    if (!form.itemOp) return null
    return itensOP.find(i => i.id.toString() === form.itemOp.toString()) || null
  }, [form.itemOp, itensOP])

  useEffect(() => {
    if (itemSelecionado) {
      handleChange('mpNome', itemSelecionado.mpNome || '')
      handleChange('codigoInterno', itemSelecionado.mpCodigo || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSelecionado?.id])

  // ---- Cálculos ----
  const liquidoKg = useMemo(() => toNumber(form.liquido), [form.liquido])
  const taraKg = useMemo(() => toNumber(form.tara), [form.tara])

  // Bruto (auto) — LIQ + TARA (exibição)
  const brutoCalcKg = useMemo(() => {
    const l = toNumber(form.liquido)
    const t = toNumber(form.tara)
    const val = l + t
    return Number.isFinite(val) && val > 0 ? val : 0
  }, [form.liquido, form.tara])

  // SALDO/VALIDAÇÃO: usa somente o LÍQUIDO (em g)
  const pesoLiquidoG = useMemo(() => kgToG(liquidoKg), [liquidoKg])

  // Valores do item selecionado
  const necessarioG = itemSelecionado ? Number(itemSelecionado.quantidade_necessaria || 0) : 0
  const pesadoG = itemSelecionado ? Number(itemSelecionado.quantidade_pesada || 0) : 0

  // Pesagem atual original (g), para não “contar duas vezes”
  const liquidoOriginalG = useMemo(
    () => Math.round(Number(pesagem?.liquido || 0)),
    [pesagem?.liquido]
  )

  // Já pesado sem esta pesagem
  const pesadoSemEstaG = Math.max(pesadoG - liquidoOriginalG, 0)

  // Total projetado após salvar
  const novoTotalG = pesadoSemEstaG + pesoLiquidoG

  // Limites e indicadores
  const limiteMinG = necessarioG * (1 - TOLERANCIA_PERCENTUAL)
  const limiteMaxG = necessarioG * (1 + TOLERANCIA_PERCENTUAL)
  const excedeMaximo = novoTotalG > limiteMaxG
  const abaixoDoMinimo = novoTotalG < limiteMinG
  const faltaParaMinG = Math.max(limiteMinG - novoTotalG, 0)
  const margemAteMaxG = Math.max(limiteMaxG - novoTotalG, 0)

  // Exibição do “restante” com base no acumulado real atual
  const restanteG = Math.max(necessarioG - pesadoSemEstaG, 0)

  const opSelecionada = useMemo(() => {
    if (!form.op) return null
    return ops.find(o => o.id.toString() === String(form.op)) || null
  }, [form.op, ops])

  const balancaSelecionada = useMemo(() => {
    if (!form.balanca || form.balanca === '__none__') return null
    return balancas.find(b => String(b.id) === String(form.balanca)) || null
  }, [balancas, form.balanca])

  // Casas decimais (kg) da balança selecionada; padrão 3 (inclui "Sem balança").
  const casasDecimais = balancaSelecionada?.casasDecimais ?? 3

  // Ao trocar a balança, trunca (sem arredondar) dígitos excedentes já digitados.
  useEffect(() => {
    setForm(prev => {
      const t = normalizeDecimalInput(prev.tara, casasDecimais)
      const l = normalizeDecimalInput(prev.liquido, casasDecimais)
      if (t === prev.tara && l === prev.liquido) return prev
      return { ...prev, tara: t, liquido: l }
    })
  }, [casasDecimais])

  const opNumeroLote = useMemo(() => {
    if (!opSelecionada) return '—'
    return `OP ${opSelecionada.numero} • Lote ${opSelecionada.lote}`
  }, [opSelecionada])

  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 3500)
    return () => clearTimeout(t)
  }, [success])

  const onSave = async () => {
    setError(''); setSuccess('')
    if (!form.op) return setError('Selecione a OP.')
    if (!form.itemOp) return setError('Selecione o Item da OP (Matéria-prima).')
    if (!form.lote_mp?.trim()) return setError('Informe o Lote MP.')
    if (!(liquidoKg > 0)) return setError('Peso Líquido (kg) deve ser > 0.')
    if (taraKg < 0) return setError('Tara (kg) deve ser ≥ 0.')
    if (!motivo) return setError('Selecione o motivo da edição.')
    if (motivo === 'outro' && !motivoObs.trim()) return setError('Descreva o motivo no campo de observação.')
    if (form.balanca && form.balanca !== '__none__' && !balancaSelecionada?.emCalibracao) {
      return setError('A balança selecionada está fora da calibração. Escolha uma balança calibrada ou selecione "Sem balança".')
    }
    if (excedeMaximo) return setError(`Ultrapassa o limite superior (+5%). Máximo: ${fmtG(limiteMaxG)}. Total projetado: ${fmtG(novoTotalG)}.`)

    try {
      setSaving(true)
      const payload = {
        op_id: Number(form.op),
        item_op_id: Number(form.itemOp),
        lote_mp: form.lote_mp.trim(),
        liquido: Number(liquidoKg.toFixed(casasDecimais)), // kg
        tara: Number(taraKg.toFixed(casasDecimais)),       // kg
        balanca_id: form.balanca && form.balanca !== '__none__' ? Number(form.balanca) : null,
        codigo_interno: form.codigoInterno?.trim() || null,
        motivo_edicao: motivo,
        motivo_observacao: motivoObs?.trim() || null,
      }
      await api.updatePesagem(id, payload)
      setSuccess('Pesagem atualizada com sucesso!')
    } catch (e) {
      console.error(e)
      const data = e?.response?.data || e?.payload
      let msg = 'Falha ao salvar. Verifique os campos e tente novamente.'
      if (data) {
        if (typeof data === 'string') msg = data
        else if (typeof data === 'object') {
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

  const itemLabel = (it) => {
    const code = it.mpCodigo ? `${it.mpCodigo} — ` : ''
    const necG = Number(it.quantidade_necessaria || 0)
    const pesG = Number(it.quantidade_pesada || 0)
    const saldoG = Math.max(necG - pesG, 0)
    return `${code}${it.mpNome} · nec ${fmtG(necG)} · pes ${fmtG(pesG)} · rest ${fmtG(saldoG)}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Editar Pesagem</h1>
          <p className="text-gray-600">
            ID #{id} • {form.produtoNome || '—'} • {form.mpNome || '—'}
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
          <CardDescription>Vinculada a OP/ItemOP — agora você pode ajustar os vínculos.</CardDescription>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* OP */}
          <div className="space-y-2 min-w-0">
            <Label>Ordem de Produção</Label>
            <Select
              value={String(form.op || '')}
              onValueChange={handleOPChange}
              disabled={loading}
              required
            >
              <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis">
                <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione a OP'} />
              </SelectTrigger>
              <SelectContent>
                {ops.map(o => (
                  <SelectItem
                    key={o.id}
                    value={String(o.id)}
                    className="leading-tight"
                    title={`OP ${o.numero} • ${o.produtoNome} • Lote ${o.lote} (${o.status})`}
                  >
                    {`OP ${o.numero} • ${o.produtoNome} • Lote ${o.lote} (${o.status})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Produto (somente leitura visual) */}
          <div className="space-y-2">
            <Label>Produto</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Package2 className="h-4 w-4 opacity-70" />
              <span className="truncate">{form.produtoNome || '—'}</span>
            </div>
          </div>

          {/* OP / Lote (somente leitura visual) */}
          <div className="space-y-2">
            <Label>OP / Lote</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Factory className="h-4 w-4 opacity-70" />
              <span className="truncate">{opNumeroLote}</span>
            </div>
          </div>

          {/* Item da OP — Combobox */}
          <div className="space-y-2">
            <Label>Item da OP (Matéria-prima)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  title={form.itemOp && itemSelecionado ? itemLabel(itemSelecionado) : undefined}
                  disabled={!form.op}
                >
                  <span className="w-full truncate text-left">
                    {form.itemOp
                      ? (itemSelecionado ? itemLabel(itemSelecionado) : '—')
                      : (!form.op ? 'Selecione uma OP primeiro' : 'Pesquisar item da OP...')}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" sideOffset={5}>
                <Command>
                  <CommandInput placeholder="Pesquisar nome/código da MP..." />
                  <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                  <CommandList className="max-h-[300px] overflow-y-auto">
                    <CommandGroup>
                      {itensOP.map((it) => {
                        const selected = form.itemOp?.toString() === it.id.toString()
                        return (
                          <CommandItem
                            key={it.id}
                            value={`${it.mpCodigo || ''} ${it.mpNome}`}
                            onSelect={() => handleChange('itemOp', it.id.toString())}
                            className="cursor-pointer"
                            title={itemLabel(it)}
                          >
                            <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
                            {itemLabel(it)}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Código Interno (editável) */}
          <div className="space-y-2">
            <Label>Código Interno (MP)</Label>
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-gray-500" />
              <Input
                value={form.codigoInterno}
                onChange={(e) => handleChange('codigoInterno', e.target.value)}
                placeholder="Ex.: CI-0001"
              />
            </div>
          </div>

          {/* Lote MP */}
          <div className="space-y-2">
            <Label>Lote MP</Label>
            <Input
              value={form.lote_mp}
              onChange={(e) => handleChange('lote_mp', e.target.value)}
              onBlur={(e) => handleChange('lote_mp', e.target.value.trim())}
              placeholder="Ex.: 24A0321"
              maxLength={60}
            />
          </div>

          {/* Balança */}
          <div className="space-y-2 min-w-0">
            <Label>Balança</Label>
            <Select
              value={String(form.balanca || '')}
              onValueChange={(v) => handleChange('balanca', v)}
              disabled={loading}
            >
              <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis">
                <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione a balança'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem balança</SelectItem>
                {balancas.map(b => (
                  <SelectItem key={b.id} value={String(b.id)} disabled={!b.emCalibracao}>
                    {b.nome}{b.emCalibracao ? '' : ' (fora da calibração)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.balanca && form.balanca !== '__none__' && !balancaSelecionada?.emCalibracao && (
              <p className="text-sm text-red-600">Esta balança está fora da calibração e não pode ser usada.</p>
            )}
          </div>

          {/* Entradas (kg) */}
          <div className="space-y-2">
            <Label>Tara (kg)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.tara}
              onChange={(e) => handleChange('tara', normalizeDecimalInput(e.target.value, casasDecimais))}
              placeholder={placeholderKg(casasDecimais)}
            />
          </div>

          <div className="space-y-2">
            <Label>Líquido (kg)</Label>
            <Input
              ref={liquidoRef}
              type="text"
              inputMode="decimal"
              value={form.liquido}
              onChange={(e) => handleChange('liquido', normalizeDecimalInput(e.target.value, casasDecimais))}
              placeholder={placeholderKg(casasDecimais)}
            />
          </div>

          {/* Bruto (auto) no card de dados */}
          <div className="space-y-2">
            <Label>Bruto (auto)</Label>
            <div className="rounded border px-3 py-2 bg-blue-50 flex items-center gap-2 text-blue-900">
              <Weight className="h-4 w-4" />
              {`${formatNumberWithComma(brutoCalcKg, casasDecimais)} kg`}
            </div>
          </div>

          {/* Pesador (read-only) */}
          <div className="space-y-2">
            <Label>Pesador</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Scale className="h-4 w-4 opacity-70" />
              <span className="truncate">{form.pesador || '—'}</span>
            </div>
          </div>

          {/* Data/Hora (read-only) */}
          <div className="space-y-2">
            <Label>Data/Hora</Label>
            <div className="rounded border px-3 py-2 bg-muted/30">
              {fmtDT(form.data_hora)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blocos de cálculo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            <Label className="text-blue-900 font-semibold">Peso Bruto (auto)</Label>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {formatNumberWithComma(brutoCalcKg, casasDecimais)} kg
          </div>
          <p className="text-sm text-blue-700 mt-1">
            Líquido ({form.liquido || '0'}) + Tara ({form.tara || '0'})
          </p>
        </div>

        <div className="bg-amber-50 p-4 rounded-lg">
          <Label className="font-semibold text-amber-900">Saldo do Item</Label>
          <div className="mt-2 text-amber-900">
            Necessário: <b>{fmtG(necessarioG)}</b><br />
            <span>Pesado (antes desta edição): </span><b>{fmtG(pesadoSemEstaG)}</b><br />
            Restante: <b>{fmtG(restanteG)}</b><br />
            Projetado: <b>{fmtG(novoTotalG)}</b><br />
            Limites (±5%): <b>{fmtG(limiteMinG)}</b> a <b>{fmtG(limiteMaxG)}</b>
          </div>

          {excedeMaximo && (
            <p className="mt-2 text-red-700 text-sm">
              Ultrapassa o limite superior (+5%). Ajuste o peso para no máximo {fmtG(limiteMaxG)}.
            </p>
          )}

          {!excedeMaximo && (
            <div className="mt-3 space-y-1 text-sm">
              {abaixoDoMinimo ? (
                <p className="text-amber-700">
                  Parcial abaixo do mínimo permitido para conclusão. Falta para o mínimo: <b>{fmtG(faltaParaMinG)}</b>.
                </p>
              ) : (
                <p className="text-green-700">
                  Mínimo atingido para este item. Você ainda tem margem até o máximo: <b>{fmtG(margemAteMaxG)}</b>.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

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
              <label key={m.value} className="flex items-center gap-2 rounded border p-2 hover:bg-gray-50">
                <input
                  type="radio"
                  name="motivo_edicao"
                  value={m.value}
                  checked={motivo === m.value}
                  onChange={() => setMotivo(m.value)}
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
              />
            </div>
          )}
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-gray-500">Carregando…</p>}
    </div>
  )
}