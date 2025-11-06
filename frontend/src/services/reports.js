// src/services/reports.js
const API_BASE =
  (import.meta.env?.VITE_API_BASE_URL || 'https://apiscale.laboratoriosobral.com.br/api') + '/reports';

export function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    q.append(k, v);
  });
  return q.toString();
}

export async function fetchReport(path, params = {}) {
  const qs = buildQuery(params);
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export function openExport(path, params = {}, type = 'csv') {
  const qs = buildQuery({ ...params, export: type });
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
  // abre em nova guia para forçar o download
  window.open(url, '_blank', 'noopener,noreferrer');
}
