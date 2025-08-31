import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Scale, History, Package, Layers, TrendingUp,
  Calendar, Clock, Weight, RefreshCw, Factory, Hammer, ListChecks
} from 'lucide-react'
import api from '@/services/api'

/* =========================
    Utils
========================= */
const tz = 'America/Fortaleza'
const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

// NOVO FORMATADOR PARA GRAMAS
const fmtG = (v) => {
  const n = Math.round(Number(v) || 0)
  return n.toLocaleString('pt-BR') + ' g'
}

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
const normalize = (data) => Array.isArray(data) ? data : (data?.results ?? [])

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
  const [pendingOps, setPendingOps] = useState([]) // [{id, numero, lote, produto, status, progresso, necessario, pesado, restante, criada_em}]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const quickActions = useMemo(() => ([
    { title: 'Nova Pesagem', description: 'Registrar uma nova pesagem', icon: Scale, href: '/nova-pesagem', color: 'bg-blue-500 hover:bg-blue-600' },
    { title: 'Histórico', description: 'Consultar pesagens anteriores', icon: History, href: '/historico', color: 'bg-green-500 hover:bg-green-600' },
    { title: 'Ordens de Produção', description: 'Status e itens das OPs', icon: Factory, href: '/ops', color: 'bg-indigo-500 hover:bg-indigo-600' },
    { title: 'Nova OP', description: 'Criar OP a partir da estrutura', icon: ListChecks, href: '/ops/nova', color: 'bg-rose-500 hover:bg-rose-600' },
  ]), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Busca tudo que precisamos
      const [produtos, materias, pesagens, ops] = await Promise.all([
        api.getProdutos(),
        api.getMateriasPrimas(),
        api.getPesagens(),
        api.getOPs({ ordering: '-criada_em' }),
      ])

      const produtosList = normalize(produtos)
      const materiasList = normalize(materias)
      const pesList = normalize(pesagens)
      const opsList = normalize(ops)

      // Mapas id->nome (fallback caso alguns endpoints retornem só IDs)
      const prodById = new Map(produtosList.map(p => [p.id, p.nome]))
      const mpById = new Map(materiasList.map(m => [m.id, m.nome]))

      // KPIs de pesagens
      const hoje = pesList.filter(p => isSameDayFortaleza(p.data_hora))
      const semana = pesList.filter(p => isWithinLastDaysFortaleza(p.data_hora, 7))

      // KPIs de OPs
      const ab = opsList.filter(o => o.status === 'aberta').length
      const em = opsList.filter(o => o.status === 'em_andamento').length
      const pend = ab + em

      setStats({
        pesagensHoje: hoje.length,
        pesagensSemana: semana.length,
        produtosCadastrados: Array.isArray(produtos) ? produtos.length : (produtos?.count ?? produtosList.length),
        materiasPrimas: Array.isArray(materias) ? materias.length : (materias?.count ?? materiasList.length),
        opsPendentes: pend,
        opsAndamento: em,
      })

      // Últimas 10 pesagens (compatível com novo serializer: produto_nome / materia_prima_nome)
      const sorted = [...pesList].sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))
      const top10 = sorted.slice(0, 10).map(p => {
        const produtoNome =
          p.produto_nome ||
          (p.produto && typeof p.produto === 'object' && p.produto.nome) ||
          (typeof p.produto === 'number' && prodById.get(p.produto)) || '-'

        const mpNome =
          p.materia_prima_nome ||
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

      // OPs pendentes (top 5 mais recentes) + progresso/saldo
      const pendentes = opsList.filter(o => ['aberta', 'em_andamento'].includes(o.status)).slice(0, 5)
      const itensByOp = await Promise.all(
        pendentes.map(o => api.getOPItems(o.id).then(normalize).catch(() => []))
      )
      const pendDetails = pendentes.map((o, idx) => {
        const itens = itensByOp[idx]
        const totals = itens.reduce((acc, it) => {
          const nec = Number(it.quantidade_necessaria || 0)
          const pes = Number(it.quantidade_pesada || 0)
          acc.necessario += nec
          acc.pesado += pes
          return acc
        }, { necessario: 0, pesado: 0 })
        const restante = Math.max(totals.necessario - totals.pesado, 0)
        const progresso = totals.necessario > 0 ? Math.min((totals.pesado / totals.necessario) * 100, 100) : 0
        return {
          id: o.id,
          numero: o.numero,
          lote: o.lote,
          produto: o?.produto?.nome || '-',
          status: o.status,
          criada_em: o.criada_em,
          necessario: totals.necessario,
          pesado: totals.pesado,
          restante,
          progresso,
        }
      })
      setPendingOps(pendDetails)

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
    { title: 'Pesagens Hoje', value: stats.pesagensHoje, icon: Calendar, color: 'text-blue-600' },
    { title: 'Pesagens esta Semana', value: stats.pesagensSemana, icon: TrendingUp, color: 'text-green-600' },
    { title: 'Produtos Cadastrados', value: stats.produtosCadastrados, icon: Package, color: 'text-purple-600' },
    { title: 'Matérias-Primas', value: stats.materiasPrimas, icon: Layers, color: 'text-orange-600' },
  ]
  const statCardsOP = [
    { title: 'OPs Pendentes', value: stats.opsPendentes, icon: Factory, color: 'text-indigo-600' },
    { title: 'OPs em Andamento', value: stats.opsAndamento, icon: Hammer, color: 'text-rose-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Bem-vindo ao Sistema de Gerenciamento de Pesagem</p>
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

      {/* KPIs de pesagens/produtos/MPs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCardsTop.map((stat, index) => {
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

      {/* KPIs de OPs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCardsOP.map((stat, index) => {
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

      {/* OPs pendentes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">OPs Pendentes</h2>
          <Link to="/ops">
            <Button variant="outline" size="sm">Ver OPs</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OP</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progresso</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criada em</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading && pendingOps.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">Carregando…</td></tr>
                  )}
                  {!loading && pendingOps.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">Nenhuma OP pendente.</td></tr>
                  )}
                  {pendingOps.map(op => (
                    <tr key={op.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{op.numero}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{op.produto}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{op.lote}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="w-48">
                          <div className="h-2 bg-gray-200 rounded">
                            <div className="h-2 bg-blue-600 rounded" style={{ width: `${op.progresso.toFixed(0)}%` }} />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{op.progresso.toFixed(0)}%</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {fmtG(op.restante)} (restante)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                          {p.pesoLiquido == null ? '-' : fmtG(p.pesoLiquido)}
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