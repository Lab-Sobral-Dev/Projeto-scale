// src/pages/LogsAuditoria.jsx
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listarLogs, exportarCsv } from "@/services/auditoria"
import { Download, RefreshCcw, Search } from "lucide-react"

const ACTIONS = ["request","create","update","delete","login","logout","token_refresh","label_print","error"]
const METHODS = ["GET","POST","PUT","PATCH","DELETE"]

export default function LogsAuditoria() {
  const [filters, setFilters] = useState({
    q: "", action: "", method: "", model: "", status_code: "", user: "", path: "",
    start: "", end: "", ordering: "-timestamp",
  })
  const [data, setData] = useState({ count: 0, results: [] })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const isHomolog = import.meta.env.VITE_APP_ENV === "homolog"

  useEffect(() => {
    if (!isHomolog) return
    fetchData(1) // carrega primeira página ao montar/alterar filtros
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.ordering]) // ordering muda menos; os demais filtros disparamos manualmente

  async function fetchData(pg = 1) {
    setLoading(true)
    try {
      const resp = await listarLogs({ filters, page: pg })
      setData(resp)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }

  function onApplyFilters(e) {
    e?.preventDefault?.()
    fetchData(1)
  }

  const totalPages = useMemo(() => {
    const pageSize = 50 // igual ao PAGE_SIZE do DRF
    return Math.max(1, Math.ceil((data?.count || 0) / pageSize))
  }, [data?.count])

  if (!isHomolog) {
    return (
      <Card>
        <CardHeader><CardTitle>Logs de Auditoria</CardTitle></CardHeader>
        <CardContent>Disponível apenas em homologação.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Logs de Auditoria (HML)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={onApplyFilters} className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Busca livre (path, model, object_pk, UA)…"
                  value={filters.q}
                  onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                />
                <Button type="submit" variant="secondary"><Search className="w-4 h-4" /></Button>
              </div>
            </div>

            <Select value={filters.action} onValueChange={v => setFilters(f => ({ ...f, action: v }))}>
              <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(todas)</SelectItem>
                {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.method} onValueChange={v => setFilters(f => ({ ...f, method: v }))}>
              <SelectTrigger><SelectValue placeholder="Método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(todos)</SelectItem>
                {METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Input
              placeholder="Modelo (ex.: Pesagem)"
              value={filters.model}
              onChange={e => setFilters(f => ({ ...f, model: e.target.value }))}
            />

            <Input
              placeholder="Status HTTP (ex.: 200)"
              value={filters.status_code}
              onChange={e => setFilters(f => ({ ...f, status_code: e.target.value }))}
            />

            <Input
              placeholder="User ID"
              value={filters.user}
              onChange={e => setFilters(f => ({ ...f, user: e.target.value }))}
            />

            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <Input
                type="datetime-local"
                value={filters.start}
                onChange={e => setFilters(f => ({ ...f, start: e.target.value }))}
                title="Início"
              />
              <Input
                type="datetime-local"
                value={filters.end}
                onChange={e => setFilters(f => ({ ...f, end: e.target.value }))}
                title="Fim"
              />
            </div>

            <Input
              placeholder="Path exato (opcional)"
              value={filters.path}
              onChange={e => setFilters(f => ({ ...f, path: e.target.value }))}
            />

            <Select value={filters.ordering} onValueChange={v => setFilters(f => ({ ...f, ordering: v }))}>
              <SelectTrigger><SelectValue placeholder="Ordenação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-timestamp">Mais recentes</SelectItem>
                <SelectItem value="timestamp">Mais antigos</SelectItem>
                <SelectItem value="-status_code">Status desc</SelectItem>
                <SelectItem value="status_code">Status asc</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                Aplicar
              </Button>
              <Button type="button" variant="outline" onClick={() => exportarCsv(data?.results || [])}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button type="button" variant="ghost" onClick={() => fetchData(page)} disabled={loading}>
                <RefreshCcw className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-center">
                <th className="px-2 py-2">Data/Hora</th>
                <th className="px-2 py-2">Usuário</th>
                <th className="px-2 py-2">IP</th>
                <th className="px-2 py-2">Método</th>
                <th className="px-2 py-2">Path</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Ação</th>
                <th className="px-2 py-2">Modelo</th>
                <th className="px-2 py-2">Objeto</th>
                <th className="px-2 py-2">Changes</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results || []).map((r) => (
                <tr key={`${r.timestamp}-${r.model}-${r.object_pk}-${Math.random()}`} className="border-b hover:bg-muted/40">
                  <td className="px-2 py-2 whitespace-nowrap text-center">
                    {new Date(r.timestamp).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-center">{r.user ?? "-"}</td>
                  <td className="px-2 py-2 text-center">{r.ip ?? "-"}</td>
                  <td className="px-2 py-2 text-center">{r.method}</td>
                  <td className="px-2 py-2">{r.path}</td>
                  <td className="px-2 py-2 text-center">{r.status_code ?? "-"}</td>
                  <td className="px-2 py-2 text-center">{r.action}</td>
                  <td className="px-2 py-2 text-center">{r.model || "-"}</td>
                  <td className="px-2 py-2 text-center">{r.object_pk || "-"}</td>
                  <td className="px-2 py-2">
                    <pre className="max-w-[340px] overflow-auto bg-muted/30 p-2 rounded text-xs">
                      {JSON.stringify(r.changes || r.extra || {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}

              {!loading && (data?.results || []).length === 0 && (
                <tr><td className="px-2 py-6 text-center" colSpan={10}>Sem registros</td></tr>
              )}
            </tbody>
          </table>

          {/* Paginação */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              {data?.count ?? 0} registro(s) • página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fetchData(Math.max(1, page - 1))}
                disabled={loading || page <= 1}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fetchData(Math.min(totalPages, page + 1))}
                disabled={loading || page >= totalPages}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
