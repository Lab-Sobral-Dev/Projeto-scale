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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            {!logoError ? (
              <img
                src="/logo.png"
                alt="Logo"
                className="h-20 w-auto"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="p-3 bg-blue-100 rounded-full">
                <Scale className="h-8 w-8 text-blue-600" />
              </div>
            )}
          </div>

          <CardTitle className="text-2xl font-bold">Sistema de Pesagem</CardTitle>
          <CardDescription>Entre com suas credenciais para acessar o sistema</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuário</Label>
              <Input
                id="usuario"
                name="usuario"
                type="text"
                placeholder="Digite seu usuário"
                value={formData.usuario}
                onChange={handleChange}
                required
                className="w-full"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  name="senha"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  value={formData.senha}
                  onChange={handleChange}
                  required
                  className="w-full pr-10"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default Login
