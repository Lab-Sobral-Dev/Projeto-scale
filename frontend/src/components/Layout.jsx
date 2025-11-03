// src/Layout.jsx
import { useState, useMemo } from 'react'
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom'
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
import api from '@/services/api'

// Mapa entre "códigos de tela" do backend e itens de navegação
// Ajuste os hrefs conforme suas rotas reais.
const NAV_MAP = {
  dashboard:        { name: 'Dashboard',               href: '/',                         icon: Home },
  nova_pesagem:     { name: 'Nova Pesagem',            href: '/nova-pesagem',             icon: Scale },
  historico_pesagens:{name: 'Histórico de Pesagens',   href: '/historico-pesagens',       icon: History },

  cadastro_produto: { name: 'Cadastrar Produto',       href: '/cadastro-produto',         icon: Package },
  cadastro_mp:      { name: 'Cadastrar Matéria-Prima', href: '/cadastro-materia-prima',   icon: Layers },

  geracao_etiqueta: { name: 'Gerar Etiqueta',          href: '/geracao-etiqueta',         icon: TagIcon }, // veremos abaixo
  estruturas:       { name: 'Estrutura de Produtos',   href: '/estruturas',               icon: Boxes },
  balancas:         { name: 'Balanças',                href: '/balancas',                 icon: Weight },
  ops:              { name: 'Ordem de Produção',       href: '/ops',                      icon: Factory },
  auditoria:        { name: 'Auditoria',               href: '/auditoria',                icon: ScrollText },
  checklist:        { name: 'Checklist',               href: '/checklist',                icon: ListChecks },

  usuarios:         { name: 'Usuários',                href: '/usuarios',                 icon: User },
}

// Fallback do icon "Tag" se você não importou acima
function TagIcon(props){ return <Package {...props} /> }

// Fallback por papel, caso o JWT não traga allowed_screens por algum motivo.
// Ajuste conforme sua política.
const ROLE_FALLBACK = {
  admin: [
    'dashboard','nova_pesagem','historico_pesagens',
    'cadastro_produto','cadastro_mp','geracao_etiqueta',
    'estruturas','balancas','ops','auditoria','checklist','usuarios'
  ],
  supervisor: [
    'dashboard','nova_pesagem','historico_pesagens',
    'cadastro_produto','cadastro_mp','geracao_etiqueta','estruturas','balancas','ops','auditoria'
  ],
  qa: [
    'dashboard','historico_pesagens','auditoria'
  ],
  operador: [
    'dashboard','nova_pesagem','historico_pesagens','geracao_etiqueta'
  ]
}

function useAllowedScreens(user){
  return useMemo(() => {
    // 1) Primeiro tenta as permissões vindas do JWT (salvas no login)
    try {
      const raw = localStorage.getItem('allowed_screens')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) {
          // normaliza para string sem espaços
          return [...new Set(parsed.map(s => String(s).trim()).filter(Boolean))]
        }
      }
    } catch { /* ignore */ }

    // 2) Fallback por papel (client-side, só para UX; backend continua sendo a fonte da verdade)
    const papel = (user?.papel || '').toLowerCase()
    const fallback = ROLE_FALLBACK[papel] || ROLE_FALLBACK['operador']
    return [...new Set(fallback)]
  }, [user])
}

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const allowedScreens = useAllowedScreens(user)

  // Constrói a lista final a partir do NAV_MAP ∩ allowedScreens.
  const navigation = useMemo(() => {
    const items = []
    allowedScreens.forEach(code => {
      const item = NAV_MAP[code]
      if (item) items.push(item)
    })
    // Garante que Dashboard apareça primeiro se estiver presente
    items.sort((a,b) => (a.href === '/' ? -1 : b.href === '/' ? 1 : 0))
    return items
  }, [allowedScreens])

  const isActive = (href) => location.pathname === href

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      onLogout?.()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar Mobile */}
      <div className={`fixed inset-0 z-40 md:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
             onClick={() => setSidebarOpen(false)} />
        <div className={`absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-zinc-900 shadow-xl transform transition-transform
                         ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between px-4 h-16 border-b">
            <div className="flex items-center gap-3">
              {!logoError ? (
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-8 w-auto"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Home className="h-6 w-6" />
              )}
              <span className="font-semibold">Scale</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="p-2 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm
                    ${active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-foreground'}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              )
            })}

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 mt-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Sidebar Desktop */}
      <aside className="hidden md:flex md:flex-col w-64 border-r">
        <div className="h-16 flex items-center justify-between px-4 border-b">
          <div className="flex items-center gap-3">
            {!logoError ? (
              <img
                src="/logo.png"
                alt="Logo"
                className="h-8 w-auto"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Home className="h-6 w-6" />
            )}
            <span className="font-semibold">Scale</span>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm
                  ${active
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'}`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-2 border-t">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-16 border-b px-4 flex items-center justify-between md:justify-end">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-3">
            <User className="h-5 w-5 opacity-70" />
            <div className="text-sm">
              <div className="font-medium leading-4">{user?.nome || user?.usuario || 'Usuário'}</div>
              <div className="text-muted-foreground text-xs">
                {user?.papel || (user?.is_staff ? 'admin' : 'operador')}
              </div>
            </div>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
