import { useEffect, useMemo, useState } from 'react'
import ReportShell from './components/ReportShell'
import { REPORTS } from './config'
import api from '@/services/api'

export default function MPs() {
  const baseReport = REPORTS.mps
  const [nomeOptions, setNomeOptions] = useState([])
  const [codigoOptions, setCodigoOptions] = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await api.getMateriasPrimas({ ordering: 'nome', page_size: 1000 })
        if (!alive) return
        const list = Array.isArray(r) ? r : (r?.results ?? [])
        setNomeOptions(list.map(x => ({ value: String(x.id), label: x.nome })))
        setCodigoOptions(list.map(x => ({ value: String(x.id), label: x.codigo_interno || `MP #${x.id}` })))
      } catch {
        if (!alive) return
        setNomeOptions([])
        setCodigoOptions([])
      }
    })()
    return () => { alive = false }
  }, [])

  const report = useMemo(() => {
    const optAll = [{ value: '__all__', label: 'Todos' }]
    const filters = baseReport.filters.map(f => {
      if (f.name === 'nome') return { ...f, type: 'select', options: optAll.concat(nomeOptions) }
      if (f.name === 'codigo_interno') return { ...f, type: 'select', options: optAll.concat(codigoOptions) }
      return f
    })
    return { ...baseReport, filters }
  }, [baseReport, nomeOptions, codigoOptions])

  return <ReportShell report={report} />
}
