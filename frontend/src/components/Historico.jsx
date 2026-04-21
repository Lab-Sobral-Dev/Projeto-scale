import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  History,
  Search,
  Eye,
  Printer,
  Edit,
  Filter,
  Calendar,
  Weight,
  User,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight
} from 'lucide-react'
import api from '@/services/api'

// Helpers
const tz = 'America/Fortaleza'
const nfG = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
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
const fmtG = (v) => (v == null ? '-' : nfG.format(v))

// Tenta descobrir um endpoint de estrutura disponível
async function tryFetchEstruturas() {
  const candidates = [
    'getEstruturasProduto',
    'getEstruturas',
    'getBom',
    'getEstruturaProdutos',
  ]
  for (const name of candidates) {
    const fn = api?.[name]
    if (typeof fn === 'function') {
      try {
        const res = await fn({ page_size: 500 })
        const list = normalizeList(res)
        if (list.length) return list
      } catch (_e) { /* segue */ }
    }
  }
  return null
}

// Extrai pares produto<->mp de vários formatos comuns de payload
function buildEdgesFromEstruturas(estruturas) {
  const edges = []
  for (const e of estruturas) {
    const produto = e.produto ?? e.product ?? e?.item?.produto ?? null
    const itens = e.itens ?? e.items ?? e.componentes ?? e.components ?? null
    if (produto && Array.isArray(itens)) {
      for (const it of itens) {
        const mp = it.materia_prima ?? it.materiaPrima ?? it.raw ?? it.material ?? it?.componente
        if (mp) {
          edges.push({
            prodId: produto.id ?? produto,
            prodNome: toDisplay(produto.nome ?? produto),
            mpId: mp.id ?? mp,
            mpNome: toDisplay(mp.nome ?? mp),
          })
        }
      }
      continue
    }
    const mpFlat = e.materia_prima ?? e.materiaPrima ?? e.raw ?? e.material
    if (produto && mpFlat) {
      edges.push({
        prodId: produto.id ?? produto,
        prodNome: toDisplay(produto.nome ?? produto),
        mpId: mpFlat.id ?? mpFlat,
        mpNome: toDisplay(mpFlat.nome ?? mpFlat),
      })
    }
  }
  return edges
}

const Historico = () => {
  const navigate = useNavigate()
  const [pesagens, setPesagens] = useState([])
  const [produtos, setProdutos] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [edgesBOM, setEdgesBOM] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Papel do usuário (para controlar UI de edição)
  const [userRole, setUserRole] = useState('operador')
  const canEdit = useMemo(() => ['supervisor', 'admin'].includes(userRole), [userRole])

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
    // Descobrir papel do usuário logado
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
    let mounted = true
      ; (async () => {
        setLoading(true)
        setError('')
        try {
          const [pes, prods, mps, estruturas] = await Promise.all([
            api.getPesagens({ page_size: 500 }),
            api.getProdutos({ page_size: 500 }),
            api.getMateriasPrimas({ page_size: 500 }),
            tryFetchEstruturas()
          ])
          if (!mounted) return

          const pesList = normalizeList(pes).map((p) => {
            const brutoKg = toNum(p.bruto ?? p.bruto_kg)
            const taraKg = toNum(p.tara ?? p.tara_kg)
            const liquidoG = toNum(p.liquido ?? p.liquido_g ?? p.peso_liquido)

            const brutoG = kgToG(brutoKg)
            const taraG = kgToG(taraKg)
            const liquidoFinalG = liquidoG != null
              ? liquidoG
              : (brutoG != null && taraG != null ? (brutoG - taraG) : null)

            return {
              id: p.id,
              dataHora: p.data_hora ?? p.dataHora,
              produto: toDisplay(p.op?.produto?.nome ?? p.produto?.nome ?? p.produto_nome ?? p.produto),
              materiaPrima: toDisplay(p.item_op?.materia_prima?.nome ?? p.materia_prima?.nome ?? p.materia_prima_nome ?? p.materia_prima),
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
          const prodsList = normalizeList(prods).map((x) => ({ id: x.id, nome: toDisplay(x.nome ?? x) }))
          const mpsList = normalizeList(mps).map((x) => ({ id: x.id, nome: toDisplay(x.nome ?? x) }))
          setProdutos(prodsList)
          setMateriasPrimas(mpsList)

          if (Array.isArray(estruturas) && estruturas.length) {
            setEdgesBOM(buildEdgesFromEstruturas(estruturas))
          } else {
            setEdgesBOM([])
          }
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

  // 1) Mapas via ESTRUTURA (preferido)
  const { prodToMPs_BOM, mpToProds_BOM } = useMemo(() => {
    const p2m = new Map()
    const m2p = new Map()
    if (!edgesBOM.length) return { prodToMPs_BOM: p2m, mpToProds_BOM: m2p }
    for (const { prodNome, mpNome } of edgesBOM) {
      if (prodNome) {
        if (!p2m.has(prodNome)) p2m.set(prodNome, new Set())
        if (mpNome) p2m.get(prodNome).add(mpNome)
      }
      if (mpNome) {
        if (!m2p.has(mpNome)) m2p.set(mpNome, new Set())
        if (prodNome) m2p.get(mpNome).add(prodNome)
      }
    }
    return { prodToMPs_BOM: p2m, mpToProds_BOM: m2p }
  }, [edgesBOM])

  // 2) Fallback via PESAGENS
  const { prodToMPs_PES, mpToProds_PES } = useMemo(() => {
    const p2m = new Map()
    const m2p = new Map()
    if (!pesagens.length) return { prodToMPs_PES: p2m, mpToProds_PES: m2p }
    for (const p of pesagens) {
      const prod = p.produto || ''
      const mp = p.materiaPrima || ''
      if (prod) {
        if (!p2m.has(prod)) p2m.set(prod, new Set())
        if (mp) p2m.get(prod).add(mp)
      }
      if (mp) {
        if (!m2p.has(mp)) m2p.set(mp, new Set())
        if (prod) m2p.get(mp).add(prod)
      }
    }
    return { prodToMPs_PES: p2m, mpToProds_PES: m2p }
  }, [pesagens])

  const prodToMPs = prodToMPs_BOM.size ? prodToMPs_BOM : prodToMPs_PES
  const mpToProds = mpToProds_BOM.size ? mpToProds_BOM : mpToProds_PES

  const prodByName = useMemo(() => new Map(produtos.map(p => [p.nome, p])), [produtos])
  const mpByName = useMemo(() => new Map(materiasPrimas.map(mp => [mp.nome, mp])), [materiasPrimas])

  const produtoOptions = useMemo(() => {
    if (!filtros.materiaPrima) return produtos.map(p => p.nome)
    const prodsSet = mpToProds.get(filtros.materiaPrima)
    return prodsSet ? Array.from(prodsSet) : []
  }, [produtos, mpToProds, filtros.materiaPrima])

  const mpOptions = useMemo(() => {
    if (!filtros.produto) return materiasPrimas.map(mp => mp.nome)
    const mpsSet = prodToMPs.get(filtros.produto)
    return mpsSet ? Array.from(mpsSet) : []
  }, [materiasPrimas, prodToMPs, filtros.produto])

  useEffect(() => {
    if (filtros.produto && !mpOptions.includes(filtros.materiaPrima)) {
      setFiltros(prev => ({ ...prev, materiaPrima: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.produto, mpOptions.join('|')])

  useEffect(() => {
    if (filtros.materiaPrima && !produtoOptions.includes(filtros.produto)) {
      setFiltros(prev => ({ ...prev, produto: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.materiaPrima, produtoOptions.join('|')])

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
    if (filtros.lote) filtered = filtered.filter(p => (p.lote || '').toLowerCase().includes(filtros.lote.toLowerCase()))
    if (filtros.loteMP) filtered = filtered.filter(p => (p.loteMP || '').toLowerCase().includes(filtros.loteMP.toLowerCase()))
    if (filtros.pesador) filtered = filtered.filter(p => (p.pesador || '').toLowerCase().includes(filtros.pesador.toLowerCase()))
    filtered = filtered.filter(p => inDateRange(p.dataHora))
    return filtered
  }, [pesagens, filtros])

  // resetar para página 1 quando filtros ou dados mudarem
  useEffect(() => { setPage(1) }, [filtros, pesagens])

  // resetar quando mudar o pageSize
  useEffect(() => { setPage(1) }, [pageSize])

  const total = filteredPesagens.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = Math.min(page, totalPages)
  const startIndex = (clampedPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, total)
  const pageItems = filteredPesagens.slice(startIndex, endIndex)

  const goFirst = () => setPage(1)
  const goPrev = () => setPage(p => Math.max(1, p - 1))
  const goNext = () => setPage(p => Math.min(totalPages, p + 1))
  const goLast = () => setPage(totalPages)

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
    <div className="min-h-[100dvh] w-full px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 bg-gray-50/50">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
          <History className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Histórico de Pesagens
          </h1>
          <p className="text-gray-600 text-sm">
            Consulte e gerencie as pesagens registradas.
          </p>
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
            {/* Produto */}
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
                  {produtoOptions.map(nome => {
                    const p = prodByName.get(nome)
                    return (
                      <SelectItem key={p?.id ?? nome} value={nome}>
                        <span className="block max-w-[340px] truncate">{nome}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* MP */}
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
                  {mpOptions.map(nome => {
                    const mp = mpByName.get(nome)
                    return (
                      <SelectItem key={mp?.id ?? nome} value={nome}>
                        <span className="block max-w-[340px] truncate">{nome}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="op">OP</Label>
              <Input
                id="op"
                placeholder="Buscar por OP"
                value={filtros.op}
                onChange={(e) => handleFiltroChange('op', e.target.value)}
              />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="pesador">Pesador</Label>
              <Input
                id="pesador"
                placeholder="Buscar por pesador"
                value={filtros.pesador}
                onChange={(e) => handleFiltroChange('pesador', e.target.value)}
              />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="dataInicio">Data Início</Label>
              <Input
                id="dataInicio"
                type="date"
                value={filtros.dataInicio}
                onChange={(e) => handleFiltroChange('dataInicio', e.target.value)}
              />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="dataFim">Data Fim</Label>
              <Input
                id="dataFim"
                type="date"
                value={filtros.dataFim}
                onChange={(e) => handleFiltroChange('dataFim', e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={limparFiltros} className="w-full">
                Limpar Filtros
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </CardContent>
      </Card>

      {/* Tabela + Paginação */}
      <Card className="shadow-sm border-t-4 border-orange-400/80">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {loading ? 'Carregando…' : `Resultados (${total})`}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Tabela (desktop) */}
          <div className="relative hidden md:block">
            <div className="overflow-x-auto">
              <table className="min-w-[880px] w-full">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-center tracking-wider w-[180px]">
                      Data/Hora
                    </th>
                    <th className="px-4 py-2 text-center tracking-wider">Produto</th>
                    <th className="px-4 py-2 text-center tracking-wider hidden lg:table-cell">MP</th>
                    <th className="px-4 py-2 text-center tracking-wider">OP</th>
                    <th className="px-4 py-2 text-center tracking-wider hidden md:table-cell">Pesador</th>
                    <th className="px-4 py-2 text-center tracking-wider hidden lg:table-cell">Pesos (g)</th>
                    <th className="sticky right-0 z-20 bg-gray-50 px-4 py-2 text-center tracking-wider w-[120px]">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody className="bg-white divide-y divide-gray-200">
                  {!loading && pageItems.length > 0 && pageItems.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50"
                      onDoubleClick={() => handleVerDetalhes(p.id)}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm text-gray-900 w-[180px]">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                          {formatDateTime(p.dataHora)}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <span
                          className="block max-w-[260px] truncate"
                          title={p.produto}
                        >
                          {p.produto}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        <Badge
                          variant="outline"
                          className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap"
                          title={p.materiaPrima}
                        >
                          {p.materiaPrima}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-500 text-center">{p.op}</td>

                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                        <div className="flex items-center justify-center">
                          <User className="h-4 w-4 mr-1 text-gray-400" />
                          <span
                            className="block max-w-[200px] truncate"
                            title={p.pesador}
                          >
                            {p.pesador}
                          </span>
                        </div>
                      </td>

                      {/* PESOS (g) */}
                      <td className="px-4 py-3 pr-12 text-sm text-gray-700 hidden lg:table-cell">
                        <div className="grid gap-0.5 text-xs">
                          <div className="flex items-center gap-2" title="Bruto (g)">
                            <span className="flex items-center text-gray-500">
                              <Weight className="h-3 w-3 mr-1 text-gray-400" />
                              <span>B:</span>
                            </span>
                            <span className="tabular-nums">{fmtG(p.bruto_g)}</span>
                          </div>

                          <div className="flex items-center gap-2" title="Tara (g)">
                            <span className="flex items-center text-gray-500">
                              <Weight className="h-3 w-3 mr-1 text-gray-400" />
                              <span>T:</span>
                            </span>
                            <span className="tabular-nums">{fmtG(p.tara_g)}</span>
                          </div>

                          <div className="flex items-center gap-2" title="Líquido (g)">
                            <span className="flex items-center text-green-700">
                              <Weight className="h-3 w-3 mr-1 text-green-600" />
                              <span className="font-semibold">L:</span>
                            </span>
                            <span className="font-semibold text-green-700 tabular-nums">
                              {fmtG(p.liquido_g)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="sticky right-0 z-10 bg-white px-4 py-3">
                        <div className="flex space-x-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleVerDetalhes(p.id)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleGerarEtiqueta(p.id)}
                            className="text-green-600 hover:text-green-800"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>

                          {/* Editar apenas para supervisor/admin */}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditar(p.id)}
                              className="text-orange-600 hover:text-orange-800"
                              title="Editar pesagem"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* gradientes laterais */}
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
                    <Button variant="ghost" size="icon" onClick={() => handleVerDetalhes(p.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleGerarEtiqueta(p.id)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => handleEditar(p.id)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-sm font-medium text-gray-900 truncate">{p.produto}</div>
                <div className="mt-0.5 text-xs text-gray-500 truncate">{p.materiaPrima}</div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                  <span>OP: <b>{p.op || '—'}</b></span>
                  <span>Pesador: <b>{p.pesador || '—'}</b></span>
                  <span>B: <b className="tabular-nums">{fmtG(p.bruto_g)} g</b></span>
                  <span>T: <b className="tabular-nums">{fmtG(p.tara_g)} g</b></span>
                  <span className="col-span-2">
                    L: <b className="text-green-700 tabular-nums">{fmtG(p.liquido_g)} g</b>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer de paginação */}
          <div className="border-t px-4 py-3 text-xs text-gray-700 bg-gray-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col md:flex-row md:items-center md:gap-2">
              <span>
                {total > 0 ? (
                  <>
                    Mostrando{' '}
                    <span className="font-medium">{startIndex + 1}</span>–
                    <span className="font-medium">{endIndex}</span> de{' '}
                    <span className="font-medium">{total}</span> pesagens
                  </>
                ) : (
                  '0 resultados'
                )}
              </span>
              <span className="hidden md:inline text-gray-400">•</span>
              <span>
                Página <span className="font-medium">{clampedPage}</span> de{' '}
                <span className="font-medium">{totalPages}</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Por página:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger className="h-8 w-[88px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-none rounded-l-md"
                  onClick={goFirst}
                  disabled={clampedPage <= 1}
                  title="Primeira página"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-none"
                  onClick={goPrev}
                  disabled={clampedPage <= 1}
                  title="Anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-none"
                  onClick={goNext}
                  disabled={clampedPage >= totalPages}
                  title="Próxima"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-none rounded-r-md"
                  onClick={goLast}
                  disabled={clampedPage >= totalPages}
                  title="Última página"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Historico
