// src/pages/Sobre.jsx
import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Info, Scale, Printer, History, Package, Layers, ListChecks } from 'lucide-react'

/**
 * Helpers de ambiente/versão
 */
const getAmbiente = () => {
    const env = import.meta.env?.VITE_APP_ENV
    if (env) return env
    const host = window.location.hostname.toLowerCase()
    if (host.includes('hml') || host.includes('homolog')) return 'Homologação'
    return 'Produção'
}

const getVersao = () => import.meta.env?.VITE_APP_VERSION || 'v1.0.0'

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
            color: 'text-blue-600',
        },
        {
            title: 'Etiquetas Automáticas',
            desc: 'Geração de etiquetas prontas para impressão a partir dos dados da pesagem e da OP.',
            icon: Printer,
            color: 'text-rose-600',
        },
        {
            title: 'Histórico e Auditoria',
            desc: 'Consulta por Produto, MP, OP, Lote e Data, com rastreabilidade do operador e data/hora.',
            icon: History,
            color: 'text-emerald-600',
        },
        {
            title: 'Cadastro Padronizado',
            desc: 'Produtos e matérias-primas com campos-chave, ativos/inativos e integração futura.',
            icon: Package,
            color: 'text-purple-600',
        },
        {
            title: 'Estruturas e OPs',
            desc: 'Criação de OP a partir da estrutura do produto e acompanhamento de progresso por itens.',
            icon: ListChecks,
            color: 'text-indigo-600',
        },
        {
            title: 'Camadas e Processos',
            desc: 'Fluxos claros entre cadastro, pesagem, etiqueta e histórico — tudo conectado.',
            icon: Layers,
            color: 'text-orange-600',
        },
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
            </div>

            {/* Missão / Em resumo */}
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

            {/* Funcionalidades-chave */}
            <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Funcionalidades-chave</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {pilares.map((p, i) => {
                        const Icon = p.icon
                        return (
                            <Card key={i} className="hover:shadow-lg transition-all">
                                <CardContent className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0">
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

            {/* Boas Práticas — Largura total */}
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

            {/* Ambiente / Versão — Largura total e logo abaixo das Boas Práticas */}
            <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                    <CardTitle className="text-gray-900">Ambiente & Versão</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                            <p className="text-xs text-gray-500">Ambiente</p>
                            <p className="font-semibold text-gray-900">{ambiente}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Versão</p>
                            <p className="font-semibold text-gray-900">{versao}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Equipe & Suporte */}
            <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                    <CardTitle className="text-gray-900">Suporte</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-gray-700">
                    <p className="mb-3">
                        Para dúvidas, melhorias e relatos de bugs, entre em contato com a equipe de TI.
                    </p>
                </CardContent>
            </Card>

            {/* Desenvolvedores */}
            <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                    <CardTitle className="text-gray-900">Desenvolvedores</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-gray-700 space-y-3">
                    <div>
                        <p className="font-semibold text-gray-900">Daniel de Sousa Barbosa</p>
                        <p className="text-sm">Analista e Desenvolvedor de Sistemas</p>
                        <p className="text-sm">Especialista em Segurança da Informação</p>
                    </div>
                    <div>
                        <p className="font-semibold text-gray-900">Hian Claudio de Sousa Costa</p>
                        <p className="text-sm">Analista e Desenvolvedor de Sistemas</p>
                        <p className="text-sm">Especialista em Projetos de Cloud Computing</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default Sobre
