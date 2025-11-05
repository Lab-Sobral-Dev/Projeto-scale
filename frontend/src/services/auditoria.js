const API_BASE = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api')

// Monta querystring incluindo apenas filtros com valor não-vazio
function buildParams(filters = {}, page = 1) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== "" && v != null) {
      params.append(k, v)
    }
  }
  params.append("page", page)
  return params.toString()
}

/**
 * Lista logs de auditoria com todos os filtros suportados pelo backend.
 * @param {{filters: object, page: number}} opts
 */
export async function listarLogs({ filters, page = 1 }) {
  const token = localStorage.getItem("access") || ""
  const qs = buildParams(filters, page)
  const url = `${API_BASE}/registro/auditoria/?${qs}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    // retorna estrutura mínima para evitar quebra
    return { count: 0, results: [] }
  }
  return await res.json()
}

/**
 * Exporta CSV simples dos resultados visíveis na tabela.
 * (Somente client-side; para grandes volumes, ideal é endpoint server-side.)
 */
export function exportarCsv(rows = []) {
  if (!rows.length) return

  const headers = [
    "timestamp",
    "usuario",
    "ip",
    "method",
    "status_code",
    "action",
    "model",
    "object_pk",
    "path",
    "user_agent",
    "reason_key",
    "reason_label",
    "reason_note"
  ]

  const escape = (val) => {
    if (val == null) return ""
    const s = String(val).replace(/"/g, '""')
    return `"${s}"`
  }

  const lines = [headers.map(escape).join(",")]

  for (const r of rows) {
    // tentar resolver nome de usuário direto
    const usuario = r.user_name || r.user_display || r.username || r.user || ""

    // extrair motivo (se houver)
    const ch = r?.changes || {}
    const ex = r?.extra || {}
    const reason = ch.reason || ch.motivo || ch.motivo_edicao || ch.motivo_exclusao ||
                   ex.reason || ex.motivo || ex.motivo_edicao || ex.motivo_exclusao || ""
    const reason_label = ex.edit_reason_label || ex.delete_reason_label || ""
    const reason_note  = ch.reason_note || ch.motivo_obs || ch.motivo_observacao ||
                         ex.reason_note || ex.motivo_obs || ex.motivo_observacao || ex.edit_reason_note || ex.delete_reason_note || ""

    const row = [
      r.timestamp,
      usuario,
      r.ip ?? "",
      r.method ?? "",
      r.status_code ?? "",
      r.action ?? "",
      r.model ?? "",
      r.object_pk ?? "",
      r.path ?? "",
      r.user_agent ?? "",
      reason ?? "",
      reason_label ?? "",
      reason_note ?? ""
    ]
    lines.push(row.map(escape).join(","))
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `auditoria_${new Date().toISOString().slice(0,19).replace(/[:T]/g, "-")}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
