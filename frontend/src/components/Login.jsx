import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Scale, Eye, EyeOff } from 'lucide-react'
import api from '@/services/api'

// util simples para ler claims do JWT sem lib extra
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decodeURIComponent(escape(json)))
  } catch {
    return {}
  }
}

const Login = ({ onLogin }) => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ usuario: '', senha: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoError, setLogoError] = useState(false) // fallback da logo

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    if (error) setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const tokens = await api.login({
        username: formData.usuario.trim(),
        password: formData.senha,
      })

      if (!tokens?.access) {
        setError('Usuário ou senha inválidos.')
        return
      }

      // persistir tokens
      localStorage.setItem('access', tokens.access)
      if (tokens.refresh) localStorage.setItem('refresh', tokens.refresh)

      // claims úteis
      const claims = decodeJwt(tokens.access)
      if (claims?.allowed_screens) {
        localStorage.setItem('allowed_screens', JSON.stringify(claims.allowed_screens))
      }

      const mustChange = !!claims?.must_change_password
      const expired = !!claims?.password_expired

      // guarda flags para a tela de alteração usar (opcional)
      localStorage.setItem('pwd_flags', JSON.stringify({ mustChange, expired }))

      // tenta /me (pode falhar com 403 se bloqueado por política)
      let userData = null
      try {
        const me = await api.me()
        userData = {
          id: me?.id,
          nome: `${me?.first_name || ''} ${me?.last_name || ''}`.trim() || me?.username || claims?.username,
          usuario: me?.username || claims?.username,
          email: me?.email || '',
          papel: me?.papel || (claims?.is_staff ? 'admin' : 'operador'),
          is_staff: me?.is_staff ?? !!claims?.is_staff,
        }
      } catch {
        // fallback mínimo só para manter estado do app caso precise
        userData = {
          id: undefined,
          nome: claims?.username || formData.usuario.trim(),
          usuario: claims?.username || formData.usuario.trim(),
          email: '',
          papel: claims?.is_staff ? 'admin' : 'operador',
          is_staff: !!claims?.is_staff,
        }
      }

      onLogin?.(userData, tokens.access)

      // fluxo de redirecionamento conforme flags
      if (mustChange || expired) {
        navigate('/alterar-senha', {
          replace: true,
          state: { reason: mustChange ? 'reset' : 'expired' },
        })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      const status = err?.status || err?.response?.status
      if (status === 423) {
        setError('Usuário bloqueado. Contate o administrador.')
      } else if (status === 401) {
        setError('Usuário ou senha inválidos.')
      } else {
        setError('Erro ao fazer login. Tente novamente.')
      }
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      localStorage.removeItem('allowed_screens')
      localStorage.removeItem('pwd_flags')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4">
      <div className="relative w-full max-w-md">
        {/* Glow laranja atrás do card */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -inset-10 bg-gradient-to-tr from-orange-500/25 via-transparent to-orange-400/30 blur-3xl" />
        </div>

        <Card className="w-full shadow-2xl border border-white/10 bg-white/95 backdrop-blur-sm rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-orange-500/30 hover:-translate-y-1">
          <CardHeader className="space-y-1 text-center relative pb-6">
            {/* Faixa laranja no topo */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500" />

            <div className="flex justify-center mt-4 mb-4">
              {!logoError ? (
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-20 w-auto drop-shadow-md"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="p-3 bg-orange-50 rounded-full border border-orange-200">
                  <Scale className="h-8 w-8 text-orange-500" />
                </div>
              )}
            </div>

            <CardTitle className="text-2xl font-bold text-slate-900">
              Sistema de Pesagem
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Entre com suas credenciais para acessar o sistema
            </CardDescription>
          </CardHeader>

          <CardContent className="pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="usuario" className="text-sm font-medium text-slate-700">
                  Usuário
                </Label>
                <Input
                  id="usuario"
                  name="usuario"
                  type="text"
                  placeholder="Digite seu usuário"
                  value={formData.usuario}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-50/80 border-slate-200 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-orange-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white transition-all"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha" className="text-sm font-medium text-slate-700">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="senha"
                    name="senha"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    value={formData.senha}
                    onChange={handleChange}
                    required
                    className="w-full pr-10 bg-slate-50/80 border-slate-200 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-orange-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white transition-all"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-slate-400 hover:text-orange-500 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-700">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-md shadow-orange-500/40 border-0 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none"
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>

              {/* Linha sutil no rodapé do form */}
              <div className="pt-2 text-xs text-center text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-px w-6 bg-gradient-to-r from-transparent via-orange-300/70 to-transparent" />
                  Acesso seguro
                  <span className="h-px w-6 bg-gradient-to-r from-transparent via-orange-300/70 to-transparent" />
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login
