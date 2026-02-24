import ReportShell from './components/ReportShell'
import { REPORTS } from './config'

export default function BackupsReport() {
  return <ReportShell report={REPORTS.backups} />
}
