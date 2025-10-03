// src/pages/Estruturas.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Boxes, Edit, Trash2, Save, X, RefreshCw, ArrowRight } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Base da API — mantenha SEMPRE https por padrão.
 */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/registro'

/** Corrige qualquer URL para HTTPS, inclusive relativas. */
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

/** Wrapper de fetch que garante HTTPS na URL de destino. */
const fetchHttps = (url, options = {}) => fetch(fixToHttps(url), options)

/** Normaliza payload de listagens DRF (results vs array). */
const normalizeList = (data) => {
    if (Array.isArray(data)) return data
    if (data?.results && Array.isArray(data.results)) return data.results
    return []
}

/** Debounce simples */
const useDebounced = (value, ms = 250) => {
    const [v, setV] = useState(value)
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms)
        return () => clearTimeout(t)
    }, [value, ms])
    return v
}

const Estruturas = () => {
    const navigate = useNavigate()

    // ====== Auth header dinâmico ======
    const [token, setToken] = useState(() => localStorage.getItem('access') || '')
    useEffect(() => {
        const sync = () => setToken(localStorage.getItem('access') || '')
        window.addEventListener('storage', sync)
        const id = setInterval(sync, 2000)
        return () => { window.removeEventListener('storage', sync); clearInterval(id) }
    }, [])
    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    }), [token])

    // ====== Catálogos ======
    const [produtos, setProdutos] = useState([])

    // ====== Estruturas ======
    const [estruturas, setEstruturas] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const [editingId, setEditingId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const q = useDebounced(searchTerm, 250)

    const [formEstrutura, setFormEstrutura] = useState({
        produtoId: '',
        descricao: '',
        ativo: true,
    })

    // ========== Helpers UI <-> API ==========
    const estruturaApiToUi = (e) => ({
        id: e.id,
        produto: e.produto || null,
        produtoId: e.produto?.id ?? '',
        descricao: e.descricao ?? '',
        ativo: !!e.ativo,
    })

    const estruturaUiToApi = (e) => ({
        produto_id: e.produtoId,
        descricao: e.descricao || '',
        ativo: e.ativo,
    })

    // ========== Carregamentos ==========
    const carregarProdutos = async () => {
        const all = []
        let url = `${API_BASE}/produtos/?page_size=500&ordering=nome`
        while (url) {
            const res = await fetchHttps(url, { headers })
            if (!res.ok) throw new Error(`GET produtos: ${res.status}`)
            const json = await res.json()
            all.push(...normalizeList(json))
            url = json?.next ? fixToHttps(json.next) : null
            if (Array.isArray(json)) break
        }
        setProdutos(all)
    }

    const carregarEstruturas = async () => {
        setLoading(true)
        setError(''); setSuccess('')
        try {
            const all = []
            let url = `${API_BASE}/estruturas/?page_size=500&ordering=produto__nome`
            while (url) {
                const res = await fetchHttps(url, { headers })
                if (!res.ok) throw new Error(`GET estruturas: ${res.status}`)
                const json = await res.json()
                const pageItems = normalizeList(json).map(estruturaApiToUi)
                all.push(...pageItems)
                url = json?.next ? fixToHttps(json.next) : null
                if (Array.isArray(json)) break
            }
            setEstruturas(all)
        } catch (e) {
            console.error(e)
            setError('Não foi possível carregar as estruturas. Verifique conexão e permissões.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        (async () => {
            try {
                await Promise.all([carregarProdutos(), carregarEstruturas()])
            } catch (e) {
                console.error(e)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ========== Handlers ==========
    const handleChangeEstrutura = (name, value) => {
        setFormEstrutura(prev => ({ ...prev, [name]: value }))
        setError(''); setSuccess('')
    }

    const handleSubmitEstrutura = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(''); setSuccess('')
        try {
            if (!formEstrutura.produtoId) {
                setError('Selecione um produto.')
                return
            }
            const dup = estruturas.some(es =>
                es.produto?.id === Number(formEstrutura.produtoId) &&
                (es.descricao || '') === (formEstrutura.descricao || '') &&
                es.id !== editingId
            )
            if (dup) {
                setError('Já existe uma estrutura com esta descrição para o produto selecionado.')
                return
            }

            if (editingId) {
                const res = await fetchHttps(`${API_BASE}/estruturas/${editingId}/`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(estruturaUiToApi(formEstrutura))
                })
                if (!res.ok) {
                    let msg = `PUT estrutura: ${res.status}`
                    try {
                        const j = await res.json()
                        if (j?.produto_id?.[0]) msg = j.produto_id[0]
                        if (j?.descricao?.[0]) msg = j.descricao[0]
                    } catch { }
                    throw new Error(msg)
                }
                const atualizado = await res.json().then(estruturaApiToUi)
                setEstruturas(prev => prev.map(x => x.id === editingId ? atualizado : x))
                setSuccess('Estrutura atualizada com sucesso.')
                setEditingId(null)
                setFormEstrutura({ produtoId: '', descricao: '', ativo: true })
            } else {
                const res = await fetchHttps(`${API_BASE}/estruturas/`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(estruturaUiToApi(formEstrutura))
                })
                if (!res.ok) {
                    let msg = `POST estrutura: ${res.status}`
                    try {
                        const j = await res.json()
                        if (j?.produto_id?.[0]) msg = j.produto_id[0]
                        if (j?.descricao?.[0]) msg = j.descricao[0]
                    } catch { }
                    throw new Error(msg)
                }
                const criado = await res.json().then(estruturaApiToUi)
                setEstruturas(prev => [criado, ...prev])
                setSuccess('Estrutura criada com sucesso.')
                setFormEstrutura({ produtoId: '', descricao: '', ativo: true })
            }
        } catch (err) {
            console.error(err)
            setError(typeof err?.message === 'string' ? err.message : 'Erro ao salvar estrutura.')
        } finally {
            setLoading(false)
        }
    }

    const handleEditarEstrutura = (e) => {
        setEditingId(e.id)
        setFormEstrutura({
            produtoId: String(e.produto?.id ?? ''),
            descricao: e.descricao || '',
            ativo: e.ativo
        })
        setSuccess(''); setError('')
    }

    const handleExcluirEstrutura = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir esta estrutura?')) return
        setLoading(true)
        setError(''); setSuccess('')
        try {
            const res = await fetchHttps(`${API_BASE}/estruturas/${id}/`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            })
            if (res.status === 409) {
                const data = await res.json().catch(() => ({}))
                setError(data?.detail || 'Não é possível excluir: existem registros vinculados.')
                return
            }
            if (res.status !== 204 && res.status !== 200) {
                throw new Error(`DELETE estrutura: ${res.status}`)
            }
            setEstruturas(prev => prev.filter(x => x.id !== id))
            setSuccess('Estrutura excluída com sucesso.')
        } catch (e) {
            console.error(e)
            setError('Erro ao excluir estrutura.')
        } finally {
            setLoading(false)
        }
    }

    const limparFormularioEstrutura = () => {
        setEditingId(null)
        setFormEstrutura({ produtoId: '', descricao: '', ativo: true })
        setError(''); setSuccess('')
    }

    // ===== Filtro de estruturas =====
    const estruturasFiltradas = useMemo(() => {
        const termo = q.trim().toLowerCase()
        if (!termo) return estruturas
        return estruturas.filter(e => {
            const a = (e.produto?.nome || '').toLowerCase()
            const b = (e.produto?.codigo_interno || '').toLowerCase()
            const c = (e.descricao || '').toLowerCase()
            return a.includes(termo) || b.includes(termo) || c.includes(termo)
        })
    }, [estruturas, q])

    return (
        <div className="min-h-[100dvh] w-full px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 bg-gray-50/50">

            {/* Header */}
            <header className="flex items-center gap-4 border-b pb-4">
                <Boxes className="h-9 w-9 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                    <h1 className="text-3xl font-extrabold tracking-tight truncate">Gestão de Estruturas de Produtos</h1>
                    <p className="text-sm text-muted-foreground truncate">
                        Cadastre e liste estruturas. Clique para abrir a página de composição.
                    </p>
                </div>
            </header>

            {/* Layout vertical: formulário + lista */}
            <div className="grid grid-cols-1 gap-6 auto-rows-max">

                {/* Formulário */}
                <Card className="flex flex-col overflow-hidden shadow-xl border-t-4 border-emerald-600">
                    <CardHeader className="bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 border-b p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <CardTitle className="text-lg font-semibold truncate">
                                    {editingId ? 'Editar Estrutura' : 'Nova Estrutura'} — Cadastro Principal
                                </CardTitle>
                                <CardDescription className="truncate">
                                    Vincule o produto e defina o status de ativação da estrutura.
                                </CardDescription>
                            </div>
                            <div className="shrink-0 flex gap-2">
                                {editingId && (
                                    <Button
                                        type="button" variant="outline" size="sm"
                                        onClick={limparFormularioEstrutura}
                                        className="gap-2"
                                    >
                                        <X className="h-4 w-4" />
                                        Cancelar Edição
                                    </Button>
                                )}
                                <Button type="submit" form="form-estrutura" size="sm" className="gap-2">
                                    <Save className="h-4 w-4" />
                                    {editingId ? 'Atualizar Estrutura' : 'Salvar Estrutura'}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    {/* menor teto para o form, liberando mais viewport ao catálogo */}
                    <CardContent className="p-6 max-h-[26vh] overflow-y-auto min-h-0">
                        <form
                            id="form-estrutura"
                            onSubmit={handleSubmitEstrutura}
                            className="grid grid-cols-1 md:grid-cols-4 gap-4"
                        >
                            {/* Produto */}
                            <div className="space-y-2 col-span-1 md:col-span-2 min-w-0">
                                <Label className="text-sm font-medium">Produto *</Label>
                                <Select
                                    value={formEstrutura.produtoId}
                                    onValueChange={(v) => handleChangeEstrutura('produtoId', v)}
                                >
                                    <SelectTrigger className="w-full min-w-0 overflow-hidden">
                                        <div className="w-full min-w-0 truncate text-ellipsis">
                                            <SelectValue placeholder="Selecione o produto..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                        {produtos.map(p => (
                                            <SelectItem key={p.id} value={String(p.id)}>
                                                <span className="inline-flex gap-2 items-baseline max-w-full">
                                                    <span className="truncate max-w-[260px]">{p.nome}</span>
                                                    <span className="text-xs text-muted-foreground shrink-0">({p.codigo_interno})</span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Descrição */}
                            <div className="space-y-2 col-span-1 md:col-span-2 min-w-0">
                                <Label htmlFor="descricao" className="text-sm font-medium">Descrição (opcional)</Label>
                                <Input
                                    id="descricao"
                                    value={formEstrutura.descricao}
                                    onChange={(e) => handleChangeEstrutura('descricao', e.target.value)}
                                    placeholder="Ex.: Fórmula padrão, Versão 2, etc."
                                    className="min-w-0"
                                />
                            </div>

                            {/* Ativo */}
                            <div className="flex items-center gap-3 pt-2 col-span-full">
                                <Switch
                                    id="ativo"
                                    checked={formEstrutura.ativo}
                                    onCheckedChange={(checked) => handleChangeEstrutura('ativo', checked)}
                                />
                                <Label htmlFor="ativo" className="text-sm font-medium">Estrutura Ativa</Label>
                            </div>

                            {(error || success) && (
                                <div className="col-span-full">
                                    {error && (
                                        <Alert variant="destructive">
                                            <AlertDescription>{error}</AlertDescription>
                                        </Alert>
                                    )}
                                    {success && (
                                        <Alert className="border-green-300 bg-green-50">
                                            <AlertDescription className="text-green-800">{success}</AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            )}
                        </form>
                    </CardContent>
                </Card>

                {/* Lista de Estruturas — altura generosa para ver várias ao mesmo tempo */}
                <Card className="flex flex-col overflow-hidden shadow-lg min-h-[56vh]">
                    <CardHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 border-b p-4 shadow-sm">
                        <CardTitle className="text-lg font-semibold">Catálogo de Estruturas</CardTitle>
                        <CardDescription>Procure e clique para abrir a composição.</CardDescription>

                        <div className="mt-3 flex gap-2 items-center">
                            <Input
                                placeholder="Buscar estruturas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 min-w-0"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={carregarEstruturas}
                                className="gap-2 shrink-0 h-9"
                                title="Atualizar Lista"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>

                    <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-100 min-h-0">
                        {loading ? (
                            <div className="p-4 space-y-3">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="h-14 bg-gray-100 animate-pulse rounded" />
                                ))}
                            </div>
                        ) : estruturasFiltradas.length === 0 ? (
                            <div className="text-center py-12 px-4 text-gray-500">
                                <Boxes className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">
                                    {q ? 'Nenhuma estrutura encontrada' : 'Nenhuma estrutura cadastrada'}
                                </h3>
                                <p className="text-sm">
                                    {q ? 'Tente ajustar o termo de busca.' : 'Use o formulário acima para criar a primeira estrutura.'}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {estruturasFiltradas.map((e) => (
                                    <div
                                        key={e.id}
                                        className="relative p-3 transition-colors hover:bg-emerald-50/30 border-l-4 border-transparent"
                                        onClick={() => navigate(`/estruturas/${e.id}`)}
                                        role="button"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 min-w-0">
                                                    <h3 className="font-semibold text-gray-900 truncate">
                                                        {e.produto?.nome}
                                                    </h3>
                                                    <Badge
                                                        variant={e.ativo ? 'default' : 'secondary'}
                                                        className={`shrink-0 text-xs font-medium ${e.ativo ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-100'}`}
                                                    >
                                                        {e.ativo ? 'Ativa' : 'Inativa'}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    Cód. Produto: <span className="font-mono text-gray-700">{e.produto?.codigo_interno}</span>
                                                </p>
                                                {e.descricao && (
                                                    <p className="text-xs text-gray-500 truncate mt-0.5">
                                                        Descrição: {e.descricao}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex gap-1 shrink-0 mt-1">
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    onClick={(ev) => { ev.stopPropagation(); handleEditarEstrutura(e) }}
                                                    className="text-blue-600 hover:bg-blue-50 h-7 w-7"
                                                    aria-label={`Editar estrutura de ${e.produto?.nome}`}
                                                    title="Editar cadastro"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    onClick={(ev) => { ev.stopPropagation(); handleExcluirEstrutura(e.id) }}
                                                    className="text-red-600 hover:bg-red-50 h-7 w-7"
                                                    aria-label={`Excluir estrutura de ${e.produto?.nome}`}
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button" variant="outline" size="sm"
                                                    onClick={(ev) => { ev.stopPropagation(); navigate(`/estruturas/${e.id}`) }}
                                                    className="gap-1"
                                                    title="Abrir composição"
                                                >
                                                    Abrir
                                                    <ArrowRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t text-sm font-medium text-gray-600 bg-gray-50">
                        {estruturasFiltradas.length} {estruturasFiltradas.length === 1 ? 'estrutura' : 'estruturas'} encontrada(s)
                    </div>
                </Card>
            </div>
        </div>
    )
}

export default Estruturas
