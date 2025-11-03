import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { History, Search, Eye, Printer, Edit, Filter, Calendar, Weight, User } from 'lucide-react'
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

// util para unir Sets
const unionSets = (a, b) => {
  const out = new Set()
  if (a) for (const x of a) out.add(x)
  if (b) for (const x of b) out.add(x)
  return out
}

const Historico = () => {
  const navigate = useNavigate()
  const [pesagens, setPesagens] = useState([])
  const [produtos, setProdutos] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Mapeamentos vindos da ESTRUTURA (prioridade para opções dos filtros)
  const [structMaps, setStructMaps] = useState({
    prodToMPs: new Map(), // produto -> Set(MP)
    mpToProds: new Map(), // MP -> Set(produto)
  })

  // Mapeamentos observados nas PESAGENS (complementam a estrutura)
  const [pesMaps, setPesMaps] = useState({
    prodToMPs: new Map(),
    mpToProds: new Map(),
  })

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
          // Tenta buscar estrutura por múltiplos nomes de função (robusto a variações)
          const structFns = [
            api.getEstruturasProduto,
            api.getEstruturas,
            api.getEstruturaProdutos,
            api.getEstrutura,
            api.getEstruturasComItens,
          ].filter(fn => typeof fn === 'function')

          const [pes, prods, mps, estruturasRaw] = await Promise.all([
            api.getPesagens({ page_size: 1000 }),
            api.getProdutos({ page_size: 1000 }),
            api.getMateriasPrimas({ page_size: 1000 }),
            (async () => {
              for (const fn of structFns) {
                try { return await fn({ page_size: 1000 }) } catch (_) { }
              }
              return null
            })(),
          ])

          if (!mounted) return

          // --- PESAGENS (para lista e para completar relacionamentos) ---
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

          // constrói mapas a partir das PESAGENS
          const pesP2M = new Map()
          const pesM2P = new Map()
          for (const r of pesList) {
            const prod = r.produto || ''
            const mp = r.materiaPrima || ''
            if (prod) {
              if (!pesP2M.has(prod)) pesP2M.set(prod, new Set())
              if (mp) pesP2M.get(prod).add(mp)
            }
            if (mp) {
              if (!pesM2P.has(mp)) pesM2P.set(mp, new Set())
              if (prod) pesM2P.get(mp).add(prod)
            }
          }

          // --- ESTRUTURA (PRIORITÁRIA para as opções dos filtros) ---
          const estrList = normalizeList(estruturasRaw)
          const structP2M = new Map()
          const structM2P = new Map()

          for (const e of estrList) {
            // Produto pode vir como objeto ou string
            const prodName =
              toDisplay(e.produto?.nome ?? e.produto_nome ?? e.produto ?? e.produto_label)

            // Itens podem vir como "itens", "items", "componentes", "materias_primas"…
            const items = e.itens ?? e.items ?? e.componentes ?? e.materias_primas ?? []
            if (!prodName) continue

            if (!structP2M.has(prodName)) structP2M.set(prodName, new Set())

            for (const it of items) {
              const mpName =
                toDisplay(
                  it.materia_prima?.nome ??
                  it.materia_prima_nome ??
                  it.materia_prima ??
                  it.mp?.nome ??
                  it.mp_nome ??
                  it.mp
                )
              if (!mpName) continue
              structP2M.get(prodName).add(mpName)

              if (!structM2P.has(mpName)) structM2P.set(mpName, new Set())
              structM2P.get(mpName).add(prodName)
            }
          }

          setStructMaps({ prodToMPs: structP2M, mpToProds: structM2P })
          setPesMaps({ prodToMPs: pesP2M, mpToProds: pesM2P })

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

  // Mapas por nome (para recuperar id quando existir)
  const prodByName = useMemo(() => new Map(produtos.map(p => [p.nome, p])), [produtos])
  const mpByName = useMemo(() => new Map(materiasPrimas.map(mp => [mp.nome, mp])), [materiasPrimas])

  // Opções dos dropdowns (estrutura ∪ pesagens). A estrutura tem prioridade de "existência".
  const produtoOptions = useMemo(() => {
    if (!filtros.materiaPrima) return produtos.map(p => p.nome)

    // prods que usam essa MP na estrutura
    const s = structMaps.mpToProds.get(filtros.materiaPrima)
    // prods que já pesaram com essa MP (para complementar)
    const p = pesMaps.mpToProds.get(filtros.materiaPrima)
    return Array.from(unionSets(s, p))
  }, [produtos, structMaps.mpToProds, pesMaps.mpToProds, filtros.materiaPrima])

  const mpOptions = useMemo(() => {
    if (!filtros.produto) return materiasPrimas.map(mp => mp.nome)

    // MPs do produto na estrutura (garante TODAS, mesmo sem pesagem)
    const s = structMaps.prodToMPs.get(filtros.produto)
    // MPs vistas em pesagens (complemento)
    const p = pesMaps.prodToMPs.get(filtros.produto)
    return Array.from(unionSets(s, p))
  }, [materiasPrimas, structMaps.prodToMPs, pesMaps.prodToMPs, filtros.produto])

  // Consistência cruzada
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

  // Filtro de datas
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
            {/* Produto (depende da MP selecionada) */}
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

            {/* Matéria-Prima (depende do Produto selecionado) */}
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
              <table className="min-w-[880px] w-full">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-center tracking-wider w-[180px]">Data/Hora</th>
                    <th className="px-4 py-2 text-center tracking-wider">Produto</th>
                    <th className="px-4 py-2 text-center tracking-wider hidden lg:table-cell">MP</th>
                    <th className="px-4 py-2 text-center tracking-wider">OP</th>
                    <th className="px-4 py-2 text-center tracking-wider hidden md:table-cell">Pesador</th>
                    <th className="px-4 py-2 text-center tracking-wider hidden lg:table-cell">Pesos (g)</th>
                    <th className="sticky right-0 z-20 bg-gray-50 px-4 py-2 text-center tracking-wider w-[120px]">Ações</th>
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

                      <td className="px-4 py-3 text-sm text-gray-500 text-center">{p.op}</td>

                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                        <div className="flex items-center justify-center">
                          <User className="h-4 w-4 mr-1 text-gray-400" />
                          <span className="block max-w-[200px] truncate" title={p.pesador}>{p.pesador}</span>
                        </div>
                      </td>

                      {/* PESOS (g) */}
                      <td className="px-4 py-3 text-sm text-gray-700 hidden lg:table-cell">
                        <div className="grid gap-0.5">
                          <div className="flex items-center justify-between" title="Bruto (g)">
                            <span className="flex items-center text-gray-500">
                              <Weight className="h-3 w-3 mr-1 text-gray-400" />
                              <span className="text-xs">B:</span>
                            </span>
                            <span className="text-xs tabular-nums">{fmtG(p.bruto_g)}</span>
                          </div>
                          <div className="flex items-center justify-between" title="Tara (g)">
                            <span className="flex items-center text-gray-500">
                              <Weight className="h-3 w-3 mr-1 text-gray-400" />
                              <span className="text-xs">T:</span>
                            </span>
                            <span className="text-xs tabular-nums">{fmtG(p.tara_g)}</span>
                          </div>
                          <div className="flex items-center justify-between" title="Líquido (g)">
                            <span className="flex items-center text-green-700">
                              <Weight className="h-3 w-3 mr-1 text-green-600" />
                              <span className="text-xs font-semibold">L:</span>
                            </span>
                            <span className="text-xs font-semibold text-green-700 tabular-nums">{fmtG(p.liquido_g)}</span>
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
                    <Button variant="ghost" size="icon" onClick={() => handleVerDetalhes(p.id)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleGerarEtiqueta(p.id)}><Printer className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEditar(p.id)}><Edit className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-1 text-sm font-medium text-gray-900 truncate">{p.produto}</div>
                <div className="mt-0.5 text-xs text-gray-500 truncate">{p.materiaPrima}</div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                  <span>OP: <b>{p.op || '—'}</b></span>
                  <span>Pesador: <b>{p.pesador || '—'}</b></span>
                  <span>B: <b className="tabular-nums">{fmtG(p.bruto_g)} g</b></span>
                  <span>T: <b className="tabular-nums">{fmtG(p.tara_g)} g</b></span>
                  <span className="col-span-2">L: <b className="text-green-700 tabular-nums">{fmtG(p.liquido_g)} g</b></span>
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
