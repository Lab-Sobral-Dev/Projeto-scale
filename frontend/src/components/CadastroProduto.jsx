import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Package, Save, X, Plus, Edit, Trash2, Search, FlaskConical } from 'lucide-react'

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/registro'

const CadastroProduto = () => {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [formData, setFormData] = useState({
    nome: '',
    codigoInterno: '',
    volumePadrao: '',   // 👈 novo
    ativo: true
  })

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
    volumePadrao: p.volume_padrao ?? '',
    ativo: !!p.ativo,
  })

  const uiToApi = (p) => ({
    nome: p.nome,
    codigo_interno: p.codigoInterno,
    volume_padrao: p.volumePadrao,
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
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`GET produtos: ${res.status}`)
        const json = await res.json()

        const pageItems = normalizeList(json).map(apiToUi)
        all.push(...pageItems)

        url = json?.next || null
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
        p.codigoInterno.toLowerCase() === formData.codigoInterno.toLowerCase() && p.id !== editingId
      )
      if (codigoExiste) {
        setError('Código interno já existe.')
        return
      }

      if (editingId) {
        const res = await fetch(`${API_BASE}/produtos/${editingId}/`, {
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
          } catch {}
          throw new Error(msg)
        }
        const atualizado = apiToUi(await res.json())
        setProdutos(prev => prev.map(p => (p.id === editingId ? atualizado : p)))
        setSuccess('Produto atualizado com sucesso!')
        setEditingId(null)
        handleLimparFormulario(false)
      } else {
        const res = await fetch(`${API_BASE}/produtos/`, {
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
          } catch {}
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
      volumePadrao: '',
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
      volumePadrao: produto.volumePadrao || '',
      ativo: produto.ativo
    })
    setEditingId(produto.id)
    setError('')
    setSuccess('')
  }

  const handleExcluir = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este produto?')) return
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/produtos/${id}/`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.status === 400 || res.status === 409) {
        const data = await res.json().catch(() => ({}))
        setError(data?.detail || 'Este produto não pode ser excluído, pois está vinculado a registros.')
        return
      }

      if (res.status !== 204 && res.status !== 200) {
        throw new Error(`DELETE produto: ${res.status}`)
      }

      setProdutos(prev => prev.filter(p => p.id !== id))
      setSuccess('Produto excluído com sucesso!')
    } catch (err) {
      console.error(err)
      setError('Erro ao excluir produto. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const produtosFiltrados = produtos.filter(produto =>
    produto.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    produto.codigoInterno.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Package className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cadastro de Produtos</h1>
          <p className="text-gray-600">Gerencie os produtos do sistema de pesagem</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editingId ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingId ? 'Editar Produto' : 'Novo Produto'}
            </CardTitle>
            <CardDescription>
              {editingId ? 'Atualize os dados do produto' : 'Preencha os dados para cadastrar um novo produto'}
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

              <div className="space-y-2">
                <Label htmlFor="volumePadrao" className="inline-flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-gray-500" />
                  Volume padrão (opcional)
                </Label>
                <Input
                  id="volumePadrao"
                  value={formData.volumePadrao}
                  onChange={(e) => handleChange('volumePadrao', e.target.value)}
                  placeholder="Ex.: Balde 5L, Saco 25kg, etc."
                />
                <p className="text-xs text-gray-500">
                  Usado como sugestão automática na tela de pesagem.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => handleChange('ativo', checked)}
                />
                <Label htmlFor="ativo">Produto Ativo</Label>
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

        {/* Lista de Produtos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Produtos Cadastrados ({produtos.length})
            </CardTitle>
            <CardDescription>
              Lista de todos os produtos cadastrados no sistema
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
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                  </h3>
                  <p className="text-gray-500">
                    {searchTerm ? 'Tente ajustar o termo de busca' : 'Cadastre o primeiro produto usando o formulário ao lado'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {produtosFiltrados.map((produto) => (
                    <div key={produto.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900">{produto.nome}</h3>
                            <Badge variant={produto.ativo ? "default" : "secondary"}>
                              {produto.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            Código: <span className="font-mono">{produto.codigoInterno}</span>
                          </p>
                          {produto.volumePadrao && (
                            <p className="text-sm text-gray-500">
                              Volume padrão: {produto.volumePadrao}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditar(produto)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExcluir(produto.id)}
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
    </div>
  )
}

export default CadastroProduto
