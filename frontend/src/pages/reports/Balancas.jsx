import { useEffect, useMemo, useState } from 'react'
import ReportShell from './components/ReportShell'
import { REPORTS } from './config'
import api from '@/services/api'

export default function Balancas() {
  const baseReport = REPORTS.balancas
  const [produtos, setProdutos] = useState([])
  const [mps, setMps] = useState([])
  const [balancas, setBalancas] = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [p, m, b] = await Promise.all([
          api.getProdutos({ ordering: 'nome', page_size: 1000 }),
          api.getMateriasPrimas({ ordering: 'nome', page_size: 1000 }),
          api.getBalancas({ ordering: 'nome', page_size: 1000 }),
        ])
        if (!alive) return
        const pList = Array.isArray(p) ? p : (p?.results ?? [])
        const mList = Array.isArray(m) ? m : (m?.results ?? [])
        const bList = Array.isArray(b) ? b : (b?.results ?? [])
        setProdutos(pList.map(x => ({ value: String(x.id), label: x.nome })))
        setMps(mList.map(x => ({ value: String(x.id), label: `${x.nome} (${x.codigo_interno})` })))
        setBalancas(bList.map(x => ({ value: String(x.id), label: x.nome })))
      } catch {
        if (!alive) return
        setProdutos([])
        setMps([])
        setBalancas([])
      }
    })()
    return () => { alive = false }
  }, [])

  const report = useMemo(() => {
    const optAll = [{ value: '__all__', label: 'Todos' }]
    const filters = baseReport.filters.map(f => {
      if (f.name === 'balanca') return { ...f, type: 'select', options: optAll.concat(balancas) }
      if (f.name === 'produto') return { ...f, type: 'select', options: optAll.concat(produtos) }
      if (f.name === 'materia_prima') return { ...f, type: 'select', options: optAll.concat(mps) }
      return f
    })
    return { ...baseReport, filters }
  }, [baseReport, balancas, produtos, mps])

  return <ReportShell report={report} />
}
