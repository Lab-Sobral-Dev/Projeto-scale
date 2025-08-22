import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User, LogOut, Shield, Calendar, Clock, UserPlus } from 'lucide-react'

/** Base da API do backend. Ex.: http://localhost:8000 + /api/usuarios */
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/usuarios'

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('access') || ''}`,
})

/** GET com tratamento de 401 (expiração de token) */
const apiGet = async (path) => {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
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

  // Prioriza staff/superuser como admin. Depois usa 'tipo' se existir. Fallback operador.
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

  return {
    id: data.id,
    nome,
    usuario: data.usuario || data.username || '',
    email: data.email || '',
    tipo,
    is_staff: !!isStaff,
    is_superuser: !!isSuper,
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

  // Relógio "vivo" com timezone America/Fortaleza
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000) // pode trocar para 60_000
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

    // 1) Se veio userProp, normaliza com o mesmo mapeamento do backend
    if (userProp) {
      const mapped = mapUserFromAPI(userProp)
      setUser(mapped)
      // 2) Se após normalizar ainda não houver um tipo confiável, busca o /auth/me/
      const tipoConfiavel = ['admin', 'operador', 'supervisor'].includes(mapped.tipo)
      if (!tipoConfiavel) {
        ;(async () => {
          try {
            const data = await apiGet('/auth/me/') // ✅ rota correta: /api/usuarios/auth/me/
            if (!mounted) return
            setUser(mapUserFromAPI(data))
          } catch (e) {
            console.error(e)
            if (e.code === 401) return handleLogout(false)
            setError('Não foi possível carregar os dados do usuário.')
          } finally {
            if (mounted) setLoading(false)
          }
        })()
      } else {
        setLoading(false)
      }
      return () => { mounted = false }
    }

    // 3) Sem userProp → sempre consulta /auth/me/
    ;(async () => {
      try {
        setError('')
        const data = await apiGet('/auth/me/') // ✅ rota correta
        if (!mounted) return
        setUser(mapUserFromAPI(data))
      } catch (e) {
        console.error(e)
        if (e.code === 401) return handleLogout(false)
        setError('Não foi possível carregar os dados do usuário.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

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
      {/* Header com botão condicional */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <User className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Perfil do Usuário</h1>
            <p className="text-gray-600">Informações da conta e configurações</p>
          </div>
        </div>

        {user?.tipo === 'admin' && (
          <Button asChild className="flex items-center gap-2">
            <Link to="/cadastro-usuario">
              <UserPlus className="h-4 w-4" />
              Cadastrar usuários
            </Link>
          </Button>
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
    </div>
  )
}

export default PerfilUsuario
