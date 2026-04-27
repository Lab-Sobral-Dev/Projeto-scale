// src/components/BackupConsole.jsx
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
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
    Filter,
    RotateCcw,
    AlertTriangle
} from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import api from '@/services/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

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
    const [restoring, setRestoring] = useState(false)

    const [filters, setFilters] = useState({
        status: 'all', // all | success | error
        trigger: 'all', // all | manual | automatic
        user: '',
        dateFrom: '',
        dateTo: ''
    })

    // --------- carga da lista ---------
    const load = async () => {
        setLoading(true)
        try {
            const data = await api.getBackups()
            setItems(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error('Erro ao carregar backups:', e)
            toast.error('Erro ao carregar lista de backups.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    // --------- executar backup ---------
    const handleExecuteBackup = async () => {
        setExecLoading(true)
        try {
            await api.executeBackup()
            toast.success('Backup iniciado/concluído com sucesso.')
            await load()
        } catch (e) {
            console.error('Erro ao executar backup:', e)
            const msg = e?.payload?.detail || e.message || 'Erro desconhecido'
            toast.error('Falha ao executar backup: ' + msg)
        } finally {
            setExecLoading(false)
        }
    }

    // --------- restaurar backup ---------
    const handleRestore = async (id) => {
        setRestoring(true)
        try {
            await api.restoreBackup(id)
            toast.success('Sistema restaurado com sucesso! A página será recarregada para aplicar os dados antigos.')
            window.location.reload()
        } catch (e) {
            console.error('Erro ao restaurar:', e)
            const msg = e?.payload?.detail || e.message || 'Erro desconhecido'
            toast.error('ERRO CRÍTICO AO RESTAURAR: ' + msg)
        } finally {
            setRestoring(false)
        }
    }

    // --------- download com Authorization (sem redirecionar) ---------
    const handleDownload = async (id, status) => {
        if (status !== 'success') {
            toast.warning('Somente backups com status OK podem ser baixados.')
            return
        }

        const token = api.access
        if (!token) {
            toast.error('Sessão expirada. Faça login novamente.')
            return
        }

        const url = `${API_BASE_URL}/registro/backups/${id}/download/`

        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })

            if (!res.ok) {
                const text = await res.text()
                console.error('Falha no download do backup:', res.status, text)
                throw new Error(`Erro HTTP ${res.status}`)
            }

            const blob = await res.blob()

            // tenta pegar nome do arquivo do header, senão usa um padrão
            const disp = res.headers.get('Content-Disposition') || ''
            let filename = 'backup.dump'
            const match = /filename="?([^"]+)"?/i.exec(disp)
            if (match && match[1]) {
                filename = match[1]
            }

            const blobUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(blobUrl)
        } catch (e) {
            console.error('Erro ao baixar backup:', e)
            toast.error('Erro ao baixar backup.')
        }
    }

    // --------- filtros ---------
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
            if (filters.status !== 'all' && b.status !== filters.status) {
                return false
            }

            // trigger_type (manual/automatic)
            const trig = b.trigger_type || 'manual'
            if (filters.trigger !== 'all' && trig !== filters.trigger) {
                return false
            }

            // usuário
            const userName = (b.executed_by_name || '').toLowerCase()
            const userFilter = filters.user.trim().toLowerCase()
            if (userFilter && !userName.includes(userFilter)) {
                return false
            }

            // período
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

    // --------- render ---------
    return (
        <div className="space-y-4">
            <Card className="border-t-4 border-t-blue-600">
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

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button disabled={execLoading || loading}>
                                    <PlayCircle className="w-4 h-4 mr-2" />
                                    {execLoading ? 'Executando…' : 'Backup agora'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Executar backup completo</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Deseja realmente executar um backup completo agora? O processo pode levar alguns instantes.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleExecuteBackup}>
                                        Confirmar
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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
                                    <th className="text-left px-3 py-2 font-medium">Banco</th>
                                    <th className="text-left px-3 py-2 font-medium">Usuário</th>
                                    <th className="text-left px-3 py-2 font-medium">Tipo</th>
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
                                            colSpan={8}
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

                                    const dbAlias = b.db_alias || 'default'
                                    const dbLabel = dbAlias === 'hml' ? 'Homologação' : 'Produção'
                                    const dbColor = dbAlias === 'hml' ? 'bg-purple-600' : 'bg-teal-700'

                                    return (
                                        <tr key={b.id} className="border-t">
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {formatDate(b.created_at)}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${dbColor}`}>
                                                    {dbLabel}
                                                </span>
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
                                                {formatSize(b.size_bytes)}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${statusColor}`}
                                                >
                                                    {statusLabel}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleDownload(b.id, b.status)}
                                                    disabled={!statusOk}
                                                >
                                                    <Download className="w-4 h-4 mr-1" />
                                                    Baixar
                                                </Button>

                                                {/* BOTÃO RESTAURAR */}
                                                {statusOk && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button size="sm" variant="destructive">
                                                                <RotateCcw className="w-4 h-4 mr-1" />
                                                                Restaurar
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                                                                    <AlertTriangle className="w-6 h-6" />
                                                                    Perigo: Restaurar Banco de Dados
                                                                </AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Você está prestes a restaurar o backup de <strong>{formatDate(b.created_at)}</strong>.
                                                                    <br /><br />
                                                                    <span className="font-bold text-red-600">
                                                                        OS DADOS ATUAIS SERÃO SUBSTITUÍDOS!
                                                                    </span>
                                                                    <br />
                                                                    Um backup de segurança será criado automaticamente antes da restauração,
                                                                    mas o sistema "voltará no tempo" para esta data.
                                                                    <br />
                                                                    Esta ação é crítica. Tem certeza?
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    className="bg-red-600 hover:bg-red-700"
                                                                    onClick={() => handleRestore(b.id)}
                                                                    disabled={restoring}
                                                                >
                                                                    {restoring ? 'Restaurando...' : 'Sim, Restaurar'}
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
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
