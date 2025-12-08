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
  ClipboardList,
  BookPlus,
} from 'lucide-react'

/** Base deve apontar para .../api */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const AUTH_ME_URL = `${API_BASE}/usuarios/auth/me/`

// ---- helpers de normalização/merge de permissões ----
const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '')
function getAllowedFromStorage() {
  try {
    const raw = localStorage.getItem('allowed_screens')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(norm).filter(Boolean)
  } catch {
    return []
  }
}
function mergeAllowed(...lists) {
  const set = new Set()
  lists.forEach((l) => {
    if (Array.isArray(l)) l.forEach((x) => set.add(norm(x)))
  })
  return Array.from(set)
}

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [me, setMe] = useState(null)
  const [loadingMe, setLoadingMe] = useState(false)
  const location = useLocation()

  // --- hidrata /auth/me se necessário ---
  useEffect(() => {
    let mounted = true
    const hasAllowedFromProp =
      Array.isArray(user?.allowedScreens) || Array.isArray(user?.allowed_screens)

    if (hasAllowedFromProp) {
      setMe(null) // já temos permissões no prop
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
            setMe(null) // sem /auth/me → seguimos com storage + prop
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
    const propHasAllowed = Array.isArray(user?.allowedScreens) || Array.isArray(user?.allowed_screens)
    if (propHasAllowed) return user
    if (me) return me
    return user || me
  }, [user, me])

  // permissões vindas de: prop + /auth/me + localStorage
  const allowedFromProp =
    (Array.isArray(effectiveUser?.allowedScreens) && effectiveUser.allowedScreens) ||
    (Array.isArray(effectiveUser?.allowed_screens) && effectiveUser.allowed_screens) ||
    []
  const allowedFromStorage = getAllowedFromStorage()
  const allowedList = mergeAllowed(allowedFromProp, allowedFromStorage)
  const allowed = useMemo(() => new Set(allowedList), [allowedList])

  const isAdmin =
    effectiveUser?.tipo === 'admin' ||
    effectiveUser?.is_staff === true ||
    effectiveUser?.is_superuser === true

  // Nome bonito para topbar
  const displayName =
    effectiveUser?.nome ||
    [effectiveUser?.first_name, effectiveUser?.last_name].filter(Boolean).join(' ') ||
    effectiveUser?.username ||
    user?.nome ||
    'Usuário'

  // Mapeie cada item para o code da Screen no backend (iguais ao seed)
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

    // 🔎 Relatórios (habilite a tela 'relatorios' para admin/supervisor)
    { name: 'Relatórios', href: '/relatorios', icon: ClipboardList, requiredScreen: 'relatorios' },

    // 🔒 Auditoria: só admin
    { name: 'Auditoria', href: '/auditoria', icon: BookPlus, requiredScreen: 'auditoria', adminOnly: true },

    // 🔸 Sobre sempre visível
    { name: 'Sobre', href: '/sobre', icon: ScrollText },
  ]

  const canSee = (item) => {
    // Itens sem requiredScreen (ex.: Sobre) ficam sempre visíveis (exceto adminOnly)
    if (!item.requiredScreen) return item.adminOnly ? isAdmin : true

    // Exclusivo admin?
    if (item.adminOnly) return isAdmin

    // Admin vê tudo
    if (isAdmin) return true

    // --- FIX: Forçar visibilidade para Operador na 'Nova Pesagem' ---
    // Isso garante que o botão apareça mesmo se o DB estiver desatualizado
    if (item.requiredScreen === 'nova_pesagem' && effectiveUser?.tipo === 'operador') {
      return true
    }

    // Demais: depende das permissões
    return allowed.has(String(item.requiredScreen).trim().toLowerCase())
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-slate-100 text-slate-900 relative">
      {/* Glows de fundo (mesma linguagem do login/alterar senha) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-32 top-0 h-72 w-72 bg-gradient-to-tr from-orange-500/20 via-transparent to-orange-400/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 bg-gradient-to-tr from-indigo-500/15 via-transparent to-orange-400/15 blur-3xl" />
      </div>

      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white/95 backdrop-blur-md border-r border-white/10 shadow-2xl rounded-r-2xl overflow-hidden">
          <div className="relative flex h-16 items-center justify-between px-4 border-b border-white/20 bg-white/80">
            {/* Faixinha laranja no topo da sidebar mobile */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500" />
            <div className="flex items-center gap-2 mt-1">
              <img
                src={logoError ? '/logo.png' : '/logo2.png'}
                alt="Logo"
                className="h-10 w-auto drop-shadow-md"
                onError={() => setLogoError(true)}
              />
              <span className="text-[11px] font-semibold text-slate-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                v1.0 Homologação
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-500 hover:text-orange-600 hover:bg-orange-50/60"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {visibleNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all ${active
                    ? 'bg-orange-500/10 text-orange-700 border border-orange-200 shadow-sm'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                    }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon
                    className={`mr-3 h-5 w-5 ${active ? 'text-orange-600' : 'text-slate-400 group-hover:text-orange-500'
                      }`}
                  />
                  {item.name}
                </Link>
              )
            })}
            {visibleNav.length === 0 && (
              <div className="px-2 text-sm text-slate-500">
                {loadingMe ? 'Carregando permissões…' : 'Nenhuma tela disponível.'}
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white/90 backdrop-blur-sm border-r border-white/20 shadow-2xl overflow-hidden">
          <div className="relative flex h-16 items-center px-4 border-b border-white/20 bg-white/80">
            {/* Faixa laranja fina no topo da sidebar desktop, igual linguagem do login */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500" />
            <div className="flex items-center gap-3 mt-1">
              <div className="p-2">
                <img
                  src="/logo.png"
                  alt="Logo Scale"
                  className="h-14 w-auto drop-shadow-md"
                />
              </div>

            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {visibleNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all ${active
                    ? 'bg-orange-500/10 text-orange-700 border border-orange-200 shadow-sm'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                    }`}
                >
                  <Icon
                    className={`mr-3 h-5 w-5 ${active ? 'text-orange-600' : 'text-slate-400 group-hover:text-orange-500'
                      }`}
                  />
                  {item.name}
                </Link>
              )
            })}
            {visibleNav.length === 0 && (
              <div className="px-2 text-sm text-slate-500">
                {loadingMe ? 'Carregando permissões…' : 'Nenhuma tela disponível.'}
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-white/30 bg-white/90 backdrop-blur-sm px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 relative">
          {/* mini faixinha no topo da topbar (continuidade visual) */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500" />

          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden text-slate-600 hover:text-orange-600 hover:bg-orange-50/60"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* “Homologação” centralizado, com pill */}
          <div className="absolute inset-x-0 flex justify-center items-center pointer-events-none">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 tracking-wide uppercase bg-orange-50/90 text-orange-700 px-3 py-1 rounded-full border border-orange-200 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              Homologação
            </span>
          </div>

          {/* Usuário + logout à direita */}
          <div className="flex flex-1 justify-end items-center gap-x-4 lg:gap-x-6">
            <div className="flex items-center gap-x-2">
              <Link
                to="/perfil"
                className="flex items-center gap-x-2 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 border border-orange-100">
                  <User className="h-4 w-4 text-orange-600" />
                </div>
                <span className="hidden sm:block max-w-[160px] truncate">
                  {displayName}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="text-slate-500 hover:text-red-600 hover:bg-red-50/70"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Dá pra manter o conteúdo interno em cards com a mesma linguagem,
                mas isso já fica para cada página específica */}
            <Outlet context={{ user: effectiveUser || user, onLogout }} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout