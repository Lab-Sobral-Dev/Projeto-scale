import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
    Boxes, Plus, Edit, Trash2, Save, X, Search, Beaker, Link2, RefreshCw
} from 'lucide-react'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

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

const CadastroEstruturaProduto = () => {
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
    const [materiasPrimas, setMateriasPrimas] = useState([])

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

    // ====== Itens da estrutura selecionada ======
    const [estruturaSelecionada, setEstruturaSelecionada] = useState(null) // objeto da estrutura
    const [itens, setItens] = useState([])
    const [loadingItens, setLoadingItens] = useState(false)
    const [formItem, setFormItem] = useState({
        materiaPrimaId: '',
        quantidadePorLote: '',
    })
    const [editingItemId, setEditingItemId] = useState(null)

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

    const itemApiToUi = (i) => ({
        id: i.id,
        estruturaId: i.estrutura_id || i.estrutura?.id, // por segurança
        materiaPrima: i.materia_prima || null,
        materiaPrimaId: i.materia_prima?.id ?? '',
        quantidadePorLote: i.quantidade_por_lote,
        unidade: i.unidade || 'g'
    })

    const itemUiToApi = (i) => ({
        estrutura_id: estruturaSelecionada?.id,
        materia_prima_id: i.materiaPrimaId,
        quantidade_por_lote: i.quantidadePorLote,
        unidade: 'g', // regra do projeto
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

    const carregarItensDaEstrutura = async (estruturaId) => {
        if (!estruturaId) { setItens([]); return }
        setLoadingItens(true)
        try {
            const res = await fetchHttps(`${API_BASE}/estruturas/${estruturaId}/itens/`, { headers })
            if (!res.ok) throw new Error(`GET itens estrutura: ${res.status}`)
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
                await Promise.all([
                    carregarProdutos(),
                    carregarMateriasPrimas(),
                    carregarEstruturas()
                ])
            } catch (e) {
                console.error(e)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Quando muda a estruturaSelecionada, traz itens
    useEffect(() => {
        carregarItensDaEstrutura(estruturaSelecionada?.id || null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estruturaSelecionada?.id])

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
            // Regra de unicidade (produto + descricao) – validação básica local
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
                const atualizado = estruturaApiToUi(await res.json())
                setEstruturas(prev => prev.map(x => x.id === editingId ? atualizado : x))
                setEstruturaSelecionada(atualizado)
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
                const criado = estruturaApiToUi(await res.json())
                setEstruturas(prev => [criado, ...prev])
                setEstruturaSelecionada(criado)
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
        setEstruturaSelecionada(e)
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
            if (estruturaSelecionada?.id === id) {
                setEstruturaSelecionada(null)
                setItens([])
            }
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

    // ===== Itens =====
    const handleChangeItem = (name, value) => {
        setFormItem(prev => ({ ...prev, [name]: value }))
        setError(''); setSuccess('')
    }

    const handleSubmitItem = async (e) => {
        e.preventDefault()
        if (!estruturaSelecionada?.id) {
            setError('Selecione ou salve uma estrutura antes de adicionar itens.')
            return
        }
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
                        for (const c of campos) {
                            if (j?.[c]?.[0]) { msg = j[c][0]; break }
                        }
                    } catch { }
                    throw new Error(msg)
                }
                const atualizado = itemApiToUi(await res.json())
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
                        for (const c of campos) {
                            if (j?.[c]?.[0]) { msg = j[c][0]; break }
                        }
                    } catch { }
                    throw new Error(msg)
                }
                const criado = itemApiToUi(await res.json())
                setItens(prev => [criado, ...prev])
                setFormItem({ materiaPrimaId: '', quantidadePorLote: '' })
                setSuccess('Item adicionado à estrutura.')
            }
        } catch (e) {
            console.error(e)
            setError(typeof e?.message === 'string' ? e.message : 'Erro ao salvar item.')
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

    const handleExcluirItem = async (id) => {
        if (!window.confirm('Excluir este item da estrutura?')) return
        setLoadingItens(true)
        setError(''); setSuccess('')
        try {
            const res = await fetchHttps(`${API_BASE}/itens-estrutura/${id}/`, {
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
            setItens(prev => prev.filter(x => x.id !== id))
            setSuccess('Item removido.')
        } catch (e) {
            console.error(e)
            setError('Erro ao excluir item.')
        } finally {
            setLoadingItens(false)
        }
    }

    // ===== Filtro de estruturas (busca por produto/descrição) =====
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

    // Total do lote (g)
    const totalLote = useMemo(
        () => itens.reduce((acc, it) => acc + (Number(it.quantidadePorLote) || 0), 0),
        [itens]
    )

    return (
        // Container Principal: h-full para se ajustar ao pai e melhor margem interna.
        <div className="h-full px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 bg-gray-50/50">

            {/* Título global */}
            <header className="flex items-center gap-4 border-b pb-4">
                <Boxes className="h-9 w-9 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                    <h1 className="text-3xl font-extrabold tracking-tight truncate">Estruturas de Produtos</h1>
                    <p className="text-sm text-muted-foreground truncate">
                        Gerencie a composição e o detalhamento das estruturas do produto.
                    </p>
                </div>
            </header>

            {/* Grade de Conteúdo: Master (Catálogo), Detail (Form), Subdetail (Itens) */}
            {/* Padrão: 1 coluna (móvel) -> 2 colunas (tablet/desktop pequeno) -> 3 colunas (desktop grande) */}
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] xl:grid-cols-[360px_minmax(400px,1fr)_480px] gap-6 h-[calc(100vh-200px)]">

                {/* 1. Catálogo de Estruturas (Master) */}
                <Card className="flex flex-col overflow-hidden shadow-lg border-emerald-200/50">
                    {/* Header fixo e com sombra para destacar */}
                    <CardHeader className="border-b sticky top-0 bg-card z-20 p-4 shadow-sm">
                        <CardTitle className="text-lg font-semibold">Catálogo de Estruturas</CardTitle>
                        <CardDescription>Procure por produto, código ou descrição.</CardDescription>

                        <div className="mt-3 flex gap-2 items-center">
                            <Input
                                placeholder="Buscar estruturas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9"
                            />
                            <Button type="button" variant="outline" onClick={carregarEstruturas} className="gap-2 shrink-0 h-9">
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>

                    {/* Lista com scroll */}
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                        {/* Exibir loading/vazio */}
                        {loading ? (
                            <div className="p-4 space-y-3">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="h-14 bg-gray-100 animate-pulse rounded" />
                                ))}
                            </div>
                        ) : estruturasFiltradas.length === 0 ? (
                            <div className="text-center py-12 px-4">
                                <Boxes className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                                    {q ? 'Nenhuma estrutura encontrada' : 'Nenhuma estrutura cadastrada'}
                                </h3>
                                <p className="text-sm text-gray-500">
                                    {q ? 'Tente ajustar o termo de busca' : 'Use o painel central para criar.'}
                                </p>
                            </div>
                        ) : (
                            // Lista de Itens (Mais clean)
                            <div className="divide-y divide-gray-100">
                                {estruturasFiltradas.map((e) => (
                                    <div
                                        key={e.id}
                                        className={`relative p-4 cursor-pointer transition-colors hover:bg-emerald-50/30 
                                        ${estruturaSelecionada?.id === e.id
                                                ? 'bg-emerald-50 border-l-4 border-emerald-600' // Borda esquerda para seleção sofisticada
                                                : 'border-l-4 border-transparent'
                                            }`}
                                        onClick={() => setEstruturaSelecionada(e)}
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
                                            {/* Ações (Reduzidas a um menu de contexto ou botões menores, mas mantive a sua versão) */}
                                            <div className="flex gap-1 shrink-0 mt-1">
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    onClick={(ev) => { ev.stopPropagation(); handleEditarEstrutura(e) }}
                                                    className="text-blue-600 hover:bg-blue-50 h-7 w-7"
                                                    aria-label={`Editar estrutura de ${e.produto?.nome}`}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    onClick={(ev) => { ev.stopPropagation(); handleExcluirEstrutura(e.id) }}
                                                    className="text-red-600 hover:bg-red-50 h-7 w-7"
                                                    aria-label={`Excluir estrutura de ${e.produto?.nome}`}
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
                    {/* Footer com contagem */}
                    <div className="p-4 border-t text-sm font-medium text-gray-600 bg-gray-50">
                        {estruturasFiltradas.length} {estruturasFiltradas.length === 1 ? 'estrutura' : 'estruturas'} encontrada(s)
                    </div>
                </Card>

                {/* Agrupamento do Detail e Subdetail para melhor responsividade em telas 'lg' */}
                <div className="lg:col-span-1 lg:grid lg:grid-cols-1 xl:grid-cols-2 gap-6">

                    {/* 2. Formulário da Estrutura (Detail) */}
                    <Card className="flex flex-col overflow-hidden shadow-lg">
                        <CardHeader className="border-b sticky top-0 bg-card z-10 flex flex-row items-center justify-between gap-3 p-4 shadow-sm">
                            <div className="min-w-0">
                                <CardTitle className="text-lg font-semibold truncate">
                                    {editingId ? 'Editar Estrutura' : 'Nova Estrutura'}
                                </CardTitle>
                                <CardDescription className="truncate">
                                    Vínculo obrigatório com o produto e status.
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
                                        Cancelar
                                    </Button>
                                )}
                                <Button type="submit" form="form-estrutura" size="sm" className="gap-2">
                                    <Save className="h-4 w-4" />
                                    {editingId ? 'Atualizar' : 'Salvar'}
                                </Button>
                            </div>
                        </CardHeader>

                        {/* Conteúdo do formulário com scroll próprio */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <form id="form-estrutura" onSubmit={handleSubmitEstrutura} className="space-y-6">
                                {/* Campos do formulário... (Estrutura mantida, apenas espaçamento ajustado) */}

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Produto *</Label>
                                    <Select
                                        value={formEstrutura.produtoId}
                                        onValueChange={(v) => handleChangeEstrutura('produtoId', v)}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Selecione o produto..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-64">
                                            {produtos.map(p => (
                                                <SelectItem key={p.id} value={String(p.id)}>
                                                    <span className="inline-flex gap-2 items-baseline">
                                                        <span className="truncate max-w-[260px]">{p.nome}</span>
                                                        <span className="text-xs text-muted-foreground shrink-0">({p.codigo_interno})</span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="descricao" className="text-sm font-medium">Descrição (opcional)</Label>
                                    <Input
                                        id="descricao"
                                        value={formEstrutura.descricao}
                                        onChange={(e) => handleChangeEstrutura('descricao', e.target.value)}
                                        placeholder="Ex.: Fórmula padrão, Versão 2, etc."
                                    />
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <Switch
                                        id="ativo"
                                        checked={formEstrutura.ativo}
                                        onCheckedChange={(checked) => handleChangeEstrutura('ativo', checked)}
                                    />
                                    <Label htmlFor="ativo" className="text-sm font-medium">Estrutura Ativa</Label>
                                </div>

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
                            </form>
                        </div>
                    </Card>

                    {/* 3. Itens da Estrutura (Subdetail) */}
                    <Card className="flex flex-col overflow-hidden shadow-lg lg:mt-6 xl:mt-0"> {/* Adicionado mt-6 para quebrar a coluna no LG, mas alinha no XL */}
                        <CardHeader className="border-b sticky top-0 bg-card z-10 p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                        <Beaker className="h-5 w-5 text-emerald-600 shrink-0" />
                                        <span className="truncate">Composição da Estrutura</span>
                                    </CardTitle>
                                    <CardDescription className="truncate mt-0.5">
                                        {estruturaSelecionada
                                            ? `Estrutura vinculada: ${estruturaSelecionada?.produto?.nome || ''}${estruturaSelecionada?.descricao ? ' — ' + estruturaSelecionada.descricao : ''}`
                                            : 'Selecione uma estrutura para gerenciar os itens.'}
                                    </CardDescription>
                                </div>
                                <div className="shrink-0 text-right">
                                    <span className="block text-xs text-muted-foreground">Lote Total (g)</span>
                                    <div className="font-mono text-lg font-bold text-gray-800">{totalLote.toLocaleString('pt-BR')}</div>
                                </div>
                            </div>
                        </CardHeader>

                        {/* Form de item - Melhor layout em grid */}
                        <div className="p-4 border-b bg-gray-50">
                            <form onSubmit={handleSubmitItem} className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3">
                                <div className="space-y-2 sm:col-span-2 md:col-span-1 xl:col-span-1">
                                    <Label className="text-sm font-medium">Matéria-prima *</Label>
                                    {/* O Select para MP é o mais importante e deve ter mais espaço */}
                                    <Select
                                        value={formItem.materiaPrimaId}
                                        onValueChange={(v) => handleChangeItem('materiaPrimaId', v)}
                                        disabled={!estruturaSelecionada || loadingItens}
                                    >
                                        {/* ... SelectContent (mantido) */}
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Selecione a MP..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-64">
                                            {materiasPrimas.map(mp => (
                                                <SelectItem key={mp.id} value={String(mp.id)}>
                                                    <span className="inline-flex gap-2 items-baseline">
                                                        <span className="truncate max-w-[200px]">{mp.nome}</span>
                                                        <span className="text-xs text-gray-500 shrink-0">({mp.codigo_interno})</span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="qtd" className="text-sm font-medium">Qtd p/ lote (g) *</Label>
                                    <Input
                                        id="qtd"
                                        inputMode="decimal"
                                        value={formItem.quantidadePorLote}
                                        onChange={(e) => handleChangeItem('quantidadePorLote', e.target.value)}
                                        placeholder="Ex.: 12500"
                                        disabled={!estruturaSelecionada || loadingItens}
                                    />
                                </div>

                                <div className="flex items-end gap-2 pt-1">
                                    <Button
                                        type="submit"
                                        disabled={!estruturaSelecionada || loadingItens}
                                        className="flex items-center gap-2 h-9"
                                    >
                                        <Save className="h-4 w-4" />
                                        {editingItemId ? 'Atualizar' : 'Adicionar'}
                                    </Button>
                                    {editingItemId && (
                                        <Button
                                            type="button" variant="outline" size="sm"
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
                            </form>
                        </div>

                        {/* Lista de itens com scroll */}
                        <div className="flex-1 overflow-y-auto">
                            {!estruturaSelecionada ? (
                                <div className="text-center py-12 text-base text-gray-400">
                                    👈 Selecione uma estrutura.
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {loadingItens ? (
                                        <div className="p-4 space-y-3">
                                            {[...Array(6)].map((_, i) => (
                                                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
                                            ))}
                                        </div>
                                    ) : itens.length === 0 ? (
                                        <div className="text-center py-12 text-base text-gray-500">
                                            Nenhum item adicionado à estrutura.
                                        </div>
                                    ) : (
                                        itens.map(i => (
                                            <div key={i.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-gray-800 truncate max-w-[280px]">
                                                            {i.materiaPrima?.nome}
                                                        </span>
                                                        <Badge variant="secondary" className="text-xs shrink-0">{i.materiaPrima?.codigo_interno}</Badge>
                                                    </div>
                                                    <div className="text-sm text-gray-600">
                                                        Quantidade: <span className="font-mono font-semibold text-gray-900">{i.quantidadePorLote}</span> g
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        type="button" variant="ghost" size="icon"
                                                        aria-label={`Editar item ${i.materiaPrima?.nome || ''}`}
                                                        onClick={() => handleEditarItem(i)}
                                                        className="text-blue-600 hover:bg-blue-50 h-7 w-7"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button" variant="ghost" size="icon"
                                                        aria-label={`Excluir item ${i.materiaPrima?.nome || ''}`}
                                                        onClick={() => handleExcluirItem(i.id)}
                                                        className="text-red-600 hover:bg-red-50 h-7 w-7"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t text-sm text-gray-600 font-medium bg-gray-50 flex items-center justify-between">
                            <span className="inline-flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-emerald-600" /> Itens vinculados {estruturaSelecionada ? `(${itens.length})` : ''}
                            </span>
                            {estruturaSelecionada && <span>Total: <span className="font-mono font-bold text-gray-900">{totalLote.toLocaleString('pt-BR')} g</span></span>}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}

export default CadastroEstruturaProduto
