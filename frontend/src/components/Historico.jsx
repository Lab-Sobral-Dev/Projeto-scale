import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { History, Search, Eye, Printer, Edit, Filter, Calendar, Weight, User, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '@/services/api'

// Helpers
const tz = 'America/Fortaleza'
const nf = new Intl.NumberFormat('pt-BR')
const normalizeList = (data) => (Array.isArray(data) ? data : (data?.results ?? []))
const formatDateTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR', { timeZone: tz })
}
const toDisplay = (v) => {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') return v.nome ?? v.numero ?? v.codigo ?? v.descricao ?? v.label ?? v.id ?? ''
  return ''
}

// Unidades
const KG_IN_G = 1000
const toNum = (x) => (x == null ? null : Number(x))
const kgToG = (kg) => (kg == null ? null : kg * KG_IN_G)

const Historico = () => {
  const navigate = useNavigate()
  const [pesagens, setPesagens] = useState([])
  const [produtos, setProdutos] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Filtros
  const [filtros, setFiltros] = useState({
    produto: '',
    materiaPrima: '',
    op: '',
    lote: '',
    loteMP: '',
    dataInicio: '',
    dataFim: '',
    pesador: ''
  })

  // Paginação
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    let mounted = true
      ; (async () => {
        setLoading(true)
        setError('')
        try {
          const [pes, prods, mps] = await Promise.all([
            api.getPesagens({ page_size: 500 }),
            api.getProdutos({ page_size: 500 }),
            api.getMateriasPrimas({ page_size: 500 })
          ])
          if (!mounted) return

          const pesList = normalizeList(pes).map((p) => {
            const brutoKg = toNum(p.bruto ?? p.bruto_kg)
            const taraKg = toNum(p.tara ?? p.tara_kg)
            const liquidoG = toNum(p.liquido ?? p.liquido_g ?? p.peso_liquido)

            const brutoG = kgToG(brutoKg)
            const taraG = kgToG(taraKg)
            const liquidoFinalG = liquidoG != null ? liquidoG : (brutoG != null && taraG != null ? (brutoG - taraG) : null)

            return {
              id: p.id,
              dataHora: p.data_hora ?? p.dataHora,
              produto: toDisplay(p.produto?.nome ?? p.produto_nome ?? p.produto),
              materiaPrima: toDisplay(p.materia_prima?.nome ?? p.materia_prima_nome ?? p.materia_prima),
              op: toDisplay(p.op?.numero ?? p.op),
              lote: toDisplay(p.op?.lote ?? p.lote),
              loteMP: toDisplay(p.lote_mp ?? p.loteMP ?? ''),
              pesador: toDisplay(p.pesador),
              bruto_g: brutoG,
              tara_g: taraG,
              liquido_g: liquidoFinalG,
              codigoInterno: toDisplay(p.codigo_interno ?? p.codigoInterno)
            }
          })

          setPesagens(pesList)
          setProdutos(normalizeList(prods).map((x) => ({ id: x.id, nome: toDisplay(x.nome ?? x) })))
          setMateriasPrimas(normalizeList(mps).map((x) => ({ id: x.id, nome: toDisplay(x.nome ?? x) })))
        } catch (e) {
          console.error(e)
          setError('Não foi possível carregar os dados. Verifique sua conexão e o token.')
        } finally {
          setLoading(false)
        }
      })()
    return () => { mounted = false }
  }, [])

  const handleFiltroChange = (name, value) => setFiltros(prev => ({ ...prev, [name]: value }))
  const limparFiltros = () => {
    setFiltros({ produto: '', materiaPrima: '', op: '', lote: '', loteMP: '', dataInicio: '', dataFim: '', pesador: '' })
    setPage(1)
  }

  const inDateRange = (isoString) => {
    if (!isoString) return false
    if (!filtros.dataInicio && !filtros.dataFim) return true
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return false
    if (filtros.dataInicio) {
      const start = new Date(`${filtros.dataInicio}T00:00:00`)
      if (d < start) return false
    }
    if (filtros.dataFim) {
      const end = new Date(`${filtros.dataFim}T23:59:59`)
      if (d > end) return false
    }
    return true
  }

  const filteredPesagens = useMemo(() => {
    let filtered = pesagens
    if (filtros.produto) filtered = filtered.filter(p => p.produto === filtros.produto)
    if (filtros.materiaPrima) filtered = filtered.filter(p => p.materiaPrima === filtros.materiaPrima)
    if (filtros.op) filtered = filtered.filter(p => (p.op || '').toLowerCase().includes(filtros.op.toLowerCase()))
    if (filtros.pesador) filtered = filtered.filter(p => (p.pesador || '').toLowerCase().includes(filtros.pesador.toLowerCase()))
    filtered = filtered.filter(p => inDateRange(p.dataHora))
    return filtered
  }, [pesagens, filtros])

  useEffect(() => { setPage(1) }, [filtros, pesagens])

  const total = filteredPesagens.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = Math.min(page, totalPages)
  const startIndex = (clampedPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, total)
  const pageItems = filteredPesagens.slice(startIndex, endIndex)

  const handleVerDetalhes = (id) => navigate(`/pesagens/${id}`)
  const handleEditar = (id) => navigate(`/pesagens/${id}/editar`)
  const handleGerarEtiqueta = async (id) => {
    try {
      const blob = await api.gerarEtiquetaPDF(id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error(e)
      console.error('Não foi possível gerar a etiqueta.')
    }
  }

  const produtoSelecionado = filtros.produto ? filtros.produto : 'Todos'
  const mpSelecionada = filtros.materiaPrima ? filtros.materiaPrima : 'Todas'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <History className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Histórico de Pesagens</h1>
          <p className="text-gray-600">Consulte e gerencie as pesagens registradas</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros de Busca
          </CardTitle>
          <CardDescription>Use os filtros abaixo para encontrar pesagens específicas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="produto">Produto</Label>
              <Select
                value={filtros.produto || "__all__"}
                onValueChange={(v) => handleFiltroChange('produto', v === "__all__" ? '' : v)}
              >
                <SelectTrigger
                  id="produto"
                  className="w-full overflow-hidden text-ellipsis whitespace-nowrap"
                  title={produtoSelecionado}
                >
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__all__">Todos</SelectItem>
                  {produtos.map(p => (
                    <SelectItem key={p.id} value={p.nome}>
                      <span className="block max-w-[340px] truncate">{p.nome}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="materiaPrima">Matéria-Prima</Label>
              <Select
                value={filtros.materiaPrima || "__all__"}
                onValueChange={(v) => handleFiltroChange('materiaPrima', v === "__all__" ? '' : v)}
              >
                <SelectTrigger
                  id="materiaPrima"
                  className="w-full overflow-hidden text-ellipsis whitespace-nowrap"
                  title={mpSelecionada}
                >
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__all__">Todas</SelectItem>
                  {materiasPrimas.map(mp => (
                    <SelectItem key={mp.id} value={mp.nome}>
                      <span className="block max-w-[340px] truncate">{mp.nome}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="op">OP</Label>
              <Input id="op" placeholder="Buscar por OP" value={filtros.op} onChange={(e) => handleFiltroChange('op', e.target.value)} />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="pesador">Pesador</Label>
              <Input id="pesador" placeholder="Buscar por pesador" value={filtros.pesador} onChange={(e) => handleFiltroChange('pesador', e.target.value)} />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="dataInicio">Data Início</Label>
              <Input id="dataInicio" type="date" value={filtros.dataInicio} onChange={(e) => handleFiltroChange('dataInicio', e.target.value)} />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="dataFim">Data Fim</Label>
              <Input id="dataFim" type="date" value={filtros.dataFim} onChange={(e) => handleFiltroChange('dataFim', e.target.value)} />
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={limparFiltros} className="w-full">Limpar Filtros</Button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </CardContent>
      </Card>

      {/* Tabela + Paginação */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {loading ? 'Carregando…' : `Resultados (${total})`}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Tabela */}
          <div className="relative hidden md:block">
            <div className="overflow-x-auto">
              <table className="min-w-[800px] w-full">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-left tracking-wider w-[180px]">Data/Hora</th>
                    <th className="px-4 py-2 text-left tracking-wider">Produto</th>
                    <th className="px-4 py-2 text-left tracking-wider hidden lg:table-cell">MP</th>
                    <th className="px-4 py-2 text-left tracking-wider">OP</th>
                    <th className="px-4 py-2 text-left tracking-wider hidden md:table-cell">Pesador</th>
                    <th className="px-4 py-2 text-left tracking-wider hidden lg:table-cell">Pesos (g)</th>
                    <th className="sticky right-0 z-20 bg-gray-50 px-4 py-2 text-left tracking-wider w-[120px]">Ações</th>
                  </tr>
                </thead>

                <tbody className="bg-white divide-y divide-gray-200">
                  {!loading && pageItems.length > 0 && pageItems.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50" onDoubleClick={() => handleVerDetalhes(p.id)}>
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm text-gray-900 w-[180px]">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                          {formatDateTime(p.dataHora)}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <span className="block max-w-[260px] truncate" title={p.produto}>{p.produto}</span>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        <Badge variant="outline" className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={p.materiaPrima}>
                          {p.materiaPrima}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-500">{p.op}</td>

                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-1 text-gray-400" />
                          <span className="block max-w-[200px] truncate" title={p.pesador}>{p.pesador}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        <div className="space-y-1">
                          <div className="flex items-center" title="Bruto (g)">
                            <Weight className="h-3 w-3 mr-1 text-gray-400" />
                            <span className="text-xs">B: {p.bruto_g == null ? '-' : nf.format(p.bruto_g)}</span>
                          </div>
                          <div className="flex items-center" title="Tara (g)">
                            <Weight className="h-3 w-3 mr-1 text-gray-400" />
                            <span className="text-xs">T: {p.tara_g == null ? '-' : nf.format(p.tara_g)}</span>
                          </div>
                          <div className="flex items-center" title="Líquido (g)">
                            <Weight className="h-3 w-3 mr-1 text-green-600" />
                            <span className="text-xs font-semibold text-green-600">L: {p.liquido_g == null ? '-' : nf.format(p.liquido_g)}</span>
                          </div>
                        </div>
                      </td>

                      <td className="sticky right-0 z-10 bg-white px-4 py-3">
                        <div className="flex space-x-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => handleVerDetalhes(p.id)} className="text-blue-600 hover:text-blue-800"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleGerarEtiqueta(p.id)} className="text-green-600 hover:text-green-800"><Printer className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEditar(p.id)} className="text-orange-600 hover:text-orange-800"><Edit className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" />
          </div>

          {/* Cards (mobile) */}
          <div className="md:hidden divide-y">
            {!loading && pageItems.map(p => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">{formatDateTime(p.dataHora)}</div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleVerDetalhes(p.id)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleGerarEtiqueta(p.id)}><Printer className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEditar(p.id)}><Edit className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-1 text-sm font-medium text-gray-900 truncate">{p.produto}</div>
                <div className="mt-0.5 text-xs text-gray-500 truncate">{p.materiaPrima}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                  <span>OP: <b>{p.op || '—'}</b></span>
                  <span>Pesador: <b>{p.pesador || '—'}</b></span>
                  <span>Liq: <b className="text-green-700">{p.liquido_g == null ? '-' : nf.format(p.liquido_g)} g</b></span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Historico
