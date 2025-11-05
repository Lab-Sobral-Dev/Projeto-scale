import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { listarLogs, exportarCsv } from "@/services/auditoria"
import { Download, RefreshCcw, Search, Filter } from "lucide-react"

const ACTIONS = ["request", "create", "update", "delete", "login", "logout", "token_refresh", "label_print", "error"]
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')
const MOTIVOS_URL = `${API_BASE}/registro/pesagens/motivos/`
const USERS_URL = `${API_BASE}/usuarios/usuarios/`

const mapAll = (v) => (v === "__ALL__" ? "" : v)

const tz = 'America/Fortaleza'
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { timeZone: tz }) } catch { return "-" } }

function extractReason(record) {
  const c = record?.changes || {}
  const e = record?.extra || {}
  const reason =
    c.reason || c.motivo || c.motivo_edicao || c.motivo_exclusao ||
    e.reason || e.motivo || e.motivo_edicao || e.motivo_exclusao || ""
  const note =
    c.reason_note || c.motivo_obs || c.motivo_observacao ||
    e.reason_note || e.motivo_obs || e.motivo_observacao || ""
  return { reason: String(reason || ""), note: String(note || "") }
}

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
    // básicos
    q: "", action: "", method: "", model: "", status_code: "", user: "", path: "",
    start: "", end: "", ordering: "-timestamp", reason: "",
    // avançados (agora suportados pelo backend)
    action_group: "",          // seguranca, dados, request, impressao, erro
    status_group: "",          // 2xx, 4xx, 5xx, none
    anon: "",                  // sim, nao
    has_reason: "",            // sim, nao
    has_changes: "",           // sim, nao
    has_extra: "",             // sim, nao
    path_contains: "",         // substring
    ua_contains: "",           // substring user agent
    ip: "",                    // exato
    object_pk: "",             // exato
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [data, setData] = useState({ count: 0, results: [] })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [motivosEdit, setMotivosEdit] = useState({})
  const [motivosDelete, setMotivosDelete] = useState({})
  const motivoOptions = useMemo(() => {
    const merged = { ...motivosEdit, ...motivosDelete }
    const entries = Object.entries(merged).filter(([k]) => k && k !== "outro")
    entries.sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    if (merged.outro) entries.push(["outro", merged.outro])
    return entries
  }, [motivosEdit, motivosDelete])

  const [usersMap, setUsersMap] = useState(new Map())

  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const openDetails = (r) => { setSelected(r); setDetailOpen(true) }

  useEffect(() => { fetchData(1) }, [filters.ordering])

  useEffect(() => {
    (async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('access') || ''}` }
        // Motivos
        const res = await fetch(MOTIVOS_URL, { headers })
        if (res.ok) {
          const json = await res.json()
          setMotivosEdit(json?.edit || {})
          setMotivosDelete(json?.delete || {})
        }
        // Usuários (map id->nome)
        const ur = await fetch(USERS_URL, { headers })
        if (ur.ok) {
          const uj = await ur.json()
          const list = Array.isArray(uj) ? uj : (uj?.results ?? [])
          const mp = new Map()
          for (const u of list) {
            const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || String(u.id)
            mp.set(String(u.id), name)
          }
          setUsersMap(mp)
        }
      } catch { /* silencioso */ }
    })()
  }, [])

  async function fetchData(pg = 1) {
    setLoading(true)
    try {
      // Agora o backend filtra tudo. Só encaminhamos os filtros “as is”.
      const resp = await listarLogs({ filters, page: pg })
      setData({ count: resp?.count ?? 0, results: resp?.results ?? [] })
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }

  function onApplyFilters(e) { e?.preventDefault?.(); fetchData(1) }

  const totalPages = useMemo(() => {
    const pageSize = 50
    return Math.max(1, Math.ceil((data?.count || 0) / pageSize))
  }, [data?.count])

  const userDisplay = (r) => {
    const direct = r.user_name || r.user_display || r.username
    if (direct) return direct
    const idStr = r.user != null ? String(r.user) : ""
    if (idStr && usersMap.has(idStr)) return usersMap.get(idStr)
    return idStr || "-"
  }

  const reasonLabel = (reason) =>
    motivosEdit?.[reason] || motivosDelete?.[reason] || (reason ? String(reason) : "—")

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Logs de Auditoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={onApplyFilters} className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {/* Linha 1 */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Busca livre (path, model, objeto, UA)…"
                  value={filters.q}
                  onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                />
                <Button type="submit" variant="secondary" disabled={loading}>
                  <Search className="w-4 h-4" />
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAdvanced(v => !v)}>
                  <Filter className="w-4 h-4 mr-1" /> {showAdvanced ? "Ocultar" : "Avançados"}
                </Button>
              </div>
            </div>

            <Select value={filters.action || undefined} onValueChange={v => setFilters(f => ({ ...f, action: mapAll(v) }))}>
              <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">(todas)</SelectItem>
                {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.method || undefined} onValueChange={v => setFilters(f => ({ ...f, method: mapAll(v) }))}>
              <SelectTrigger><SelectValue placeholder="Método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">(todos)</SelectItem>
                {METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Input placeholder="Modelo (ex.: Pesagem)" value={filters.model} onChange={e => setFilters(f => ({ ...f, model: e.target.value }))} />
            <Input placeholder="Status HTTP (ex.: 200)" value={filters.status_code} onChange={e => setFilters(f => ({ ...f, status_code: e.target.value }))} />
            <Input placeholder="Usuário (id/nome)" value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} />

            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <Input type="datetime-local" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} title="Início" />
              <Input type="datetime-local" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} title="Fim" />
            </div>

            <Input placeholder="Path exato (opcional)" value={filters.path} onChange={e => setFilters(f => ({ ...f, path: e.target.value }))} />

            <Select value={filters.reason || undefined} onValueChange={v => setFilters(f => ({ ...f, reason: mapAll(v) }))}>
              <SelectTrigger><SelectValue placeholder="Motivo (edição/exclusão)" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__ALL__">(todos)</SelectItem>
                {motivoOptions.map(([key, label]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={filters.ordering} onValueChange={v => setFilters(f => ({ ...f, ordering: v }))}>
              <SelectTrigger><SelectValue placeholder="Ordenação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-timestamp">Mais recentes</SelectItem>
                <SelectItem value="timestamp">Mais antigos</SelectItem>
                <SelectItem value="-status_code">Status desc</SelectItem>
                <SelectItem value="status_code">Status asc</SelectItem>
              </SelectContent>
            </Select>

            {/* -------- Filtros Avançados (colapsáveis) -------- */}
            {showAdvanced && (
              <>
                <Select value={filters.action_group || undefined} onValueChange={v => setFilters(f => ({ ...f, action_group: mapAll(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Grupo de ação" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">(todos)</SelectItem>
                    <SelectItem value="seguranca">Segurança (login/logout/token)</SelectItem>
                    <SelectItem value="dados">Dados (create/update/delete)</SelectItem>
                    <SelectItem value="request">Request</SelectItem>
                    <SelectItem value="impressao">Impressão</SelectItem>
                    <SelectItem value="erro">Erro</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.status_group || undefined} onValueChange={v => setFilters(f => ({ ...f, status_group: mapAll(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Faixa de status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">(todas)</SelectItem>
                    <SelectItem value="2xx">2xx</SelectItem>
                    <SelectItem value="4xx">4xx</SelectItem>
                    <SelectItem value="5xx">5xx</SelectItem>
                    <SelectItem value="none">Sem status</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.anon || undefined} onValueChange={v => setFilters(f => ({ ...f, anon: mapAll(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Anonimato" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">(todos)</SelectItem>
                    <SelectItem value="sim">Somente anônimo</SelectItem>
                    <SelectItem value="nao">Somente autenticado</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.has_reason || undefined} onValueChange={v => setFilters(f => ({ ...f, has_reason: mapAll(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Possui motivo?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">(todos)</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.has_changes || undefined} onValueChange={v => setFilters(f => ({ ...f, has_changes: mapAll(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Possui changes?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">(todos)</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.has_extra || undefined} onValueChange={v => setFilters(f => ({ ...f, has_extra: mapAll(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Possui extra?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">(todos)</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>

                <Input placeholder="Path contém…" value={filters.path_contains} onChange={e => setFilters(f => ({ ...f, path_contains: e.target.value }))} />
                <Input placeholder="User-Agent contém…" value={filters.ua_contains} onChange={e => setFilters(f => ({ ...f, ua_contains: e.target.value }))} />
                <Input placeholder="IP (exato)" value={filters.ip} onChange={e => setFilters(f => ({ ...f, ip: e.target.value }))} />
                <Input placeholder="Objeto (PK)" value={filters.object_pk} onChange={e => setFilters(f => ({ ...f, object_pk: e.target.value }))} />
              </>
            )}

            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={loading}>Aplicar</Button>
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

      {/* Lista + Modal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {loading ? "Carregando…" : `Resultados (${data?.count ?? 0})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-center">
                <th className="px-2 py-2">Data/Hora</th>
                <th className="px-2 py-2">Usuário</th>
                <th className="px-2 py-2">Método</th>
                <th className="px-2 py-2">Path</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Ação</th>
                <th className="px-2 py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results || []).map((r, idx) => {
                const key = `${r.timestamp}-${r.model}-${r.object_pk}-${idx}`
                return (
                  <tr key={key} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 whitespace-nowrap text-center">{fmtDate(r.timestamp)}</td>
                    <td className="px-2 py-2 text-center">{userDisplay(r)}</td>
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
                    <td className="px-2 py-2 text-center">
                      <Button type="button" variant="outline" size="sm" onClick={() => openDetails(r)}>Ver</Button>
                    </td>
                  </tr>
                )
              })}
              {!loading && (data?.results || []).length === 0 && (
                <tr><td className="px-2 py-6 text-center" colSpan={7}>Sem registros</td></tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              {data?.count ?? 0} registro(s) • página {page} de {Math.max(1, Math.ceil((data?.count || 0) / 50))}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => fetchData(Math.max(1, page - 1))} disabled={loading || page <= 1}>Anterior</Button>
              <Button type="button" variant="outline" onClick={() => fetchData(page + 1)} disabled={loading || (page * 50) >= (data?.count || 0)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de detalhes */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="!w-[98vw] sm:!max-w-[98vw] lg:!max-w-[1600px] max-h-[95vh] p-8 rounded-xl">
          <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
            <DialogTitle>Detalhes do Log</DialogTitle>
            <DialogDescription>Informações completas do registro selecionado.</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[74vh] pr-1">
            {selected && (
              <div className="space-y-3">
                {/* Linha 1 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><div className="text-xs text-muted-foreground">Data/Hora</div><div className="font-medium">{fmtDate(selected.timestamp)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Usuário</div><div className="font-medium">{userDisplay(selected)}</div></div>
                  <div><div className="text-xs text-muted-foreground">IP</div><div className="font-medium">{selected.ip || "—"}</div></div>
                </div>

                {/* Linha 2 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><div className="text-xs text-muted-foreground">Método</div><div className={`inline-flex px-2 py-0.5 rounded ${methodClass(selected.method)}`}>{selected.method}</div></div>
                  <div><div className="text-xs text-muted-foreground">Status</div><div className={`inline-flex px-2 py-0.5 rounded ${statusClass(selected.status_code)}`}>{selected.status_code ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Ação</div><div className={`inline-flex px-2 py-0.5 rounded ${actionClass(selected.action)}`}>{selected.action}</div></div>
                </div>

                {/* Path, Modelo, Objeto */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-3">
                    <div className="text-xs text-muted-foreground">Path</div>
                    <div className="font-mono text-xs bg-muted/30 rounded px-2 py-1 overflow-x-auto">{selected.path}</div>
                  </div>
                  <div><div className="text-xs text-muted-foreground">Modelo</div><div className="font-medium">{selected.model || "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Objeto (PK)</div><div className="font-medium">{selected.object_pk || "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">User-Agent</div><div className="text-xs break-words">{selected.user_agent || "—"}</div></div>
                </div>

                {/* Motivo + Observação (quando houver) */}
                {(() => {
                  const { reason, note } = extractReason(selected)
                  const label = reasonLabel(reason)
                  if (!reason && !note) return null
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Motivo</div>
                        <div className="font-medium">{label}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs text-muted-foreground">Observação</div>
                        <div className="text-sm">{note || "—"}</div>
                      </div>
                    </div>
                  )
                })()}

                {/* Changes / Extra */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Changes</div>
                    <pre className="text-xs bg-muted/30 rounded p-2 max-h-[40vh] overflow-auto">
                      {JSON.stringify(selected.changes || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Extra</div>
                    <pre className="text-xs bg-muted/30 rounded p-2 max-h-[40vh] overflow-auto">
                      {JSON.stringify(selected.extra || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
