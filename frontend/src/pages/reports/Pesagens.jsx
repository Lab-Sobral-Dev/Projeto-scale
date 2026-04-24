// src/pages/reports/Pesagens.jsx
import { useEffect, useMemo, useState } from 'react'
import ReportShell from './components/ReportShell'
import { REPORTS } from './config'
import api from '@/services/api'


export default function Pesagens() {
  const baseReport = REPORTS.pesagens
  const [produtos, setProdutos] = useState([])
  const [mps, setMps] = useState([])
  const [balancas, setBalancas] = useState([])
  const [operadores, setOperadores] = useState([])
  const [loadingOpts, setLoadingOpts] = useState(true)

  useEffect(() => {
    let alive = true
      ; (async () => {
        try {
          setLoadingOpts(true)
          // produtos
          const p = await api.getProdutos({ ordering: 'nome', page_size: 1000 })
          const pList = Array.isArray(p) ? p : (p?.results ?? [])
          // MPs
          const m = await api.getMateriasPrimas({ ordering: 'nome', page_size: 1000 })
          const mList = Array.isArray(m) ? m : (m?.results ?? [])
          // balanças
          const b = await api.getBalancas({ ordering: 'nome', page_size: 1000 })
          const bList = Array.isArray(b) ? b : (b?.results ?? [])
          const opRaw = await api.getPesadores().catch(() => [])
          const opList = Array.isArray(opRaw) ? opRaw : []

          if (!alive) return
          setProdutos(pList.map(x => ({ value: String(x.id), label: x.nome })))
          setMps(mList.map(x => ({ value: String(x.id), label: `${x.nome} (${x.codigo_interno})` })))
          setBalancas(bList.map(x => ({ value: String(x.id), label: x.nome })))
          setOperadores(opList.map(n => ({ value: String(n), label: String(n) })))
        } finally {
          if (alive) setLoadingOpts(false)
        }
      })()
    return () => { alive = false }
  }, [])

  // Clona o report base e injeta opções nos filtros solicitados
  const hydratedReport = useMemo(() => {
    const optAll = [{ value: '__all__', label: 'Todos' }]

    const filters = baseReport.filters.map(f => {
      // Mapear por name original do config:
      // produto, materia_prima, operador, balanca
      if (f.name === 'produto') {
        return { ...f, type: 'select', options: optAll.concat(produtos) }
      }
      if (f.name === 'materia_prima') {
        return { ...f, type: 'select', options: optAll.concat(mps) }
      }
      if (f.name === 'operador') {
        return { ...f, type: 'select', options: optAll.concat(operadores) }
      }
      if (f.name === 'balanca') {
        return { ...f, type: 'select', options: optAll.concat(balancas) }
      }
      return f
    })

    // Exportação — PDF em A4 paisagem com fonte reduzida
    const exportParams = {
      pdf: { paper: 'A4', orientation: 'landscape', font_size: '9' },
      csv: {}, // nada especial
    }

    return { ...baseReport, filters, exportParams }
  }, [baseReport, produtos, mps, operadores, balancas])

  return <ReportShell report={hydratedReport} />
}
