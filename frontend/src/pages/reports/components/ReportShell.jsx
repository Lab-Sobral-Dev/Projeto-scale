// src/pages/reports/components/ReportShell.jsx
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchReport, openExport } from '@/services/reports'
import { Download, RefreshCcw, Search } from 'lucide-react'

export default function ReportShell({ report }) {
    const [params, setParams] = useState({})
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState({ results: [], count: 0, next: null, previous: null })
    const [page, setPage] = useState(1)

    const isPaginated = useMemo(() => typeof data?.results !== 'undefined', [data])
    const rows = isPaginated ? (data.results || []) : (Array.isArray(data) ? data : [])

    function setParam(name, value) {
        setParams(prev => ({ ...prev, [name]: value }))
    }

    async function load(p = 1) {
        setLoading(true)
        try {
            const res = await fetchReport(report.path, { ...params, page: p })
            setData(res)
            setPage(p)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load(1) }, []) // carrega inicial

    function clearFilters() {
        setParams({})
    }

    function onExport(type) {
        openExport(report.path, params, type)
    }

    const Icon = report.primaryIcon

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        {Icon ? <Icon className="w-5 h-5" /> : null}
                        <CardTitle>{report.title}</CardTitle>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onExport('csv')}>
                            <Download className="w-4 h-4 mr-2" /> CSV
                        </Button>
                        <Button variant="outline" onClick={() => onExport('pdf')}>
                            <Download className="w-4 h-4 mr-2" /> PDF
                        </Button>
                        <Button onClick={() => load(1)}>
                            <RefreshCcw className="w-4 h-4 mr-2" /> Recarregar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Filtros */}
                    <form className="grid md:grid-cols-4 gap-3 mb-4">
                        {report.filters?.map((f) => (
                            <div key={f.name} className="space-y-1">
                                <Label htmlFor={f.name}>{f.label}</Label>
                                {f.type === 'select' ? (
                                    <Select value={params[f.name] ?? ''} onValueChange={v => setParam(f.name, v)}>
                                        <SelectTrigger id={f.name}>
                                            <SelectValue placeholder="Selecione" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(f.options || []).map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        id={f.name}
                                        type={f.type}
                                        value={params[f.name] ?? ''}
                                        onChange={e => setParam(f.name, e.target.value)}
                                        placeholder={f.placeholder || ''}
                                    />
                                )}
                            </div>
                        ))}
                    </form>

                    <div className="flex justify-between mb-3">
                        <div className="text-sm text-muted-foreground">
                            {loading ? 'Carregando…' : isPaginated ? `Total: ${data.count || rows.length}` : `Registros: ${rows.length}`}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={clearFilters}>Limpar</Button>
                            <Button onClick={() => load(1)}>
                                <Search className="w-4 h-4 mr-2" /> Aplicar
                            </Button>
                        </div>
                    </div>

                    {/* Tabela */}
                    <div className="overflow-auto rounded border">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-muted">
                                    {report.columns.map(col => (
                                        <th key={col.key} className="text-left px-3 py-2 font-medium">{col.header}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && !loading ? (
                                    <tr><td className="px-3 py-3 text-muted-foreground" colSpan={report.columns.length}>Nenhum registro.</td></tr>
                                ) : rows.map((row, idx) => (
                                    <tr key={idx} className="border-t">
                                        {report.columns.map(col => {
                                            let val = row[col.key];
                                            if (typeof val === 'boolean') val = val ? 'Sim' : 'Não';
                                            if (val === null || val === undefined) val = '';
                                            return <td key={col.key} className="px-3 py-2">{String(val)}</td>
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginação simples (quando houver results/count) */}
                    {isPaginated && (
                        <div className="flex items-center justify-end gap-2 mt-3">
                            <Button variant="outline" disabled={!data.previous || loading} onClick={() => load(Math.max(1, page - 1))}>Anterior</Button>
                            <span className="text-sm">Página {page}</span>
                            <Button variant="outline" disabled={!data.next || loading} onClick={() => load(page + 1)}>Próxima</Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
