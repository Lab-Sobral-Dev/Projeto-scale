// src/pages/Sobre.jsx
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Factory, Scale, History, Printer, Package, Layers, ListChecks,
  FileText, ShieldCheck, RefreshCw, Server, Database, Settings, Info
} from 'lucide-react'

/**
 * Helpers de ambiente/versão
 */
const getAmbiente = () => {
  // Use a env se existir; senão, tenta inferir pelo host
  const env = import.meta.env?.VITE_APP_ENV
  if (env) return env
  const host = window.location.hostname.toLowerCase()
  if (host.includes('hml') || host.includes('homolog')) return 'Homologação'
  return 'Produção'
}

const getVersao = () =>
  import.meta.env?.VITE_APP_VERSION || 'v1.0.0'

const getBuildDate = () => {
  const raw = import.meta.env?.VITE_BUILD_DATE
  if (!raw) return '—'
  const d = new Date(raw)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })
}

const Sobre = () => {
  const ambiente = getAmbiente()
  const versao = getVersao()
  const buildDate = getBuildDate()

  const pilares = useMemo(() => ([
    {
      title: 'Registro de Pesagens',
      desc: 'Interface rápida para lançar bruto, tara e cálculo automático do líquido com regras de validação.',
      icon: Scale,
      color: 'text-blue-600'
    },
    {
      title: 'Etiquetas Automáticas',
      desc: 'Geração de etiquetas prontas para impressão a partir dos dados da pesagem e da OP.',
      icon: Printer,
      color: 'text-rose-600'
    },
    {
      title: 'Histórico e Auditoria',
      desc: 'Consulta por Produto, MP, OP, Lote e Data, com rastreabilidade do operador e data/hora.',
      icon: History,
      color: 'text-emerald-600'
    },
    {
      title: 'Cadastro Padronizado',
      desc: 'Produtos e matérias-primas com campos-chave, ativos/inativos e integração futura.',
      icon: Package,
      color: 'text-purple-600'
    },
    {
      title: 'Estruturas e OPs',
      desc: 'Criação de OP a partir da estrutura do produto e acompanhamento de progresso por itens.',
      icon: ListChecks,
      color: 'text-indigo-600'
    },
    {
      title: 'Camadas e Processos',
      desc: 'Fluxos claros entre cadastro, pesagem, etiqueta e histórico — tudo conectado.',
      icon: Layers,
      color: 'text-orange-600'
    },
  ]), [])

  const stack = useMemo(() => ([
    { title: 'Backend', desc: 'Django + Django REST Framework', icon: Server },
    { title: 'Frontend', desc: 'React + Vite (componentes shadcn/ui)', icon: Settings },
    { title: 'Banco de Dados', desc: 'PostgreSQL (ou SQLite em dev)', icon: Database },
    { title: 'Segurança', desc: 'Autenticação JWT e perfis de acesso', icon: ShieldCheck },
    { title: 'Deploy', desc: 'Nginx + Gunicorn (SSL e proxy)', icon: RefreshCw },
    { title: 'Documentação', desc: 'Escopo, telas e requisitos do projeto', icon: FileText },
  ]), [])

  const acoesRapidas = useMemo(() => ([
    { title: 'Nova Pesagem', to: '/nova-pesagem', icon: Scale, color: 'bg-blue-500 hover:bg-blue-600' },
    { title: 'Histórico', to: '/historico', icon: History, color: 'bg-green-500 hover:bg-green-600' },
    { title: 'Ordens de Produção', to: '/ops', icon: Factory, color: 'bg-indigo-500 hover:bg-indigo-600' },
    { title: 'Nova OP', to: '/ops/nova', icon: ListChecks, color: 'bg-rose-500 hover:bg-rose-600' },
  ]), [])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Info className="h-6 w-6 text-gray-700" />
            Sobre o Sistema de Gerenciamento de Pesagem
          </h1>
          <p className="text-gray-600 mt-1">
            Plataforma web para digitalizar e padronizar o processo de pesagem de matérias-primas,
            com foco em rastreabilidade, usabilidade e conformidade.
          </p>
        </div>
        <div className="text-right">
          <Card className="min-w-[220px]">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Ambiente</p>
              <p className="text-sm font-semibold text-gray-900">{ambiente}</p>
              <div className="mt-2 h-px bg-gray-200" />
              <p className="mt-2 text-xs text-gray-500">Versão</p>
              <p className="text-sm font-semibold text-gray-900">{versao}</p>
              <p className="mt-1 text-xs text-gray-500">Build</p>
              <p className="text-xs text-gray-800">{buildDate}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Missão / Escopo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-gray-900">Missão</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-gray-700 leading-relaxed">
              Garantir que cada pesagem seja <span className="font-semibold">rápida, precisa e auditável</span>,
              reduzindo erros manuais, padronizando cadastros e gerando etiquetas automaticamente para
              o fluxo de produção.
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-gray-900">Em resumo</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-gray-700">
            <ul className="list-disc list-inside space-y-1">
              <li>Cadastro de produtos e MPs padronizado</li>
              <li>Registro de pesagens com cálculo automático</li>
              <li>Etiquetas em PDF para impressão imediata</li>
              <li>Histórico filtrável e rastreável</li>
              <li>OPs a partir de estruturas de produto</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Pilares (funcionalidades-chave) */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Funcionalidades-chave</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {pilares.map((p, i) => {
            const Icon = p.icon
            return (
              <Card key={i} className="hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0`}>
                      <Icon className={`h-8 w-8 ${p.color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{p.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{p.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Fluxo do usuário */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-gray-900">Boas Práticas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-gray-700">
            <ul className="list-disc list-inside space-y-1">
              <li>Manter cadastros de Produto/MP atualizados</li>
              <li>Validar tara e checagem do equipamento</li>
              <li>Respeitar perfis de acesso (operador/admin)</li>
              <li>Registrar ajustes no histórico para auditoria</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Contato / suporte interno */}
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <CardTitle className="text-gray-900">Equipe & Suporte</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-gray-700">
          <p className="mb-3">
            Para dúvidas, melhorias e relatos de bugs, utilize o canal interno da TI/Qualidade ou abra um ticket.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default Sobre
