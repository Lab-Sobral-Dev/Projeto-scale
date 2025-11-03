import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Home,
  Scale,
  History,
  Package,
  Layers,
  User,
  Menu,
  X,
  LogOut,
  Weight,
  ScrollText,
  Factory,
  ListChecks,
  Boxes,
} from 'lucide-react'

/** Base deve apontar para .../api */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const AUTH_ME_URL = `${API_BASE}/usuarios/auth/me/`

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [me, setMe] = useState(null)
  const [loadingMe, setLoadingMe] = useState(false)
  const location = useLocation()

  // --- hidrata /auth/me se necessário (ex.: user sem allowedScreens) ---
  useEffect(() => {
    let mounted = true
    // já temos allowed screens no prop?
    const hasAllowedFromProp =
      Array.isArray(user?.allowedScreens) || Array.isArray(user?.allowed_screens)

    if (hasAllowedFromProp) {
      setMe(null) // não precisa de fallback
      return
    }

    const token = localStorage.getItem('access') || ''
    if (!token) return

      ; (async () => {
        try {
          setLoadingMe(true)
          const res = await fetch(AUTH_ME_URL, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!mounted) return
          if (!res.ok) {
            // se 401, deixa sem me (menu ficará só com Sobre para não-admins)
            setMe(null)
            return
          }
          const data = await res.json()
          setMe(data)
        } catch (e) {
          console.error(e)
        } finally {
          if (mounted) setLoadingMe(false)
        }
      })()

    return () => { mounted = false }
  }, [user])

  // escolhe a melhor fonte do usuário efetivo
  const effectiveUser = useMemo(() => {
    // prioriza prop se tiver allowed screens; senão, usa /auth/me
    const propHasAllowed = Array.isArray(user?.allowedScreens) || Array.isArray(user?.allowed_screens)
    if (propHasAllowed) return user
    if (me) return me
    return user || me
  }, [user, me])

  const allowedList =
    (Array.isArray(effectiveUser?.allowedScreens) && effectiveUser.allowedScreens) ||
    (Array.isArray(effectiveUser?.allowed_screens) && effectiveUser.allowed_screens) ||
    []

  const allowed = useMemo(() => new Set(allowedList), [allowedList])

  const isAdmin =
    effectiveUser?.tipo === 'admin' ||
    effectiveUser?.is_staff === true ||
    effectiveUser?.is_superuser === true

  // Mapeie cada item para o code da Screen no backend (iguais ao seed que criamos)
  const navigation = [
    { name: 'Home', href: '/', icon: Home, requiredScreen: 'dashboard' },
    { name: 'Cadastrar Matéria-Prima', href: '/cadastro-materia-prima', icon: Layers, requiredScreen: 'cadastro_mp' },
    { name: 'Cadastrar Produto', href: '/cadastro-produto', icon: Package, requiredScreen: 'cadastro_produto' },
    { name: 'Estrutura de Produtos', href: '/estruturas', icon: Boxes, requiredScreen: 'estruturas' },
    { name: 'OPs', href: '/ops', icon: Factory, requiredScreen: 'ops' },
    { name: 'Nova OP', href: '/ops/nova', icon: ListChecks, requiredScreen: 'nova_op' },
    { name: 'Nova Pesagem', href: '/nova-pesagem', icon: Scale, requiredScreen: 'nova_pesagem' },
    { name: 'Histórico', href: '/historico', icon: History, requiredScreen: 'historico_pesagens' },
    { name: 'Balanças', href: '/balancas', icon: Weight, requiredScreen: 'balancas' },
    { name: 'Sobre', href: '/sobre', icon: ScrollText, requiredScreen: 'sobre' },
  ]

  const canSee = (item) => {
    if (isAdmin) return true
    if (!item.requiredScreen) return true
    return allowed.has(item.requiredScreen)
  }

  const visibleNav = navigation.filter(canSee)

  // evita que '/ops' e '/estruturas' fiquem ativos quando estiver em subrotas (ex.: '/ops/nova')
  const isActive = (href) => {
    const path = location.pathname
    if (href === '/ops') return path === '/ops' || path === '/ops/'
    if (href === '/estruturas') return path === '/estruturas' || path === '/estruturas/'
    return path === href || path.startsWith(href + '/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75"
          onClick={() => setSidebarOpen(false)}
        />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
          <div className="flex h-16 items-center justify-between px-4 border-b">
            <div className="flex items-center gap-2">
              <img
                src={logoError ? '/logo.png' : '/logo2.png'}
                alt="Logo"
                className="h-12 w-auto"
                onError={() => setLogoError(true)}
              />
              <h1 className="text-xl font-bold text-gray-800">Scale v1.0</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {visibleNav.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${isActive(item.href)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
            {/* Se ainda está carregando /auth/me e nada aparece, evita “menu vazio” para não-admin */}
            {visibleNav.length === 0 && loadingMe && (
              <div className="px-2 text-sm text-gray-500">Carregando permissões…</div>
            )}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 shadow-sm">
          <div className="flex h-16 items-center px-4 border-b">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo Scale" className="h-7 w-7" />
              <h1 className="text-xl font-bold text-gray-900">Scale 1.0</h1>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {visibleNav.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${isActive(item.href)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
            {visibleNav.length === 0 && loadingMe && (
              <div className="px-2 text-sm text-gray-500">Carregando permissões…</div>
            )}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 relative">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* 🔹 Texto centralizado “Homologação” */}
          <div className="absolute inset-x-0 flex justify-center items-center pointer-events-none">
            <span className="text-sm font-semibold text-gray-700 tracking-wide uppercase">
              Homologação
            </span>
          </div>

          {/* 🔹 Conteúdo alinhado à direita */}
          <div className="flex flex-1 justify-end items-center gap-x-4 lg:gap-x-6">
            <div className="flex items-center gap-x-2">
              <Link
                to="/perfil"
                className="flex items-center gap-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                <User className="h-5 w-5" />
                <span className="hidden sm:block">{effectiveUser?.nome || user?.nome || 'Usuário'}</span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="text-gray-500 hover:text-gray-700"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Outlet context={{ user: effectiveUser || user, onLogout }} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout
