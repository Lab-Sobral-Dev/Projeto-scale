import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Package, Save, X, Plus, Edit, Trash2, Search } from 'lucide-react'

/**
 * Base da API — mantenha SEMPRE https por padrão.
 * Se preferir, defina VITE_API_BASE_URL=https://apiscale.laboratoriosobral.com.br/api
 */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/registro'

/**
 * Corrige qualquer URL para HTTPS, inclusive relativas.
 * - Se "u" for relativo, resolvemos contra API_BASE.
 * - Se "u" vier em http://, trocamos para https:// (evita Mixed Content).
 */
const fixToHttps = (u) => {
  if (!u) return u
  try {
    const urlObj = new URL(u, API_BASE) // resolve relativo também
    urlObj.protocol = 'https:'
    return urlObj.toString()
  } catch {
    // fallback bruto
    return String(u).replace(/^http:\/\//i, 'https://')
  }
}

/**
 * Wrapper de fetch que garante HTTPS na URL de destino.
 */
const fetchHttps = (url, options = {}) => fetch(fixToHttps(url), options)

/** Motivos válidos no backend (ProdutoViewSet.DELETE_MOTIVOS) */
const DELETE_MOTIVOS = [
  { key: 'cadastro_duplicado', label: 'Cadastro duplicado' },
  { key: 'descontinuacao', label: 'Descontinuação do produto' },
  { key: 'substituicao', label: 'Substituição do SKU' },
  { key: 'erro_cadastro', label: 'Erro de cadastro' },
  { key: 'outro', label: 'Outro motivo' },
]

const CadastroProduto = () => {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Estados do formulário principal
  const [formData, setFormData] = useState({
    nome: '',
    codigoInterno: '',
    ativo: true
  })

  // Estados para exclusão com motivo (fluxo em duas etapas)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteNote, setDeleteNote] = useState('')

  const token = useMemo(() => localStorage.getItem('access') || '', [])
  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token])

  // Helpers camelCase <-> snake_case
  const apiToUi = (p) => ({
    id: p.id,
    nome: p.nome ?? '',
    codigoInterno: p.codigo_interno ?? '',
    ativo: !!p.ativo,
  })

  const uiToApi = (p) => ({
    nome: p.nome,
    codigo_interno: p.codigoInterno,
    ativo: p.ativo,
  })

  const normalizeList = (data) => {
    if (Array.isArray(data)) return data
    if (data?.results && Array.isArray(data.results)) return data.results
    return []
  }

  const carregarProdutos = async () => {
    setLoading(true)
    setError('')
    try {
      let url = `${API_BASE}/produtos/?page_size=500`
      const all = []

      while (url) {
        const res = await fetchHttps(url, { headers })
        if (!res.ok) throw new Error(`GET produtos: ${res.status}`)
        const json = await res.json()

        const pageItems = normalizeList(json).map(apiToUi)
        all.push(...pageItems)

        // Força https também nos next/previous do DRF
        url = json?.next ? fixToHttps(json.next) : null
        if (Array.isArray(json)) break
      }

      setProdutos(all)
    } catch (e) {
      console.error(e)
      setError('Não foi possível carregar os produtos. Verifique conexão e permissões.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarProdutos()
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
        setError('Por favor, preencha Nome e Código Interno.')
        return
      }

      // Duplicidades locais
      const codigoExiste = produtos.some(p =>
        (p.codigoInterno || '').toLowerCase() === formData.codigoInterno.toLowerCase() && p.id !== editingId
      )
      if (codigoExiste) {
        setError('Código interno já existe.')
        return
      }

      if (editingId) {
        const res = await fetchHttps(`${API_BASE}/produtos/${editingId}/`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(uiToApi(formData)),
        })
        if (!res.ok) {
          let msg = `PUT produto: ${res.status}`
          try {
            const j = await res.json()
            if (j?.codigo_interno?.[0]) msg = j.codigo_interno[0]
            if (j?.nome?.[0]) msg = j.nome[0]
            if (j?.detail) msg = j.detail
          } catch { }
          throw new Error(msg)
        }
        const atualizado = apiToUi(await res.json())
        setProdutos(prev => prev.map(p => (p.id === editingId ? atualizado : p)))
        setSuccess('Produto atualizado com sucesso!')
        setEditingId(null)
        handleLimparFormulario(false)
      } else {
        const res = await fetchHttps(`${API_BASE}/produtos/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(uiToApi(formData)),
        })
        if (!res.ok) {
          let msg = `POST produto: ${res.status}`
          try {
            const j = await res.json()
            if (j?.codigo_interno?.[0]) msg = j.codigo_interno[0]
            if (j?.nome?.[0]) msg = j.nome[0]
            if (j?.detail) msg = j.detail
          } catch { }
          throw new Error(msg)
        }
        const criado = apiToUi(await res.json())
        setProdutos(prev => [criado, ...prev])
        setSuccess('Produto cadastrado com sucesso!')
        handleLimparFormulario(false)
      }
    } catch (err) {
      console.error(err)
      setError(typeof err?.message === 'string' ? err.message : 'Erro ao salvar produto. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleLimparFormulario = (clearAlerts = true) => {
    setFormData({
      nome: '',
      codigoInterno: '',
      ativo: true
    })
    setEditingId(null)
    if (clearAlerts) {
      setError('')
      setSuccess('')
    }
  }

  const handleEditar = (produto) => {
    setFormData({
      nome: produto.nome,
      codigoInterno: produto.codigoInterno,
      ativo: produto.ativo
    })
    setEditingId(produto.id)
    setError('')
    setSuccess('')
  }

  // Fluxo de exclusão com motivo (passo 1: abrir painel)
  const handleExcluirClick = (id) => {
    setDeleteTargetId(id)
    setDeleteReason('')
    setDeleteNote('')
    setError('')
    setSuccess('')
  }

  // Cancelar exclusão
  const handleCancelarExclusao = () => {
    setDeleteTargetId(null)
    setDeleteReason('')
    setDeleteNote('')
  }

  // Confirmar exclusão (envia motivo_exclusao e motivo_observacao)
  const handleConfirmarExclusao = async () => {
    if (!deleteTargetId) return
    if (!deleteReason) {
      setError('Selecione um motivo para a exclusão.')
      return
    }

    try {
      setLoading(true)
      setError('')
      const res = await fetchHttps(`${API_BASE}/produtos/${deleteTargetId}/`, {
        method: 'DELETE',
        headers: token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo_exclusao: deleteReason,
          motivo_observacao: deleteNote || ''
        })
      })

      if (res.status === 400 || res.status === 409) {
        const data = await res.json().catch(() => ({}))
        setError(data?.detail || 'Este produto não pode ser excluído, pois está vinculado a registros.')
        return
      }

      if (res.status !== 204 && res.status !== 200) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || `DELETE produto: ${res.status}`)
      }

      setProdutos(prev => prev.filter(p => p.id !== deleteTargetId))
      setSuccess('Produto excluído com sucesso!')
      handleCancelarExclusao()
    } catch (err) {
      console.error(err)
      setError(typeof err?.message === 'string' ? err.message : 'Erro ao excluir produto. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const produtosFiltrados = produtos.filter(produto =>
    (produto.nome || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (produto.codigoInterno || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  )

  const totalAtivos = produtos.filter(p => p.ativo).length
  const totalInativos = produtos.length - totalAtivos

  return (
    <div className="min-h-[100dvh] w-full px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 bg-gray-50/50">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
          <Package className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Cadastro de Produtos
          </h1>
          <p className="text-gray-600 text-sm">
            Gerencie os produtos disponíveis nas ordens de produção e pesagens.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <Card className="shadow-sm border border-orange-100/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-50">
                {editingId ? (
                  <Edit className="h-4 w-4 text-orange-600" />
                ) : (
                  <Plus className="h-4 w-4 text-orange-600" />
                )}
              </span>
              <span>{editingId ? 'Editar Produto' : 'Novo Produto'}</span>
            </CardTitle>
            <CardDescription>
              {editingId
                ? 'Atualize os dados do produto cadastrado.'
                : 'Preencha os campos abaixo para cadastrar um novo produto.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Produto *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  placeholder="Digite o nome do produto"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="codigoInterno">Código Interno *</Label>
                <Input
                  id="codigoInterno"
                  value={formData.codigoInterno}
                  onChange={(e) => handleChange('codigoInterno', e.target.value)}
                  placeholder="Digite o código interno"
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => handleChange('ativo', checked)}
                />
                <Label htmlFor="ativo">Produto ativo</Label>
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

        {/* Lista de Produtos */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-50">
                <Search className="h-4 w-4 text-gray-600" />
              </span>
              <span>Produtos cadastrados ({produtos.length})</span>
            </CardTitle>
            <CardDescription>
              Lista de todos os produtos cadastrados no sistema.
            </CardDescription>
            <div className="mt-4">
              <Input
                placeholder="Buscar produtos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {produtosFiltrados.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {searchTerm
                      ? 'Tente ajustar o termo de busca.'
                      : 'Cadastre o primeiro produto usando o formulário ao lado.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {produtosFiltrados.map((produto) => {
                    const isDeleting = deleteTargetId === produto.id
                    return (
                      <div key={produto.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900 truncate">
                                {produto.nome}
                              </h3>
                              <Badge
                                variant={produto.ativo ? "default" : "secondary"}
                                className={produto.ativo
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : "bg-gray-100 text-gray-700 border-gray-200"
                                }
                              >
                                {produto.ativo ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">
                              Código:{' '}
                              <span className="font-mono text-gray-800">
                                {produto.codigoInterno}
                              </span>
                            </p>
                          </div>

                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditar(produto)}
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            {!isDeleting ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleExcluirClick(produto.id)}
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

                        {/* Painel inline de exclusão com motivo */}
                        {isDeleting && (
                          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                            <p className="text-sm font-medium text-red-800 mb-3">
                              Para excluir este produto, informe o motivo.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                              <div className="space-y-1 md:col-span-1">
                                <Label htmlFor={`motivo-${produto.id}`}>Motivo *</Label>
                                <select
                                  id={`motivo-${produto.id}`}
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
                                <Label htmlFor={`obs-${produto.id}`}>Observação (opcional)</Label>
                                <Input
                                  id={`obs-${produto.id}`}
                                  value={deleteNote}
                                  onChange={(e) => setDeleteNote(e.target.value)}
                                  placeholder="Ex.: SKU substituído por nova versão"
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
                  {produtos.length}
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                <Package className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ativos</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {totalAtivos}
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <Package className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Inativos</p>
                <p className="text-2xl font-bold text-red-600">
                  {totalInativos}
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <Package className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default CadastroProduto
