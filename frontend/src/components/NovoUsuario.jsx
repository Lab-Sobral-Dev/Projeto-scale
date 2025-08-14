import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Users, Save, Trash2 } from 'lucide-react'

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const USUARIOS_BASE = `${API_BASE}/usuarios`

const PAPEL_OPTIONS = [
  { value: 'operador', label: 'Operador' },
  { value: 'admin', label: 'Administrador' },
]

export default function UsuariosAdmin() {
  const token = useMemo(() => localStorage.getItem('access') || '', [])
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  )
  const jsonHeaders = useMemo(
    () => ({ 'Content-Type': 'application/json', ...authHeaders }),
    [authHeaders]
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // listas
  const [users, setUsers] = useState([])         // /usuarios/
  const [perfis, setPerfis] = useState([])       // /perfis/

  // form criação
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    papel: 'operador',
  })

  // Map rápido: username -> perfil
  const perfilByUsername = useMemo(() => {
    const map = new Map()
    for (const p of perfis) map.set(p.username, p)
    return map
  }, [perfis])

  async function carregar() {
    setLoading(true)
    // NÃO zerar success aqui (para não apagar mensagens positivas durante reloads voluntários)
    setError('')
    try {
      const [uRes, pRes] = await Promise.all([
        fetch(`${USUARIOS_BASE}/usuarios/`, { headers: authHeaders }),
        fetch(`${USUARIOS_BASE}/perfis/`, { headers: authHeaders }),
      ])

      if (!uRes.ok || !pRes.ok) {
        setError('Não foi possível carregar os usuários/perfis.')
        return
      }

      const [uJson, pJson] = await Promise.all([uRes.json(), pRes.json()])
      const uList = Array.isArray(uJson) ? uJson : (uJson?.results ?? [])
      const pList = Array.isArray(pJson) ? pJson : (pJson?.results ?? [])

      setUsers(uList)
      setPerfis(pList)
    } catch (e) {
      console.error(e)
      setError('Não foi possível carregar os usuários. Verifique permissões (admin) e token.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  async function criarUsuario(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (!form.username || !form.password || !form.first_name) {
        setError('Preencha pelo menos usuário, senha e nome.')
        return
      }

      // POST /usuarios/ (usa UserCreateSerializer com campo "papel")
      const res = await fetch(`${USUARIOS_BASE}/usuarios/`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        // lê o body UMA ÚNICA vez
        const raw = await res.text()
        let detail = raw
        try { detail = JSON.stringify(JSON.parse(raw)) } catch {}
        throw new Error(`Erro ao criar usuário (${res.status}) ${detail}`)
      }

      setSuccess('Usuário criado com sucesso!')
      setForm({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        papel: 'operador',
      })
    } catch (e) {
      console.error(e)
      setError('Não foi possível criar o usuário. Verifique dados/duplicidade.')
    } finally {
      setLoading(false)
    }

    // 🔹 Tenta recarregar a lista sem derrubar a mensagem de sucesso
    try {
      await carregar()
    } catch (e) {
      console.warn('Falha ao recarregar listas após criação:', e)
    }
  }

  async function atualizarPapel(username, novoPapel) {
    const perfil = perfilByUsername.get(username)
    if (!perfil) {
      setError('Perfil não encontrado para este usuário.')
      return
    }
    setLoading(true)
    setError('')
    // não limpamos o success aqui

    try {
      const res = await fetch(`${USUARIOS_BASE}/perfis/${perfil.id}/`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ papel: novoPapel }),
      })
      if (!res.ok) {
        const raw = await res.text()
        let detail = raw
        try { detail = JSON.stringify(JSON.parse(raw)) } catch {}
        throw new Error(`Erro ao atualizar papel (${res.status}) ${detail}`)
      }
      setSuccess('Papel atualizado!')
    } catch (e) {
      console.error(e)
      setError('Não foi possível atualizar o papel.')
    } finally {
      setLoading(false)
    }

    try {
      await carregar()
    } catch (e) {
      console.warn('Falha ao recarregar após atualizar papel:', e)
    }
  }

  async function removerUsuario(id) {
    if (!window.confirm('Excluir este usuário?')) return
    setLoading(true)
    setError('')
    // não limpamos o success aqui

    try {
      const res = await fetch(`${USUARIOS_BASE}/usuarios/${id}/`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      if (res.status !== 204 && res.status !== 200) {
        const raw = await res.text()
        let detail = raw
        try { detail = JSON.stringify(JSON.parse(raw)) } catch {}
        throw new Error(`Erro ao excluir (${res.status}) ${detail}`)
      }
      setSuccess('Usuário excluído!')
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (e) {
      console.error(e)
      setError('Não foi possível excluir o usuário.')
    } finally {
      setLoading(false)
    }

    try {
      await carregar()
    } catch (e) {
      console.warn('Falha ao recarregar após exclusão:', e)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usuários</h1>
          <p className="text-gray-600">Cadastre operadores (pesadores) e administradores</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form de criação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Novo Usuário
            </CardTitle>
            <CardDescription>Crie o pesador/administrador</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={criarUsuario} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário *</Label>
                  <Input id="username" value={form.username} onChange={e => handleChange('username', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input id="password" type="password" value={form.password} onChange={e => handleChange('password', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="first_name">Nome *</Label>
                  <Input id="first_name" value={form.first_name} onChange={e => handleChange('first_name', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Sobrenome</Label>
                  <Input id="last_name" value={form.last_name} onChange={e => handleChange('last_name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="papel">Papel</Label>
                  <Select value={form.papel} onValueChange={v => handleChange('papel', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o papel" /></SelectTrigger>
                    <SelectContent>
                      {PAPEL_OPTIONS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {success && <Alert className="border-green-200 bg-green-50"><AlertDescription className="text-green-800">{success}</AlertDescription></Alert>}

              <Button type="submit" disabled={loading} className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                {loading ? 'Salvando...' : 'Salvar Usuário'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Lista de usuários */}
        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados ({users.length})</CardTitle>
            <CardDescription>Gerencie o papel (Operador/Admin)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-200">
              {users.length === 0 ? (
                <div className="p-6 text-gray-500">Nenhum usuário cadastrado.</div>
              ) : users.map(u => {
                const perfil = perfilByUsername.get(u.username)
                const papel = perfil?.papel || u.papel || 'operador'
                return (
                  <div key={u.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{u.first_name} {u.last_name}</span>
                          <Badge variant={papel === 'admin' ? 'default' : 'secondary'}>
                            {papel === 'admin' ? 'Administrador' : 'Operador'}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                          @{u.username} {u.email ? `• ${u.email}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select
                          value={papel}
                          onValueChange={(v) => atualizarPapel(u.username, v)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAPEL_OPTIONS.map(op => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          className="text-red-600 hover:text-red-800"
                          onClick={() => removerUsuario(u.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
