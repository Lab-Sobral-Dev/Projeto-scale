import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, User, Weight, Printer, Edit, ArrowLeft, Scale } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('access') || ''}` })

const apiGet = async (path) => {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function PesagemDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const [p, u] = await Promise.all([
          apiGet(`/api/registro/pesagens/${id}/`),
          apiGet(`/api/usuarios/auth/me/`)
        ])
        if (!mounted) return
        setData(p)
        setMe(u)
      } catch (e) {
        console.error(e)
        setError('Não foi possível carregar os dados da pesagem.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [id])

  const formatDateTime = (dateTime) => {
    const d = new Date(dateTime)
    return isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR')
  }

  const canEdit = () => {
    // Admin/staff podem editar
    return !!(me?.is_staff || me?.is_superuser)
  }

  const handleEtiqueta = () => {
    window.open(`${API}/api/registro/etiqueta/${id}/`, '_blank', 'noopener')
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Carregando…</div>
  }
  if (error || !data) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-red-600">{error || 'Pesagem não encontrada.'}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Weight className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Detalhe da Pesagem</h1>
            <p className="text-gray-600">ID #{data.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          {canEdit() && (
            <Button onClick={() => navigate(`/pesagens/${data.id}/editar`)}>
              <Edit className="h-4 w-4 mr-2" /> Editar
            </Button>
          )}
          <Button variant="secondary" onClick={handleEtiqueta}>
            <Printer className="h-4 w-4 mr-2" /> Etiqueta
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações</CardTitle>
          <CardDescription>Resumo completo da pesagem</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Info label="Data/Hora" value={
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-4 w-4 text-gray-400" />
              {formatDateTime(data.data_hora)}
            </span>
          }/>
          <Info label="Produto" value={data.produto?.nome} />
          <Info label="Matéria-prima" value={<Badge variant="outline">{data.materia_prima?.nome}</Badge>} />
          <Info label="OP" value={data.op} />
          <Info label="Lote" value={data.lote} />
          <Info label="Pesador" value={
            <span className="inline-flex items-center gap-1">
              <User className="h-4 w-4 text-gray-400" />
              {data.pesador}
            </span>
          }/>
          <Info label="Peso Bruto (kg)" value={String(data.bruto)} />
          <Info label="Tara (kg)" value={String(data.tara)} />
          <Info label="Peso Líquido (kg)" value={<span className="font-semibold text-green-700">{String(data.liquido)}</span>} />
          <Info label="Volume" value={data.volume} />
          {/* 👇 agora mostra o nome da balança (FK) */}
          <Info label="Balança" value={
            <span className="inline-flex items-center gap-1">
              <Scale className="h-4 w-4 text-gray-400" />
              {data.balanca?.nome || '-'}
            </span>
          } />
          <Info label="Código Interno" value={data.codigo_interno} />
        </CardContent>
      </Card>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-gray-900">{value || '-'}</div>
    </div>
  )
}
