import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Layers, Save, X, Plus, Edit, Trash2, Search } from 'lucide-react'

/** Base SEMPRE em HTTPS */
const API_BASE =
  (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/registro'

/** Força qualquer URL (inclusive relativa) para https */
const fixToHttps = (u) => {
  if (!u) return u
  if (API_BASE.startsWith('http://')) return u // local dev: skip https coercion
  try {
    const urlObj = new URL(u, API_BASE)
    urlObj.protocol = 'https:'
    return urlObj.toString()
  } catch {
    return String(u).replace(/^http:\/\//i, 'https://')
  }
}

/** Wrapper de fetch que usa fixToHttps */
const fetchHttps = (url, options = {}) => fetch(fixToHttps(url), options)

/** Motivos válidos no backend (MateriasPrimasViewSet.DELETE_MOTIVOS) */
const DELETE_MOTIVOS = [
  { key: 'cadastro_duplicado', label: 'Cadastro duplicado' },
  { key: 'descontinuacao', label: 'Descontinuação da MP' },
  { key: 'substituicao', label: 'Substituição por outra MP' },
  { key: 'erro_cadastro', label: 'Erro de cadastro' },
  { key: 'outro', label: 'Outro motivo' },
]

const CadastroMateriaPrima = () => {
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Estados para exclusão com motivo
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [deleteReason, setDeleteReason] = useState('') // deve ser uma das keys de DELETE_MOTIVOS
  const [deleteNote, setDeleteNote] = useState('')

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
        const res = await fetchHttps(url, { headers })
        if (!res.ok) throw new Error(`GET materias-primas: ${res.status}`)
        const json = await res.json()

        const pageItems = normalizeList(json).map(apiToUi)
        all.push(...pageItems)

        // força https no next
        url = json?.next ? fixToHttps(json.next) : null
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
        const res = await fetchHttps(`${API_BASE}/materias-primas/${editingId}/`, {
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
            if (j?.detail) msg = j.detail
          } catch { }
          throw new Error(msg)
        }
        const atualizado = apiToUi(await res.json())
        setMateriasPrimas(prev => prev.map(mp => (mp.id === editingId ? atualizado : mp)))
        setSuccess('Matéria-prima atualizada com sucesso!')
        setEditingId(null)
        handleLimparFormulario(false)
      } else {
        const res = await fetchHttps(`${API_BASE}/materias-primas/`, {
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
            if (j?.detail) msg = j.detail
          } catch { }
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

  // Inicia fluxo de exclusão solicitando motivo
  const handleExcluirClick = (id) => {
    setDeleteTargetId(id)
    setDeleteReason('')
    setDeleteNote('')
    setError('')
    setSuccess('')
  }

  // Cancela fluxo de exclusão
  const handleCancelarExclusao = () => {
    setDeleteTargetId(null)
    setDeleteReason('')
    setDeleteNote('')
  }

  // Confirma exclusão com motivo
  const handleConfirmarExclusao = async () => {
    if (!deleteTargetId) return
    if (!deleteReason) {
      setError('Selecione um motivo para a exclusão.')
      return
    }

    try {
      setLoading(true)
      setError('')
      const res = await fetchHttps(`${API_BASE}/materias-primas/${deleteTargetId}/`, {
        method: 'DELETE',
        headers: token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo_exclusao: deleteReason,
          motivo_observacao: deleteNote || ''
        })
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

      setMateriasPrimas(prev => prev.filter(mp => mp.id !== deleteTargetId))
      setSuccess('Matéria-prima excluída com sucesso!')
      handleCancelarExclusao()
    } catch (err) {
      console.error(err)
      setError(typeof err?.message === 'string' ? err.message : 'Erro ao excluir matéria-prima. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const materiasPrimasFiltradas = materiasPrimas.filter(mp => {
    const t = searchTerm.toLowerCase()
    return (mp.nome || '').toLowerCase().includes(t) || (mp.codigoInterno || '').toLowerCase().includes(t)
  })

  const totalAtivas = materiasPrimas.filter(mp => mp.ativo).length
  const totalInativas = materiasPrimas.length - totalAtivas

  return (
    <div className="min-h-[100dvh] w-full px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 bg-gray-50/50">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
          <Layers className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Cadastro de Matérias-Primas
          </h1>
          <p className="text-gray-600 text-sm">
            Gerencie as matérias-primas utilizadas nas ordens de produção e pesagens.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <Card className="shadow-sm border border-orange-100/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-50">
                {editingId ? <Edit className="h-4 w-4 text-orange-600" /> : <Plus className="h-4 w-4 text-orange-600" />}
              </span>
              <span>{editingId ? 'Editar Matéria-Prima' : 'Nova Matéria-Prima'}</span>
            </CardTitle>
            <CardDescription>
              {editingId
                ? 'Atualize os dados da matéria-prima cadastrada.'
                : 'Preencha os campos abaixo para cadastrar uma nova matéria-prima.'}
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
                <p className="text-xs text-gray-500">
                  Deve ser único (ex.: MP-0001, MP-0002...).
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => handleChange('ativo', checked)}
                />
                <Label htmlFor="ativo">Matéria-prima ativa</Label>
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
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2"
                >
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
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-50">
                <Search className="h-4 w-4 text-gray-600" />
              </span>
              <span>Matérias-primas cadastradas ({materiasPrimas.length})</span>
            </CardTitle>
            <CardDescription>
              Visualize, filtre e gerencie as matérias-primas do sistema.
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
                  <Layers className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm ? 'Nenhuma matéria-prima encontrada' : 'Nenhuma matéria-prima cadastrada'}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {searchTerm
                      ? 'Tente ajustar o termo de busca.'
                      : 'Cadastre a primeira matéria-prima usando o formulário ao lado.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {materiasPrimasFiltradas.map((materiaPrima) => {
                    const isDeleting = deleteTargetId === materiaPrima.id
                    return (
                      <div key={materiaPrima.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900 truncate">
                                {materiaPrima.nome}
                              </h3>
                              <Badge
                                variant={materiaPrima.ativo ? "default" : "secondary"}
                                className={materiaPrima.ativo
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : "bg-gray-100 text-gray-700 border-gray-200"
                                }
                              >
                                {materiaPrima.ativo ? 'Ativa' : 'Inativa'}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">
                              Código:{' '}
                              <span className="font-mono text-gray-800">
                                {materiaPrima.codigoInterno || '-'}
                              </span>
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditar(materiaPrima)}
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!isDeleting ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleExcluirClick(materiaPrima.id)}
                                className="text-red-600 hover:text-red-800 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancelarExclusao}
                                className="text-gray-700"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Painel inline para exclusão com motivo */}
                        {isDeleting && (
                          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                            <p className="text-sm font-medium text-red-800 mb-3">
                              Para excluir esta matéria-prima, informe o motivo.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                              <div className="space-y-1 md:col-span-1">
                                <Label htmlFor={`motivo-${materiaPrima.id}`}>Motivo *</Label>
                                <select
                                  id={`motivo-${materiaPrima.id}`}
                                  className="w-full border rounded-md h-9 px-3 text-sm bg-white"
                                  value={deleteReason}
                                  onChange={(e) => setDeleteReason(e.target.value)}
                                >
                                  <option value="">Selecione...</option>
                                  {DELETE_MOTIVOS.map((m) => (
                                    <option key={m.key} value={m.key}>{m.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <Label htmlFor={`obs-${materiaPrima.id}`}>Observação (opcional)</Label>
                                <Input
                                  id={`obs-${materiaPrima.id}`}
                                  value={deleteNote}
                                  onChange={(e) => setDeleteNote(e.target.value)}
                                  placeholder="Ex.: MP substituída pela nova especificação"
                                />
                              </div>
                              <div className="md:col-span-3 flex gap-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={loading || !deleteReason}
                                  onClick={handleConfirmarExclusao}
                                  className="flex items-center gap-2"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {loading ? 'Excluindo...' : 'Confirmar exclusão'}
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleCancelarExclusao}>
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">
                  {materiasPrimas.length}
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                <Layers className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ativas</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {totalAtivas}
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <Layers className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Inativas</p>
                <p className="text-2xl font-bold text-red-600">
                  {totalInativas}
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <Layers className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default CadastroMateriaPrima
