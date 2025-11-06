// src/pages/reports/AuditoriaAcoes.jsx
import ReportShell from './components/ReportShell'
import { REPORTS } from './config'

export default function AuditoriaAcoes() {
  return <ReportShell report={REPORTS.aud_acoes} />
}
