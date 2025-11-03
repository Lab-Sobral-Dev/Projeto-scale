import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, UserPlus, Users, Save, Trash2, LayoutGrid, Layers, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react'

/** Base deve apontar para .../api */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')

/** ENDPOINTS conforme urls.py (mantidos) */
const USERS_URL = `${API_BASE}/usuarios/usuarios/`
const PERFIS_URL = `${API_BASE}/usuarios/perfis/`
const ME_URL = `${API_BASE}/usuarios/auth/me/`
const ROLES_URL = `${API_BASE}/usuarios/roles/`
const SCREENS_URL = `${API_BASE}/usuarios/screens/`

const PAPEL_OPTIONS = [
  { value: 'operador', label: 'Operador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Administrador' },
]

// ========= Validação de senha (mesma regra do backend) =========
function checkPasswordPolicy(pw = '') {
  const issues = {
    length: pw.length >= 10,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^\w\s]/.test(pw),
  }
  const valid = Object.values(issues).every(Boolean)
  return { valid, issues }
}

function PolicyRow({ ok, text }) {
  const Icon = ok ? CheckCircle2 : XCircle
  const color = ok ? 'text-green-600' : 'text-red-500'
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className={ok ? 'text-green-700' : 'text-red-600'}>{text}</span>
    </div>
  )
}

function PasswordPolicy({ password }) {
  const { issues } = checkPasswordPolicy(password)
  return (
    <div className="rounded-md border p-3 bg-gray-50 dark:bg-zinc-900/40">
      <div className="text-xs font-medium mb-2 text-gray-700 dark:text-gray-300">A senha deve conter:</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
        <PolicyRow ok={issues.length} text="Mínimo de 10 caracteres" />
        <PolicyRow ok={issues.upper} text="Pelo menos 1 letra maiúscula (A-Z)" />
        <PolicyRow ok={issues.lower} text="Pelo menos 1 letra minúscula (a-z)" />
        <PolicyRow ok={issues.digit} text="Pelo menos 1 dígito (0-9)" />
        <PolicyRow ok={issues.symbol} text="Pelo menos 1 símbolo (!@#…)" />
      </div>
    </div>
  )
}

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
  const [roles, setRoles] = useState([])      // cada role já vem com "screens" (id, code, label)
  const [screens, setScreens] = useState([])  // catálogo de telas (id, code, label)

  // mapa roleId -> [screenIds] (derivado de roles)
  const [roleScreensMap, setRoleScreensMap] = useState({})

  // telas herdadas pelos roles selecionados (checadas e desabilitadas na UI)
  const [autoScreenIds, setAutoScreenIds] = useState(new Set())

  // visibilidade de senha
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // form criação
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm: '',
    papel: 'operador',
    role_ids: [],          // manteremos array por compatibilidade com a API, porém só com 0 ou 1 item
    extra_screen_ids: [],  // só as marcadas manualmente
  })

  // estados de validação
  const pwCheck = useMemo(() => checkPasswordPolicy(form.password), [form.password])
  const confirmOk = useMemo(() => form.password && form.password === form.confirm, [form.password, form.confirm])
  const canSubmit = pwCheck.valid && confirmOk && !!form.username && !!form.first_name

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

      // ordena telas por label para organizar a lista
      sList.sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')))

      // constrói roleId -> [screenIds]
      const map = {}
      for (const r of rList) {
        const ids = Array.isArray(r.screens) ? r.screens.map(sc => sc.id).filter(Boolean) : []
        map[r.id] = ids
      }

      setUsers(uList)
      setPerfis(pList)
      setMe(meJson)
      setRoles(rList)
      setScreens(sList)
      setRoleScreensMap(map)
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

  // recalcula telas herdadas sempre que role_ids (único) mudar
  useEffect(() => {
    const set = new Set()
    const [only] = form.role_ids
    if (only) {
      const arr = roleScreensMap[only] || []
      for (const sid of arr) set.add(sid)
    }
    setAutoScreenIds(set)

    // ao trocar o papel, opcionalmente removemos extras que estejam contidos no novo papel
    setForm(prev => ({
      ...prev,
      extra_screen_ids: prev.extra_screen_ids.filter(id => !set.has(id)),
    }))
  }, [form.role_ids, roleScreensMap])

  const toggleInArray = (name, id) => {
    setForm(prev => {
      const set = new Set(prev[name])
      set.has(id) ? set.delete(id) : set.add(id)
      return { ...prev, [name]: Array.from(set) }
    })
  }

  // toggle de tela extra respeitando herdadas
  const toggleExtraScreen = (id) => {
    if (autoScreenIds.has(id)) return // herdada por papel → não altera
    toggleInArray('extra_screen_ids', id)
  }

  // *** Seleção ÚNICA de roles ***
  const toggleSingleRole = (roleId, checked) => {
    setForm(prev => {
      if (checked) {
        return { ...prev, role_ids: [roleId] }
      } else {
        if (prev.role_ids[0] === roleId) {
          return { ...prev, role_ids: [] }
        }
        return prev
      }
    })
  }

  async function criarUsuario(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (!form.username || !form.first_name) {
        setError('Preencha pelo menos usuário e nome.')
        return
      }

      // validação de senha cliente
      if (!pwCheck.valid) {
        setError('A senha não atende à política de complexidade.')
        return
      }
      if (!confirmOk) {
        setError('A confirmação de senha não confere.')
        return
      }

      const payload = {
        username: form.username,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        papel: form.papel,
        role_ids: form.role_ids,                 // array com 0 ou 1 id
        extra_screen_ids: form.extra_screen_ids, // apenas extras manuais
      }

      const res = await fetch(USERS_URL, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        // tenta extrair erro legível (inclui erros do validator de senha do Django)
        let detail = 'Não foi possível criar o usuário. Verifique dados/duplicidade.'
        try {
          const data = await res.json()
          // erros comuns: {password: ["..."]} | {username: ["..."]} | {detail: "..."}
          if (data?.password) detail = Array.isArray(data.password) ? data.password.join(' ') : String(data.password)
          else if (data?.username) detail = Array.isArray(data.username) ? data.username.join(' ') : String(data.username)
          else if (data?.detail) detail = String(data.detail)
          else detail = JSON.stringify(data)
        } catch {
          // corpo não-JSON
          const raw = await res.text()
          if (raw) detail = raw
        }
        throw new Error(detail)
      }

      setSuccess('Usuário criado com sucesso!')
      setForm({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        confirm: '',
        papel: 'operador',
        role_ids: [],
        extra_screen_ids: [],
      })
      setAutoScreenIds(new Set())

      await carregar()
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Não foi possível criar o usuário.')
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Usuários</h1>
            <p className="text-gray-600">Cadastre operadores (pesadores), supervisores e administradores; atribua papéis e telas.</p>
          </div>
        </div>

        {/* Botão Voltar para Perfil */}
        <Button asChild variant="outline" className="gap-2">
          <Link to="/perfil">
            <ArrowLeft className="h-4 w-4" />
            Voltar para Perfil
          </Link>
        </Button>
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
                  <Label htmlFor="username">Usuário</Label>
                  <Input id="username" value={form.username} onChange={e => handleChange('username', e.target.value)} required />
                </div>

                {/* Senha + ver/ocultar */}
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => handleChange('password', e.target.value)}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                    </Button>
                  </div>
                </div>

                {/* Confirmar senha */}
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmar Senha</Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      value={form.confirm}
                      onChange={e => handleChange('confirm', e.target.value)}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirm(v => !v)}
                      aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                    </Button>
                  </div>
                  {!confirmOk && form.confirm && (
                    <div className="text-xs text-red-600 mt-1">A confirmação não confere.</div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="first_name">Nome</Label>
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

              {/* Política de senha (feedback em tempo real) */}
              <PasswordPolicy password={form.password} />

              {/* Papéis (roles) – agora SELEÇÃO ÚNICA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-gray-600" />
                    <Label>Papel (role) extra</Label>
                    <Badge variant="outline" className="ml-2">seleção única</Badge>
                  </div>
                  {roles.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum papel cadastrado.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {roles.map(r => {
                        const selected = form.role_ids[0] === r.id
                        return (
                          <label key={r.id} className="flex items-center gap-2 rounded border p-2 hover:bg-gray-50">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => toggleSingleRole(r.id, !!checked)}
                            />
                            <span className="text-sm text-gray-800">{r.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Telas extras – lista única e só com o nome */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-gray-600" />
                    <Label>Telas permitidas</Label>
                  </div>
                  {screens.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma tela cadastrada.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-auto pr-1">
                      {screens.map(s => {
                        const isAuto = autoScreenIds.has(s.id)
                        const isManual = form.extra_screen_ids.includes(s.id)
                        const checked = isAuto || isManual
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center justify-between gap-2 rounded border p-2 hover:bg-gray-50 ${isAuto ? 'opacity-90' : ''}`}
                            title={isAuto ? 'Acesso herdado via papel' : ''}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={checked}
                                disabled={isAuto}
                                onCheckedChange={() => toggleExtraScreen(s.id)}
                              />
                              <span className="text-sm text-gray-800 font-medium">{s.label}</span>
                            </div>
                            {isAuto && <Badge variant="outline">via papel</Badge>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {success && <Alert className="border-green-200 bg-green-50"><AlertDescription className="text-green-800">{success}</AlertDescription></Alert>}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={loading || !canSubmit} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {loading ? 'Salvando...' : 'Salvar Usuário'}
                </Button>

                <Button asChild type="button" variant="outline" className="gap-2">
                  <Link to="/perfil">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para Perfil
                  </Link>
                </Button>
              </div>
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
