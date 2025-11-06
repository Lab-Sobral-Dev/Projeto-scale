// src/pages/reports/Index.jsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { REPORTS } from './config'

const LINKS = [
  ['Pesagens', '/relatorios/pesagens'],
  ['Lotes', '/relatorios/lotes'],
  ['Balanças', '/relatorios/balancas'],
  ['Produtos', '/relatorios/produtos'],
  ['Matérias-Primas', '/relatorios/mps'],
  ['Estrutura', '/relatorios/estrutura'],
  ['Usuários', '/relatorios/usuarios'],
  ['Permissões', '/relatorios/permissoes'],
  ['Auditoria — Ações', '/relatorios/auditoria/acoes'],
  ['Auditoria — Exclusões', '/relatorios/auditoria/exclusoes'],
  ['Auditoria — Erros/Login', '/relatorios/auditoria/auth'],
  ['Backups', '/relatorios/backups'],
  ['Restaurações', '/relatorios/restores'],
]

export default function ReportsHome() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {LINKS.map(([label, href]) => (
        <Link key={href} to={href}>
          <Card className="hover:shadow-md transition">
            <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Visualize, filtre e exporte em CSV ou PDF.
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
