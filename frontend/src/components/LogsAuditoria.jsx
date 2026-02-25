// src/pages/LogsAuditoria.jsx
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { listarLogs, exportarCsv } from "@/services/auditoria"
import { fetchReport, openExport } from "@/services/reports"
import { Download, FileDown, RefreshCcw, Search, XCircle } from "lucide-react"

const mapAll = (v) => (v === "__ALL__" ? "" : v)

const tz = "America/Fortaleza"
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: tz })
  } catch {
    return "-"
  }
}

const initialFilters = {
  start: "",
  end: "",
  user: "",
  action: "",
  model: "",
  reason: "",
  q: "",
  ordering: "-timestamp",
}

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

const actionLabel = (a) =>
  ({ create: "Cadastro", update: "Atualização", delete: "Exclusão", login: "Login", logout: "Logout", request: "Acesso", token_refresh: "Renovação de sessão", label_print: "Impressão", error: "Erro" }[a] || (a || "—"))

const statusClass = (s) => {
  if (!s && s !== 0) return "bg-gray-50 text-gray-600"
  if (s >= 500) return "bg-rose-50 text-rose-700"
  if (s >= 400) return "bg-amber-50 text-amber-700"
  if (s >= 200) return "bg-green-50 text-green-700"
  return "bg-gray-50 text-gray-600"
}

const roleLabel = (raw) => {
  const key = String(raw || "").toLowerCase().trim()
  return ({ admin: "Administrador", supervisor: "Supervisor", operador: "Operador" }[key] || "—")
}

export default function LogsAuditoria() {
  const [filters, setFilters] = useState(initialFilters)
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
  const [dynamicOptions, setDynamicOptions] = useState({ action: [], model: [] })
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const openDetails = (r) => { setSelected(r); setDetailOpen(true) }

  useEffect(() => { fetchData(1) }, [filters.ordering])

  useEffect(() => {
    (async () => {
      try {
        const API_BASE = (import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000/api")
        const headers = { Authorization: `Bearer ${localStorage.getItem("access") || ""}` }

        const [motivosRes, usersRes, dynRes] = await Promise.all([
          fetch(`${API_BASE}/registro/pesagens/motivos/`, { headers }),
          fetch(`${API_BASE}/usuarios/usuarios/`, { headers }),
          fetchReport("/auditoria/logs-sistema/", { meta: "filters" }),
        ])

        if (motivosRes?.ok) {
          const json = await motivosRes.json()
          setMotivosEdit(json?.edit || {})
          setMotivosDelete(json?.delete || {})
        }

        if (usersRes?.ok) {
          const uj = await usersRes.json()
          const list = Array.isArray(uj) ? uj : (uj?.results ?? [])
          const mp = new Map()
          for (const u of list) {
            const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || String(u.id)
            mp.set(String(u.id), name)
          }
          setUsersMap(mp)
        }

        setDynamicOptions({
          action: dynRes?.action || [],
          model: dynRes?.model || [],
        })
      } catch {
        setDynamicOptions({ action: [], model: [] })
      }
    })()
  }, [])

  async function fetchData(pg = 1) {
    setLoading(true)
    try {
      const cleaned = {}
      for (const k of ["q", "action", "model", "user", "ordering"]) {
        if (filters[k]) cleaned[k] = filters[k]
      }

      if (filters.start) cleaned.start = `${filters.start}T00:00:00`
      if (filters.end) cleaned.end = `${filters.end}T23:59:59`

      const resp = await listarLogs({ filters: cleaned, page: pg })
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

  function onApplyFilters(e) { e?.preventDefault?.(); fetchData(1) }
  function onClearFilters() { setFilters(initialFilters); fetchData(1) }

  const userDisplay = (r) => {
    const direct = r.user_name || r.user_display || r.username
    if (direct) return direct
    const idStr = r.user != null ? String(r.user) : ""
    if (idStr && usersMap.has(idStr)) return usersMap.get(idStr)
    return idStr || "Sistema"
  }

  const userProfile = (r) => roleLabel(r.user_role || r.role || r.papel)

  const reasonLabel = (reason) =>
    motivosEdit?.[reason] || motivosDelete?.[reason] || (reason ? String(reason) : "—")

  const humanDetails = (r) => {
    const extra = r.extra || {}
    const model = r.model || "registro"
    const obj = r.object_pk || "sem identificação"
    const { reason, note } = extractReason(r)

    if (r.action === "login") {
      if ((r.status_code || 0) < 400 && r.status_code != null) {
        return `Usuário ${userDisplay(r)} realizou login com sucesso no sistema.`
      }
      return `Tentativa de login não concluída para ${extra.username || "usuário informado"}: ${extra.reason || "usuário ou senha incorretos"}.`
    }

    if (r.action === "logout") return `Usuário ${userDisplay(r)} encerrou a sessão no sistema.`

    if (r.action === "create") return `Foi realizado um novo cadastro em ${model} (ID ${obj}).`

    if (r.action === "update") {
      const fields = Object.keys(r.changes || {}).length
      const motivoTxt = reason ? ` Motivo informado: ${reasonLabel(reason)}.` : ""
      return `Foi realizada atualização em ${model} (ID ${obj}) com ${fields} campo(s) alterado(s).${motivoTxt}`
    }

    if (r.action === "delete") {
      const motivoTxt = reason ? ` Motivo informado: ${reasonLabel(reason)}.` : ""
      return `Foi realizada exclusão de registro em ${model} (ID ${obj}).${motivoTxt}`
    }

    if (r.action === "error") {
      return `Sistema registrou uma ocorrência de erro${extra?.error ? `: ${extra.error}` : "."}`
    }

    if (note) return `Ação registrada no sistema. Observação: ${note}`
    return r.path ? `Ação registrada na funcionalidade ${r.path}.` : "Evento registrado no sistema."
  }

  async function onExportPdf() {
    const params = {
      data_inicial: filters.start || undefined,
      data_final: filters.end || undefined,
      usuario: filters.user || undefined,
      action: filters.action || undefined,
      model: filters.model || undefined,
    }
    await openExport("/auditoria/logs-sistema/", params, "pdf")
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Logs de Auditoria do Sistema</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={onApplyFilters} className="grid grid-cols-1 md:grid-cols-8 gap-4">
            <div className="md:col-span-2">
              <Label className="mb-1 block">Data inicial</Label>
              <Input type="date" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1 block">Data final</Label>
              <Input type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1 block">Usuário</Label>
              <Input
                placeholder="id, login ou nome"
                value={filters.user}
                onChange={e => setFilters(f => ({ ...f, user: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1 block">Ação</Label>
              <Select value={filters.action || "__ALL__"} onValueChange={v => setFilters(f => ({ ...f, action: mapAll(v) }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="(todas)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">(todas)</SelectItem>
                  {dynamicOptions.action.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1 block">Módulo / Modelo</Label>
              <Select value={filters.model || "__ALL__"} onValueChange={v => setFilters(f => ({ ...f, model: mapAll(v) }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="(todos)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">(todos)</SelectItem>
                  {dynamicOptions.model.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1 block">Motivo</Label>
              <Select value={filters.reason || "__ALL__"} onValueChange={v => setFilters(f => ({ ...f, reason: mapAll(v) }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="(todos)" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__ALL__">(todos)</SelectItem>
                  {motivoOptions.map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-4">
              <Label className="mb-1 block">Busca</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="modelo, id, IP, usuário..."
                  value={filters.q}
                  onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                />
                <Button type="submit" variant="secondary" disabled={loading}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1 block">Ordenação</Label>
              <Select value={filters.ordering} onValueChange={v => setFilters(f => ({ ...f, ordering: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="-timestamp">Mais recentes</SelectItem>
                  <SelectItem value="timestamp">Mais antigos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-8 flex justify-end flex-wrap gap-2">
              <Button type="submit" disabled={loading}>Aplicar</Button>
              <Button type="button" variant="outline" onClick={onClearFilters} disabled={loading}>
                <XCircle className="w-4 h-4 mr-1" /> Limpar
              </Button>
              <Button type="button" variant="outline" onClick={() => exportarCsv(data?.results || [])} disabled={loading || (data?.results || []).length === 0}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button type="button" variant="outline" onClick={onExportPdf} disabled={loading}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button type="button" variant="ghost" onClick={() => fetchData(page)} disabled={loading}>
                <RefreshCcw className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{loading ? "Carregando…" : `Resultados (${data?.count ?? 0})`}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-center bg-muted/40">
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">Data e Hora</th>
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">Perfil</th>
                <th className="px-2 py-2">IP de Origem</th>
                <th className="px-2 py-2">Ação Realizada</th>
                <th className="px-2 py-2 text-left">Detalhes</th>
                <th className="px-2 py-2">Mais</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results || []).map((r, idx) => {
                const key = `${r.id || idx}-${r.timestamp}-${r.action}`
                return (
                  <tr key={key} className="border-b hover:bg-muted/30 align-top">
                    <td className="px-2 py-2 text-center font-medium">{String(r.id || idx + 1).padStart(5, "0")}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-center">{fmtDate(r.timestamp)}</td>
                    <td className="px-2 py-2 text-center">{userDisplay(r)}</td>
                    <td className="px-2 py-2 text-center">{userProfile(r)}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{r.ip || "—"}</td>
                    <td className="px-2 py-2 text-center">
                      <div className="space-y-1">
                        <span className={`inline-flex px-2 py-0.5 rounded ${actionClass(r.action)}`}>{actionLabel(r.action)}</span>
                        <div><span className={`inline-flex px-2 py-0.5 rounded ${statusClass(r.status_code)}`}>{r.status_code ?? "-"}</span></div>
                      </div>
                    </td>
                    <td className="px-2 py-2 max-w-[480px] whitespace-normal">{humanDetails(r)}</td>
                    <td className="px-2 py-2 text-center"><Button type="button" variant="outline" size="sm" onClick={() => openDetails(r)}>Ver</Button></td>
                  </tr>
                )
              })}
              {!loading && (data?.results || []).length === 0 && (
                <tr><td className="px-2 py-6 text-center" colSpan={8}>Sem registros</td></tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">{data?.count ?? 0} registro(s) • página {page} de {Math.max(1, Math.ceil((data?.count || 0) / 50))}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => fetchData(Math.max(1, page - 1))} disabled={loading || page <= 1}>Anterior</Button>
              <Button type="button" variant="outline" onClick={() => fetchData(page + 1)} disabled={loading || (page * 50) >= (data?.count || 0)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="!w-[98vw] sm:!max-w-[98vw] lg:!max-w-[1300px] max-h-[95vh] p-6 rounded-xl">
          <DialogHeader className="sticky top-0 bg-background z-10 pb-4 border-b">
            <DialogTitle>Detalhes da ocorrência</DialogTitle>
            <DialogDescription>
              Informações organizadas para leitura rápida de auditoria.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[76vh] pr-1">
            {selected && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="text-xs text-muted-foreground mb-1">Resumo da ação</div>
                  <div className="text-sm font-medium leading-6">{humanDetails(selected)}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Data/Hora</div>
                    <div className="font-medium mt-1">{fmtDate(selected.timestamp)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Nome</div>
                    <div className="font-medium mt-1">{userDisplay(selected)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Perfil</div>
                    <div className="font-medium mt-1">{userProfile(selected)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">IP de origem</div>
                    <div className="font-medium mt-1">{selected.ip || "—"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Ação</div>
                    <div className={`inline-flex mt-1 px-2 py-0.5 rounded ${actionClass(selected.action)}`}>{actionLabel(selected.action)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Método HTTP</div>
                    <div className={`inline-flex mt-1 px-2 py-0.5 rounded ${methodClass(selected.method)}`}>{selected.method || "—"}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Status da operação</div>
                    <div className={`inline-flex mt-1 px-2 py-0.5 rounded ${statusClass(selected.status_code)}`}>{selected.status_code ?? "—"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-3 rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Rota / funcionalidade</div>
                    <div className="font-mono text-xs bg-muted/40 rounded px-2 py-1 mt-1 overflow-x-auto">{selected.path || "—"}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Módulo</div>
                    <div className="font-medium mt-1">{selected.model || "—"}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Registro (ID)</div>
                    <div className="font-medium mt-1">{selected.object_pk || "—"}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Navegador (User-Agent)</div>
                    <div className="text-xs mt-1 break-words">{selected.user_agent || "—"}</div>
                  </div>
                </div>

                {(() => {
                  const { reason, note } = extractReason(selected)
                  const label = reasonLabel(reason)
                  if (!reason && !note) return null
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Motivo informado</div>
                        <div className="font-medium mt-1">{label}</div>
                      </div>
                      <div className="md:col-span-2 rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Observação complementar</div>
                        <div className="text-sm mt-1">{note || "—"}</div>
                      </div>
                    </div>
                  )
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground mb-1">Dados brutos — Alterações (Changes)</div>
                    <pre className="text-xs bg-muted/40 rounded p-2 max-h-[34vh] overflow-auto">
                      {JSON.stringify(selected.changes || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground mb-1">Dados brutos — Informações extras (Extra)</div>
                    <pre className="text-xs bg-muted/40 rounded p-2 max-h-[34vh] overflow-auto">
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