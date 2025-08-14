import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User, LogOut, Shield, Calendar, Clock, Settings } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('access') || ''}`,
})

const apiGet = async (path) => {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

// Mapeia a resposta do backend para o shape usado na UI
const mapUserFromAPI = (data) => {
  const full =
    (data.first_name ? data.first_name.trim() : '') +
    (data.last_name ? ` ${data.last_name.trim()}` : '')
  const nome =
    (data.nome_exibicao && data.nome_exibicao.trim()) ||
    (full && full.trim()) ||
    data.nome ||
    data.username ||
    'Usuário'

  // Se o backend ainda não enviar 'tipo', usa fallback por permissões do User
  const tipo =
    data.tipo ||
    (data.is_staff || data.is_superuser ? 'admin' : 'operador')

  return {
    id: data.id,
    nome,
    usuario: data.usuario || data.username || '',
    email: data.email || '',
    tipo, // 'admin' | 'operador' | (outros no futuro)
  }
}

const PerfilUsuario = ({ user: userProp, onLogout }) => {
  const [user, setUser] = useState(userProp || null)
  const [loading, setLoading] = useState(!userProp)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    if (userProp) {
      setUser(userProp)
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const data = await apiGet('/api/usuarios/auth/me/')
        if (!mounted) return
        setUser(mapUserFromAPI(data))
      } catch (e) {
        console.error(e)
        setError('Não foi possível carregar os dados do usuário.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [userProp])

  const handleLogout = () => {
    if (window.confirm('Tem certeza que deseja sair do sistema?')) {
      if (typeof onLogout === 'function') {
        onLogout()
      } else {
        // fallback: limpa tokens e vai pro login
        localStorage.removeItem('access')
        localStorage.removeItem('refresh')
        window.location.href = '/login'
      }
    }
  }

  const getUserTypeLabel = (tipo) => {
    switch (tipo) {
      case 'admin':
        return 'Administrador'
      case 'operador':
        return 'Operador'
      case 'supervisor':
        return 'Supervisor'
      default:
        return 'Usuário'
    }
  }

  const getUserTypeColor = (tipo) => {
    switch (tipo) {
      case 'admin':
        return 'bg-red-100 text-red-800'
      case 'supervisor':
        return 'bg-blue-100 text-blue-800'
      case 'operador':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const currentDate = new Date().toLocaleDateString('pt-BR')
  const currentTime = new Date().toLocaleTimeString('pt-BR')

  if (loading) {
    return (
      <div className="space-y-6">
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
      <div className="space-y-4">
        <p className="text-red-600 text-sm">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <User className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Perfil do Usuário</h1>
          <p className="text-gray-600">Informações da conta e configurações</p>
        </div>
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
                <Badge className={getUserTypeColor(user?.tipo)}>
                  {getUserTypeLabel(user?.tipo)}
                </Badge>
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
                <Badge className="bg-green-100 text-green-800">Ativa</Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Tipo de Autenticação</span>
                <span className="text-sm text-gray-900">JWT Token</span>
              </div>
            </div>

            <div className="pt-4">
              <Button onClick={handleLogout} variant="destructive" className="w-full flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Sair do Sistema
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Permissões e Funcionalidades 
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Permissões e Funcionalidades
          </CardTitle>
          <CardDescription>Funcionalidades disponíveis para seu tipo de usuário</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Pesagens</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>✓ Registrar nova pesagem</li>
                <li>✓ Visualizar histórico</li>
                <li>✓ Gerar etiquetas</li>
                {user?.tipo === 'admin' && <li>✓ Editar pesagens</li>}
              </ul>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Cadastros</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                {(user?.tipo === 'admin' || user?.tipo === 'supervisor') ? (
                  <>
                    <li>✓ Cadastrar produtos</li>
                    <li>✓ Cadastrar matérias-primas</li>
                    <li>✓ Editar cadastros</li>
                  </>
                ) : (
                  <li>○ Acesso limitado aos cadastros</li>
                )}
              </ul>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Relatórios</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>✓ Visualizar dashboard</li>
                <li>✓ Consultar histórico</li>
                {(user?.tipo === 'admin' || user?.tipo === 'supervisor') && (
                  <li>✓ Relatórios avançados</li>
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>*/}
    </div>
  )
}

export default PerfilUsuario
