import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Scale, History, Package, Layers, TrendingUp,
  Calendar, Clock, Weight, RefreshCw
} from 'lucide-react'
import api from '@/services/api'

/* =========================
   Utils
========================= */
const tz = 'America/Fortaleza'
const nfKg = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function formatDateTimeISOToBR(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { timeZone: tz })
}
function isSameDayFortaleza(iso, ref = new Date()) {
  if (!iso) return false
  const d = new Date(iso)
  const fmt = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }
  return new Intl.DateTimeFormat('pt-BR', fmt).format(d) === new Intl.DateTimeFormat('pt-BR', fmt).format(ref)
}
function isWithinLastDaysFortaleza(iso, days = 7) {
  if (!iso) return false
  const now = new Date()
  const d = new Date(iso)
  const diff = now.getTime() - d.getTime()
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000
}

/* =========================
   Componente
========================= */
const Dashboard = () => {
  const [stats, setStats] = useState({
    pesagensHoje: 0,
    pesagensSemana: 0,
    produtosCadastrados: 0,
    materiasPrimas: 0
  })
  const [ultimasPesagens, setUltimasPesagens] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const quickActions = useMemo(() => ([
    { title: 'Nova Pesagem', description: 'Registrar uma nova pesagem', icon: Scale, href: '/nova-pesagem', color: 'bg-blue-500 hover:bg-blue-600' },
    { title: 'Histórico', description: 'Consultar pesagens anteriores', icon: History, href: '/historico', color: 'bg-green-500 hover:bg-green-600' },
    { title: 'Cadastrar Produto', description: 'Adicionar novo produto', icon: Package, href: '/cadastro-produto', color: 'bg-purple-500 hover:bg-purple-600' },
    { title: 'Cadastrar MP', description: 'Adicionar matéria-prima', icon: Layers, href: '/cadastro-materia-prima', color: 'bg-orange-500 hover:bg-orange-600' },
  ]), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // O service já cuida de Authorization/refresh.
      const [produtos, materias, pesagens] = await Promise.all([
        api.getProdutos(),
        api.getMateriasPrimas(),
        api.getPesagens(),
      ])

      const produtosList = Array.isArray(produtos) ? produtos : (produtos?.results ?? [])
      const materiasList = Array.isArray(materias) ? materias : (materias?.results ?? [])
      const pesList     = Array.isArray(pesagens) ? pesagens : (pesagens?.results ?? [])

      // Mapas id->nome para quando vierem apenas IDs
      const prodById = new Map(produtosList.map(p => [p.id, p.nome]))
      const mpById   = new Map(materiasList.map(m => [m.id, m.nome]))

      // KPIs
      const hoje   = pesList.filter(p => isSameDayFortaleza(p.data_hora))
      const semana = pesList.filter(p => isWithinLastDaysFortaleza(p.data_hora, 7))

      setStats({
        pesagensHoje: hoje.length,
        pesagensSemana: semana.length,
        produtosCadastrados: Array.isArray(produtos) ? produtos.length : (produtos?.count ?? produtosList.length),
        materiasPrimas: Array.isArray(materias) ? materias.length : (materias?.count ?? materiasList.length),
      })

      // Últimas 10 pesagens
      const sorted = [...pesList].sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))
      const top10 = sorted.slice(0, 10).map(p => {
        const produtoNome =
          (p.produto && typeof p.produto === 'object' && p.produto.nome) ||
          (typeof p.produto === 'number' && prodById.get(p.produto)) || '-'

        const mpNome =
          (p.materia_prima && typeof p.materia_prima === 'object' && p.materia_prima.nome) ||
          (typeof p.materia_prima === 'number' && mpById.get(p.materia_prima)) || '-'

        const liquido =
          p.liquido ?? p.peso_liquido ??
          ((p.bruto != null && p.tara != null) ? (Number(p.bruto) - Number(p.tara)) : null)

        return {
          id: p.id,
          produto: produtoNome,
          materiaPrima: mpNome,
          pesoLiquido: liquido,
          data: formatDateTimeISOToBR(p.data_hora),
          pesador: p.pesador ?? '-',
        }
      })

      setUltimasPesagens(top10)
      setLastUpdated(new Date())
    } catch (e) {
      console.error(e)
      setError('Não foi possível carregar os dados. Verifique sua conexão, token e CORS.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    fetchData()

    // Auto refresh a cada 30s
    const id = setInterval(() => {
      if (mounted) fetchData()
    }, 30000)

    // Recarregar quando o token mudar (ex.: login em outra aba)
    const onStorage = (e) => {
      if (e.key === 'access') fetchData()
    }
    window.addEventListener('storage', onStorage)

    return () => {
      mounted = false
      clearInterval(id)
      window.removeEventListener('storage', onStorage)
    }
  }, [fetchData])

  const statCards = [
    { title: 'Pesagens Hoje', value: stats.pesagensHoje, icon: Calendar, color: 'text-blue-600' },
    { title: 'Pesagens esta Semana', value: stats.pesagensSemana, icon: TrendingUp, color: 'text-green-600' },
    { title: 'Produtos Cadastrados', value: stats.produtosCadastrados, icon: Package, color: 'text-purple-600' },
    { title: 'Matérias-Primas', value: stats.materiasPrimas, icon: Layers, color: 'text-orange-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Bem-vindo ao Sistema de Gerenciamento de Pesagem de Matéria-Prima</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {lastUpdated && (
            <p className="mt-1 text-xs text-gray-500">
              Atualizado em {formatDateTimeISOToBR(lastUpdated.toISOString())}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} aria-label="Recarregar">
          <RefreshCw className="h-4 w-4 mr-2" /> Recarregar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {loading ? '—' : stat.value}
                    </p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Ações rápidas */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => {
            const Icon = action.icon
            return (
              <Link key={index} to={action.href}>
                <Card className="hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  <CardContent className="p-6 text-center">
                    <div className={`inline-flex p-3 rounded-full text-white mb-4 ${action.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{action.title}</h3>
                    <p className="text-sm text-gray-600">{action.description}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Últimas pesagens */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Últimas Pesagens</h2>
          <Link to="/historico">
            <Button variant="outline" size="sm">Ver Todas</Button>
          </Link>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matéria-Prima</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Peso Líquido</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pesador</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading && ultimasPesagens.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                        Carregando…
                      </td>
                    </tr>
                  )}
                  {!loading && ultimasPesagens.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                        Nenhuma pesagem encontrada.
                      </td>
                    </tr>
                  )}
                  {ultimasPesagens.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.produto}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.materiaPrima}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Weight className="h-4 w-4 mr-1 text-gray-400" />
                          {p.pesoLiquido == null ? '-' : `${nfKg.format(Number(p.pesoLiquido))} kg`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-1 text-gray-400" />
                          {p.data}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.pesador}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard
