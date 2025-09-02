// NovaPesagem.jsx

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from '@/components/ui/command'
import { Scale, Save, Printer, RotateCcw, Calculator, ChevronsUpDown, Check, Package, Tag } from 'lucide-react'
import api from '@/services/api'
import { cn } from '@/lib/utils'

/**
 * UI: entradas em kg (3 casas), regra interna: gramas (g)
 */
const KG_IN_G = 1000
const TOLERANCIA_PERCENTUAL = 0.05 // 5%

const kgToG = (kg) => Math.round((Number(kg) || 0) * KG_IN_G)    // => g (inteiro)
const gToKg = (g) => (Number(g) || 0) / KG_IN_G                  // => kg (decimal)

// formatadores
const fmtG = (v) => {
  const n = Math.round(Number(v) || 0)
  return n.toLocaleString('pt-BR') + ' g'
}

// conversor robusto pt-BR para número
const toNumber = (v) => {
  if (typeof v !== 'string') return Number(v) || 0
  const s = v.replace(/\s/g, '')
  return Number(s.replace(/\./g, '').replace(',', '.')) || 0
}

const NovaPesagem = () => {
  const [localUser, setLocalUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [ops, setOps] = useState([])
  const [itensOP, setItensOP] = useState([])
  const [balancas, setBalancas] = useState([])

  const [createdId, setCreatedId] = useState(null)

  const [openItem, setOpenItem] = useState(false)
  const [searchItem, setSearchItem] = useState('')

  const getInitialFormData = (user = null) => ({
    op: '',          // sempre string p/ Select controlado
    itemOp: '',       // sempre string p/ Select/Popover controlado
    pesador: user?.nome || '',
    // Entradas SEMPRE em kg na UI
    liquido: '',     // input do usuário (kg)
    tara: '',        // input do usuário (kg)
    balanca: '',      // sempre string p/ Select controlado
    codigoInterno: '',
    loteMP: ''         // mapeia para lote_mp
  })

  const [formData, setFormData] = useState(getInitialFormData())

  const getDisplayName = (user) => {
    if (!user) return ''
    return user.nome?.trim()
      || `${(user.first_name || '').trim()} ${(user.last_name || '').trim()}`.trim()
      || user.username
      || ''
  }

  const normalizeList = (data) => Array.isArray(data) ? data : (data?.results ?? [])

  useEffect(() => {
    let abort = false
    async function loadInitialData() {
      setLoading(true)
      try {
        const [opsRes, balRes, userRes] = await Promise.all([
          api.getOPs({ ordering: '-criada_em' }),
          api.getBalancas(),
          api.me().catch(() => null)
        ])
        if (abort) return

        const opsNorm = normalizeList(opsRes)
          .filter(o => ['aberta', 'em_andamento'].includes(o.status))
          .map(o => ({
            id: o.id,
            numero: o.numero,
            lote: o.lote,
            status: o.status,
            produtoNome: o.produto?.nome ?? '',
          }))

        const balsNorm = normalizeList(balRes).map(b => ({ id: b.id, nome: b.nome }))

        setOps(opsNorm)
        setBalancas(balsNorm)

        const display = getDisplayName(userRes)
        const safeUser = userRes ? userRes : {}
        setLocalUser({ ...safeUser, displayName: display })
        setFormData(prev => ({ ...prev, pesador: display }))
      } catch (e) {
        console.error(e)
        setError('Não foi possível carregar os dados iniciais.')
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
    return () => { abort = true }
  }, [])

  // ---- Unidades: UI em kg; comparação/saldo em g ----
  // Entradas do usuário (kg)
  const liquidoKg = useMemo(() => toNumber(formData.liquido), [formData.liquido])
  const taraKg = useMemo(() => toNumber(formData.tara), [formData.tara])

  // Cálculo automático do bruto (kg)
  const brutoCalculadoKg = useMemo(() => {
    const val = liquidoKg + taraKg
    return val > 0 ? val : 0
  }, [liquidoKg, taraKg])

  // Líquido em g (para validação)
  const pesoLiquidoG = useMemo(() => kgToG(liquidoKg), [liquidoKg])

  // Item selecionado
  const itemSelecionado = useMemo(() => {
    if (!formData.itemOp) return null
    return itensOP.find(i => i.id.toString() === formData.itemOp.toString()) || null
  }, [formData.itemOp, itensOP])

  // Quantidades do item (em g, vindas do backend)
  const necessarioG = itemSelecionado ? Number(itemSelecionado.quantidade_necessaria || 0) : 0
  const pesadoG = itemSelecionado ? Number(itemSelecionado.quantidade_pesada || 0) : 0
  const restanteG = Math.max(necessarioG - pesadoG, 0)

  // NOVO: Cálculo dos limites com +/- 5%
  const limiteMinG = necessarioG * (1 - TOLERANCIA_PERCENTUAL)
  const limiteMaxG = necessarioG * (1 + TOLERANCIA_PERCENTUAL)

  const produtoNome = useMemo(() => {
    const sel = ops.find(o => o.id.toString() === formData.op.toString())
    return sel?.produtoNome || ''
  }, [ops, formData.op])

  const opNumeroLote = useMemo(() => {
    const sel = ops.find(o => o.id.toString() === formData.op.toString())
    if (!sel) return ''
    return `OP ${sel.numero} • Lote ${sel.lote}`
  }, [ops, formData.op])

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
    setCreatedId(null)
  }

  const handleOPChange = async (opId) => {
    handleChange('op', opId)
    handleChange('itemOp', '')
    setItensOP([])
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

  // Campos obrigatórios: op, itemOp, liquido, tara
  const hasCamposBasicos = formData.op && formData.itemOp && formData.liquido && formData.tara

  // Validações client-side
  const novoTotalG = pesadoG + pesoLiquidoG
  const estaForaDaFaixa = novoTotalG > limiteMaxG || novoTotalG < limiteMinG

  // Pode salvar se tudo ok, líquido > 0 e não está fora da faixa de tolerância
  const canSave = !loading && hasCamposBasicos && !estaForaDaFaixa && liquidoKg > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setCreatedId(null)

    try {
      if (!hasCamposBasicos) {
        setError('Preencha OP, Item da OP, Líquido e Tara.')
        setLoading(false)
        return
      }
      if (liquidoKg <= 0) {
        setError('O peso líquido deve ser maior que zero.')
        setLoading(false)
        return
      }
      if (taraKg < 0) {
        setError('A tara não pode ser negativa.')
        setLoading(false)
        return
      }

      if (estaForaDaFaixa) {
        setError(
          `O peso total excede a faixa de tolerância (+/- 5%). Limite: ${fmtG(limiteMinG)} a ${fmtG(limiteMaxG)}. O peso total atual será ${fmtG(novoTotalG)}.`
        );
        setLoading(false)
        return
      }

      const loteMP = (formData.loteMP || '').trim()

      // Payload: ENVIAR EM KG (backend converte/valida/calcula bruto)
      const payload = {
        op_id: Number(formData.op),
        item_op_id: Number(formData.itemOp),
        tara: Number(taraKg.toFixed(3)),     // kg
        liquido: Number(liquidoKg.toFixed(3)),  // kg
        balanca_id: formData.balanca ? Number(formData.balanca) : null,
        codigo_interno: formData.codigoInterno || '',
        lote_mp: loteMP
      }

      const created = await api.createPesagemOP(payload)
      setCreatedId(created?.id)
      setSuccess('Pesagem registrada com sucesso! A OP será concluída automaticamente ao zerar todos os itens.')
    } catch (err) {
      console.error(err)
      const msg = err?.response?.data?.detail
        || err?.response?.data?.non_field_errors?.[0]
        || err?.response?.data?.lote_mp?.[0]
        || err?.response?.data?.liquido?.[0]
        || err?.response?.data?.tara?.[0]
        || (typeof err?.message === 'string' ? err.message : '')
        || 'Erro ao salvar pesagem.'
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  const handleLimparCampos = () => {
    setFormData(getInitialFormData(localUser ? { nome: localUser.displayName } : null))
    setError('')
    setSuccess('')
    setCreatedId(null)
    setItensOP([])
    setOpenItem(false)
    setSearchItem('')
  }

  const handleGerarEtiqueta = async () => {
    try {
      if (!createdId) {
        setError('Salve a pesagem primeiro para gerar a etiqueta.')
        return
      }
      const blob = await api.gerarEtiquetaPDF(createdId)
      const pdfUrl = URL.createObjectURL(blob)
      window.open(pdfUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000)
    } catch (e) {
      console.error(e)
      setError('Não foi possível gerar a etiqueta.')
    }
  }

  const currentDateTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })

  // Label do item — EXIBE em gramas
  const itemLabel = (it) => {
    const code = it.mpCodigo ? `${it.mpCodigo} — ` : ''
    const necG = Number(it.quantidade_necessaria || 0)
    const pesG = Number(it.quantidade_pesada || 0)
    const saldoG = Math.max(necG - pesG, 0)
    return `${code}${it.mpNome} · nec ${fmtG(necG)} · pes ${fmtG(pesG)} · rest ${fmtG(saldoG)}`
  }

  const opSelecionadaTitle = useMemo(() => {
    if (!formData.op) return undefined
    const o = ops.find(x => x.id.toString() === String(formData.op))
    return o ? `OP ${o.numero} • ${o.produtoNome} • Lote ${o.lote} (${o.status})` : undefined
  }, [formData.op, ops])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nova Pesagem</h1>
          <p className="text-gray-600">Registrar pesagem vinculada a uma OP e a um item da OP</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da Pesagem</CardTitle>
          <CardDescription>Data/Hora: {currentDateTime}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pesador">Pesador</Label>
                <Input id="pesador" value={formData.pesador} readOnly />
              </div>

              {/* OP — Select controlado (sempre string) */}
              <div className="space-y-2 min-w-0">
                <Label htmlFor="op">Ordem de Produção *</Label>
                <Select
                  value={String(formData.op || '')}
                  onValueChange={handleOPChange}
                  disabled={loading}
                >
                  <SelectTrigger
                    className="w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis"
                    title={opSelecionadaTitle}
                  >
                    <SelectValue
                      placeholder={loading ? 'Carregando...' : 'Selecione a OP'}
                      className="truncate"
                    />
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

              {/* Item da OP */}
              <div className="space-y-2">
                <Label>Item da OP (Matéria-prima) *</Label>
                <Popover
                  open={openItem}
                  onOpenChange={(v) => { setOpenItem(v); if (!v) setSearchItem('') }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openItem}
                      className="w-full justify-between"
                      disabled={loading || !formData.op}
                      title={formData.itemOp ? itemLabel(itemSelecionado) : undefined}
                    >
                      <span className="w-full truncate text-left">
                        {formData.itemOp
                          ? itemLabel(itemSelecionado)
                          : (!formData.op ? 'Selecione uma OP primeiro' : 'Pesquisar item da OP...')}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" sideOffset={5}>
                    <Command>
                      <CommandInput
                        placeholder="Pesquisar nome/código da MP..."
                        onValueChange={setSearchItem}
                      />
                      <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                      <CommandList className="max-h-[300px] overflow-y-auto" aria-live="polite">
                        <CommandGroup>
                          {itensOP
                            .filter(it => {
                              if (!searchItem) return true
                              const needle = searchItem.toLowerCase()
                              return (it.mpNome?.toLowerCase() || '').includes(needle)
                                || (it.mpCodigo || '').toLowerCase().includes(needle)
                            })
                            .map((it) => {
                              const selected = formData.itemOp?.toString() === it.id.toString()
                              return (
                                <CommandItem
                                  key={it.id}
                                  value={`${it.mpCodigo || ''} ${it.mpNome}`}
                                  onSelect={() => {
                                    handleChange('itemOp', it.id.toString())
                                    setOpenItem(false)
                                  }}
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

              {/* Produto (somente leitura) */}
              <div className="space-y-2">
                <Label>Produto</Label>
                <div className="flex items-center gap-2 rounded border px-3 py-2 bg-muted/30">
                  <Package className="h-4 w-4 opacity-70" />
                  <span className="truncate">{produtoNome || '—'}</span>
                </div>
              </div>

              {/* OP / Lote (somente leitura) */}
              <div className="space-y-2">
                <Label>OP / Lote</Label>
                <div className="flex items-center gap-2 rounded border px-3 py-2 bg-muted/30">
                  <span className="truncate">{opNumeroLote || '—'}</span>
                </div>
              </div>

              {/* Lote MP */}
              <div className="space-y-2">
                <Label htmlFor="loteMP">Lote MP</Label>
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 opacity-70" />
                  <Input
                    id="loteMP"
                    type="text"
                    value={formData.loteMP}
                    onChange={(e) => handleChange('loteMP', e.target.value)}
                    placeholder="Ex.: L2408-XYZ"
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Entradas (sempre em kg): LÍQUIDO e TARA */}
              <div className="space-y-2">
                <Label htmlFor="tara">Tara (kg) *</Label>
                <Input
                  id="tara"
                  type="text"
                  inputMode="decimal"
                  value={formData.tara}
                  onChange={(e) => handleChange('tara', e.target.value)}
                  placeholder="0,000 kg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="liquido">Peso Líquido (kg) *</Label>
                <Input
                  id="liquido"
                  type="text"
                  inputMode="decimal"
                  value={formData.liquido}
                  onChange={(e) => handleChange('liquido', e.target.value)}
                  placeholder="0,000 kg"
                />
              </div>

              {/* Balança — Select controlado (sempre string) */}
              <div className="space-y-2">
                <Label htmlFor="balanca">Balança</Label>
                <Select
                  value={String(formData.balanca || '')}
                  onValueChange={(value) => handleChange('balanca', value)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione a balança'} />
                  </SelectTrigger>
                  <SelectContent>
                    {balancas.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="codigoInterno">Código Interno(MP)</Label>
                <Input
                  id="codigoInterno"
                  value={formData.codigoInterno}
                  onChange={(e) => handleChange('codigoInterno', e.target.value)}

                />
              </div>
            </div>

            {/* Bloco de cálculo e saldo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="h-5 w-5 text-blue-600" />
                  <Label className="text-blue-900 font-semibold">Peso Bruto (auto)</Label>
                </div>
                <div className="text-2xl font-bold text-blue-900">
                  {Number.isFinite(brutoCalculadoKg) ? brutoCalculadoKg.toFixed(3) : '0,000'} kg
                </div>
                <p className="text-sm text-blue-700 mt-1">
                  Líquido ({formData.liquido || '0'}) + Tara ({formData.tara || '0'})
                </p>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg">
                <Label className="font-semibold text-amber-900">Saldo do Item</Label>
                <div className="mt-2 text-amber-900">
                  Necessário: <b>{fmtG(necessarioG)}</b><br />
                  Pesado: <b>{fmtG(pesadoG)}</b><br />
                  Restante: <b>{fmtG(restanteG)}</b><br />
                  {/* Exibindo os novos limites */}
                  Limite (-/+ 5%): <b>{fmtG(limiteMinG)}</b> a <b>{fmtG(limiteMaxG)}</b>
                </div>
                {/* Nova lógica para as mensagens de aviso/erro */}
                {estaForaDaFaixa && (
                  <p className="mt-2 text-red-700 text-sm">
                    Excede a faixa de tolerância de +/- 5%. Ajuste o peso.
                  </p>
                )}
                {!estaForaDaFaixa && (novoTotalG > necessarioG) && (
                  <p className="mt-2 text-amber-700 text-sm">
                    Atingiu ou ultrapassou a quantidade necessária, dentro da tolerância de +5%.
                  </p>
                )}
                {!estaForaDaFaixa && (novoTotalG < necessarioG) && (
                  <p className="mt-2 text-amber-700 text-sm">
                    Atingiu a quantidade, mas com tolerância de -5%.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!canSave} className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleGerarEtiqueta}
                className="flex items-center gap-2"
                disabled={!createdId}
                title={!createdId ? 'Salve a pesagem para liberar a etiqueta' : 'Gerar etiqueta em PDF'}
              >
                <Printer className="h-4 w-4" />
                Gerar Etiqueta
              </Button>

              <Button type="button" variant="outline" onClick={handleLimparCampos} className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default NovaPesagem