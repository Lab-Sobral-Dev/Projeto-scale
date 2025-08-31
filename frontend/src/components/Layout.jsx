import { useState } from 'react'
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
  Factory,
  ListChecks,
} from 'lucide-react'

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoError, setLogoError] = useState(false) // evita erro no onError do logo mobile
  const location = useLocation()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Nova Pesagem', href: '/nova-pesagem', icon: Scale },
    { name: 'Histórico', href: '/historico', icon: History },
    { name: 'OPs', href: '/ops', icon: Factory },            // 👈 novo
    { name: 'Nova OP', href: '/ops/nova', icon: ListChecks },// 👈 novo
    { name: 'Cadastrar Produto', href: '/cadastro-produto', icon: Package },
    { name: 'Cadastrar Matéria-Prima', href: '/cadastro-materia-prima', icon: Layers },
    { name: 'Balanças', href: '/balancas', icon: Weight },
  ]

  // evita que '/ops' fique ativo quando estiver em '/ops/nova'
  const isActive = (href) => {
    const path = location.pathname
    if (href === '/ops') return path === '/ops' || path === '/ops/'
    return path === href || path.startsWith(href + '/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
          <div className="flex h-16 items-center justify-between px-4 border-b">
            <div className="flex items-center gap-2">
              <img
                src={logoError ? '/logo.png' : '/logo2.png'}
                alt="Logo"
                className="h-12 w-auto"
                onError={() => setLogoError(true)}
              />
              <h1 className="text-xl font-bold text-gray-900">Scale</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive(item.href)
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
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 shadow-sm">
          <div className="flex h-16 items-center px-4 border-b">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo Scale" className="h-7 w-7" />
              <h1 className="text-xl font-bold text-gray-900">Scale</h1>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive(item.href)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1" />
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <div className="flex items-center gap-x-2">
                <Link to="/perfil" className="flex items-center gap-x-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                  <User className="h-5 w-5" />
                  <span className="hidden sm:block">{user?.nome || 'Usuário'}</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={onLogout} className="text-gray-500 hover:text-gray-700">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Outlet context={{ user, onLogout }} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout
