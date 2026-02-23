import { useEffect, useMemo, useState } from 'react'
import ReportShell from './components/ReportShell'
import { REPORTS } from './config'
import api from '@/services/api'

export default function Estrutura() {
  const baseReport = REPORTS.estrutura
  const [produtos, setProdutos] = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const p = await api.getProdutos({ ordering: 'nome', page_size: 1000 })
        if (!alive) return
        const list = Array.isArray(p) ? p : (p?.results ?? [])
        setProdutos(list.map(x => ({ value: String(x.id), label: x.nome })))
      } catch {
        if (alive) setProdutos([])
      }
    })()
    return () => { alive = false }
  }, [])

  const report = useMemo(() => {
    const optAll = [{ value: '__all__', label: 'Todos' }]
    const filters = baseReport.filters.map(f => (
      f.name === 'produto' ? { ...f, type: 'select', options: optAll.concat(produtos) } : f
    ))
    return { ...baseReport, filters }
  }, [baseReport, produtos])

  return <ReportShell report={report} />
}
