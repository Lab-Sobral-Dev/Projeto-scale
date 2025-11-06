// src/services/reports.js
import api from './api' // reaproveita tryRefresh() e leitura de tokens

const API_BASE =
  (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/reports'

export function buildQuery(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    const s = String(v).trim()
    if (s !== '') q.append(k, s)
  })
  return q.toString()
}

// --- GET JSON de relatórios com Bearer + refresh 401 ---
export async function fetchReport(path, params = {}) {
  const qs = buildQuery(params)
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`

  // primeira tentativa com access atual
  let res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(api.access ? { Authorization: `Bearer ${api.access}` } : {}),
    },
  })

  // se 401 e houver refresh, tenta renovar e refazer
  if (res.status === 401 && api.refresh) {
    const ok = await api.tryRefresh()
    if (ok) {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(api.access ? { Authorization: `Bearer ${api.access}` } : {}),
        },
      })
    }
  }

  if (!res.ok) {
    const err = new Error(`Erro ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// --- Exporta CSV/PDF baixando com Bearer + filename do Content-Disposition ---
export async function openExport(path, params = {}, type = 'csv') {
  const qs = buildQuery({ ...params, export: type })
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`

  const call = async () => {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(api.access ? { Authorization: `Bearer ${api.access}` } : {}),
      },
    })
    if (!res.ok) {
      const err = new Error(`Erro ${res.status}`)
      err.status = res.status
      throw err
    }
    // captura nome sugerido pelo servidor
    const dispo = res.headers.get('Content-Disposition') || ''
    const match = dispo.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i)
    const rawName = decodeURIComponent((match && (match[1] || match[2])) || '')
    const fallback =
      rawName ||
      (type === 'pdf' ? 'relatorio.pdf' : 'relatorio.csv')

    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = fallback
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  }

  try {
    await call()
  } catch (e) {
    if (e?.status === 401 && api.refresh) {
      const ok = await api.tryRefresh()
      if (ok) {
        await call()
        return
      }
    }
    throw e
  }
}
