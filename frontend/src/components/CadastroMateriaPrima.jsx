import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Layers, Save, X, Plus, Edit, Trash2, Search } from 'lucide-react'

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api') + '/registro'

const CadastroMateriaPrima = () => {
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [formData, setFormData] = useState({
    nome: '',
    codigoInterno: '',
    ativo: true
  })

  const token = useMemo(() => localStorage.getItem('access') || '', [])
  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token])

  const apiToUi = (mp) => ({
    id: mp.id,
    nome: mp.nome ?? '',
    codigoInterno: mp.codigo_interno ?? '',
    ativo: !!mp.ativo,
  })

  const uiToApi = (mp) => ({
    nome: mp.nome,
    codigo_interno: mp.codigoInterno,
    ativo: mp.ativo,
  })

  const normalizeList = (data) => {
    if (Array.isArray(data)) return data
    if (data?.results && Array.isArray(data.results)) return data.results
    return []
  }

  const carregarMateriasPrimas = async () => {
    setLoading(true)
    setError('')
    try {
      let url = `${API_BASE}/materias-primas/?page_size=500`
      const all = []

      while (url) {
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`GET materias-primas: ${res.status}`)

        const json = await res.json()
        const pageItems = normalizeList(json).map(apiToUi)
        all.push(...pageItems)

        url = json?.next || null
        if (Array.isArray(json)) break
      }

      setMateriasPrimas(all)
    } catch (e) {
      console.error(e)
      setError('Não foi possível carregar as matérias-primas. Verifique conexão e permissões.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarMateriasPrimas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (!formData.nome.trim() || !formData.codigoInterno.trim()) {
        setError('Por favor, preencha Nome e Código Interno')
        return
      }

      const nomeExiste = materiasPrimas.some(mp =>
        (mp.nome || '').toLowerCase() === formData.nome.toLowerCase() && mp.id !== editingId
      )
      if (nomeExiste) {
        setError('Já existe uma matéria-prima com este nome')
        return
      }

      const codigoExiste = materiasPrimas.some(mp =>
        (mp.codigoInterno || '').toLowerCase() === formData.codigoInterno.toLowerCase() && mp.id !== editingId
      )
      if (codigoExiste) {
        setError('Já existe uma matéria-prima com este código interno')
        return
      }

      if (editingId) {
        const res = await fetch(`${API_BASE}/materias-primas/${editingId}/`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(uiToApi(formData)),
        })
        if (!res.ok) {
          let msg = `PUT materia-prima: ${res.status}`
          try {
            const j = await res.json()
            if (j?.codigo_interno?.[0]) msg = j.codigo_interno[0]
            if (j?.nome?.[0]) msg = j.nome[0]
          } catch {}
          throw new Error(msg)
        }
        const atualizado = apiToUi(await res.json())
        setMateriasPrimas(prev => prev.map(mp => (mp.id === editingId ? atualizado : mp)))
        setSuccess('Matéria-prima atualizada com sucesso!')
        setEditingId(null)
        handleLimparFormulario(false)
      } else {
        const res = await fetch(`${API_BASE}/materias-primas/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(uiToApi(formData)),
        })
        if (!res.ok) {
          let msg = `POST materia-prima: ${res.status}`
          try {
            const j = await res.json()
            if (j?.codigo_interno?.[0]) msg = j.codigo_interno[0]
            if (j?.nome?.[0]) msg = j.nome[0]
          } catch {}
          throw new Error(msg)
        }
        const criado = apiToUi(await res.json())
        setMateriasPrimas(prev => [criado, ...prev])
        setSuccess('Matéria-prima cadastrada com sucesso!')
        handleLimparFormulario(false)
      }
    } catch (err) {
      console.error(err)
      setError(typeof err?.message === 'string' ? err.message : 'Erro ao salvar matéria-prima. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleLimparFormulario = (clearAlerts = true) => {
    setFormData({ nome: '', codigoInterno: '', ativo: true })
    setEditingId(null)
    if (clearAlerts) {
      setError('')
      setSuccess('')
    }
  }

  const handleEditar = (materiaPrima) => {
    setFormData({
      nome: materiaPrima.nome || '',
      codigoInterno: materiaPrima.codigoInterno || '',
      ativo: !!materiaPrima.ativo
    })
    setEditingId(materiaPrima.id)
    setError('')
    setSuccess('')
  }

  const handleExcluir = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta matéria-prima?')) return
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/materias-primas/${id}/`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.status === 400 || res.status === 409) {
        const data = await res.json().catch(() => ({}))
        setError(data?.detail || 'Esta matéria-prima não pode ser excluída, pois está vinculada a registros.')
        return
      }

      if (res.status !== 204 && res.status !== 200) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || `DELETE matéria-prima: ${res.status}`)
      }

      setMateriasPrimas(prev => prev.filter(mp => mp.id !== id))
      setSuccess('Matéria-prima excluída com sucesso!')
    } catch (err) {
      console.error(err)
      setError('Erro ao excluir matéria-prima. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const materiasPrimasFiltradas = materiasPrimas.filter(mp => {
    const t = searchTerm.toLowerCase()
    return (mp.nome || '').toLowerCase().includes(t) || (mp.codigoInterno || '').toLowerCase().includes(t)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Layers className="h-8 w-8 text-orange-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cadastro de Matérias-Primas</h1>
          <p className="text-gray-600">Gerencie as matérias-primas do sistema de pesagem</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editingId ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingId ? 'Editar Matéria-Prima' : 'Nova Matéria-Prima'}
            </CardTitle>
            <CardDescription>
              {editingId ? 'Atualize os dados da matéria-prima' : 'Preencha os dados para cadastrar uma nova matéria-prima'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da Matéria-Prima *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  placeholder="Ex.: Ácido Cítrico"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="codigoInterno">Código Interno *</Label>
                <Input
                  id="codigoInterno"
                  value={formData.codigoInterno}
                  onChange={(e) => handleChange('codigoInterno', e.target.value)}
                  placeholder="Ex.: MP-0001"
                  required
                />
                <p className="text-xs text-gray-500">Deve ser único (ex.: MP-0001, MP-0002...)</p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => handleChange('ativo', checked)}
                />
                <Label htmlFor="ativo">Matéria-Prima Ativa</Label>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {loading ? 'Salvando...' : (editingId ? 'Atualizar' : 'Salvar')}
                </Button>

                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleLimparFormulario()}
                    className="flex items-center gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Matérias-Primas Cadastradas ({materiasPrimas.length})
            </CardTitle>
            <CardDescription>
              Lista de todas as matérias-primas cadastradas no sistema
            </CardDescription>
            <div className="mt-4">
              <Input
                placeholder="Buscar por nome ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {materiasPrimasFiltradas.length === 0 ? (
                <div className="text-center py-8">
                  <Layers className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm ? 'Nenhuma matéria-prima encontrada' : 'Nenhuma matéria-prima cadastrada'}
                  </h3>
                  <p className="text-gray-500">
                    {searchTerm ? 'Tente ajustar o termo de busca' : 'Cadastre a primeira matéria-prima usando o formulário ao lado'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {materiasPrimasFiltradas.map((materiaPrima) => (
                    <div key={materiaPrima.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900">{materiaPrima.nome}</h3>
                            <Badge variant={materiaPrima.ativo ? "default" : "secondary"}>
                              {materiaPrima.ativo ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            Código: <span className="font-mono">{materiaPrima.codigoInterno || '-'}</span>
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditar(materiaPrima)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExcluir(materiaPrima.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-gray-600">Total</p><p className="text-2xl font-bold text-gray-900">{materiasPrimas.length}</p></div><Layers className="h-8 w-8 text-gray-400" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-gray-600">Ativas</p><p className="text-2xl font-bold text-green-600">{materiasPrimas.filter(mp => mp.ativo).length}</p></div><Layers className="h-8 w-8 text-green-400" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-gray-600">Inativas</p><p className="text-2xl font-bold text-red-600">{materiasPrimas.filter(mp => !mp.ativo).length}</p></div><Layers className="h-8 w-8 text-red-400" /></div></CardContent></Card>
      </div>
    </div>
  )
}

export default CadastroMateriaPrima
