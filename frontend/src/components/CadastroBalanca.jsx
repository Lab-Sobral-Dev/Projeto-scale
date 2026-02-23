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

/** Base SEMPRE em https */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/registro'
const ENDPOINT = `${API_BASE}/balancas/`

/** Corrige qualquer URL (inclusive relativa) para https */
const fixToHttps = (u) => {
  if (!u) return u
  try {
    const urlObj = new URL(u, API_BASE)
    urlObj.protocol = 'https:'
    return urlObj.toString()
  } catch {
    return String(u).replace(/^http:\/\//i, 'https://')
  }
}
/** Wrapper fetch que garante https */
const fetchHttps = (url, options = {}) => fetch(fixToHttps(url), options)

/** Motivos aceitos no backend (chaves passadas em motivo_exclusao) */
const DELETE_MOTIVOS = [
  { key: 'cadastro_duplicado', label: 'Cadastro duplicado' },
  { key: 'manutencao_substituicao', label: 'Manutenção/Substituição do equipamento' },
  { key: 'erro_cadastro', label: 'Erro de cadastro' },
  { key: 'equipamento_obsoleto', label: 'Equipamento obsoleto/desativado' },
  { key: 'outro', label: 'Outro motivo' },
]

const CadastroBalanca = () => {
  const [balancas, setBalancas] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // exclusão com motivo
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteNote, setDeleteNote] = useState('')

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
    frequenciaCalibracaoDias: '365',
    calibracaoRealizada: false,
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
    frequenciaCalibracaoDias: b.frequencia_calibracao_dias != null ? String(b.frequencia_calibracao_dias) : '365',
    calibracaoRealizada: !!b.calibracao_realizada,
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
    ultima_calibracao: b.calibracaoRealizada ? (b.ultimaCalibracao || null) : null,
    frequencia_calibracao_dias: b.frequenciaCalibracaoDias !== '' ? Number(b.frequenciaCalibracaoDias) : 365,
    calibracao_realizada: !!b.calibracaoRealizada,
    ativo: b.ativo,
  })

  const normalizeList = (data) => Array.isArray(data) ? data : (data?.results ?? [])

  const carregarBalancas = async () => {
    setLoading(true)
    setError('')
    try {
      let url = ENDPOINT + '?page_size=500'
      const all = []
      while (url) {
        const res = await fetchHttps(url, { headers })
        if (!res.ok) throw new Error(`GET balanças: ${res.status}`)
        const json = await res.json()
        all.push(...normalizeList(json).map(apiToUi))
        url = json?.next ? fixToHttps(json.next) : null
        if (Array.isArray(json)) break
      }
      setBalancas(all)
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
    if (!formData.nome.trim() || !formData.identificador.trim()) return 'Preencha Nome e Identificador.'
    if (formData.tipoConexao === 'ethernet') {
      if (!formData.enderecoIp.trim()) return 'Para Ethernet, informe o Endereço IP.'
      if (formData.porta === '' || isNaN(Number(formData.porta))) return 'Para Ethernet, informe a Porta numérica.'
    } else {
      if (!formData.portaSerial.trim()) return 'Para Serial/USB, informe a Porta Serial (ex.: COM3).'
    }
    if (formData.frequenciaCalibracaoDias === '' || Number(formData.frequenciaCalibracaoDias) <= 0) {
      return 'Informe a frequência de calibração em dias (valor maior que zero).'
    }
    if (formData.calibracaoRealizada && !formData.ultimaCalibracao) {
      return 'Informe a data da última calibração quando a calibração foi realizada.'
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
      if (idExiste) { setError('Identificador já existe.'); return }

      if (editingId) {
        const res = await fetchHttps(`${ENDPOINT}${editingId}/`, {
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
        const res = await fetchHttps(ENDPOINT, {
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
      frequenciaCalibracaoDias: '365',
      calibracaoRealizada: false,
      ativo: true
    })
    setEditingId(null)
    if (clearAlerts) { setError(''); setSuccess('') }
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
      frequenciaCalibracaoDias: balanca.frequenciaCalibracaoDias || '365',
      calibracaoRealizada: !!balanca.calibracaoRealizada,
      ativo: balanca.ativo
    })
    setEditingId(balanca.id)
    setError('')
    setSuccess('')
  }

  // ===== Exclusão com motivo (duas etapas) =====
  const openDeleteWithReason = (id) => {
    setDeleteTargetId(id)
    setDeleteReason('')
    setDeleteNote('')
    setError('')
    setSuccess('')
  }
  const cancelDeleteWithReason = () => {
    setDeleteTargetId(null)
    setDeleteReason('')
    setDeleteNote('')
  }
  const confirmDeleteWithReason = async () => {
    if (!deleteTargetId) return
    if (!deleteReason) { setError('Selecione um motivo para a exclusão.'); return }
    try {
      setLoading(true)
      const res = await fetchHttps(`${ENDPOINT}${deleteTargetId}/`, {
        method: 'DELETE',
        headers: token
          ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
          : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo_exclusao: deleteReason,
          motivo_observacao: deleteNote || ''
        })
      })

      if (res.status === 400 || res.status === 409) {
        const data = await res.json().catch(() => ({}))
        setError(data?.detail || 'Esta balança não pode ser excluída, pois está vinculada a pesagens.')
        return
      }
      if (res.status !== 204 && res.status !== 200) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || `DELETE balança: ${res.status}`)
      }

      setBalancas(prev => prev.filter(b => b.id !== deleteTargetId))
      setSuccess('Balança excluída com sucesso!')
      cancelDeleteWithReason()
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
    <div className="min-h-[100dvh] w-full px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 bg-gray-50/50">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
          <Weight className="h-6 w-6 text-orange-600 shrink-0" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-gray-900 truncate tracking-tight">
            Cadastro de Balanças
          </h1>
          <p className="text-gray-600 text-sm">
            Gerencie as balanças usadas no sistema de pesagem.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <Card className="overflow-hidden shadow-sm border-t-4 border-orange-400/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              {editingId ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              <span className="truncate">{editingId ? 'Editar Balança' : 'Nova Balança'}</span>
            </CardTitle>
            <CardDescription className="min-w-0">
              {editingId
                ? 'Atualize os dados da balança'
                : 'Preencha os dados para cadastrar uma nova balança'}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>

              <div className="space-y-2">
                <Label>Tipo de Conexão *</Label>
                <Select
                  value={formData.tipoConexao}
                  onValueChange={(v) => handleChange('tipoConexao', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ethernet">
                      <span className="inline-flex items-center gap-2">
                        <Network className="h-4 w-4" /> Ethernet
                      </span>
                    </SelectItem>
                    <SelectItem value="serial">
                      <span className="inline-flex items-center gap-2">
                        <Cable className="h-4 w-4" /> Serial
                      </span>
                    </SelectItem>
                    <SelectItem value="usb">
                      <span className="inline-flex items-center gap-2">
                        <Usb className="h-4 w-4" /> USB
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isEthernet && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="enderecoIp">Endereço IP *</Label>
                    <Input
                      id="enderecoIp"
                      value={formData.enderecoIp}
                      onChange={(e) => handleChange('enderecoIp', e.target.value)}
                      placeholder="Ex.: 192.168.0.10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="porta">Porta *</Label>
                    <Input
                      id="porta"
                      type="number"
                      inputMode="numeric"
                      value={formData.porta}
                      onChange={(e) => handleChange('porta', e.target.value)}
                      placeholder="Ex.: 502"
                    />
                  </div>
                </div>
              )}

              {isSerialLike && (
                <div className="space-y-2">
                  <Label htmlFor="portaSerial">Porta Serial *</Label>
                  <Input
                    id="portaSerial"
                    value={formData.portaSerial}
                    onChange={(e) => handleChange('portaSerial', e.target.value)}
                    placeholder="Ex.: COM3 ou /dev/ttyUSB0"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="localizacao">Localização</Label>
                  <Input
                    id="localizacao"
                    value={formData.localizacao}
                    onChange={(e) => handleChange('localizacao', e.target.value)}
                    placeholder="Ex.: Sala 02"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="protocolo">Protocolo</Label>
                  <Input
                    id="protocolo"
                    value={formData.protocolo}
                    onChange={(e) => handleChange('protocolo', e.target.value)}
                    placeholder="Ex.: Toledo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacidadeMaxima">Capacidade Máx. (kg)</Label>
                  <Input
                    id="capacidadeMaxima"
                    type="number"
                    step="0.001"
                    inputMode="decimal"
                    value={formData.capacidadeMaxima}
                    onChange={(e) => handleChange('capacidadeMaxima', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="divisao">Divisão/Resolução (kg)</Label>
                  <Input
                    id="divisao"
                    type="number"
                    step="0.001"
                    inputMode="decimal"
                    value={formData.divisao}
                    onChange={(e) => handleChange('divisao', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequenciaCalibracaoDias">Frequência de calibração (dias)</Label>
                  <Input
                    id="frequenciaCalibracaoDias"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={formData.frequenciaCalibracaoDias}
                    onChange={(e) => handleChange('frequenciaCalibracaoDias', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ultimaCalibracao">Última Calibração</Label>
                  <Input
                    id="ultimaCalibracao"
                    type="date"
                    value={formData.ultimaCalibracao}
                    onChange={(e) => handleChange('ultimaCalibracao', e.target.value)}
                    disabled={!formData.calibracaoRealizada}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="calibracaoRealizada"
                  checked={!!formData.calibracaoRealizada}
                  onCheckedChange={(checked) => {
                    handleChange('calibracaoRealizada', checked)
                    if (!checked) handleChange('ultimaCalibracao', '')
                  }}
                />
                <Label htmlFor="calibracaoRealizada" className="cursor-pointer">Calibração realizada</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => handleChange('ativo', checked)}
                />
                <Label htmlFor="ativo" className="cursor-pointer">Balança Ativa</Label>
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

              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600"
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
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card className="overflow-hidden shadow-sm border-t-4 border-orange-400/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              <span className="truncate">Balanças Cadastradas ({balancas.length})</span>
            </CardTitle>
            <CardDescription>Lista de todas as balanças cadastradas no sistema</CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {/* Barra de busca fixa */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 border-b">
              <div className="p-4">
                <Input
                  placeholder="Buscar por nome, identificador, local, protocolo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Lista rolável */}
            <div className="max-h-[28rem] overflow-y-auto">
              {loading ? (
                <div className="p-6 text-sm text-gray-500">Carregando...</div>
              ) : balancasFiltradas.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Weight className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm ? 'Nenhuma balança encontrada' : 'Nenhuma balança cadastrada'}
                  </h3>
                  <p className="text-gray-500">
                    {searchTerm
                      ? 'Tente ajustar o termo de busca'
                      : 'Cadastre a primeira balança usando o formulário ao lado'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {balancasFiltradas.map((b) => {
                    const isDeleting = deleteTargetId === b.id
                    return (
                      <div key={b.id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between gap-3">
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 min-w-0">
                              <h3 className="font-medium text-gray-900 truncate">{b.nome}</h3>
                              <Badge
                                variant={b.ativo ? "default" : "secondary"}
                                className="shrink-0"
                              >
                                {b.ativo ? 'Ativa' : 'Inativa'}
                              </Badge>
                            </div>

                            <p className="text-sm text-gray-500 break-all">
                              <span className="font-medium">Identificador:</span> {b.identificador}
                            </p>

                            <p className="text-sm text-gray-500">
                              <span className="font-medium">Tipo:</span>{' '}
                              {b.tipoConexao === 'ethernet'
                                ? 'Ethernet'
                                : (b.tipoConexao === 'serial' ? 'Serial' : 'USB')}
                            </p>

                            {b.tipoConexao === 'ethernet' ? (
                              <p className="text-sm text-gray-500 break-all">
                                <span className="font-medium">IP/Porta:</span>{' '}
                                {b.enderecoIp || '-'}{b.porta ? `:${b.porta}` : ''}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-500 break-all">
                                <span className="font-medium">Porta:</span> {b.portaSerial || '-'}
                              </p>
                            )}

                            {!!b.localizacao && (
                              <p className="text-sm text-gray-500 break-words">
                                <span className="font-medium">Local:</span> {b.localizacao}
                              </p>
                            )}
                            {!!b.protocolo && (
                              <p className="text-sm text-gray-500 break-words">
                                <span className="font-medium">Protocolo:</span> {b.protocolo}
                              </p>
                            )}
                            <p className="text-sm text-gray-500 break-words">
                              <span className="font-medium">Frequência calibração:</span> {b.frequenciaCalibracaoDias || 365} dias
                            </p>
                            <p className="text-sm text-gray-500 break-words">
                              <span className="font-medium">Calibração realizada:</span> {b.calibracaoRealizada ? 'Sim' : 'Não'}
                            </p>
                          </div>

                          {/* Ações */}
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditar(b)}
                              className="text-blue-600 hover:text-blue-800"
                              aria-label={`Editar ${b.nome}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            {!isDeleting ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeleteWithReason(b.id)}
                                className="text-red-600 hover:text-red-800"
                                aria-label={`Excluir ${b.nome}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={cancelDeleteWithReason}
                                className="text-gray-700"
                                title="Cancelar exclusão"
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
                              Para excluir esta balança, informe o motivo.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                              <div className="space-y-1 md:col-span-1">
                                <Label htmlFor={`motivo-${b.id}`}>Motivo *</Label>
                                <select
                                  id={`motivo-${b.id}`}
                                  className="w-full border rounded-md h-9 px-3 text-sm bg-white"
                                  value={deleteReason}
                                  onChange={(ev) => setDeleteReason(ev.target.value)}
                                >
                                  <option value="">Selecione...</option>
                                  {DELETE_MOTIVOS.map(m => (
                                    <option key={m.key} value={m.key}>{m.label}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1 md:col-span-2">
                                <Label htmlFor={`obs-${b.id}`}>Observação (opcional)</Label>
                                <Input
                                  id={`obs-${b.id}`}
                                  value={deleteNote}
                                  onChange={(ev) => setDeleteNote(ev.target.value)}
                                  placeholder="Ex.: Substituída por modelo novo"
                                />
                              </div>

                              <div className="md:col-span-3 flex gap-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={loading || !deleteReason}
                                  onClick={confirmDeleteWithReason}
                                  className="flex items-center gap-2"
                                  title="Confirmar exclusão"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {loading ? 'Excluindo...' : 'Confirmar exclusão'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={cancelDeleteWithReason}
                                >
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
    </div>
  )
}

export default CadastroBalanca
