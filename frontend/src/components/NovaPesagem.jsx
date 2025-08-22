import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Scale, Save, Printer, RotateCcw, Calculator, ChevronsUpDown, Check } from 'lucide-react'
import api from '@/services/api'
import { cn } from '@/lib/utils'

const NovaPesagem = () => {
  const [localUser, setLocalUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [produtos, setProdutos] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [balancas, setBalancas] = useState([])

  const [createdId, setCreatedId] = useState(null)

  const [openMp, setOpenMp] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Conversor robusto para pt-BR (aceita "1.234,56" e "1234,56")
  const toNumber = (v) => {
    if (typeof v !== 'string') return Number(v) || 0
    const s = v.replace(/\s/g, '')
    // remove separador de milhar . e troca vírgula por ponto
    return Number(s.replace(/\./g, '').replace(',', '.')) || 0
  }

  const getInitialFormData = (user = null) => ({
    produto: '',
    materiaPrima: '',
    op: '',
    pesador: user?.nome || '',
    lote: '',
    bruto: '',
    tara: '',
    volume: '',
    balanca: '',
    codigoInterno: ''
    // pesoLiquido NÃO fica mais no estado (é derivado)
  })

  const [formData, setFormData] = useState(getInitialFormData())

  const normalizeList = (data) => Array.isArray(data) ? data : (data?.results ?? [])

  const getDisplayName = (user) => {
    if (!user) return ''
    return user.nome?.trim()
      || `${(user.first_name || '').trim()} ${(user.last_name || '').trim()}`.trim()
      || user.username
      || ''
  }

  useEffect(() => {
    let abort = false
    async function loadInitialData() {
      setLoading(true)
      try {
        const [prodRes, balRes, userRes] = await Promise.all([
          api.getProdutos(),
          api.getBalancas(),
          api.me().catch(e => { console.error('Falha ao buscar usuário', e); return null })
        ])

        if (abort) return

        const produtosNorm = normalizeList(prodRes).map(p => ({
          id: p.id,
          nome: p.nome,
          volumePadrao: p.volume_padrao ?? p.volumePadrao ?? '',
        }))

        const balsNorm = normalizeList(balRes).map(b => ({
          id: b.id,
          nome: b.nome
        }))

        setProdutos(produtosNorm)
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

  useEffect(() => {
    if (searchTerm.length === 0) {
      setMateriasPrimas([])
      return
    }

    const handler = setTimeout(async () => {
      setIsSearching(true)
      try {
        const mpRes = await api.getMateriasPrimas({ search: searchTerm })
        const mpsNorm = normalizeList(mpRes).map(m => ({
          id: m.id,
          nome: m.nome,
          ativo: !!m.ativo,
          codigoInterno: m.codigo_interno ?? m.codigoInterno ?? ''
        }))
        setMateriasPrimas(mpsNorm)
      } catch (e) {
        console.error('Falha na busca de matérias-primas', e)
        setError('Falha ao buscar matérias-primas.')
        setMateriasPrimas([])
      } finally {
        setIsSearching(false)
      }
    }, 500)

    return () => {
      clearTimeout(handler)
    }
  }, [searchTerm])

  // peso líquido calculado sob demanda (não fica em estado)
  const pesoLiquido = useMemo(() => {
    const bruto = toNumber(formData.bruto)
    const tara = toNumber(formData.tara)
    return Math.max(bruto - tara, 0)
  }, [formData.bruto, formData.tara])

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
    setCreatedId(null)
  }

  const handleProdutoChange = (produtoId) => {
    const produto = produtos.find(p => p.id.toString() === produtoId)
    setFormData(prev => ({
      ...prev,
      produto: produtoId,
      volume: produto?.volumePadrao !== undefined && produto?.volumePadrao !== null
        ? String(produto.volumePadrao)
        : ''
    }))
    setError('')
    setSuccess('')
    setCreatedId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setCreatedId(null)

    try {
      if (!formData.produto || !formData.materiaPrima || !formData.bruto || !formData.tara) {
        setError('Por favor, preencha Produto, Matéria-Prima, Bruto e Tara.')
        setLoading(false)
        return
      }

      if (toNumber(formData.bruto) <= toNumber(formData.tara)) {
        setError('O peso bruto deve ser maior que a tara.')
        setLoading(false)
        return
      }

      const payload = {
        produto_id: Number(formData.produto),
        materia_prima_id: Number(formData.materiaPrima),
        op: formData.op || '',
        lote: formData.lote || '',
        bruto: toNumber(formData.bruto),
        tara: toNumber(formData.tara),
        volume: (formData.volume ?? '').toString(),
        balanca_id: formData.balanca ? Number(formData.balanca) : null,
        codigo_interno: formData.codigoInterno || '',
        // Se o backend exigir o nome do pesador via payload, descomente:
        // pesador: formData.pesador || ''
      }

      const created = await api.createPesagem(payload)
      setCreatedId(created?.id)
      setSuccess('Pesagem registrada com sucesso!')
    } catch (err) {
      console.error(err)
      setError('Erro ao salvar pesagem. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleLimparCampos = () => {
    setFormData(getInitialFormData(localUser ? { nome: localUser.displayName } : null))
    setError('')
    setSuccess('')
    setCreatedId(null)
    setMateriasPrimas([])
    setSearchTerm('')
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
      // evita vazamento de memória de blob URL
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000)
    } catch (e) {
      console.error(e)
      setError('Não foi possível gerar a etiqueta.')
    }
  }

  const currentDateTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })
  const canSave = !loading && formData.produto && formData.materiaPrima && formData.bruto && formData.tara

  const getMateriaPrimaLabel = (id) => {
    const mp = materiasPrimas.find(m => m.id.toString() === id?.toString())
    if (!mp) return ''
    return mp.codigoInterno ? `${mp.codigoInterno} — ${mp.nome}` : mp.nome
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nova Pesagem</h1>
          <p className="text-gray-600">Registrar dados de uma nova pesagem de matéria-prima</p>
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
                <Input
                  id="pesador"
                  value={formData.pesador}
                  onChange={(e) => handleChange('pesador', e.target.value)}
                  placeholder="Nome do Pesador"
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="produto">Produto *</Label>
                <Select
                  value={formData.produto ? String(formData.produto) : undefined}
                  onValueChange={handleProdutoChange}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione o produto'} />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.map(produto => (
                      <SelectItem key={produto.id} value={String(produto.id)}>
                        {produto.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="materiaPrima">Matéria-Prima *</Label>
                <Popover
                  open={openMp}
                  onOpenChange={(v) => { setOpenMp(v); if (!v) setSearchTerm('') }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openMp}
                      className="w-full justify-between"
                      disabled={loading}
                    >
                      <span className="w-full truncate whitespace-nowrap overflow-hidden text-left">
                        {formData.materiaPrima
                          ? getMateriaPrimaLabel(formData.materiaPrima)
                          : (isSearching ? 'Buscando...' : 'Pesquise e selecione')}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    sideOffset={5}
                  >
                    <Command>
                      <CommandInput
                        placeholder="Pesquisar por nome ou código..."
                        onValueChange={setSearchTerm}
                      />
                      <CommandEmpty>
                        {isSearching ? 'Buscando...' : 'Nenhuma matéria-prima encontrada.'}
                      </CommandEmpty>
                      <CommandList
                        className="max-h-[300px] overflow-y-auto"
                        aria-busy={isSearching}
                        aria-live="polite"
                      >
                        <CommandGroup>
                          {materiasPrimas.map((mp) => {
                            const label = mp.codigoInterno ? `${mp.codigoInterno} — ${mp.nome}` : mp.nome
                            const selected = formData.materiaPrima?.toString() === mp.id.toString()
                            return (
                              <CommandItem
                                key={mp.id}
                                value={`${mp.codigoInterno || ''} ${mp.nome}`}
                                onSelect={() => {
                                  handleChange('materiaPrima', mp.id.toString())
                                  setOpenMp(false)
                                }}
                                className="cursor-pointer"
                              >
                                <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
                                {label}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="op">OP</Label>
                <Input
                  id="op"
                  value={formData.op}
                  onChange={(e) => handleChange('op', e.target.value)}
                  placeholder="Número da OP"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lote">Lote</Label>
                <Input
                  id="lote"
                  value={formData.lote}
                  onChange={(e) => handleChange('lote', e.target.value)}
                  placeholder="Número do lote"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bruto">Peso Bruto (kg) *</Label>
                <Input
                  id="bruto"
                  type="text" // text para aceitar vírgula; converter com toNumber
                  inputMode="decimal"
                  value={formData.bruto}
                  onChange={(e) => handleChange('bruto', e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tara">Tara (kg) *</Label>
                <Input
                  id="tara"
                  type="text" // text para aceitar vírgula; converter com toNumber
                  inputMode="decimal"
                  value={formData.tara}
                  onChange={(e) => handleChange('tara', e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="volume">Volume</Label>
                <Input
                  id="volume"
                  type="text" // manter string; se for numérico puro, trocar para number + step
                  value={formData.volume}
                  onChange={(e) => handleChange('volume', e.target.value)}
                  placeholder="Volume"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="balanca">Balança</Label>
                <Select
                  value={formData.balanca ? String(formData.balanca) : undefined}
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
                <Label htmlFor="codigoInterno">Código Interno</Label>
                <Input
                  id="codigoInterno"
                  value={formData.codigoInterno}
                  onChange={(e) => handleChange('codigoInterno', e.target.value)}
                  placeholder="Código interno"
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="h-5 w-5 text-blue-600" />
                <Label className="text-blue-900 font-semibold">Peso Líquido (Calculado Automaticamente)</Label>
              </div>
              <div className="text-2xl font-bold text-blue-900">
                {Number.isFinite(pesoLiquido) ? pesoLiquido.toFixed(2) : '0,00'} kg
              </div>
              <p className="text-sm text-blue-700 mt-1">
                Peso Bruto ({formData.bruto || '0'}) - Tara ({formData.tara || '0'})
              </p>
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
                Limpar Campos
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default NovaPesagem
