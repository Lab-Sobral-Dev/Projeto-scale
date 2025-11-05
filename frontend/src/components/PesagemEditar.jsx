import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import { ArrowLeft, Save, Printer, Package2, Layers, Factory, Scale, QrCode, Weight, Calculator, ChevronsUpDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/services/api'

// ---------- Constantes/Formatadores (iguais aos da NovaPesagem) ----------
const KG_IN_G = 1000
const TOLERANCIA_PERCENTUAL = 0.05 // 5%
const kgToG = (kg) => Math.round((Number(kg) || 0) * KG_IN_G)
const gToKg = (g) => (Number(g) || 0) / KG_IN_G
const fmtG = (v) => {
  const n = Math.round(Number(v) || 0)
  return n.toLocaleString('pt-BR') + ' g'
}
const toNumber = (v) => {
  if (typeof v !== 'string') return Number(v) || 0
  const s = v.replace(/\s/g, '')
  return Number(s.replace(/\./g, '').replace(',', '.')) || 0
}

const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const tz = 'America/Fortaleza'
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: tz }) : '-')

// API base (motivos)
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const MOTIVOS_URL = `${API_BASE}/registro/pesagens/motivos/`

export default function PesagemEditar() {
  const { id } = useParams()
  const navigate = useNavigate()

  // estado básico
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // dados carregados
  const [pesagem, setPesagem] = useState(null)
  const [ops, setOps] = useState([])
  const [itensOP, setItensOP] = useState([])
  const [balancas, setBalancas] = useState([])

  // motivos edição
  const [motivosEditMap, setMotivosEditMap] = useState({})
  const motivosEditList = useMemo(
    () => Object.entries(motivosEditMap).map(([value, label]) => ({ value, label })),
    [motivosEditMap]
  )
  const [motivo, setMotivo] = useState('')
  const [motivoObs, setMotivoObs] = useState('')

  // formulário
  const [form, setForm] = useState({
    // vínculos
    op: '',          // string para Select/Popover
    itemOp: '',      // string
    // exibidos (somente leitura)
    pesador: '',
    data_hora: '',
    // dados editáveis
    produtoNome: '',
    mpNome: '',
    lote_mp: '',
    liquido: '',     // kg (string para input)
    tara: '',        // kg (string para input)
    balanca: '',     // string id
    codigoInterno: '',
  })

  // refs
  const liquidoRef = useRef(null)

  // helpers
  const normalizeList = (data) => Array.isArray(data) ? data : (data?.results ?? [])
  const handleChange = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  // carregar tudo
  useEffect(() => {
    let alive = true
      ; (async () => {
        try {
          setLoading(true); setError('')
          // carrega pesagem + listas
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

          const balsNorm = normalizeList(balsRes).map(b => ({ id: b.id, nome: b.nome }))
          setBalancas(balsNorm)

          // monta form
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
            liquido: liquidoKg ? String(liquidoKg) : '',
            tara: p?.tara != null ? String(p.tara) : '',
            balanca: p?.balanca?.id ? String(p.balanca.id) : '',
            codigoInterno: p?.codigo_interno || '',
          }))

          // carrega itens da OP atual, se houver
          if (opId) {
            const itens = await api.getOPItems(opId)
            const itensNorm = normalizeList(itens).map(it => ({
              id: it.id,
              mpNome: it.materia_prima?.nome ?? '',
              mpCodigo: it.materia_prima?.codigo_interno ?? '',
              quantidade_necessaria: it.quantidade_necessaria, // g
              quantidade_pesada: it.quantidade_pesada,         // g
              quantidade_restante: it.quantidade_restante,     // g
              unidade: it.unidade,
            }))
            if (alive) setItensOP(itensNorm)
          }

          // motivos
          try {
            const res = await fetch(MOTIVOS_URL, { headers: { Authorization: `Bearer ${localStorage.getItem('access') || ''}` } })
            if (res.ok) {
              const data = await res.json()
              setMotivosEditMap(data?.edit || {})
            }
          } catch { /* ignore */ }

        } catch (e) {
          console.error(e)
          setError('Não foi possível carregar a pesagem para edição.')
        } finally {
          if (alive) setLoading(false)
        }
      })()
    return () => { alive = false }
  }, [id])

  // quando troca OP, recarrega itens e limpa dependentes
  const handleOPChange = async (opId) => {
    handleChange('op', opId)
    handleChange('itemOp', '')
    handleChange('codigoInterno', '')
    // atualiza campos exibidos (produto, op/lote)
    const sel = ops.find(o => o.id.toString() === String(opId))
    handleChange('produtoNome', sel?.produtoNome || '')
    try {
      const resp = await api.getOPItems(opId)
      const itens = normalizeList(resp).map(it => ({
        id: it.id,
        mpNome: it.materia_prima?.nome ?? '',
        mpCodigo: it.materia_prima?.codigo_interno ?? '',
        quantidade_necessaria: it.quantidade_necessaria, // g
        quantidade_pesada: it.quantidade_pesada,         // g
        quantidade_restante: it.quantidade_restante,     // g
        unidade: it.unidade,
      }))
      setItensOP(itens)
    } catch (e) {
      console.error(e)
      setError('Falha ao carregar itens da OP.')
    }
  }

  // quando seleciona item, preenche mp/código
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

  // ---- Unidades/Calculos (iguais à NovaPesagem) ----
  const liquidoKg = useMemo(() => toNumber(form.liquido), [form.liquido])
  const taraKg = useMemo(() => toNumber(form.tara), [form.tara])
  const brutoCalcKg = useMemo(() => {
    const val = liquidoKg + taraKg
    return val > 0 ? val : 0
  }, [liquidoKg, taraKg])
  const pesoLiquidoG = useMemo(() => kgToG(liquidoKg), [liquidoKg])

  const necessarioG = itemSelecionado ? Number(itemSelecionado.quantidade_necessaria || 0) : 0
  const pesadoG = itemSelecionado ? Number(itemSelecionado.quantidade_pesada || 0) : 0
  const restanteG = Math.max(necessarioG - pesadoG, 0)

  const limiteMinG = necessarioG * (1 - TOLERANCIA_PERCENTUAL)
  const limiteMaxG = necessarioG * (1 + TOLERANCIA_PERCENTUAL)

  const novoTotalG = pesadoG + pesoLiquidoG
  const excedeMaximo = novoTotalG > limiteMaxG
  const abaixoDoMinimo = novoTotalG < limiteMinG
  const faltaParaMinG = Math.max(limiteMinG - novoTotalG, 0)
  const margemAteMaxG = Math.max(limiteMaxG - novoTotalG, 0)

  // OP e Lote para exibição
  const opSelecionada = useMemo(() => {
    if (!form.op) return null
    return ops.find(o => o.id.toString() === String(form.op)) || null
  }, [form.op, ops])

  const opNumeroLote = useMemo(() => {
    if (!opSelecionada) return '—'
    return `OP ${opSelecionada.numero} • Lote ${opSelecionada.lote}`
  }, [opSelecionada])

  // auto limpar mensagem de sucesso
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 3500)
    return () => clearTimeout(t)
  }, [success])

  // salvar
  const onSave = async () => {
    setError(''); setSuccess('')
    // validações de UI
    if (!form.op) return setError('Selecione a OP.')
    if (!form.itemOp) return setError('Selecione o Item da OP (Matéria-prima).')
    if (!form.lote_mp?.trim()) return setError('Informe o Lote MP.')
    if (!(liquidoKg > 0)) return setError('Peso Líquido (kg) deve ser > 0.')
    if (taraKg < 0) return setError('Tara (kg) deve ser ≥ 0.')
    if (!motivo) return setError('Selecione o motivo da edição.')
    if (motivo === 'outro' && !motivoObs.trim()) return setError('Descreva o motivo no campo de observação.')
    if (excedeMaximo) {
      return setError(`Ultrapassa o limite superior (+5%). Máximo: ${fmtG(limiteMaxG)}. Total projetado: ${fmtG(novoTotalG)}.`)
    }

    try {
      setSaving(true)

      const payload = {
        // vínculos (agora editáveis)
        op_id: Number(form.op),
        item_op_id: Number(form.itemOp),

        // dados
        lote_mp: form.lote_mp.trim(),
        liquido: Number(liquidoKg.toFixed(3)), // kg (back converte para g e calcula bruto)
        tara: Number(taraKg.toFixed(3)),       // kg
        balanca_id: form.balanca ? Number(form.balanca) : null,
        codigo_interno: form.codigoInterno?.trim() || null,

        // auditoria
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

  // UI helpers
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

          {/* Produto (read-only visual) */}
          <div className="space-y-2">
            <Label>Produto</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Package2 className="h-4 w-4 opacity-70" />
              <span className="truncate">{form.produtoNome || '—'}</span>
            </div>
          </div>

          {/* OP / Lote (read-only visual) */}
          <div className="space-y-2">
            <Label>OP / Lote</Label>
            <div className="rounded border px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Factory className="h-4 w-4 opacity-70" />
              <span className="truncate">{opNumeroLote}</span>
            </div>
          </div>

          {/* Item da OP — Combobox estilo NovaPesagem */}
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

          {/* Código Interno (editável agora) */}
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
                  <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entradas (kg) */}
          <div className="space-y-2">
            <Label>Tara (kg)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.tara}
              onChange={(e) => handleChange('tara', e.target.value)}
              placeholder="0,000 kg"
            />
          </div>

          <div className="space-y-2">
            <Label>Líquido (kg)</Label>
            <Input
              ref={liquidoRef}
              type="text"
              inputMode="decimal"
              value={form.liquido}
              onChange={(e) => handleChange('liquido', e.target.value)}
              placeholder="0,000 kg"
            />
          </div>

          {/* Bruto (auto) */}
          <div className="space-y-2">
            <Label>Bruto (auto)</Label>
            <div className="rounded border px-3 py-2 bg-blue-50 flex items-center gap-2 text-blue-900">
              <Weight className="h-4 w-4" />
              {`${nf3.format(brutoCalcKg)} kg`}
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

      {/* Bloco de cálculo e saldo (igual à NovaPesagem) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            <Label className="text-blue-900 font-semibold">Peso Bruto (auto)</Label>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {Number.isFinite(brutoCalcKg) ? brutoCalcKg.toFixed(3) : '0,000'} kg
          </div>
          <p className="text-sm text-blue-700 mt-1">
            Líquido ({form.liquido || '0'}) + Tara ({form.tara || '0'})
          </p>
        </div>

        <div className="bg-amber-50 p-4 rounded-lg">
          <Label className="font-semibold text-amber-900">Saldo do Item</Label>
          <div className="mt-2 text-amber-900">
            Necessário: <b>{fmtG(necessarioG)}</b><br />
            Pesado: <b>{fmtG(pesadoG)}</b><br />
            Restante: <b>{fmtG(restanteG)}</b><br />
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
