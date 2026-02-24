// src/pages/ReportsHome.jsx
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Scale, Network, Layers, Package, FlaskConical,
  Users, ShieldCheck, FileWarning, DatabaseBackup,
  RotateCcw, ListChecks
} from 'lucide-react'
import { useMemo, useState } from 'react'

const CATEGORIES = [
  {
    title: 'Produção',
    descr: 'Relatórios operacionais do chão de fábrica.',
    items: [
      { label: 'Pesagens', href: '/relatorios/pesagens', icon: Scale, hint: 'Filtrar por OP, produto, período' },
      { label: 'Balanças', href: '/relatorios/balancas', icon: Network, hint: 'Conexões, status e leituras' },
      { label: 'Estrutura', href: '/relatorios/estrutura', icon: Layers, hint: 'BOM, itens e versões' },
    ],
  },
  {
    title: 'Cadastros',
    descr: 'Visões e conferências de catálogos.',
    items: [
      { label: 'Produtos', href: '/relatorios/produtos', icon: Package, hint: 'Lista, status e códigos internos' },
      { label: 'Matérias-Primas', href: '/relatorios/mps', icon: FlaskConical, hint: 'Ativos, códigos e vínculos' },
      { label: 'Usuários', href: '/relatorios/usuarios', icon: Users, hint: 'Perfis, acessos e atividade' },
      { label: 'Permissões', href: '/relatorios/permissoes', icon: ShieldCheck, hint: 'Papeis e telas liberadas' },
    ],
  },
  {
    title: 'Administração',
    descr: 'Rastreabilidade de ações e segurança.',
    items: [
      { label: 'Administração — Ações', href: '/relatorios/auditoria/acoes', icon: ListChecks, hint: 'Inserções, edições e exclusões com antes/depois' },
      { label: 'Administração — Erros/Login', href: '/relatorios/auditoria/auth', icon: FileWarning, hint: 'Tentativas de login com sucesso/falha e motivo' },
    ],
  },
  {
    title: 'Segurança & Continuidade',
    descr: 'Backup, restore e recuperação.',
    items: [
      { label: 'Backups', href: '/relatorios/backups', icon: DatabaseBackup, hint: 'Agendamentos e integridade' },
      { label: 'Restaurações', href: '/relatorios/restores', icon: RotateCcw, hint: 'Histórico de restores e origem' },
    ],
  },
]

function Section({ title, descr, items }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary" className="rounded-full">{items.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{descr}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map(({ label, href, icon: Icon, hint }) => (
          <Link key={href} to={href} className="group">
            <Card className="h-full transition-all hover:shadow-md hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 transition-colors group-hover:bg-primary/15">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <CardTitle className="text-base">{label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{hint || 'Visualize, filtre e exporte.'}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function ReportsHome() {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!q.trim()) return CATEGORIES
    const term = q.toLowerCase()
    return CATEGORIES.map(cat => ({
      ...cat,
      items: cat.items.filter(it =>
        it.label.toLowerCase().includes(term) ||
        (it.hint && it.hint.toLowerCase().includes(term)) ||
        cat.title.toLowerCase().includes(term)
      ),
    })).filter(cat => cat.items.length > 0)
  }, [q])

  const totalLinks = useMemo(
    () => CATEGORIES.reduce((acc, c) => acc + c.items.length, 0),
    []
  )

  return (
    <div className="space-y-6">
      {/* Header com gradiente sutil */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background to-muted p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Área de Relatórios</h1>
            <p className="text-sm text-muted-foreground">
              Selecione um relatório por categoria, filtre e exporte em CSV/PDF.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="rounded-full">
              {totalLinks} relatórios
            </Badge>
          </div>
        </div>
      </div>

      {/* Seções */}
      <div className="space-y-10">
        {filtered.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            Nada encontrado para <span className="font-semibold">“{q}”</span>. Limpe a busca ou tente outro termo.
          </div>
        ) : (
          filtered.map(cat => (
            <Section key={cat.title} title={cat.title} descr={cat.descr} items={cat.items} />
          ))
        )}
      </div>
    </div>
  )
}
