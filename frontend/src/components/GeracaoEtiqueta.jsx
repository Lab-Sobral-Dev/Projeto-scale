import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Printer, 
  Download, 
  ArrowLeft,
  FileText,
  QrCode,
  Calendar,
  Weight,
  Package,
  Layers
} from 'lucide-react'

const GeracaoEtiqueta = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pesagem, setPesagem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Simulação de busca da pesagem - substituir pela chamada real da API
    const buscarPesagem = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Dados simulados da pesagem
        const dadosPesagem = {
          id: id,
          dataHora: '2024-08-08 14:30:00',
          produto: 'Produto A',
          materiaPrima: 'MP-001 - Matéria Prima A',
          op: 'OP-2024-001',
          lote: 'L001',
          pesador: 'João Silva',
          bruto: 250.5,
          tara: 100.0,
          liquido: 150.5,
          volume: 100,
          balanca: 'Balança 01',
          codigoInterno: 'INT-001',
          codigoBarras: `*${id}*`
        }
        
        setPesagem(dadosPesagem)
      } catch (err) {
        setError('Erro ao carregar dados da pesagem')
      } finally {
        setLoading(false)
      }
    }

    buscarPesagem()
  }, [id])

  const handleImprimir = () => {
    window.print()
  }

  const handleDownloadPDF = () => {
    // Implementar geração de PDF
    alert('Funcionalidade de download PDF será implementada')
  }

  const formatDateTime = (dateTime) => {
    return new Date(dateTime).toLocaleString('pt-BR')
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
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Geração de Etiqueta</h1>
          </div>
        </div>
        
        <Alert variant="destructive">
          <AlertDescription>
            {error || 'Pesagem não encontrada'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Geração de Etiqueta</h1>
            <p className="text-gray-600">Pesagem #{pesagem.id}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleDownloadPDF}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
          <Button
            onClick={handleImprimir}
            className="flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Prévia da Etiqueta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Prévia da Etiqueta
          </CardTitle>
          <CardDescription>
            Visualização da etiqueta que será impressa (2 blocos por página)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white border-2 border-dashed border-gray-300 p-8 rounded-lg">
            {/* Primeira Etiqueta */}
            <div className="border-2 border-black p-4 mb-6 bg-white" style={{ width: '400px', height: '300px' }}>
              <div className="h-full flex flex-col">
                {/* Cabeçalho */}
                <div className="text-center border-b-2 border-black pb-2 mb-3">
                  <h2 className="text-lg font-bold">SISTEMA DE PESAGEM</h2>
                  <p className="text-sm">Etiqueta de Identificação</p>
                </div>

                {/* Dados Principais */}
                <div className="flex-1 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-semibold">Produto:</span>
                      <div className="text-xs">{pesagem.produto}</div>
                    </div>
                    <div>
                      <span className="font-semibold">MP:</span>
                      <div className="text-xs">{pesagem.materiaPrima}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-semibold">OP:</span>
                      <div className="text-xs">{pesagem.op}</div>
                    </div>
                    <div>
                      <span className="font-semibold">Lote:</span>
                      <div className="text-xs">{pesagem.lote}</div>
                    </div>
                  </div>

                  <div className="border-t border-gray-300 pt-2">
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <span className="font-semibold">Bruto:</span>
                        <div>{pesagem.bruto} kg</div>
                      </div>
                      <div>
                        <span className="font-semibold">Tara:</span>
                        <div>{pesagem.tara} kg</div>
                      </div>
                      <div>
                        <span className="font-semibold text-green-600">Líquido:</span>
                        <div className="font-bold text-green-600">{pesagem.liquido} kg</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-300 pt-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="font-semibold">Data/Hora:</span>
                        <div>{formatDateTime(pesagem.dataHora)}</div>
                      </div>
                      <div>
                        <span className="font-semibold">Pesador:</span>
                        <div>{pesagem.pesador}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Código de Barras Simulado */}
                <div className="border-t-2 border-black pt-2 text-center">
                  <div className="bg-black text-white text-xs px-2 py-1 inline-block font-mono">
                    {pesagem.codigoBarras}
                  </div>
                  <div className="text-xs mt-1">ID: {pesagem.id}</div>
                </div>
              </div>
            </div>

            {/* Segunda Etiqueta (Cópia) */}
            <div className="border-2 border-black p-4 bg-white" style={{ width: '400px', height: '300px' }}>
              <div className="h-full flex flex-col">
                {/* Cabeçalho */}
                <div className="text-center border-b-2 border-black pb-2 mb-3">
                  <h2 className="text-lg font-bold">SISTEMA DE PESAGEM</h2>
                  <p className="text-sm">Etiqueta de Identificação (CÓPIA)</p>
                </div>

                {/* Dados Principais */}
                <div className="flex-1 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-semibold">Produto:</span>
                      <div className="text-xs">{pesagem.produto}</div>
                    </div>
                    <div>
                      <span className="font-semibold">MP:</span>
                      <div className="text-xs">{pesagem.materiaPrima}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-semibold">OP:</span>
                      <div className="text-xs">{pesagem.op}</div>
                    </div>
                    <div>
                      <span className="font-semibold">Lote:</span>
                      <div className="text-xs">{pesagem.lote}</div>
                    </div>
                  </div>

                  <div className="border-t border-gray-300 pt-2">
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <span className="font-semibold">Bruto:</span>
                        <div>{pesagem.bruto} kg</div>
                      </div>
                      <div>
                        <span className="font-semibold">Tara:</span>
                        <div>{pesagem.tara} kg</div>
                      </div>
                      <div>
                        <span className="font-semibold text-green-600">Líquido:</span>
                        <div className="font-bold text-green-600">{pesagem.liquido} kg</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-300 pt-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="font-semibold">Data/Hora:</span>
                        <div>{formatDateTime(pesagem.dataHora)}</div>
                      </div>
                      <div>
                        <span className="font-semibold">Pesador:</span>
                        <div>{pesagem.pesador}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Código de Barras Simulado */}
                <div className="border-t-2 border-black pt-2 text-center">
                  <div className="bg-black text-white text-xs px-2 py-1 inline-block font-mono">
                    {pesagem.codigoBarras}
                  </div>
                  <div className="text-xs mt-1">ID: {pesagem.id}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dados da Pesagem */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Weight className="h-5 w-5" />
            Dados da Pesagem
          </CardTitle>
          <CardDescription>
            Informações completas da pesagem #{pesagem.id}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Produto e Material
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Produto:</span>
                  <span className="font-medium">{pesagem.produto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Matéria-Prima:</span>
                  <span className="font-medium">{pesagem.materiaPrima}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Código Interno:</span>
                  <span className="font-medium">{pesagem.codigoInterno}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Lote e OP
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">OP:</span>
                  <span className="font-medium">{pesagem.op}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Lote:</span>
                  <span className="font-medium">{pesagem.lote}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Volume:</span>
                  <span className="font-medium">{pesagem.volume}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <Weight className="h-4 w-4" />
                Pesos
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Peso Bruto:</span>
                  <span className="font-medium">{pesagem.bruto} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tara:</span>
                  <span className="font-medium">{pesagem.tara} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Peso Líquido:</span>
                  <span className="font-bold text-green-600">{pesagem.liquido} kg</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Data e Responsável
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Data/Hora:</span>
                  <span className="font-medium">{formatDateTime(pesagem.dataHora)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pesador:</span>
                  <span className="font-medium">{pesagem.pesador}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Balança:</span>
                  <span className="font-medium">{pesagem.balanca}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default GeracaoEtiqueta

