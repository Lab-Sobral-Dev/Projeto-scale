// GeracaoEtiqueta.jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Printer, Download, ArrowLeft, FileText, Calendar, Weight, Package, Layers } from 'lucide-react'
import api from '@/services/api'

const tz = 'America/Fortaleza'
// Inteiros, sem casas decimais
const nf0 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// --- Normalização (valores do backend já estão em gramas) ---
const normalize = (p) => {
  const brutoG   = p.bruto != null ? Number(p.bruto) : null
  const taraG    = p.tara  != null ? Number(p.tara)  : null
  const liquidoG = (p.liquido ?? p.peso_liquido) != null
    ? Number(p.liquido ?? p.peso_liquido)
    : (brutoG != null && taraG != null ? (brutoG - taraG) : null)

  return {
    id: p.id,
    dataHora: p.data_hora || p.dataHora,
    produto: (p.produto?.nome) ?? p.produto_nome ?? (typeof p.produto === 'string' ? p.produto : ''),
    materiaPrima: (p.materia_prima?.nome) ?? p.materia_prima_nome ?? (typeof p.materia_prima === 'string' ? p.materia_prima : ''),
    op: p.op?.numero ?? p.op ?? '',
    lote: p.op?.lote ?? p.lote ?? '',
    pesador: p.pesador ?? '',
    brutoG,
    taraG,
    liquidoG,
    balanca: (p.balanca?.nome) ?? p.balanca_nome ?? (typeof p.balanca === 'string' ? p.balanca : ''),
    codigoInterno: p.codigo_interno ?? ''
  }
}

const formatDateTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR', { timeZone: tz })
}

// Dimensoes fisicas da etiqueta — espelham ETIQUETA_LARGURA_MM / ETIQUETA_ALTURA_MM
// em backend/registro/views.py. Alterar nos dois lugares.
const ETIQUETA_LARGURA = '80mm'
const ETIQUETA_ALTURA  = '65mm'

const appEnv = localStorage.getItem('app_env') ?? 'prod'
const ENV_LABEL = appEnv === 'hml' ? 'HOMOLOGAÇÃO' : 'PRODUÇÃO'
const ENV_BG    = appEnv === 'hml' ? '#b45309' : '#1d4ed8'

export default function GeracaoEtiqueta() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pesagem, setPesagem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const p = await api.getPesagem(id)
        if (!mounted) return
        setPesagem(normalize(p))
      } catch (e) {
        console.error(e)
        setError('Erro ao carregar dados da pesagem.')
      } finally {
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [id])

  const openServerPDF = async (download = false) => {
    try {
      const blob = await api.gerarEtiquetaPDF(id)
      const url = URL.createObjectURL(blob)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.download = `etiqueta_pesagem_${id}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        window.open(url, '_blank', 'noopener')
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error(e)
      alert('Não foi possível gerar a etiqueta.')
    }
  }

  const handleImprimirPreview = () => window.print()

  // Formata em gramas, mínimo zero
  const fmtG = (g) => {
    if (g == null) return '-'
    const val = Math.max(0, Number(g) || 0)
    return `${nf0.format(val)} g`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados da pesagem...</p>
        </div>
      </div>
    )
  }

  if (error || !pesagem) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Geração de Etiqueta</h1>
          </div>
        </div>
        <Alert variant="destructive"><AlertDescription>{error || 'Pesagem não encontrada'}</AlertDescription></Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Geração de Etiqueta</h1>
            <p className="text-gray-600">Pesagem #{pesagem.id}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => openServerPDF(true)} variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Baixar PDF (servidor)
          </Button>
          <Button onClick={() => openServerPDF(false)} variant="secondary" className="flex items-center gap-2">
            <Printer className="h-4 w-4" /> Abrir PDF (servidor)
          </Button>
          <Button onClick={handleImprimirPreview} className="flex items-center gap-2">
            <Printer className="h-4 w-4" /> Imprimir esta prévia
          </Button>
        </div>
      </div>

      {/* Regras de impressao: define o papel no tamanho fisico da etiqueta,
          uma etiqueta por pagina. Sem isto o navegador imprime em A4. */}
      <style>{`
        @media print {
          @page { size: ${ETIQUETA_LARGURA} ${ETIQUETA_ALTURA}; margin: 0; }
          .etiqueta-print {
            margin: 0 !important;
            border: none !important;
            break-after: page;
            page-break-after: always;
          }
          .etiqueta-print:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      {/* Prévia da Etiqueta (uma por página) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Prévia da Etiqueta
          </CardTitle>
          <CardDescription>Visualização da etiqueta que será impressa (80 × 65 mm, uma por página)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white border-2 border-dashed border-gray-300 p-8 rounded-lg print:border-0 print:p-0">
            {[0,1].map((i) => (
              <div key={i} className={`etiqueta-print border-2 border-black p-[2mm] ${i===0 ? 'mb-6' : ''} bg-white overflow-hidden`} style={{ width: ETIQUETA_LARGURA, height: ETIQUETA_ALTURA }}>
                <div className="h-full flex flex-col leading-tight">
                  {/* Cabeçalho */}
                  <div className="text-center border-b border-black pb-1 mb-1">
                    <h2 className="text-[9px] font-bold leading-none">SISTEMA DE PESAGEM</h2>
                    <p className="text-[6px] leading-tight">{i===0 ? 'Etiqueta de Identificação' : 'Etiqueta de Identificação (CÓPIA)'}</p>
                    <div className="mt-0.5 text-[6px] font-bold text-white rounded leading-tight" style={{ backgroundColor: ENV_BG }}>
                      {ENV_LABEL}
                    </div>
                  </div>

                  {/* Dados Principais */}
                  <div className="flex-1 space-y-1 text-[7px] min-h-0">
                    <div className="grid grid-cols-2 gap-1">
                      <div className="min-w-0">
                        <span className="font-semibold">Produto:</span>
                        <div className="truncate">{pesagem.produto}</div>
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold">MP:</span>
                        <div className="truncate">{pesagem.materiaPrima}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      <div className="min-w-0">
                        <span className="font-semibold">OP:</span>
                        <div className="truncate">{pesagem.op}</div>
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold">Lote:</span>
                        <div className="truncate">{pesagem.lote}</div>
                      </div>
                    </div>

                    <div className="border-t border-gray-300 pt-1">
                      <div className="grid grid-cols-3 gap-1">
                        <div className="min-w-0"><span className="font-semibold">Bruto:</span><div className="truncate">{fmtG(pesagem.brutoG)}</div></div>
                        <div className="min-w-0"><span className="font-semibold">Tara:</span><div className="truncate">{fmtG(pesagem.taraG)}</div></div>
                        <div className="min-w-0"><span className="font-semibold text-green-600">Líquido:</span><div className="font-bold text-green-600 truncate">{fmtG(pesagem.liquidoG)}</div></div>
                      </div>
                    </div>

                    <div className="border-t border-gray-300 pt-1">
                      <div className="grid grid-cols-2 gap-1">
                        <div className="min-w-0"><span className="font-semibold">Data/Hora:</span><div className="truncate">{formatDateTime(pesagem.dataHora)}</div></div>
                        <div className="min-w-0"><span className="font-semibold">Pesador:</span><div className="truncate">{pesagem.pesador}</div></div>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé simples com ID */}
                  <div className="border-t border-black pt-0.5 text-center shrink-0">
                    <div className="bg-black text-white text-[6px] px-1 inline-block font-mono tracking-widest">
                      ID {pesagem.id}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dados da Pesagem */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Weight className="h-5 w-5" /> Dados da Pesagem</CardTitle>
          <CardDescription>Informações completas da pesagem #{pesagem.id}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2"><Package className="h-4 w-4" /> Produto e Material</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Produto:</span><span className="font-medium">{pesagem.produto}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Matéria-Prima:</span><span className="font-medium">{pesagem.materiaPrima}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Código Interno:</span><span className="font-medium">{pesagem.codigoInterno}</span></div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2"><Layers className="h-4 w-4" /> Lote e OP</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">OP:</span><span className="font-medium">{pesagem.op}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Lote:</span><span className="font-medium">{pesagem.lote}</span></div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2"><Weight className="h-4 w-4" /> Pesos (g)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Peso Bruto:</span><span className="font-medium">{fmtG(pesagem.brutoG)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Tara:</span><span className="font-medium">{fmtG(pesagem.taraG)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Peso Líquido:</span><span className="font-bold text-green-600">{fmtG(pesagem.liquidoG)}</span></div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2"><Calendar className="h-4 w-4" /> Data e Responsável</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Data/Hora:</span><span className="font-medium">{formatDateTime(pesagem.dataHora)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Pesador:</span><span className="font-medium">{pesagem.pesador}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Balança:</span><span className="font-medium">{pesagem.balanca}</span></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
