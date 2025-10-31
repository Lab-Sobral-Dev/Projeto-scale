import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { UserPlus, Users, Save, Trash2, LayoutGrid, Layers } from 'lucide-react'

/** Base deve apontar para .../api */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')

/** ENDPOINTS corretos conforme seu urls.py */
const USERS_URL = `${API_BASE}/usuarios/`
const PERFIS_URL = `${API_BASE}/perfis/`
const ME_URL = `${API_BASE}/auth/me/`
const ROLES_URL = `${API_BASE}/roles/`
const SCREENS_URL = `${API_BASE}/screens/`

const PAPEL_OPTIONS = [
  { value: 'operador', label: 'Operador' },
  { value: 'supervisor', label: 'Supervisor' },
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
  const [rowLoading, setRowLoading] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // listas
  const [users, setUsers] = useState([])
  const [perfis, setPerfis] = useState([])
  const [me, setMe] = useState(null)
  const [roles, setRoles] = useState([])
  const [screens, setScreens] = useState([])

  // form criação
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    papel: 'operador',
    role_ids: [],
    extra_screen_ids: [],
  })

  const perfilByUsername = useMemo(() => {
    const map = new Map()
    for (const p of perfis) map.set(p.username, p)
    return map
  }, [perfis])

  async function carregar() {
    setLoading(true)
    setError('')
    try {
      const [uRes, pRes, meRes, rRes, sRes] = await Promise.all([
        fetch(USERS_URL, { headers: authHeaders }),
        fetch(PERFIS_URL, { headers: authHeaders }),
        fetch(ME_URL, { headers: authHeaders }),
        fetch(ROLES_URL, { headers: authHeaders }),
        fetch(SCREENS_URL, { headers: authHeaders }),
      ])

      if ([uRes, pRes, meRes, rRes, sRes].some(r => r.status === 401)) {
        setError('Sessão expirada. Faça login novamente.')
        return
      }

      if (![uRes, pRes, meRes, rRes, sRes].every(r => r.ok)) {
        setError('Não foi possível carregar usuários/perfis/roles/screens.')
        return
      }

      const [uJson, pJson, meJson, rJson, sJson] = await Promise.all([
        uRes.json(), pRes.json(), meRes.json(), rRes.json(), sRes.json()
      ])

      const uList = Array.isArray(uJson) ? uJson : (uJson?.results ?? [])
      const pList = Array.isArray(pJson) ? pJson : (pJson?.results ?? [])
      const rList = Array.isArray(rJson) ? rJson : (rJson?.results ?? [])
      const sList = Array.isArray(sJson) ? sJson : (sJson?.results ?? [])

      setUsers(uList)
      setPerfis(pList)
      setMe(meJson)
      setRoles(rList)
      setScreens(sList)
    } catch (e) {
      console.error(e)
      setError('Falha ao carregar dados. Verifique permissões (admin) e token.')
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

  const toggleInArray = (name, id) => {
    setForm(prev => {
      const set = new Set(prev[name])
      set.has(id) ? set.delete(id) : set.add(id)
      return { ...prev, [name]: Array.from(set) }
    })
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

      const payload = {
        username: form.username,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        papel: form.papel,
        role_ids: form.role_ids,
        extra_screen_ids: form.extra_screen_ids,
      }

      const res = await fetch(USERS_URL, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const raw = await res.text()
        let detail = raw
        try { detail = JSON.stringify(JSON.parse(raw)) } catch { }
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
        role_ids: [],
        extra_screen_ids: [],
      })

      await carregar()
    } catch (e) {
      console.error(e)
      setError('Não foi possível criar o usuário. Verifique dados/duplicidade.')
    } finally {
      setLoading(false)
    }
  }

  async function atualizarPapel(username, novoPapel) {
    const perfil = perfilByUsername.get(username)
    if (!perfil) {
      setError('Perfil não encontrado para este usuário.')
      return
    }
    setRowLoading(username)
    setError('')

    try {
      const res = await fetch(`${PERFIS_URL}${perfil.id}/`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ papel: novoPapel }),
      })
      if (!res.ok) {
        const raw = await res.text()
        let detail = raw
        try { detail = JSON.stringify(JSON.parse(raw)) } catch { }
        throw new Error(`Erro ao atualizar papel (${res.status}) ${detail}`)
      }
      setSuccess('Papel atualizado!')
      await carregar()
    } catch (e) {
      console.error(e)
      setError('Não foi possível atualizar o papel.')
    } finally {
      setRowLoading(null)
    }
  }

  async function removerUsuario(id, username) {
    if (me?.username && username === me.username) {
      setError('Você não pode excluir sua própria conta.')
      return
    }
    if (!window.confirm('Excluir este usuário?')) return

    setRowLoading(username)
    setError('')

    try {
      const res = await fetch(`${USERS_URL}${id}/`, {
        method: 'DELETE',
        headers: authHeaders, // objeto com Authorization
      })
      if (res.status !== 204 && res.status !== 200) {
        const raw = await res.text()
        let detail = raw
        try { detail = JSON.stringify(JSON.parse(raw)) } catch { }
        throw new Error(`Erro ao excluir (${res.status}) ${detail}`)
      }
      setSuccess('Usuário excluído!')
      await carregar()
    } catch (e) {
      console.error(e)
      setError('Não foi possível excluir o usuário.')
    } finally {
      setRowLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usuários</h1>
          <p className="text-gray-600">Cadastre operadores (pesadores), supervisores e administradores; atribua papéis e telas.</p>
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
            <CardDescription>Crie o usuário e já defina seus acessos</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={criarUsuario} className="space-y-6">
              {/* Campos básicos */}
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

                {/* Papel primário */}
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

              {/* Papéis (roles) – múltiplos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-gray-600" />
                    <Label>Papéis (roles)</Label>
                  </div>
                  {roles.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum papel cadastrado.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {roles.map(r => (
                        <label key={r.id} className="flex items-center gap-2 rounded border p-2 hover:bg-gray-50">
                          <Checkbox
                            checked={form.role_ids.includes(r.id)}
                            onCheckedChange={() => toggleInArray('role_ids', r.id)}
                          />
                          <span className="text-sm text-gray-800">{r.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Telas extras – múltiplas */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-gray-600" />
                    <Label>Telas extras</Label>
                  </div>
                  {screens.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma tela cadastrada.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-auto pr-1">
                      {screens.map(s => (
                        <label key={s.id} className="flex items-center gap-2 rounded border p-2 hover:bg-gray-50">
                          <Checkbox
                            checked={form.extra_screen_ids.includes(s.id)}
                            onCheckedChange={() => toggleInArray('extra_screen_ids', s.id)}
                          />
                          <span className="text-sm text-gray-800">
                            <span className="font-medium">{s.label}</span>
                            <span className="text-gray-500"> — {s.code}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
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
            <CardDescription>Gerencie o papel (Operador/Supervisor/Admin)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-200">
              {users.length === 0 ? (
                <div className="p-6 text-gray-500">Nenhum usuário cadastrado.</div>
              ) : users.map(u => {
                const perfil = perfilByUsername.get(u.username)
                const papel = perfil?.papel || u.papel || 'operador'
                const isRowBusy = rowLoading === u.username
                const isMe = me?.username === u.username
                return (
                  <div key={u.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{u.first_name} {u.last_name}</span>
                          <Badge variant={papel === 'admin' ? 'default' : papel === 'supervisor' ? 'secondary' : 'outline'}>
                            {papel === 'admin' ? 'Administrador' : papel === 'supervisor' ? 'Supervisor' : 'Operador'}
                          </Badge>
                          {isMe && <Badge variant="outline">você</Badge>}
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                          @{u.username} {u.email ? `• ${u.email}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select
                          value={papel}
                          onValueChange={(v) => atualizarPapel(u.username, v)}
                          disabled={isRowBusy}
                        >
                          <SelectTrigger className="w-44">
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
                          className={`text-red-600 hover:text-red-800 ${isMe ? 'opacity-40 cursor-not-allowed' : ''}`}
                          onClick={() => removerUsuario(u.id, u.username)}
                          disabled={isRowBusy || isMe}
                          title={isMe ? 'Você não pode excluir sua própria conta' : 'Excluir usuário'}
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
