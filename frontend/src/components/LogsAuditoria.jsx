import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import api from "@/services/api"
import { listarLogs, exportarCsv } from "@/services/auditoria"
import { fetchReport, openExport } from "@/services/reports"
import { Download, FileDown, RefreshCcw, Search, XCircle, User, Terminal, Fingerprint, Info } from "lucide-react"

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
  ({ GET: "bg-blue-50 text-blue-700 border-blue-200", POST: "bg-green-50 text-green-700 border-green-200", PUT: "bg-amber-50 text-amber-700 border-amber-200", PATCH: "bg-amber-50 text-amber-700 border-amber-200", DELETE: "bg-red-50 text-red-700 border-red-200" }[m] || "bg-gray-50 text-gray-600")

const actionClass = (a) =>
  ({ update: "bg-amber-50 text-amber-700", delete: "bg-red-50 text-red-700", create: "bg-green-50 text-green-700", login: "bg-emerald-50 text-emerald-700", logout: "bg-slate-50 text-slate-700", error: "bg-rose-50 text-rose-700" }[a] || "bg-gray-50 text-gray-700")

const actionLabel = (a) =>
  ({ create: "Cadastro", update: "Atualização", delete: "Exclusão", login: "Login", logout: "Logout", request: "Acesso", token_refresh: "Renovação de sessão", label_print: "Impressão", error: "Erro" }[a] || (a || "—"))

const statusClass = (s) => {
  if (!s && s !== 0) return "bg-gray-100 text-gray-600"
  if (s >= 500) return "bg-red-100 text-red-700"
  if (s >= 400) return "bg-orange-100 text-orange-700"
  if (s >= 200) return "bg-emerald-100 text-emerald-700"
  return "bg-gray-100 text-gray-600"
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

  const [usersMeta, setUsersMeta] = useState(new Map())
  const [dynamicOptions, setDynamicOptions] = useState({ usuario: [], action: [], model: [] })
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const openDetails = (r) => { setSelected(r); setDetailOpen(true) }

  useEffect(() => { fetchData(1) }, [filters.ordering])

  useEffect(() => {
    (async () => {
      try {
        const [motivosJson, uj, dynRes] = await Promise.all([
          api.get('/registro/pesagens/motivos/').catch(() => null),
          api.get('/usuarios/usuarios/').catch(() => null),
          fetchReport("/auditoria/logs-sistema/", { meta: "filters" }),
        ])

        if (motivosJson) {
          setMotivosEdit(motivosJson?.edit || {})
          setMotivosDelete(motivosJson?.delete || {})
        }

        if (uj) {
          const list = Array.isArray(uj) ? uj : (uj?.results ?? [])
          const mp = new Map()
          for (const u of list) {
            const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || String(u.id)
            mp.set(String(u.id), { name, papel: u.papel || "" })
          }
          setUsersMeta(mp)
        }

        setDynamicOptions({
          usuario: dynRes?.usuario || [],
          action: dynRes?.action || [],
          model: dynRes?.model || [],
        })
      } catch {
        setDynamicOptions({ usuario: [], action: [], model: [] })
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
    if (idStr && usersMeta.has(idStr)) return usersMeta.get(idStr)?.name || idStr
    return idStr || "Sistema"
  }

  const userProfile = (r) => {
    const idStr = r.user != null ? String(r.user) : ""
    const papelFromMap = idStr && usersMeta.has(idStr) ? usersMeta.get(idStr)?.papel : ""
    return roleLabel(r.user_role || r.role || r.papel || papelFromMap)
  }

  const describeRouteAction = (r) => {
    const actor = userDisplay(r)
    const path = String(r?.path || "").toLowerCase()
    if (!path) return `${actor} realizou uma ação no sistema.`

    const routes = [
      { key: "/auditoria", text: `${actor} acessou a página de auditoria.` },
      { key: "/nova-pesagem", text: `${actor} acessou a tela de nova pesagem.` },
      { key: "/registro/pesagens", text: `${actor} registrou ou consultou informações de pesagem.` },
      { key: "/pesagens/", text: `${actor} consultou ou atualizou uma pesagem.` },
      { key: "/ops", text: `${actor} acessou informações de ordens de produção (OP).` },
      { key: "/usuarios", text: `${actor} consultou ou atualizou dados de usuários.` },
      { key: "/materias-primas", text: `${actor} consultou ou atualizou dados de matérias-primas.` },
      { key: "/produtos", text: `${actor} consultou ou atualizou dados de produtos.` },
      { key: "/balancas", text: `${actor} consultou ou atualizou dados de balanças.` },
      { key: "/estrutura", text: `${actor} consultou ou atualizou estruturas de produto.` },
      { key: "/historico", text: `${actor} acessou a página de histórico.` },
      { key: "/relatorios", text: `${actor} acessou a área de relatórios.` },
      { key: "/auth/login", text: `${actor} tentou autenticar no sistema.` },
      { key: "/auth/refresh", text: `${actor} renovou a sessão de acesso.` },
    ]

    const found = routes.find((x) => path.includes(x.key))
    if (found) return found.text
    return `${actor} executou uma ação na funcionalidade ${r.path}.`
  }

  const reasonLabel = (reason) =>
    motivosEdit?.[reason] || motivosDelete?.[reason] || (reason ? String(reason) : "—")

  const formatChanges = (r) => {
    const changes = r.changes || {}
    const entries = Object.entries(changes).filter(([f]) => !f.includes('motivo') && !f.includes('reason'))
    if (!entries.length || !['create', 'update', 'delete'].includes(r.action)) return <span className="text-slate-400 text-xs">—</span>

    const fmt = (v) => v == null ? '∅' : (typeof v === 'object' ? JSON.stringify(v) : String(v))

    return (
      <div className="flex flex-col gap-0.5">
        {entries.map(([field, value]) => {
          if (r.action === 'update' && Array.isArray(value) && value.length === 2) {
            return (
              <span key={field} className="font-mono text-[10px] leading-tight">
                <span className="text-blue-600 font-bold">{field}:</span>{' '}
                <span className="text-red-600">{fmt(value[0])}</span>
                <span className="text-slate-400"> → </span>
                <span className="text-emerald-600">{fmt(value[1])}</span>
              </span>
            )
          }
          return (
            <span key={field} className="font-mono text-[10px] leading-tight">
              <span className="text-blue-600 font-bold">{field}:</span>{' '}
              <span className="text-slate-600">{fmt(value)}</span>
            </span>
          )
        })}
      </div>
    )
  }

  const humanDetails = (r) => {
    const extra = r.extra || {}
    const model = r.model || "registro"
    const obj = r.object_pk || "sem identificação"
    const { reason, note } = extractReason(r)

    if (r.action === "login") {
      if ((r.status_code || 0) < 400 && r.status_code != null) {
        return `Usuário ${userDisplay(r)} realizou login com sucesso.`
      }
      return `Tentativa de login não concluída para ${extra.username || "usuário"}: ${extra.reason || "falha na autenticação"}.`
    }
    if (r.action === "logout") return `Usuário ${userDisplay(r)} encerrou a sessão.`
    if (r.action === "create") return `Novo cadastro em ${model} (ID ${obj}).`
    if (r.action === "update") {
      const fields = Object.keys(r.changes || {}).length
      const motivoTxt = reason ? ` Motivo: ${reasonLabel(reason)}.` : ""
      return `Atualização em ${model} (ID ${obj}) com ${fields} campo(s) alterado(s).${motivoTxt}`
    }
    if (r.action === "delete") {
      const motivoTxt = reason ? ` Motivo: ${reasonLabel(reason)}.` : ""
      return `Exclusão de registro em ${model} (ID ${obj}).${motivoTxt}`
    }
    if (r.action === "error") {
      return `Erro registrado pelo sistema${extra?.error ? `: ${extra.error}` : "."}`
    }
    if (note) return `Ação registrada. Obs: ${note}`
    return describeRouteAction(r)
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
              <Select value={filters.user || "__ALL__"} onValueChange={v => setFilters(f => ({ ...f, user: mapAll(v) }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="(todos)" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__ALL__">(todos)</SelectItem>
                  {dynamicOptions.usuario.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <th className="px-2 py-2 text-left">Ação e Detalhes</th>
                <th className="px-2 py-2 text-left">Alterações</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Mais</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results || []).map((r, idx) => {
                const key = `${r.id || idx}-${r.timestamp}-${r.action}`
                return (
                  <tr key={key} className="border-b hover:bg-muted/30 align-top">
                    <td className="px-2 py-2 text-center font-medium font-mono text-xs">{String(r.id || idx + 1).padStart(5, "0")}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-center text-xs">{fmtDate(r.timestamp)}</td>
                    <td className="px-2 py-2 text-center font-medium">{userDisplay(r)}</td>
                    <td className="px-2 py-2 text-center text-xs text-muted-foreground">{userProfile(r)}</td>
                    <td className="px-2 py-2 max-w-[400px]">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${actionClass(r.action)}`}>
                          {actionLabel(r.action)}
                        </span>
                        <span className="text-slate-600 leading-snug">{humanDetails(r)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 max-w-[260px]">
                      {formatChanges(r)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-mono text-xs border ${statusClass(r.status_code)}`}>
                        {r.status_code ?? "-"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Button type="button" variant="outline" size="sm" onClick={() => openDetails(r)} className="h-8">Ver</Button>
                    </td>
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

      {/* MODAL DE DETALHES AJUSTADO */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="!w-[98vw] sm:!max-w-[98vw] lg:!max-w-[1000px] max-h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-none shadow-2xl">
          <DialogHeader className="p-6 bg-gray-700 text-white">
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
                  <Terminal className="w-5 h-5 text-blue-400" />
                  Detalhes do Log #{String(selected?.id).padStart(5, "0")}
                </DialogTitle>
                <DialogDescription className="text-slate-400 mt-1">
                  Rastreabilidade do evento registrado em {selected && fmtDate(selected.timestamp)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto p-6 bg-slate-50/50 flex-1">
            {selected && (
              <div className="space-y-6">
                {/* Resumo e Status */}
                <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-3 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-blue-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Descrição do Evento</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed font-medium">
                      {humanDetails(selected)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-center items-center text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Código HTTP</span>
                    <div className={`px-4 py-2 rounded-full font-bold text-lg border ${statusClass(selected.status_code)}`}>
                      {selected.status_code || "—"}
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Ator */}
                  <section className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 px-1">
                      <User className="w-3.5 h-3.5 text-blue-500" /> Ator do Evento
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white border rounded-lg shadow-sm">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Usuário</p>
                        <p className="font-semibold text-slate-800 truncate">{userDisplay(selected)}</p>
                      </div>
                      <div className="p-3 bg-white border rounded-lg shadow-sm">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Perfil</p>
                        <p className="font-semibold text-slate-800">{userProfile(selected)}</p>
                      </div>
                      <div className="p-3 bg-white border rounded-lg shadow-sm col-span-2">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Endereço IP</p>
                        <p className="font-mono text-sm text-slate-600">{selected.ip || "Não identificado"}</p>
                      </div>
                    </div>
                  </section>

                  {/* Contexto */}
                  <section className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 px-1">
                      <Fingerprint className="w-3.5 h-3.5 text-amber-500" /> Localização Técnica
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white border rounded-lg shadow-sm">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Módulo/Tabela</p>
                        <p className="font-semibold text-slate-800 uppercase text-xs">{selected.model || "—"}</p>
                      </div>
                      <div className="p-3 bg-white border rounded-lg shadow-sm">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">ID do Objeto</p>
                        <p className="font-semibold text-slate-800">#{selected.object_pk || "—"}</p>
                      </div>
                      <div className="p-3 bg-white border rounded-lg shadow-sm col-span-2">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Método e Rota</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${methodClass(selected.method)}`}>{selected.method}</span>
                          <p className="font-mono text-[11px] text-slate-500 truncate">{selected.path || "—"}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Justificativa (se houver) */}
                {(() => {
                  const { reason, note } = extractReason(selected)
                  const label = reasonLabel(reason)
                  if (!reason && !note) return null
                  return (
                    <section className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase px-1">Justificativa Registrada</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-lg border bg-amber-50/50 border-amber-100 p-3 shadow-sm">
                          <p className="text-[10px] text-amber-600 uppercase font-bold">Motivo</p>
                          <p className="font-semibold text-slate-800 mt-1">{label}</p>
                        </div>
                        <div className="md:col-span-2 rounded-lg border bg-white p-3 shadow-sm">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Observação Complementar</p>
                          <p className="text-sm text-slate-700 mt-1">{note || "—"}</p>
                        </div>
                      </div>
                    </section>
                  )
                })()}

                {/* Tabela de Alterações de Dados */}
                {selected.changes && Object.keys(selected.changes).length > 0 && (
                  <section className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2 px-1">
                      <RefreshCcw className="w-3.5 h-3.5 text-emerald-500" /> Alterações de Dados (Diff)
                    </h4>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-md">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 border-b">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-600 uppercase">Campo Modificado</th>
                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-red-500 uppercase">Valor Anterior</th>
                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-emerald-600 uppercase">Valor Novo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(selected.changes).map(([field, value]) => {
                            if (field.includes('motivo') || field.includes('reason')) return null;

                            let before = null
                            let after = null

                            if (Array.isArray(value) && value.length === 2) {
                              before = value[0]
                              after = value[1]
                            } else if (value !== null && typeof value === 'object' && ('old' in value || 'new' in value)) {
                              before = value.old ?? null
                              after = value.new ?? null
                            } else if (selected.action === 'create') {
                              after = value
                            } else if (selected.action === 'delete') {
                              before = value
                            } else {
                              after = value
                            }

                            const fmt = (v) => v == null ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v))

                            return (
                              <tr key={field} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-[11px] text-blue-700 bg-blue-50/20 w-1/4 border-r font-bold">{field}</td>
                                <td className="px-4 py-2.5 border-r bg-red-50/30">
                                  <span className="text-red-700 font-mono text-xs break-all">{fmt(before)}</span>
                                </td>
                                <td className="px-4 py-2.5 bg-emerald-50/30">
                                  <span className="text-emerald-700 font-mono text-xs break-all">{fmt(after)}</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Dados Brutos colapsáveis */}
                <section className="pt-2">
                  <details className="group border rounded-lg bg-white overflow-hidden shadow-sm">
                    <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Payload Completo (JSON Extra)</span>
                      <div className="text-slate-400 group-open:rotate-180 transition-transform text-[10px]">▼</div>
                    </summary>
                    <div className="p-4 border-t bg-slate-900 overflow-x-auto">
                      <pre className="text-[11px] font-mono text-emerald-400 leading-relaxed">
                        {JSON.stringify(selected.extra || {}, null, 2)}
                      </pre>
                    </div>
                  </details>
                </section>
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t flex justify-end gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
            <Button variant="outline" onClick={() => setDetailOpen(false)} className="px-6 font-semibold">
              Fechar Relatório
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}