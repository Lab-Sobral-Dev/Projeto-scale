import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Scale, History, Package, Layers, TrendingUp,
  Calendar, Clock, Weight, RefreshCw, Factory, CalendarFold, CalendarClock, ListChecks
} from 'lucide-react'
import api from '@/services/api'
// IMPORTANTE: Importando helpers de permissão
import { getUserRole } from '@/utils/authRoles'

/* =========================
    Utils
========================= */
const tz = 'America/Fortaleza'
const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const fmtG = (v) => {
  const n = Math.round(Number(v) || 0)
  return n.toLocaleString('pt-BR') + ' g'
}

function formatDateTimeISOToBR(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { timeZone: tz })
}

/* =========================
    Componente
========================= */
const Dashboard = () => {
  const [stats, setStats] = useState({
    pesagensHoje: 0,
    pesagensSemana: 0,
    produtosCadastrados: 0,
    materiasPrimas: 0,
    opsPendentes: 0,
    opsAbertas: 0,
    opsAndamento: 0,
  })
  const [ultimasPesagens, setUltimasPesagens] = useState([])
  const [pendingOps, setPendingOps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Obtém papel atual para filtrar botões
  const role = getUserRole()
  const isOperador = role === 'operador'
  const isAdminOrSupervisor = role === 'admin' || role === 'supervisor'

  const quickActions = useMemo(() => {
    const actions = [
      {
        title: 'Nova Pesagem',
        description: 'Registrar uma nova pesagem',
        icon: Scale,
        href: '/nova-pesagem',
        color: 'bg-orange-500 hover:bg-orange-600',
        // Todos podem ver (inclusive operador)
        visible: true
      },
      {
        title: 'Histórico',
        description: 'Consultar pesagens anteriores',
        icon: History,
        href: '/historico',
        color: 'bg-orange-500/90 hover:bg-orange-600',
        visible: true
      },
      {
        title: 'Ordens de Produção',
        description: 'Status e itens das OPs',
        icon: Factory,
        href: '/ops',
        color: 'bg-orange-500/95 hover:bg-orange-600',
        visible: true
      },
      {
        title: 'Nova OP',
        description: 'Criar OP a partir da estrutura',
        icon: ListChecks,
        href: '/ops/nova',
        color: 'bg-orange-500 hover:bg-orange-600',
        // Operador NÃO vê Nova OP
        visible: isAdminOrSupervisor
      },
    ]
    return actions.filter(a => a.visible)
  }, [isAdminOrSupervisor])

  // Todos os indicadores vem prontos do backend (endpoints /stats/ e o "count" do
  // envelope paginado). Nao conte itens de lista aqui: as listas da API sao
  // paginadas em 50 registros e qualquer contador derivado de .length trava nesse teto.
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.getDashboardStats()

      setStats({
        pesagensHoje: d.pesagensHoje,
        pesagensSemana: d.pesagensSemana,
        produtosCadastrados: d.produtosCadastrados,
        materiasPrimas: d.materiasPrimas,
        opsPendentes: d.opsPendentes,
        opsAbertas: d.opsAbertas,
        opsAndamento: d.opsAndamento,
      })

      setUltimasPesagens(d.ultimasPesagens.map(p => ({
        id: p.id,
        produto: p.produto_nome || '-',
        materiaPrima: p.materia_prima_nome || '-',
        pesoLiquido: p.liquido ?? null,
        data: formatDateTimeISOToBR(p.data_hora),
        pesador: p.pesador || '-',
      })))

      setPendingOps(d.opsPendentesDetalhe.map(o => ({
        id: o.id,
        numero: o.numero,
        lote: o.lote,
        produto: o.produto || '-',
        status: o.status,
        criada_em: o.criada_em,
        necessario: o.necessario,
        pesado: o.pesado,
        restante: o.restante,
        progresso: o.progresso,
      })))

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
    const id = setInterval(() => { if (mounted) fetchData() }, 30000)
    const onStorage = (e) => { if (e.key === 'access') fetchData() }
    window.addEventListener('storage', onStorage)
    return () => { mounted = false; clearInterval(id); window.removeEventListener('storage', onStorage) }
  }, [fetchData])

  const statCardsTop = [
    { title: 'Pesagens Hoje', value: stats.pesagensHoje, icon: Calendar, color: 'text-orange-500' },
    { title: 'Pesagens esta Semana', value: stats.pesagensSemana, icon: TrendingUp, color: 'text-orange-500' },
    { title: 'Produtos Cadastrados', value: stats.produtosCadastrados, icon: Package, color: 'text-orange-500' },
    { title: 'Matérias-Primas', value: stats.materiasPrimas, icon: Layers, color: 'text-orange-500' },
  ]
  const statCardsOP = [
    { title: 'OPs Pendentes', value: stats.opsPendentes, icon: CalendarClock, color: 'text-orange-500' },
    { title: 'OPs em Andamento', value: stats.opsAndamento, icon: CalendarFold, color: 'text-orange-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 border border-orange-100 px-3 py-1 mb-1">
            <Scale className="h-4 w-4 text-orange-500" />
            <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
              Dashboard de Pesagem
            </span>
          </div>
          <p className="text-slate-700 mt-1">
            Bem-vindo ao Sistema de Gerenciamento de Pesagem
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {lastUpdated && (
            <p className="mt-1 text-xs text-slate-500">
              Atualizado em {formatDateTimeISOToBR(lastUpdated.toISOString())}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          aria-label="Recarregar"
          className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Recarregar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCardsTop.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card
              key={index}
              className="hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 border border-white/60 bg-white/90"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">{stat.title}</p>
                    <p className="text-3xl font-bold text-slate-900">
                      {loading ? '—' : stat.value}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100">
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCardsOP.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card
              key={index}
              className="hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 border border-white/60 bg-white/90"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">{stat.title}</p>
                    <p className="text-3xl font-bold text-slate-900">
                      {loading ? '—' : stat.value}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100">
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Ações Rápidas - Agora filtradas */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => {
            const Icon = action.icon
            return (
              <Link key={index} to={action.href}>
                <Card className="hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer border border-white/60 bg-white/95 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-orange-500">
                  <CardContent className="p-6 text-center">
                    <div className={`inline-flex p-3 rounded-full text-white mb-4 shadow-md shadow-orange-500/40 ${action.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-2">{action.title}</h3>
                    <p className="text-sm text-slate-600">{action.description}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* OPs Pendentes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">OPs Pendentes</h2>
          <Link to="/ops">
            <Button
              variant="outline"
              size="sm"
              className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
            >
              Ver OPs
            </Button>
          </Link>
        </div>

        <Card className="border border-white/60 bg-white/95">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-orange-50/70">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">OP</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Produto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Progresso</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Saldo Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Criada em</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {loading && pendingOps.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                        Carregando…
                      </td>
                    </tr>
                  )}
                  {!loading && pendingOps.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                        Nenhuma OP pendente.
                      </td>
                    </tr>
                  )}
                  {pendingOps.map(op => (
                    <tr key={op.id} className="hover:bg-orange-50/40">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{op.numero}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{op.produto}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{op.lote}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        <div className="w-48">
                          <div className="h-2 bg-slate-200 rounded">
                            <div
                              className="h-2 bg-orange-500 rounded transition-all"
                              style={{ width: `${op.progresso.toFixed(0)}%` }}
                            />
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{op.progresso.toFixed(0)}%</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {fmtG(op.restante)} (restante)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {formatDateTimeISOToBR(op.criada_em)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Últimas pesagens */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Últimas Pesagens</h2>
          <Link to="/historico">
            <Button
              variant="outline"
              size="sm"
              className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
            >
              Ver Todas
            </Button>
          </Link>
        </div>
        <Card className="border border-white/60 bg-white/95">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-orange-50/70">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Produto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Matéria-Prima</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Peso Líquido</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Data/Hora</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Pesador</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {loading && ultimasPesagens.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                        Carregando…
                      </td>
                    </tr>
                  )}
                  {!loading && ultimasPesagens.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                        Nenhuma pesagem encontrada.
                      </td>
                    </tr>
                  )}
                  {ultimasPesagens.map((p) => (
                    <tr key={p.id} className="hover:bg-orange-50/40">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{p.produto}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{p.materiaPrima}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        <div className="flex items-center">
                          <Weight className="h-4 w-4 mr-1 text-orange-400" />
                          {p.pesoLiquido == null ? '-' : fmtG(p.pesoLiquido)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-1 text-orange-400" />
                          {p.data}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{p.pesador}</td>
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