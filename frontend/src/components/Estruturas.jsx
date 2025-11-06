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
import {
    Boxes, Edit, Trash2, Save, X, RefreshCw, ArrowRight,
    ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Base da API — mantenha SEMPRE https por padrão. */
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

/** Motivos aceitos no backend (EstruturaProdutoViewSet.DELETE_MOTIVOS) */
const DELETE_MOTIVOS = [
    { key: 'cadastro_duplicado', label: 'Cadastro duplicado' },
    { key: 'revisao_estrutura', label: 'Revisão/substituição da estrutura' },
    { key: 'erro_cadastro', label: 'Erro de cadastro' },
    { key: 'outro', label: 'Outro motivo' },
]

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

    // ===== Paginação (client-side) =====
    const [pageSize, setPageSize] = useState(10)
    const [page, setPage] = useState(1)

    // ===== Exclusão com motivo (inline por item) =====
    const [deleteTargetId, setDeleteTargetId] = useState(null)
    const [deleteReason, setDeleteReason] = useState('')
    const [deleteNote, setDeleteNote] = useState('')

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

    // Reset de página ao mudar filtro, dataset ou pageSize
    useEffect(() => { setPage(1) }, [q])
    useEffect(() => { setPage(1) }, [estruturas.length])
    useEffect(() => { setPage(1) }, [pageSize])

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
                        if (j?.detail) msg = j.detail
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
                        if (j?.detail) msg = j.detail
                    } catch { }
                    throw new Error(msg)
                }
                const criado = await res.json().then(estruturaApiToUi)
                setEstruturas(prev => [criado, ...prev])
                setSuccess('Estrutura criado com sucesso.')
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

    // ===== Exclusão com motivo (duas etapas) =====
    const handleExcluirClick = (id) => {
        setDeleteTargetId(id)
        setDeleteReason('')
        setDeleteNote('')
        setError(''); setSuccess('')
    }

    const handleCancelarExclusao = () => {
        setDeleteTargetId(null)
        setDeleteReason('')
        setDeleteNote('')
    }

    const handleConfirmarExclusao = async () => {
        if (!deleteTargetId) return
        if (!deleteReason) {
            setError('Selecione um motivo para a exclusão.')
            return
        }
        setLoading(true)
        setError(''); setSuccess('')
        try {
            const res = await fetchHttps(`${API_BASE}/estruturas/${deleteTargetId}/`, {
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
                setError(data?.detail || 'Não é possível excluir: existem registros vinculados.')
                return
            }
            if (res.status !== 204 && res.status !== 200) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data?.detail || `DELETE estrutura: ${res.status}`)
            }

            setEstruturas(prev => prev.filter(x => x.id !== deleteTargetId))
            setSuccess('Estrutura excluída com sucesso.')
            handleCancelarExclusao()
        } catch (e) {
            console.error(e)
            setError(typeof e?.message === 'string' ? e.message : 'Erro ao excluir estrutura.')
        } finally {
            setLoading(false)
        }
    }

    const limparFormularioEstrutura = () => {
        setEditingId(null)
        setFormEstrutura({ produtoId: '', descricao: '', ativo: true })
        setError(''); setSuccess('')
    }

    // ===== Filtro + paginação =====
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

    const { pageItems, totalItems, totalPages, startIndex, endIndex } = useMemo(() => {
        const totalItems = estruturasFiltradas.length
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
        const safePage = Math.min(page, totalPages)
        const startIndex = (safePage - 1) * pageSize
        const endIndex = Math.min(startIndex + pageSize, totalItems)
        const pageItems = estruturasFiltradas.slice(startIndex, endIndex)
        return { pageItems, totalItems, totalPages, startIndex, endIndex }
    }, [estruturasFiltradas, pageSize, page])

    const goFirst = () => setPage(1)
    const goPrev = () => setPage(p => Math.max(1, p - 1))
    const goNext = () => setPage(p => Math.min(totalPages, p + 1))
    const goLast = () => setPage(totalPages)

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
                <Card className="flex flex-col overflow-hidden shadow-xl border-t-4">
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

                {/* Lista de Estruturas — com paginação e exclusão com motivo */}
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
                                {[...Array(pageSize)].map((_, i) => (
                                    <div key={i} className="h-14 bg-gray-100 animate-pulse rounded" />
                                ))}
                            </div>
                        ) : totalItems === 0 ? (
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
                                {pageItems.map((e) => {
                                    const isDeleting = deleteTargetId === e.id
                                    return (
                                        <div
                                            key={e.id}
                                            className="relative p-3 transition-colors hover:bg-emerald-50/30 border-l-4 border-transparent cursor-pointer"
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

                                                    {!isDeleting ? (
                                                        <Button
                                                            type="button" variant="ghost" size="icon"
                                                            onClick={(ev) => { ev.stopPropagation(); handleExcluirClick(e.id) }}
                                                            className="text-red-600 hover:bg-red-50 h-7 w-7"
                                                            aria-label={`Excluir estrutura de ${e.produto?.nome}`}
                                                            title="Excluir"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            type="button" variant="outline" size="sm"
                                                            onClick={(ev) => { ev.stopPropagation(); handleCancelarExclusao() }}
                                                            className="text-gray-700"
                                                            title="Cancelar exclusão"
                                                        >
                                                            <X className="h-4 w-4 mr-1" />
                                                            Cancelar
                                                        </Button>
                                                    )}

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

                                            {/* Painel inline para exclusão com motivo */}
                                            {isDeleting && (
                                                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4" onClick={(ev) => ev.stopPropagation()}>
                                                    <p className="text-sm font-medium text-red-800 mb-3">
                                                        Para excluir esta estrutura, informe o motivo.
                                                    </p>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                                        <div className="space-y-1 md:col-span-1">
                                                            <Label htmlFor={`motivo-${e.id}`}>Motivo *</Label>
                                                            <select
                                                                id={`motivo-${e.id}`}
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
                                                            <Label htmlFor={`obs-${e.id}`}>Observação (opcional)</Label>
                                                            <Input
                                                                id={`obs-${e.id}`}
                                                                value={deleteNote}
                                                                onChange={(ev) => setDeleteNote(ev.target.value)}
                                                                placeholder="Ex.: Estrutura substituída pela revisão 2"
                                                            />
                                                        </div>

                                                        <div className="md:col-span-3 flex gap-2">
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                disabled={loading || !deleteReason}
                                                                onClick={handleConfirmarExclusao}
                                                                className="flex items-center gap-2"
                                                                title="Confirmar exclusão"
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

                    {/* Footer com paginação */}
                    <div className="p-4 border-t text-sm text-gray-700 bg-gray-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                            <span>
                                {totalItems > 0
                                    ? <>Mostrando <span className="font-medium">{startIndex + 1}</span>–<span className="font-medium">{endIndex}</span> de <span className="font-medium">{totalItems}</span></>
                                    : '0 resultados'}
                            </span>
                            <span className="hidden md:inline text-gray-400">•</span>
                            <span>Página <span className="font-medium">{Math.min(page, totalPages)}</span> de <span className="font-medium">{totalPages}</span></span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600">Por página:</span>
                                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                                    <SelectTrigger className="h-8 w-[88px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[10, 25, 50, 100].map(n => (
                                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center">
                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-none rounded-l-md" onClick={goFirst} disabled={page <= 1} title="Primeira página">
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" onClick={goPrev} disabled={page <= 1} title="Anterior">
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" onClick={goNext} disabled={page >= totalPages} title="Próxima">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-none rounded-r-md" onClick={goLast} disabled={page >= totalPages} title="Última página">
                                    <ChevronsRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}

export default Estruturas
