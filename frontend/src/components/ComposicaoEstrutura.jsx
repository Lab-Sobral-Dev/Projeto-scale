// src/pages/ComposicaoEstrutura.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
    Beaker, Edit, Trash2, Save, ArrowLeft, Link2, RefreshCw,
    ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Base da API — mantenha SEMPRE https por padrão.
 */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/registro'

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
const fetchHttps = (url, options = {}) => fetch(fixToHttps(url), options)
const normalizeList = (data) => {
    if (Array.isArray(data)) return data
    if (data?.results && Array.isArray(data.results)) return data.results
    return []
}

/**
 * Formatação de quantidade em g (mesmo padrão da tela de pesagem)
 * - Arredonda para 3 casas decimais
 * - Formata em pt-BR
 * - Evita lixo de ponto flutuante
 */
const formatG = (value) => {
    if (value == null || value === '') return '0'
    const num = Number(value)
    if (!Number.isFinite(num)) return '0'
    const rounded = Number(num.toFixed(3))
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(rounded)
}

const ComposicaoEstrutura = () => {
    const { id } = useParams() // id da estrutura
    const navigate = useNavigate()

    // ===== Auth =====
    const [token, setToken] = useState(() => localStorage.getItem('access') || '')
    useEffect(() => {
        const sync = () => setToken(localStorage.getItem('access') || '')
        window.addEventListener('storage', sync)
        const iid = setInterval(sync, 2000)
        return () => { window.removeEventListener('storage', sync); clearInterval(iid) }
    }, [])
    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    }), [token])

    // ===== Estado principal =====
    const [estrutura, setEstrutura] = useState(null)
    const [materiasPrimas, setMateriasPrimas] = useState([])
    const [itens, setItens] = useState([])
    const [loadingEstrutura, setLoadingEstrutura] = useState(true)
    const [loadingItens, setLoadingItens] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [formItem, setFormItem] = useState({ materiaPrimaId: '', quantidadePorLote: '' })
    const [editingItemId, setEditingItemId] = useState(null)

    // ===== Paginação (client-side) =====
    const [pageSize, setPageSize] = useState(10)
    const [page, setPage] = useState(1)
    useEffect(() => { setPage(1) }, [itens.length])
    useEffect(() => { setPage(1) }, [pageSize])

    // ===== Mapeamentos =====
    const estruturaApiToUi = (e) => ({
        id: e.id,
        produto: e.produto || null,
        descricao: e.descricao ?? '',
        ativo: !!e.ativo,
    })

    const itemApiToUi = (i) => ({
        id: i.id,
        estruturaId: i.estrutura_id || i.estrutura?.id,
        materiaPrima: i.materia_prima || null,
        materiaPrimaId: i.materia_prima?.id ?? '',
        quantidadePorLote: i.quantidade_por_lote ?? i.quantidadePorLote,
        unidade: i.unidade || 'g'
    })

    const itemUiToApi = (i) => ({
        estrutura_id: Number(id),
        materia_prima_id: i.materiaPrimaId,
        quantidade_por_lote: i.quantidadePorLote,
        unidade: 'g',
    })

    // ===== Loads =====
    const carregarEstrutura = async () => {
        setLoadingEstrutura(true)
        setError(''); setSuccess('')
        try {
            const res = await fetchHttps(`${API_BASE}/estruturas/${id}/`, { headers })
            if (!res.ok) throw new Error(`GET estrutura: ${res.status}`)
            const json = await res.json()
            setEstrutura(estruturaApiToUi(json))
        } catch (e) {
            console.error(e)
            setError('Não foi possível carregar a estrutura.')
        } finally {
            setLoadingEstrutura(false)
        }
    }

    const carregarMateriasPrimas = async () => {
        const all = []
        let url = `${API_BASE}/materias-primas/?page_size=1000&ordering=nome`
        while (url) {
            const res = await fetchHttps(url, { headers })
            if (!res.ok) throw new Error(`GET MPs: ${res.status}`)
            const json = await res.json()
            all.push(...normalizeList(json))
            url = json?.next ? fixToHttps(json.next) : null
            if (Array.isArray(json)) break
        }
        setMateriasPrimas(all)
    }

    const carregarItens = async () => {
        setLoadingItens(true)
        setError(''); setSuccess('')
        try {
            const res = await fetchHttps(`${API_BASE}/estruturas/${id}/itens/`, { headers })
            if (!res.ok) throw new Error(`GET itens: ${res.status}`)
            const json = await res.json()
            setItens(normalizeList(json).map(itemApiToUi))
        } catch (e) {
            console.error(e)
            setError('Falha ao carregar itens da estrutura.')
        } finally {
            setLoadingItens(false)
        }
    }

    useEffect(() => {
        (async () => {
            try {
                await Promise.all([carregarEstrutura(), carregarMateriasPrimas(), carregarItens()])
            } catch (e) {
                console.error(e)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    // ===== Totais =====
    const totalLote = useMemo(
        () => itens.reduce((acc, it) => acc + (Number(it.quantidadePorLote) || 0), 0),
        [itens]
    )

    // ===== Handlers Item =====
    const handleChangeItem = (name, value) => {
        setFormItem(prev => ({ ...prev, [name]: value }))
        setError(''); setSuccess('')
    }

    const handleSubmitItem = async (e) => {
        e.preventDefault()
        if (!formItem.materiaPrimaId || !formItem.quantidadePorLote) {
            setError('Selecione a matéria-prima e informe a quantidade (g).')
            return
        }
        setLoadingItens(true)
        setError(''); setSuccess('')
        try {
            if (editingItemId) {
                const res = await fetchHttps(`${API_BASE}/itens-estrutura/${editingItemId}/`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(itemUiToApi(formItem))
                })
                if (!res.ok) {
                    let msg = `PUT item: ${res.status}`
                    try {
                        const j = await res.json()
                        const campos = ['estrutura_id', 'materia_prima_id', 'quantidade_por_lote', 'unidade']
                        for (const c of campos) { if (j?.[c]?.[0]) { msg = j[c][0]; break } }
                    } catch { }
                    throw new Error(msg)
                }
                const atualizado = await res.json().then(itemApiToUi)
                setItens(prev => prev.map(i => i.id === editingItemId ? atualizado : i))
                setEditingItemId(null)
                setFormItem({ materiaPrimaId: '', quantidadePorLote: '' })
                setSuccess('Item atualizado.')
            } else {
                const res = await fetchHttps(`${API_BASE}/itens-estrutura/`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(itemUiToApi(formItem))
                })
                if (!res.ok) {
                    let msg = `POST item: ${res.status}`
                    try {
                        const j = await res.json()
                        const campos = ['estrutura_id', 'materia_prima_id', 'quantidade_por_lote', 'unidade']
                        for (const c of campos) { if (j?.[c]?.[0]) { msg = j[c][0]; break } }
                    } catch { }
                    throw new Error(msg)
                }
                const criado = await res.json().then(itemApiToUi)
                setItens(prev => [criado, ...prev])
                setFormItem({ materiaPrimaId: '', quantidadePorLote: '' })
                setSuccess('Item adicionado à estrutura.')
            }
        } catch (e1) {
            console.error(e1)
            setError(typeof e1?.message === 'string' ? e1.message : 'Erro ao salvar item.')
        } finally {
            setLoadingItens(false)
        }
    }

    const handleEditarItem = (i) => {
        setEditingItemId(i.id)
        setFormItem({
            materiaPrimaId: String(i.materiaPrima?.id ?? ''),
            quantidadePorLote: String(i.quantidadePorLote ?? '')
        })
        setError(''); setSuccess('')
    }

    const handleExcluirItem = async (itemId) => {
        if (!window.confirm('Excluir este item da estrutura?')) return
        setLoadingItens(true)
        setError(''); setSuccess('')
        try {
            const res = await fetchHttps(`${API_BASE}/itens-estrutura/${itemId}/`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            })
            if (res.status === 409) {
                const data = await res.json().catch(() => ({}))
                setError(data?.detail || 'Não é possível excluir este item.')
                return
            }
            if (res.status !== 204 && res.status !== 200) {
                throw new Error(`DELETE item: ${res.status}`)
            }
            setItens(prev => prev.filter(x => x.id !== itemId))
            setSuccess('Item removido.')
        } catch (e) {
            console.error(e)
            setError('Erro ao excluir item.')
        } finally {
            setLoadingItens(false)
        }
    }

    // ===== Paginação calculada =====
    const { pageItems, totalItems, totalPages, startIndex, endIndex } = useMemo(() => {
        const totalItems = itens.length
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
        const safePage = Math.min(page, totalPages)
        const startIndex = (safePage - 1) * pageSize
        const endIndex = Math.min(startIndex + pageSize, totalItems)
        const pageItems = itens.slice(startIndex, endIndex)
        return { pageItems, totalItems, totalPages, startIndex, endIndex }
    }, [itens, pageSize, page])

    const goFirst = () => setPage(1)
    const goPrev = () => setPage(p => Math.max(1, p - 1))
    const goNext = () => setPage(p => Math.min(totalPages, p + 1))
    const goLast = () => setPage(totalPages)

    return (
        <div className="min-h-[100dvh] w-full px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 bg-gray-50/50">
            <header className="flex items-center gap-3 border-b pb-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/estruturas')}
                    className="gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>
                <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight truncate">
                        Composição da Estrutura
                    </h1>
                    <p className="text-sm text-muted-foreground truncate">
                        Gerencie as matérias-primas desta estrutura.
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-6 auto-rows-max">
                {/* Info da estrutura + formulário de item */}
                <Card className="flex flex-col overflow-hidden shadow-xl border-t-4 border-orange-400/80">
                    <CardHeader className="sticky top-0 z-20 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 border-b p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                    <Beaker className="h-5 w-5 text-orange-600 shrink-0" />
                                    <span className="truncate">Estrutura</span>
                                </CardTitle>
                                <CardDescription className="truncate">
                                    {loadingEstrutura
                                        ? 'Carregando...'
                                        : estrutura
                                            ? `${estrutura?.produto?.nome || ''}${estrutura?.descricao ? ' — ' + estrutura.descricao : ''}`
                                            : 'Estrutura não encontrada.'}
                                </CardDescription>
                            </div>
                            <div className="shrink-0 text-right">
                                <span className="block text-xs text-muted-foreground">
                                    Lote Total (g)
                                </span>
                                <div className="font-mono text-lg font-bold text-gray-800">
                                    {formatG(totalLote)} g
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-4 max-h-[24vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm text-gray-600 flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-orange-600" />
                                {estrutura?.ativo ? (
                                    <Badge className="bg-orange-100 text-orange-700 border border-orange-200">
                                        Ativa
                                    </Badge>
                                ) : (
                                    <Badge variant="secondary">Inativa</Badge>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={carregarItens}
                                className="gap-2"
                            >
                                <RefreshCw className="h-4 w-4" /> Recarregar Itens
                            </Button>
                        </div>

                        {/* Form Itens */}
                        <form
                            onSubmit={handleSubmitItem}
                            className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3"
                        >
                            <div className="space-y-2 col-span-full md:col-span-2 xl:col-span-2 min-w-0">
                                <Label className="text-sm font-medium">Matéria-prima *</Label>
                                <Select
                                    value={formItem.materiaPrimaId}
                                    onValueChange={(v) => handleChangeItem('materiaPrimaId', v)}
                                    disabled={!estrutura || loadingItens}
                                >
                                    <SelectTrigger className="w-full min-w-0 overflow-hidden">
                                        <div className="w-full min-w-0 truncate text-ellipsis">
                                            <SelectValue placeholder="Selecione a MP..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                        {materiasPrimas.map(mp => (
                                            <SelectItem key={mp.id} value={String(mp.id)} disabled={mp.ativo === false}>
                                                <span className="inline-flex gap-2 items-baseline max-w-full">
                                                    <span className="truncate max-w-[200px]">{mp.nome}</span>
                                                    <span className="text-xs text-gray-500 shrink-0">
                                                        ({mp.codigo_interno})
                                                    </span>
                                                    {mp.ativo === false && (
                                                        <span className="text-xs text-red-500 shrink-0">
                                                            inativa
                                                        </span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2 col-span-full md:col-span-1 xl:col-span-1">
                                <Label htmlFor="qtd" className="text-sm font-medium">
                                    Qtd p/ lote (g) *
                                </Label>
                                <Input
                                    id="qtd"
                                    inputMode="decimal"
                                    value={formItem.quantidadePorLote}
                                    onChange={(e) => handleChangeItem('quantidadePorLote', e.target.value)}
                                    disabled={!estrutura || loadingItens}
                                    className="min-w-0"
                                />
                            </div>

                            <div className="flex items-end gap-2 pt-1 col-span-full">
                                <Button
                                    type="submit"
                                    disabled={!estrutura || loadingItens}
                                    className="flex items-center gap-2 h-9"
                                >
                                    <Save className="h-4 w-4" />
                                    {editingItemId ? 'Atualizar Item' : 'Adicionar Item'}
                                </Button>
                                {editingItemId && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setEditingItemId(null)
                                            setFormItem({ materiaPrimaId: '', quantidadePorLote: '' })
                                        }}
                                        className="h-9"
                                    >
                                        Cancelar
                                    </Button>
                                )}
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
                                            <AlertDescription className="text-green-800">
                                                {success}
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            )}
                        </form>
                    </CardContent>
                </Card>

                {/* Lista de Itens */}
                <Card className="flex flex-col overflow-hidden shadow-lg min-h-[56vh]">
                    <CardHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 border-b p-4 shadow-sm">
                        <CardTitle className="text-lg font-semibold">
                            Itens da Composição
                        </CardTitle>
                        <CardDescription>
                            {estrutura ? 'Edite ou remova itens conforme necessário.' : 'Carregando...'}
                        </CardDescription>
                    </CardHeader>

                    <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
                        {!estrutura ? (
                            <div className="text-center py-12 text-base text-gray-400">
                                Carregando estrutura...
                            </div>
                        ) : loadingItens ? (
                            <div className="p-4 space-y-3">
                                {[...Array(pageSize)].map((_, i) => (
                                    <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
                                ))}
                            </div>
                        ) : totalItems === 0 ? (
                            <div className="text-center py-12 text-base text-gray-500">
                                Nenhum item adicionado à composição.
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {pageItems.map(i => (
                                    <div
                                        key={i.id}
                                        className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1 min-w-0">
                                                <span className="font-medium text-gray-800 truncate max-w-[320px]">
                                                    {i.materiaPrima?.nome}
                                                </span>
                                                <Badge variant="secondary" className="text-xs shrink-0">
                                                    {i.materiaPrima?.codigo_interno}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                Quantidade{' '}
                                                <span className="font-mono font-semibold text-gray-900">
                                                    {formatG(i.quantidadePorLote)}
                                                </span>{' '}
                                                g
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Editar item ${i.materiaPrima?.nome || ''}`}
                                                onClick={() => handleEditarItem(i)}
                                                className="text-blue-600 hover:bg-blue-50 h-7 w-7"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Excluir item ${i.materiaPrima?.nome || ''}`}
                                                onClick={() => handleExcluirItem(i.id)}
                                                className="text-red-600 hover:bg-red-50 h-7 w-7"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer com paginação + total do lote */}
                    <div className="p-4 border-t text-sm text-gray-700 bg-gray-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col md:flex-row md:items-center md:gap-2">
                            <span>
                                {totalItems > 0 ? (
                                    <>
                                        Mostrando{' '}
                                        <span className="font-medium">{startIndex + 1}</span>–
                                        <span className="font-medium">{endIndex}</span> de{' '}
                                        <span className="font-medium">{totalItems}</span> itens
                                    </>
                                ) : (
                                    '0 resultados'
                                )}
                            </span>
                            <span className="hidden md:inline text-gray-400">•</span>
                            <span>
                                Página <span className="font-medium">{Math.min(page, totalPages)}</span> de{' '}
                                <span className="font-medium">{totalPages}</span>
                            </span>
                            <span className="hidden md:inline text-gray-400">•</span>
                            <span>
                                Lote total:{' '}
                                <span className="font-mono font-bold text-gray-900">
                                    {formatG(totalLote)} g
                                </span>
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600">Por página:</span>
                                <Select
                                    value={String(pageSize)}
                                    onValueChange={(v) => setPageSize(Number(v))}
                                >
                                    <SelectTrigger className="h-8 w-[88px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[10, 25, 50, 100].map(n => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-none rounded-l-md"
                                    onClick={goFirst}
                                    disabled={page <= 1}
                                    title="Primeira página"
                                >
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-none"
                                    onClick={goPrev}
                                    disabled={page <= 1}
                                    title="Anterior"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-none"
                                    onClick={goNext}
                                    disabled={page >= totalPages}
                                    title="Próxima"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-none rounded-r-md"
                                    onClick={goLast}
                                    disabled={page >= totalPages}
                                    title="Última página"
                                >
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

export default ComposicaoEstrutura
