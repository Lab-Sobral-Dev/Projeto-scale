// src/components/Historico.jsx
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
  User
} from 'lucide-react'

// Base da API
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Headers com JWT
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('access') || ''}`
})

// GET genérico com unwrap opcional de paginação DRF (results)
const apiGet = async (path) => {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return (data && typeof data === 'object' && 'results' in data) ? data.results : data
}

const Historico = () => {
  const navigate = useNavigate()
  const [pesagens, setPesagens] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filtros, setFiltros] = useState({
    produto: '',        // armazena NOME do produto
    materiaPrima: '',   // armazena NOME da MP
    op: '',
    lote: '',
    dataInicio: '',
    dataFim: '',
    pesador: ''
  })

  const [produtos, setProdutos] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])

  // Carregar dados reais da API
  useEffect(() => {
    let mounted = true
      ; (async () => {
        setLoading(true)
        setError('')
        try {
          const [pes, prods, mps] = await Promise.all([
            apiGet('/api/registro/pesagens/'),
            apiGet('/api/registro/produtos/'),
            apiGet('/api/registro/materias-primas/')
          ])

          if (!mounted) return

          const normalized = (pes || []).map(p => ({
            id: p.id,
            dataHora: p.data_hora,
            produto: p.produto?.nome || '',
            materiaPrima: p.materia_prima?.nome || '',
            op: p.op || '',
            lote: p.lote || '',
            pesador: p.pesador || '',
            bruto: Number(p.bruto),
            tara: Number(p.tara),
            liquido: Number(p.liquido),
            volume: p.volume,
            balanca: p.balanca,
            codigoInterno: p.codigo_interno
          }))

          setPesagens(normalized)
          setProdutos((prods || []).map(x => ({ id: x.id, nome: x.nome })))
          setMateriasPrimas((mps || []).map(x => ({ id: x.id, nome: x.nome })))
        } catch (e) {
          console.error(e)
          setError('Não foi possível carregar os dados. Verifique sua conexão e o token.')
        } finally {
          if (mounted) setLoading(false)
        }
      })()
    return () => { mounted = false }
  }, [])

  const handleFiltroChange = (name, value) => {
    setFiltros(prev => ({ ...prev, [name]: value }))
  }

  const limparFiltros = () => {
    setFiltros({
      produto: '',
      materiaPrima: '',
      op: '',
      lote: '',
      dataInicio: '',
      dataFim: '',
      pesador: ''
    })
  }

  const inDateRange = (isoString) => {
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

    if (filtros.produto) {
      filtered = filtered.filter(p => p.produto === filtros.produto)
    }
    if (filtros.materiaPrima) {
      filtered = filtered.filter(p => p.materiaPrima === filtros.materiaPrima)
    }
    if (filtros.op) {
      const q = filtros.op.toLowerCase()
      filtered = filtered.filter(p => p.op?.toLowerCase().includes(q))
    }
    if (filtros.lote) {
      const q = filtros.lote.toLowerCase()
      filtered = filtered.filter(p => p.lote?.toLowerCase().includes(q))
    }
    if (filtros.pesador) {
      const q = filtros.pesador.toLowerCase()
      filtered = filtered.filter(p => p.pesador?.toLowerCase().includes(q))
    }
    filtered = filtered.filter(p => inDateRange(p.dataHora))

    return filtered
  }, [pesagens, filtros])

  const handleVerDetalhes = (id) => {
    navigate(`/pesagens/${id}`)
  }

  const handleGerarEtiqueta = (id) => {
    window.open(`${API}/api/registro/etiqueta/${id}/`, '_blank', 'noopener')
  }

  const handleEditar = (id) => {
    navigate(`/pesagens/${id}/editar`)
  }

  const formatDateTime = (dateTime) => {
    const d = new Date(dateTime)
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR')
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
            {/* Produto (Select) */}
            <div className="space-y-2">
              <Label htmlFor="produto">Produto</Label>
              <Select
                value={filtros.produto || "__all__"}
                onValueChange={(v) => handleFiltroChange('produto', v === "__all__" ? '' : v)}
              >
                <SelectTrigger id="produto">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {produtos.map(p => (
                    <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* MP (Select) */}
            <div className="space-y-2">
              <Label htmlFor="materiaPrima">Matéria-Prima</Label>
              <Select
                value={filtros.materiaPrima || "__all__"}
                onValueChange={(v) => handleFiltroChange('materiaPrima', v === "__all__" ? '' : v)}
              >
                <SelectTrigger id="materiaPrima">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {materiasPrimas.map(mp => (
                    <SelectItem key={mp.id} value={mp.nome}>{mp.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            {/* OP */}
            <div className="space-y-2">
              <Label htmlFor="op">OP</Label>
              <Input
                id="op"
                placeholder="Buscar por OP"
                value={filtros.op}
                onChange={(e) => handleFiltroChange('op', e.target.value)}
              />
            </div>

            {/* Lote */}
            <div className="space-y-2">
              <Label htmlFor="lote">Lote</Label>
              <Input
                id="lote"
                placeholder="Buscar por lote"
                value={filtros.lote}
                onChange={(e) => handleFiltroChange('lote', e.target.value)}
              />
            </div>

            {/* Pesador */}
            <div className="space-y-2">
              <Label htmlFor="pesador">Pesador</Label>
              <Input
                id="pesador"
                placeholder="Buscar por pesador"
                value={filtros.pesador}
                onChange={(e) => handleFiltroChange('pesador', e.target.value)}
              />
            </div>

            {/* Data Início */}
            <div className="space-y-2">
              <Label htmlFor="dataInicio">Data Início</Label>
              <Input
                id="dataInicio"
                type="date"
                value={filtros.dataInicio}
                onChange={(e) => handleFiltroChange('dataInicio', e.target.value)}
              />
            </div>

            {/* Data Fim */}
            <div className="space-y-2">
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

      {/* Resultados */}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lote</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pesador</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pesos (kg)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {!loading && filteredPesagens.map((pesagem) => (
                  <tr key={pesagem.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {formatDateTime(pesagem.dataHora)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {pesagem.produto}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <Badge variant="outline">{pesagem.materiaPrima}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pesagem.op}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pesagem.lote}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-1 text-gray-400" />
                        {pesagem.pesador}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <Weight className="h-3 w-3 mr-1 text-gray-400" />
                          <span className="text-xs">B: {pesagem.bruto}</span>
                        </div>
                        <div className="flex items-center">
                          <Weight className="h-3 w-3 mr-1 text-gray-400" />
                          <span className="text-xs">T: {pesagem.tara}</span>
                        </div>
                        <div className="flex items-center">
                          <Weight className="h-3 w-3 mr-1 text-green-600" />
                          <span className="text-xs font-semibold text-green-600">L: {pesagem.liquido}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalhes(pesagem.id)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleGerarEtiqueta(pesagem.id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditar(pesagem.id)}
                          className="text-orange-600 hover:text-orange-800"
                        >
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
