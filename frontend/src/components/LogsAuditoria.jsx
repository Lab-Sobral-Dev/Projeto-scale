// src/pages/LogsAuditoria.jsx
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listarLogs, exportarCsv } from "@/services/auditoria"
import { Download, RefreshCcw, Search } from "lucide-react"

const ACTIONS = ["request", "create", "update", "delete", "login", "logout", "token_refresh", "label_print", "error"]
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

// API base para buscar os motivos padronizados
const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const MOTIVOS_URL = `${API_BASE}/registro/pesagens/motivos/`

// helper: sentinela "__ALL__" -> string vazia
const mapAll = (v) => (v === "__ALL__" ? "" : v)

// extrai o melhor "display" para usuário
const userDisplay = (r) =>
  r.user_name || r.user_display || r.username || r.user || "-"

// Fortaleza
const tz = 'America/Fortaleza'
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { timeZone: tz }) } catch { return "-" }
}

// tenta extrair motivo/observação de várias formas possíveis (changes/extra)
function extractReason(record) {
  const c = record?.changes || {}
  const e = record?.extra || {}
  // chaves candidatas
  const reason =
    c.reason || c.motivo || c.motivo_edicao || c.motivo_exclusao ||
    e.reason || e.motivo || e.motivo_edicao || e.motivo_exclusao || ""
  const note =
    c.reason_note || c.motivo_obs || c.motivo_observacao ||
    e.reason_note || e.motivo_obs || e.motivo_observacao || ""
  return { reason: String(reason || ""), note: String(note || "") }
}

// badge helpers
const methodClass = (m) =>
  ({ GET: "bg-blue-50 text-blue-700", POST: "bg-green-50 text-green-700", PUT: "bg-amber-50 text-amber-700", PATCH: "bg-amber-50 text-amber-700", DELETE: "bg-red-50 text-red-700" }[m] || "bg-gray-50 text-gray-600")

const actionClass = (a) =>
  ({ update: "bg-amber-50 text-amber-700", delete: "bg-red-50 text-red-700", create: "bg-green-50 text-green-700", login: "bg-emerald-50 text-emerald-700", logout: "bg-slate-50 text-slate-700", error: "bg-rose-50 text-rose-700" }[a] || "bg-gray-50 text-gray-700")

const statusClass = (s) => {
  if (!s && s !== 0) return "bg-gray-50 text-gray-600"
  if (s >= 500) return "bg-rose-50 text-rose-700"
  if (s >= 400) return "bg-amber-50 text-amber-700"
  if (s >= 200) return "bg-green-50 text-green-700"
  return "bg-gray-50 text-gray-600"
}

export default function LogsAuditoria() {
  const [filters, setFilters] = useState({
    q: "", action: "", method: "", model: "", status_code: "", user: "", path: "",
    start: "", end: "", ordering: "-timestamp",
    reason: "" // novo: filtro por motivo
  })
  const [data, setData] = useState({ count: 0, results: [] })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // motivos carregados do backend
  const [motivosEdit, setMotivosEdit] = useState({})
  const [motivosDelete, setMotivosDelete] = useState({})
  const motivoOptions = useMemo(() => {
    // junta e remove duplicatas
    const merged = { ...motivosEdit, ...motivosDelete }
    // mantém "outro" por último
    const entries = Object.entries(merged).filter(([k]) => k && k !== "outro")
    entries.sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    if (merged.outro) entries.push(["outro", merged.outro])
    return entries
  }, [motivosEdit, motivosDelete])

  useEffect(() => {
    fetchData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.ordering])

  useEffect(() => {
    // carrega motivos de edição/exclusão para exibir/filtrar
    ; (async () => {
      try {
        const res = await fetch(MOTIVOS_URL, { headers: { Authorization: `Bearer ${localStorage.getItem('access') || ''}` } })
        if (!res.ok) return
        const json = await res.json()
        setMotivosEdit(json?.edit || {})
        setMotivosDelete(json?.delete || {})
      } catch { /* silencioso */ }
    })()
  }, [])

  async function fetchData(pg = 1) {
    setLoading(true)
    try {
      // Não alteramos o serviço; o filtro "reason" será aplicado client-side abaixo.
      const resp = await listarLogs({ filters, page: pg })
      // filtro por motivo (client-side) usando extractReason()
      let results = resp?.results || []
      if (filters.reason) {
        results = results.filter(r => extractReason(r).reason === filters.reason)
      }
      setData({ count: resp?.count ?? results.length, results })
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
    const pageSize = 50
    return Math.max(1, Math.ceil((data?.count || 0) / pageSize))
  }, [data?.count])

  // JSON colapsável
  const [openJson, setOpenJson] = useState({}) // key -> bool
  const toggleJson = (k) => setOpenJson(prev => ({ ...prev, [k]: !prev[k] }))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Logs de Auditoria</CardTitle>
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
                <Button type="submit" variant="secondary" disabled={loading}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Select
              value={filters.action || undefined}
              onValueChange={v => setFilters(f => ({ ...f, action: mapAll(v) }))}
            >
              <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">(todas)</SelectItem>
                {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={filters.method || undefined}
              onValueChange={v => setFilters(f => ({ ...f, method: mapAll(v) }))}
            >
              <SelectTrigger><SelectValue placeholder="Método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">(todos)</SelectItem>
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
              placeholder="Usuário (id/nome)"
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

            {/* Novo: filtro por motivo (edição/exclusão) */}
            <Select
              value={filters.reason || undefined}
              onValueChange={v => setFilters(f => ({ ...f, reason: mapAll(v) }))}
            >
              <SelectTrigger><SelectValue placeholder="Motivo (edição/exclusão)" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__ALL__">(todos)</SelectItem>
                {motivoOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.ordering}
              onValueChange={v => setFilters(f => ({ ...f, ordering: v }))}
            >
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
              <Button
                type="button"
                variant="outline"
                onClick={() => exportarCsv(data?.results || [])}
                disabled={loading || (data?.results || []).length === 0}
              >
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
                <th className="px-2 py-2">Motivo</th>
                <th className="px-2 py-2">Obs.</th>
                <th className="px-2 py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results || []).map((r, idx) => {
                const key = `${r.timestamp}-${r.model}-${r.object_pk}-${idx}`
                const { reason, note } = extractReason(r)
                // label amigável
                const label =
                  motivosEdit?.[reason] || motivosDelete?.[reason] || (reason ? String(reason) : "-")
                return (
                  <tr key={key} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 whitespace-nowrap text-center">{fmtDate(r.timestamp)}</td>
                    <td className="px-2 py-2 text-center">{userDisplay(r)}</td>
                    <td className="px-2 py-2 text-center">{r.ip ?? "-"}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded ${methodClass(r.method)}`}>{r.method}</span>
                    </td>
                    <td className="px-2 py-2">{r.path}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded ${statusClass(r.status_code)}`}>{r.status_code ?? "-"}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded ${actionClass(r.action)}`}>{r.action}</span>
                    </td>
                    <td className="px-2 py-2 text-center">{r.model || "-"}</td>
                    <td className="px-2 py-2 text-center">{r.object_pk || "-"}</td>

                    {/* Motivo / Obs */}
                    <td className="px-2 py-2 text-center">{label}</td>
                    <td className="px-2 py-2 text-center">
                      {note ? <span title={note} className="inline-block max-w-[220px] truncate align-middle">{note}</span> : "—"}
                    </td>

                    {/* JSON colapsável (changes/extra) */}
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleJson(key)}
                      >
                        {openJson[key] ? 'Ocultar' : 'Ver'}
                      </Button>
                      {openJson[key] && (
                        <pre className="mt-2 max-w-[420px] max-h-60 overflow-auto bg-muted/30 p-2 rounded text-xs">
                          {JSON.stringify(r.changes || r.extra || {}, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                )
              })}

              {!loading && (data?.results || []).length === 0 && (
                <tr><td className="px-2 py-6 text-center" colSpan={12}>Sem registros</td></tr>
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
