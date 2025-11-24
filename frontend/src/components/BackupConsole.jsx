// src/pages/BackupConsole.jsx
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import {
    HardDrive,
    RefreshCcw,
    Download,
    PlayCircle,
    Filter
} from 'lucide-react'
import api from '@/services/api'

const API_BASE =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:8000/api'

function formatDate(val) {
    if (!val) return ''
    try {
        const d = new Date(val)
        return d
            .toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'medium'
            })
            .replace(',', '')
    } catch {
        return val
    }
}

function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0,00 MB'
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function BackupConsole() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [execLoading, setExecLoading] = useState(false)

    const [filters, setFilters] = useState({
        status: 'all', // all | success | error
        trigger: 'all', // all | manual | automatic
        user: '',
        dateFrom: '',
        dateTo: ''
    })

    const load = async () => {
        setLoading(true)
        try {
            const { data } = await api.get('/registro/backups/')
            setItems(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error(e)
            alert('Erro ao carregar lista de backups.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const handleExecuteBackup = async () => {
        if (!window.confirm('Deseja realmente executar um backup completo agora?')) {
            return
        }
        setExecLoading(true)
        try {
            await api.post('/registro/backups/execute/')
            alert('Backup iniciado/concluído com sucesso.')
            await load()
        } catch (e) {
            console.error(e)
            const msg = e?.response?.data?.detail || e.message || 'Erro desconhecido'
            alert('Falha ao executar backup: ' + msg)
        } finally {
            setExecLoading(false)
        }
    }

    const handleDownload = (id, status) => {
        if (status !== 'success') {
            alert('Somente backups com status OK podem ser baixados.')
            return
        }
        // Para o frontend usamos a view DRF com JWT/sessão
        const url = `${API_BASE}/registro/backups/${id}/download/`
        window.open(url, '_blank')
    }

    const updateFilter = (name, value) => {
        setFilters(prev => ({ ...prev, [name]: value }))
    }

    const clearFilters = () => {
        setFilters({
            status: 'all',
            trigger: 'all',
            user: '',
            dateFrom: '',
            dateTo: ''
        })
    }

    const filteredItems = useMemo(() => {
        return items.filter(b => {
            // status
            if (filters.status !== 'all') {
                if (b.status !== filters.status) return false
            }

            // trigger_type (manual/automatic)
            const trig = b.trigger_type || 'manual'
            if (filters.trigger !== 'all') {
                if (trig !== filters.trigger) return false
            }

            // usuário (nome)
            const userName = (b.executed_by_name || '').toLowerCase()
            const userFilter = filters.user.trim().toLowerCase()
            if (userFilter) {
                if (!userName.includes(userFilter)) return false
            }

            // datas
            if (filters.dateFrom || filters.dateTo) {
                try {
                    const d = new Date(b.created_at)
                    if (Number.isNaN(d.getTime())) return false
                    const onlyDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())

                    if (filters.dateFrom) {
                        const [y, m, day] = filters.dateFrom.split('-').map(Number)
                        const dFrom = new Date(y, m - 1, day)
                        if (onlyDate < dFrom) return false
                    }

                    if (filters.dateTo) {
                        const [y, m, day] = filters.dateTo.split('-').map(Number)
                        const dTo = new Date(y, m - 1, day)
                        if (onlyDate > dTo) return false
                    }
                } catch {
                    return false
                }
            }

            return true
        })
    }, [items, filters])

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <HardDrive className="w-5 h-5" />
                        <CardTitle>Backups do banco</CardTitle>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                            variant="outline"
                            onClick={load}
                            disabled={loading || execLoading}
                        >
                            <RefreshCcw className="w-4 h-4 mr-2" />
                            {loading ? 'Carregando…' : 'Recarregar'}
                        </Button>
                        <Button
                            onClick={handleExecuteBackup}
                            disabled={execLoading || loading}
                        >
                            <PlayCircle className="w-4 h-4 mr-2" />
                            {execLoading ? 'Executando…' : 'Backup agora'}
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Filtros */}
                    <div className="mb-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Filter className="w-4 h-4" />
                            <span>Filtros</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Status */}
                            <div className="space-y-1">
                                <Label>Status</Label>
                                <Select
                                    value={filters.status}
                                    onValueChange={v => updateFilter('status', v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos" />
                                    </SelectTrigger>
                                    <SelectContent className="w-[--radix-select-trigger-width] max-h-72">
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="success">OK</SelectItem>
                                        <SelectItem value="error">Erro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Tipo */}
                            <div className="space-y-1">
                                <Label>Tipo</Label>
                                <Select
                                    value={filters.trigger}
                                    onValueChange={v => updateFilter('trigger', v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos" />
                                    </SelectTrigger>
                                    <SelectContent className="w-[--radix-select-trigger-width] max-h-72">
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="manual">Manual</SelectItem>
                                        <SelectItem value="automatic">Automático</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Usuário */}
                            <div className="space-y-1">
                                <Label>Usuário</Label>
                                <Input
                                    value={filters.user}
                                    onChange={e => updateFilter('user', e.target.value)}
                                    placeholder="Nome do usuário"
                                />
                            </div>

                            {/* Período */}
                            <div className="space-y-1">
                                <Label>Período</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={e => updateFilter('dateFrom', e.target.value)}
                                    />
                                    <Input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={e => updateFilter('dateTo', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={clearFilters}>
                                Limpar filtros
                            </Button>
                        </div>
                    </div>

                    {/* Contador */}
                    <div className="text-sm text-muted-foreground mb-3">
                        {loading
                            ? 'Carregando…'
                            : `Total de backups: ${filteredItems.length} (de ${items.length})`}
                    </div>

                    {/* Tabela */}
                    <div className="overflow-auto rounded border">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2 font-medium">Data/Hora</th>
                                    <th className="text-left px-3 py-2 font-medium">Usuário</th>
                                    <th className="text-left px-3 py-2 font-medium">Tipo</th>
                                    <th className="text-left px-3 py-2 font-medium">Engine</th>
                                    <th className="text-left px-3 py-2 font-medium">Tamanho</th>
                                    <th className="text-left px-3 py-2 font-medium">Status</th>
                                    <th className="text-left px-3 py-2 font-medium">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!loading && filteredItems.length === 0 && (
                                    <tr>
                                        <td
                                            className="px-3 py-3 text-muted-foreground"
                                            colSpan={7}
                                        >
                                            Nenhum backup corresponde aos filtros.
                                        </td>
                                    </tr>
                                )}

                                {filteredItems.map(b => {
                                    const statusOk = b.status === 'success'
                                    const statusLabel = statusOk ? 'OK' : 'Erro'
                                    const statusColor = statusOk ? 'bg-emerald-600' : 'bg-red-600'

                                    const trig = b.trigger_type || 'manual'
                                    const typeLabel =
                                        trig === 'automatic' ? 'Automático' : 'Manual'
                                    const typeColor =
                                        trig === 'automatic' ? 'bg-blue-600' : 'bg-slate-600'

                                    const userName =
                                        b.executed_by_name ||
                                        (trig === 'automatic' ? 'Backup automático' : '—')

                                    return (
                                        <tr key={b.id} className="border-t">
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {formatDate(b.created_at)}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{userName}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${typeColor}`}
                                                >
                                                    {typeLabel}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {b.engine || ''}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {formatSize(b.size_bytes)}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${statusColor}`}
                                                >
                                                    {statusLabel}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleDownload(b.id, b.status)}
                                                    disabled={!statusOk}
                                                >
                                                    <Download className="w-4 h-4 mr-1" />
                                                    Baixar
                                                </Button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
