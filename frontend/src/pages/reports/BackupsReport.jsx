import ReportShell from './components/ReportShell'
import { REPORTS } from './config'

export default function Backups() {
  return <ReportShell report={REPORTS.backups} />
}