import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Weight, Save, X, Plus, Edit, Trash2, Search, Network, Usb, Cable } from 'lucide-react'

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/registro'
const ENDPOINT = `${API_BASE}/balancas/`

const CadastroBalanca = () => {
  const [balancas, setBalancas] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [formData, setFormData] = useState({
    nome: '',
    identificador: '',
    tipoConexao: 'ethernet',
    enderecoIp: '',
    porta: '',
    portaSerial: '',
    localizacao: '',
    capacidadeMaxima: '',
    divisao: '',
    protocolo: '',
    ultimaCalibracao: '',
    ativo: true,
  })

  const token = useMemo(() => localStorage.getItem('access') || '', [])
  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token])

  const apiToUi = (b) => ({
    id: b.id,
    nome: b.nome ?? '',
    identificador: b.identificador ?? '',
    tipoConexao: b.tipo_conexao ?? 'ethernet',
    enderecoIp: b.endereco_ip ?? '',
    porta: b.porta ?? '',
    portaSerial: b.porta_serial ?? '',
    localizacao: b.localizacao ?? '',
    capacidadeMaxima: b.capacidade_maxima != null ? String(b.capacidade_maxima) : '',
    divisao: b.divisao != null ? String(b.divisao) : '',
    protocolo: b.protocolo ?? '',
    ultimaCalibracao: b.ultima_calibracao ?? '',
    ativo: !!b.ativo,
  })

  const uiToApi = (b) => ({
    nome: b.nome,
    identificador: b.identificador,
    tipo_conexao: b.tipoConexao,
    endereco_ip: b.tipoConexao === 'ethernet' ? (b.enderecoIp || null) : null,
    porta: b.tipoConexao === 'ethernet' ? (b.porta !== '' ? Number(b.porta) : null) : null,
    porta_serial: b.tipoConexao !== 'ethernet' ? (b.portaSerial || '') : '',
    localizacao: b.localizacao || '',
    capacidade_maxima: b.capacidadeMaxima !== '' ? b.capacidadeMaxima : null,
    divisao: b.divisao !== '' ? b.divisao : null,
    protocolo: b.protocolo || '',
    ultima_calibracao: b.ultimaCalibracao || null,
    ativo: b.ativo,
  })

  const normalizeList = (data) => Array.isArray(data) ? data : (data?.results ?? [])

  const carregarBalancas = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(ENDPOINT + '?page_size=500', { headers })
      if (!res.ok) throw new Error(`GET balanças: ${res.status}`)
      const json = await res.json()
      const list = normalizeList(json).map(apiToUi)
      setBalancas(list)
    } catch (e) {
      console.error(e)
      setError('Não foi possível carregar as balanças. Verifique conexão e permissões.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarBalancas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  const validar = () => {
    if (!formData.nome.trim() || !formData.identificador.trim()) {
      return 'Preencha Nome e Identificador.'
    }
    if (formData.tipoConexao === 'ethernet') {
      if (!formData.enderecoIp.trim()) return 'Para Ethernet, informe o Endereço IP.'
      if (formData.porta === '' || isNaN(Number(formData.porta))) return 'Para Ethernet, informe a Porta numérica.'
    } else {
      if (!formData.portaSerial.trim()) return 'Para Serial/USB, informe a Porta Serial (ex.: COM3).'
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const msg = validar()
      if (msg) { setError(msg); return }

      const idExiste = balancas.some(b =>
        b.identificador.toLowerCase() === formData.identificador.toLowerCase() && b.id !== editingId
      )
      if (idExiste) {
        setError('Identificador já existe.')
        return
      }

      if (editingId) {
        const res = await fetch(`${ENDPOINT}${editingId}/`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(uiToApi(formData)),
        })
        if (!res.ok) throw new Error(`PUT balança: ${res.status}`)
        const atualizado = apiToUi(await res.json())
        setBalancas(prev => prev.map(b => (b.id === editingId ? atualizado : b)))
        setSuccess('Balança atualizada com sucesso!')
        setEditingId(null)
        handleLimparFormulario(false)
      } else {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify(uiToApi(formData)),
        })
        if (!res.ok) throw new Error(`POST balança: ${res.status}`)
        const criado = apiToUi(await res.json())
        setBalancas(prev => [criado, ...prev])
        setSuccess('Balança cadastrada com sucesso!')
        handleLimparFormulario(false)
      }
    } catch (err) {
      console.error(err)
      setError('Erro ao salvar balança. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleLimparFormulario = (clearAlerts = true) => {
    setFormData({
      nome: '',
      identificador: '',
      tipoConexao: 'ethernet',
      enderecoIp: '',
      porta: '',
      portaSerial: '',
      localizacao: '',
      capacidadeMaxima: '',
      divisao: '',
      protocolo: '',
      ultimaCalibracao: '',
      ativo: true
    })
    setEditingId(null)
    if (clearAlerts) {
      setError('')
      setSuccess('')
    }
  }

  const handleEditar = (balanca) => {
    setFormData({
      nome: balanca.nome,
      identificador: balanca.identificador,
      tipoConexao: balanca.tipoConexao || 'ethernet',
      enderecoIp: balanca.enderecoIp,
      porta: balanca.porta !== null && balanca.porta !== undefined ? String(balanca.porta) : '',
      portaSerial: balanca.portaSerial,
      localizacao: balanca.localizacao,
      capacidadeMaxima: balanca.capacidadeMaxima,
      divisao: balanca.divisao,
      protocolo: balanca.protocolo,
      ultimaCalibracao: balanca.ultimaCalibracao || '',
      ativo: balanca.ativo
    })
    setEditingId(balanca.id)
    setError('')
    setSuccess('')
  }

  const handleExcluir = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta balança?')) return
    try {
      setLoading(true)
      const res = await fetch(`${ENDPOINT}${id}/`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 400 || res.status === 409) {
        const data = await res.json().catch(() => ({}))
        setError(data?.detail || 'Esta balança não pode ser excluída, pois está vinculada a pesagens.')
        return
      }
      if (res.status !== 204 && res.status !== 200) throw new Error(`DELETE balança: ${res.status}`)
      setBalancas(prev => prev.filter(b => b.id !== id))
      setSuccess('Balança excluída com sucesso!')
    } catch (err) {
      console.error(err)
      setError('Erro ao excluir balança. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const isEthernet = formData.tipoConexao === 'ethernet'
  const isSerialLike = formData.tipoConexao === 'serial' || formData.tipoConexao === 'usb'

  const balancasFiltradas = balancas.filter(b =>
    b.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.identificador.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.localizacao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.protocolo || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Weight className="h-8 w-8 text-emerald-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cadastro de Balanças</h1>
          <p className="text-gray-600">Gerencie as balanças usadas no sistema de pesagem</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editingId ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingId ? 'Editar Balança' : 'Nova Balança'}
            </CardTitle>
            <CardDescription>
              {editingId ? 'Atualize os dados da balança' : 'Preencha os dados para cadastrar uma nova balança'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  placeholder="Ex.: Balança 01"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="identificador">Identificador *</Label>
                <Input
                  id="identificador"
                  value={formData.identificador}
                  onChange={(e) => handleChange('identificador', e.target.value)}
                  placeholder="Ex.: sala02-eth"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Conexão *</Label>
                <Select value={formData.tipoConexao} onValueChange={(v) => handleChange('tipoConexao', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ethernet"><span className="inline-flex items-center gap-2"><Network className="h-4 w-4" /> Ethernet</span></SelectItem>
                    <SelectItem value="serial"><span className="inline-flex items-center gap-2"><Cable className="h-4 w-4" /> Serial</span></SelectItem>
                    <SelectItem value="usb"><span className="inline-flex items-center gap-2"><Usb className="h-4 w-4" /> USB</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isEthernet && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="enderecoIp">Endereço IP *</Label>
                    <Input id="enderecoIp" value={formData.enderecoIp} onChange={(e) => handleChange('enderecoIp', e.target.value)} placeholder="Ex.: 192.168.0.10" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="porta">Porta *</Label>
                    <Input id="porta" type="number" value={formData.porta} onChange={(e) => handleChange('porta', e.target.value)} placeholder="Ex.: 502" />
                  </div>
                </div>
              )}

              {isSerialLike && (
                <div className="space-y-2">
                  <Label htmlFor="portaSerial">Porta Serial *</Label>
                  <Input id="portaSerial" value={formData.portaSerial} onChange={(e) => handleChange('portaSerial', e.target.value)} placeholder="Ex.: COM3 ou /dev/ttyUSB0" />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="localizacao">Localização</Label>
                  <Input id="localizacao" value={formData.localizacao} onChange={(e) => handleChange('localizacao', e.target.value)} placeholder="Ex.: Sala 02" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="protocolo">Protocolo</Label>
                  <Input id="protocolo" value={formData.protocolo} onChange={(e) => handleChange('protocolo', e.target.value)} placeholder="Ex.: Toledo" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacidadeMaxima">Capacidade Máx. (kg)</Label>
                  <Input id="capacidadeMaxima" type="number" step="0.001" value={formData.capacidadeMaxima} onChange={(e) => handleChange('capacidadeMaxima', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="divisao">Divisão/Resolução (kg)</Label>
                  <Input id="divisao" type="number" step="0.001" value={formData.divisao} onChange={(e) => handleChange('divisao', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ultimaCalibracao">Última Calibração</Label>
                  <Input id="ultimaCalibracao" type="date" value={formData.ultimaCalibracao} onChange={(e) => handleChange('ultimaCalibracao', e.target.value)} />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="ativo" checked={formData.ativo} onCheckedChange={(checked) => handleChange('ativo', checked)} />
                <Label htmlFor="ativo">Balança Ativa</Label>
              </div>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {success && <Alert className="border-green-200 bg-green-50"><AlertDescription className="text-green-800">{success}</AlertDescription></Alert>}

              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {loading ? 'Salvando...' : (editingId ? 'Atualizar' : 'Salvar')}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={() => handleLimparFormulario()} className="flex items-center gap-2">
                    <X className="h-4 w-4" /> Cancelar
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
              Balanças Cadastradas ({balancas.length})
            </CardTitle>
            <CardDescription>Lista de todas as balanças cadastradas no sistema</CardDescription>
            <div className="mt-4">
              <Input
                placeholder="Buscar por nome, identificador, local, protocolo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {balancasFiltradas.length === 0 ? (
                <div className="text-center py-8">
                  <Weight className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm ? 'Nenhuma balança encontrada' : 'Nenhuma balança cadastrada'}
                  </h3>
                  <p className="text-gray-500">
                    {searchTerm ? 'Tente ajustar o termo de busca' : 'Cadastre a primeira balança usando o formulário ao lado'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {balancasFiltradas.map((b) => (
                    <div key={b.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900">{b.nome}</h3>
                            <Badge variant={b.ativo ? "default" : "secondary"}>{b.ativo ? 'Ativa' : 'Inativa'}</Badge>
                          </div>
                          <p className="text-sm text-gray-500">Identificador: {b.identificador}</p>
                          <p className="text-sm text-gray-500">
                            Tipo: {b.tipoConexao === 'ethernet' ? 'Ethernet' : (b.tipoConexao === 'serial' ? 'Serial' : 'USB')}
                          </p>
                          {b.tipoConexao === 'ethernet' ? (
                            <p className="text-sm text-gray-500">IP/Porta: {b.enderecoIp || '-'} {b.porta ? `:${b.porta}` : ''}</p>
                          ) : (
                            <p className="text-sm text-gray-500">Porta: {b.portaSerial || '-'}</p>
                          )}
                          {b.localizacao && <p className="text-sm text-gray-500">Local: {b.localizacao}</p>}
                          {b.protocolo && <p className="text-sm text-gray-500">Protocolo: {b.protocolo}</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditar(b)} className="text-blue-600 hover:text-blue-800">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleExcluir(b.id)} className="text-red-600 hover:text-red-800">
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

export default CadastroBalanca
