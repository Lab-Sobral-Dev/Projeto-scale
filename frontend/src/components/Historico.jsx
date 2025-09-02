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

  useEffect(() => {
    let mounted = true
    ;(async () => {
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
          // backend atual: bruto (kg), tara (kg), liquido (g)
          // compat: bruto_kg/tara_kg/liquido_g/peso_liquido
          const brutoKg = toNum(p.bruto ?? p.bruto_kg)
          const taraKg  = toNum(p.tara ?? p.tara_kg)
          const liquidoG = toNum(p.liquido ?? p.liquido_g ?? p.peso_liquido)

          const brutoG = kgToG(brutoKg)
          const taraG  = kgToG(taraKg)
          const liquidoFinalG = liquidoG != null
            ? liquidoG
            : (brutoG != null && taraG != null ? (brutoG - taraG) : null)

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
  const limparFiltros = () => setFiltros({ produto: '', materiaPrima: '', op: '', lote: '', loteMP: '', dataInicio: '', dataFim: '', pesador: '' })

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
            <div className="space-y-2">
              <Label htmlFor="produto">Produto</Label>
              <Select
                value={filtros.produto || "__all__"}
                onValueChange={(v) => handleFiltroChange('produto', v === "__all__" ? '' : v)}
              >
                <SelectTrigger id="produto"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {produtos.map(p => <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="materiaPrima">Matéria-Prima</Label>
              <Select
                value={filtros.materiaPrima || "__all__"}
                onValueChange={(v) => handleFiltroChange('materiaPrima', v === "__all__" ? '' : v)}
              >
                <SelectTrigger id="materiaPrima"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {materiasPrimas.map(mp => <SelectItem key={mp.id} value={mp.nome}>{mp.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="op">OP</Label>
              <Input id="op" placeholder="Buscar por OP" value={filtros.op} onChange={(e) => handleFiltroChange('op', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lote">Lote (OP)</Label>
              <Input id="lote" placeholder="Buscar por lote da OP" value={filtros.lote} onChange={(e) => handleFiltroChange('lote', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loteMP">Lote MP</Label>
              <Input id="loteMP" placeholder="Buscar por lote de MP" value={filtros.loteMP} onChange={(e) => handleFiltroChange('loteMP', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pesador">Pesador</Label>
              <Input id="pesador" placeholder="Buscar por pesador" value={filtros.pesador} onChange={(e) => handleFiltroChange('pesador', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataInicio">Data Início</Label>
              <Input id="dataInicio" type="date" value={filtros.dataInicio} onChange={(e) => handleFiltroChange('dataInicio', e.target.value)} />
            </div>

            <div className="space-y-2">
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

      {/* Tabela */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {loading ? 'Carregando…' : `Resultados (${filteredPesagens.length})`}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MP</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OP</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lote (OP)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lote MP</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pesador</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pesos (g)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {!loading && filteredPesagens.length > 0 && filteredPesagens.map((pesagem) => (
                  <tr key={pesagem.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {formatDateTime(pesagem.dataHora)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{pesagem.produto}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <Badge variant="outline">{pesagem.materiaPrima}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pesagem.op}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pesagem.lote}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {pesagem.loteMP || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-1 text-gray-400" />
                        {pesagem.pesador}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="space-y-1">
                        <div className="flex items-center" title="Bruto (convertido de kg para g)">
                          <Weight className="h-3 w-3 mr-1 text-gray-400" />
                          <span className="text-xs">B: {pesagem.bruto_g == null ? '-' : nf.format(pesagem.bruto_g)}</span>
                        </div>
                        <div className="flex items-center" title="Tara (convertido de kg para g)">
                          <Weight className="h-3 w-3 mr-1 text-gray-400" />
                          <span className="text-xs">T: {pesagem.tara_g == null ? '-' : nf.format(pesagem.tara_g)}</span>
                        </div>
                        <div className="flex items-center" title="Líquido (g do backend)">
                          <Weight className="h-3 w-3 mr-1 text-green-600" />
                          <span className="text-xs font-semibold text-green-600">L: {pesagem.liquido_g == null ? '-' : nf.format(pesagem.liquido_g)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => handleVerDetalhes(pesagem.id)} className="text-blue-600 hover:text-blue-800">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleGerarEtiqueta(pesagem.id)} className="text-green-600 hover:text-green-800">
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditar(pesagem.id)} className="text-orange-600 hover:text-orange-800">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && filteredPesagens.length === 0 && (
            <div className="text-center py-12">
              <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma pesagem encontrada</h3>
              <p className="text-gray-500">Tente ajustar os filtros ou registre uma nova pesagem.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Historico
