// src/services/auditoria.js
import api from "@/services/api"

// Transforma um objeto de filtros em params de query
function buildParams(filters = {}, page = 1) {
  const params = { page }

  // filtros nativos do ViewSet: action, model, status_code, user, path, method, object_pk
  if (filters.action) params.action = filters.action
  if (filters.model) params.model = filters.model
  if (filters.status_code) params.status_code = filters.status_code
  if (filters.user) params.user = filters.user
  if (filters.method) params.method = filters.method
  if (filters.path) params.path = filters.path

  // Busca livre (SearchFilter) — procura em user_agent, path, model, object_pk
  if (filters.q) params.search = filters.q

  // Ordenação
  if (filters.ordering) params.ordering = filters.ordering // exemplo: "-timestamp"

  // Faixa de datas (se você habilitar no backend com django-filter)
  // Opção A (mais simples): usar lookups gte/lte
  if (filters.start) params["timestamp__gte"] = new Date(filters.start).toISOString()
  if (filters.end)   params["timestamp__lte"] = new Date(filters.end).toISOString()

  return params
}

export async function listarLogs({ filters, page = 1 }) {
  const params = buildParams(filters, page)
  const { data } = await api.get("/auditoria/", { params })
  return data // DRF: {count, next, previous, results}
}

export function exportarCsv(registros) {
  const headers = [
    "timestamp","user","ip","method","path","status_code",
    "action","model","object_pk","changes","extra","user_agent"
  ]
  const rows = registros.map(r => ([
    r.timestamp,
    r.user, // pode ser id; exiba como está vindo do backend
    r.ip,
    r.method,
    r.path,
    r.status_code,
    r.action,
    r.model,
    r.object_pk,
    JSON.stringify(r.changes ?? {}),
    JSON.stringify(r.extra ?? {}),
    (r.user_agent || "").replaceAll(/[\r\n]+/g, " "),
  ]))

  const csv = [headers.join(","), ...rows.map(arr => arr.map(val => {
    // aspas e vírgulas seguras
    const v = (val ?? "").toString().replaceAll('"','""')
    return `"${v}"`
  }).join(","))].join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `audit_logs_${new Date().toISOString().slice(0,19).replaceAll(":","-")}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
