import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
    Package, Boxes, Plus, Edit, Trash2, Save, X, Search, Beaker, Link2, RefreshCw
} from 'lucide-react'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

/**
 * Base da API — mantenha SEMPRE https por padrão.
 * Se preferir, defina VITE_API_BASE_URL=https://apiscale.laboratoriosobral.com.br/api
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Boxes className="h-8 w-8 text-emerald-600" />
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Estrutura de Produtos (BOM/Receita)</h1>
                    <p className="text-gray-600">
                        Cadastre a composição (itens e quantidades por lote, em gramas) para cada produto.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Form Estrutura */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {editingId ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                            {editingId ? 'Editar Estrutura' : 'Nova Estrutura'}
                        </CardTitle>
                        <CardDescription>
                            Vincule um produto, descreva (opcional) e marque ativo. A descrição é única por produto.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmitEstrutura} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Produto *</Label>
                                <Select
                                    value={formEstrutura.produtoId}
                                    onValueChange={(v) => handleChangeEstrutura('produtoId', v)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecione o produto..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {produtos.map(p => (
                                            <SelectItem key={p.id} value={String(p.id)}>
                                                {p.nome} <span className="text-xs text-gray-500">({p.codigo_interno})</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="descricao">Descrição (opcional)</Label>
                                <Input
                                    id="descricao"
                                    value={formEstrutura.descricao}
                                    onChange={(e) => handleChangeEstrutura('descricao', e.target.value)}
                                    placeholder="Ex.: Fórmula padrão, Versão 2, etc."
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="ativo"
                                    checked={formEstrutura.ativo}
                                    onCheckedChange={(checked) => handleChangeEstrutura('ativo', checked)}
                                />
                                <Label htmlFor="ativo">Estrutura Ativa</Label>
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
                                        onClick={limparFormularioEstrutura}
                                        className="flex items-center gap-2"
                                    >
                                        <X className="h-4 w-4" />
                                        Cancelar
                                    </Button>
                                )}
                            </div>
                        </form>

                        {/* Painel de Itens — aparece quando uma estrutura está selecionada */}
                        {estruturaSelecionada && (
                            <div className="mt-8 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Beaker className="h-5 w-5 text-emerald-600" />
                                    <h3 className="text-lg font-semibold">
                                        Itens da Estrutura — {estruturaSelecionada.produto?.nome}
                                        {estruturaSelecionada.descricao ? ` — ${estruturaSelecionada.descricao}` : ''}
                                    </h3>
                                </div>

                                <form onSubmit={handleSubmitItem} className="grid md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Matéria-prima *</Label>
                                        <Select
                                            value={formItem.materiaPrimaId}
                                            onValueChange={(v) => handleChangeItem('materiaPrimaId', v)}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Selecione a MP..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {materiasPrimas.map(mp => (
                                                    <SelectItem key={mp.id} value={String(mp.id)}>
                                                        {mp.nome} <span className="text-xs text-gray-500">({mp.codigo_interno})</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="qtd">Qtd por lote (g) *</Label>
                                        <Input
                                            id="qtd"
                                            inputMode="decimal"
                                            value={formItem.quantidadePorLote}
                                            onChange={(e) => handleChangeItem('quantidadePorLote', e.target.value)}
                                            placeholder="Ex.: 12500 (g)"
                                        />
                                        <p className="text-xs text-gray-500">Regra do projeto: usar <strong>g</strong> para MPs.</p>
                                    </div>

                                    <div className="flex items-end gap-3">
                                        <Button type="submit" disabled={loadingItens} className="flex items-center gap-2">
                                            <Save className="h-4 w-4" />
                                            {editingItemId ? 'Atualizar item' : 'Adicionar item'}
                                        </Button>
                                        {editingItemId && (
                                            <Button type="button" variant="outline" onClick={() => {
                                                setEditingItemId(null)
                                                setFormItem({ materiaPrimaId: '', quantidadePorLote: '' })
                                            }}>
                                                Cancelar
                                            </Button>
                                        )}
                                    </div>
                                </form>

                                <Card className="border-dashed">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Link2 className="h-4 w-4" />
                                            Itens vinculados ({itens.length})
                                        </CardTitle>
                                        <CardDescription>Quantidades por lote em gramas (g)</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="max-h-72 overflow-y-auto divide-y">
                                            {loadingItens ? (
                                                <div className="p-4 space-y-3">
                                                    {[...Array(6)].map((_, i) => (
                                                        <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
                                                    ))}
                                                </div>
                                            ) : itens.length === 0 ? (
                                                <div className="text-center py-6 text-sm text-gray-500">Nenhum item adicionado.</div>
                                            ) : (
                                                itens.map(i => (
                                                    <div key={i.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium truncate max-w-[460px]">
                                                                    {i.materiaPrima?.nome}
                                                                </span>
                                                                <Badge variant="secondary">{i.materiaPrima?.codigo_interno}</Badge>
                                                            </div>
                                                            <div className="text-sm text-gray-600">
                                                                Quantidade: <span className="font-mono">{i.quantidadePorLote}</span> g
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={`Editar item ${i.materiaPrima?.nome || ''}`}
                                                                onClick={() => handleEditarItem(i)}
                                                                className="text-blue-600 hover:text-blue-800"
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={`Excluir item ${i.materiaPrima?.nome || ''}`}
                                                                onClick={() => handleExcluirItem(i.id)}
                                                                className="text-red-600 hover:text-red-800"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Lista Estruturas */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5" />
                            Estruturas Cadastradas ({estruturas.length})
                        </CardTitle>
                        <CardDescription>
                            Pesquise por produto, código interno ou descrição {estruturas.length > 450 && '— considere refinar a busca'}
                        </CardDescription>
                        <div className="mt-4 flex gap-3">
                            <Input
                                placeholder="Buscar estruturas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="max-w-sm"
                            />
                            <Button type="button" variant="outline" onClick={carregarEstruturas} className="gap-2">
                                <RefreshCw className="h-4 w-4" /> Atualizar
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-96 overflow-y-auto">
                            {loading ? (
                                <div className="p-4 space-y-3">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
                                    ))}
                                </div>
                            ) : estruturasFiltradas.length === 0 ? (
                                <div className="text-center py-8">
                                    <Boxes className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                        {q ? 'Nenhuma estrutura encontrada' : 'Nenhuma estrutura cadastrada'}
                                    </h3>
                                    <p className="text-gray-500">
                                        {q ? 'Tente ajustar o termo de busca' : 'Crie a primeira estrutura usando o formulário ao lado'}
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-200">
                                    {estruturasFiltradas.map((e) => (
                                        <div
                                            key={e.id}
                                            className={`p-4 hover:bg-gray-50 cursor-pointer ${estruturaSelecionada?.id === e.id ? 'bg-emerald-50/60' : ''}`}
                                            onClick={() => setEstruturaSelecionada(e)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="font-medium text-gray-900 truncate max-w-[420px]">
                                                            {e.produto?.nome}
                                                        </h3>
                                                        <Badge variant={e.ativo ? "default" : "secondary"}>
                                                            {e.ativo ? 'Ativa' : 'Inativa'}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-gray-500">
                                                        Produto: <span className="font-mono">{e.produto?.codigo_interno}</span>
                                                    </p>
                                                    {e.descricao && (
                                                        <p className="text-sm text-gray-500 truncate max-w-[520px]">
                                                            Descrição: {e.descricao}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(ev) => { ev.stopPropagation(); handleEditarEstrutura(e) }}
                                                        className="text-blue-600 hover:text-blue-800"
                                                        aria-label={`Editar estrutura de ${e.produto?.nome}`}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(ev) => { ev.stopPropagation(); handleExcluirEstrutura(e.id) }}
                                                        className="text-red-600 hover:text-red-800"
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
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default CadastroEstruturaProduto
