import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User, LogOut, Shield, Calendar, Clock, UserPlus, LayoutGrid, HardDrive } from 'lucide-react'

/** Base da API do backend — deve apontar para .../api */
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000/api')

/** Endpoints globais (auth) e catálogo de telas */
const AUTH_ME_URL = `${API_BASE}/usuarios/auth/me/`
const SCREENS_URL = `${API_BASE}/usuarios/screens/`

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('access') || ''}`,
})

/** GET absoluto com tratamento de 401 */
const apiGetAbs = async (url) => {
  const res = await fetch(url, { headers: authHeaders() })
  if (res.status === 401) {
    const err = new Error('UNAUTHORIZED')
    err.code = 401
    throw err
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

/** Normaliza o usuário vindo do backend/prop para o shape da UI */
const mapUserFromAPI = (data = {}) => {
  const full =
    (data.first_name ? String(data.first_name).trim() : '') +
    (data.last_name ? ` ${String(data.last_name).trim()}` : '')
  const nome =
    (data.nome_exibicao && String(data.nome_exibicao).trim()) ||
    (full && full.trim()) ||
    data.nome ||
    data.username ||
    data.usuario ||
    'Usuário'

  const isStaff = data.is_staff === true || data.is_staff === 'True'
  const isSuper = data.is_superuser === true || data.is_superuser === 'True'
  const tipoCanon =
    isStaff || isSuper ? 'admin'
      : data.tipo ? String(data.tipo).toLowerCase()
        : 'operador'

  const tipo =
    ['admin', 'operador', 'supervisor'].includes(tipoCanon) ? tipoCanon
      : (tipoCanon.includes('admin') ? 'admin'
        : tipoCanon.includes('super') ? 'admin'
          : tipoCanon.includes('oper') ? 'operador'
            : tipoCanon.includes('superv') ? 'supervisor'
              : 'operador')

  const allowedScreens =
    Array.isArray(data.allowed_screens) ? data.allowed_screens
      : Array.isArray(data.allowedScreens) ? data.allowedScreens
        : []

  return {
    id: data.id,
    nome,
    usuario: data.usuario || data.username || '',
    email: data.email || '',
    tipo,
    is_staff: !!isStaff,
    is_superuser: !!isSuper,
    allowedScreens,
  }
}

/** Mapeia tipo → Badge variant + rótulo */
const getUserTypeBadge = (tipo) => {
  switch (tipo) {
    case 'admin': return { label: 'Administrador', variant: 'destructive' }
    case 'supervisor': return { label: 'Supervisor', variant: 'secondary' }
    case 'operador': return { label: 'Operador', variant: 'default' }
    default: return { label: 'Usuário', variant: 'outline' }
  }
}

const PerfilUsuario = ({ user: userProp, onLogout }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // catálogo de telas para exibir labels
  const [screenLabels, setScreenLabels] = useState({}) // { code: label }

  // Relógio "vivo" com timezone America/Fortaleza
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const currentDate = now.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })
  const currentTime = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza' })

  const handleLogout = (ask = true) => {
    if (!ask || window.confirm('Tem certeza que deseja sair do sistema?')) {
      if (typeof onLogout === 'function') {
        onLogout()
      } else {
        localStorage.removeItem('access')
        localStorage.removeItem('refresh')
        window.location.href = '/login'
      }
    }
  }

  useEffect(() => {
    let mounted = true

    const hydrate = async () => {
      try {
        setError('')
        // carrega usuário
        const data = await apiGetAbs(AUTH_ME_URL)
        if (!mounted) return
        setUser(mapUserFromAPI(data))
      } catch (e) {
        console.error(e)
        if (e.code === 401) return handleLogout(false)
        setError('Não foi possível carregar os dados do usuário.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    // carrega catálogo de telas (code → label)
    const hydrateScreens = async () => {
      try {
        const json = await apiGetAbs(SCREENS_URL)
        const list = Array.isArray(json) ? json : (json?.results ?? [])
        const map = {}
        for (const s of list) {
          if (s?.code) map[s.code] = s.label || s.code
        }
        if (mounted) setScreenLabels(map)
      } catch (e) {
        console.warn('Falha ao carregar screens — exibindo códigos.')
      }
    }

    if (userProp) {
      const mapped = mapUserFromAPI(userProp)
      setUser(mapped)
      const tipoConfiavel = ['admin', 'operador', 'supervisor'].includes(mapped.tipo)
      if (!tipoConfiavel || mapped.allowedScreens.length === 0) {
        hydrate()
      } else {
        setLoading(false)
      }
    } else {
      hydrate()
    }

    hydrateScreens()
    return () => { mounted = false }
  }, [userProp])

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-gray-100 rounded mt-2 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="h-24 bg-gray-100 rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <p className="text-red-600 text-sm">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  const badge = getUserTypeBadge(user?.tipo)

  return (
    <div className="space-y-6">
      {/* Header com botões condicionais (Usuários + Backups para admin) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <User className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Perfil do Usuário</h1>
            <p className="text-gray-600">Informações da conta e configurações</p>
          </div>
        </div>

        {user?.tipo === 'admin' && (
          <div className="flex items-center gap-2">
            <Button asChild className="flex items-center gap-2">
              <Link to="/usuarios">
                <UserPlus className="h-4 w-4" />
                Usuários
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex items-center gap-2">
              <Link to="/relatorios/backups">
                <HardDrive className="h-4 w-4" />
                Backups
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Informações do Usuário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Dados do Usuário
            </CardTitle>
            <CardDescription>Informações básicas da conta logada</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{user?.nome || 'Usuário'}</h3>
                <p className="text-gray-500">@{user?.usuario || 'usuario'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Nome Completo</span>
                <span className="text-sm text-gray-900">{user?.nome || 'Não informado'}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Usuário</span>
                <span className="text-sm text-gray-900">{user?.usuario || 'Não informado'}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Tipo de Usuário</span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">ID do Usuário</span>
                <span className="text-sm text-gray-900">#{user?.id || 'N/A'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sessão Atual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Sessão Atual
            </CardTitle>
            <CardDescription>Informações sobre a sessão ativa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Data de Acesso</span>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">{currentDate}</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Hora Atual</span>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">{currentTime}</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Status da Sessão</span>
                <Badge variant="default">Ativa</Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Tipo de Autenticação</span>
                <span className="text-sm text-gray-900">JWT Token</span>
              </div>
            </div>

            <div className="pt-4">
              <Button onClick={() => handleLogout(true)} variant="destructive" className="w-full flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Sair do Sistema
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Telas permitidas (labels ao invés de codes) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Telas permitidas
          </CardTitle>
          <CardDescription>Conjunto efetivo de telas habilitadas para este usuário</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {user?.allowedScreens?.length
            ? user.allowedScreens.map(code => {
              const label = screenLabels[code] || code
              return <Badge key={code} variant="secondary">{label}</Badge>
            })
            : <span className="text-sm text-gray-500">Nenhuma tela atribuída.</span>}
        </CardContent>
      </Card>
    </div>
  )
}

export default PerfilUsuario
