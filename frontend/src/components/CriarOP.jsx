import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Save, Factory, ListChecks } from 'lucide-react'
import api from '@/services/api'

const CriarOP = () => {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [produtos, setProdutos] = useState([])
  const [estruturas, setEstruturas] = useState([])

  const [form, setForm] = useState({
    numero: '',
    produto: '',
    estrutura: '',
    lote: '',
    observacoes: ''
  })

  const handleChange = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }))
    setError('')
    setSuccess('')
  }

  useEffect(() => {
    let abort = false
    async function load() {
      setLoading(true)
      try {
        const [prodRes, estRes] = await Promise.all([
          api.getProdutos(),
          api.getEstruturas()
        ])
        if (abort) return
        const normalize = data => Array.isArray(data) ? data : (data?.results ?? [])
        setProdutos(normalize(prodRes))
        setEstruturas(normalize(estRes))
      } catch (e) {
        console.error(e)
        setError('Falha ao carregar produtos/estruturas.')
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => { abort = true }
  }, [])

  const estruturasFiltradas = useMemo(() => {
    if (!form.produto) return estruturas
    // Estrutura vem com produto aninhado; filtramos por id
    return estruturas.filter(e => e?.produto?.id?.toString() === form.produto.toString())
  }, [estruturas, form.produto])

  const canSave = form.numero && form.produto && form.estrutura && form.lote && !loading

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const created = await api.createOP({
        numero: form.numero,
        produto_id: Number(form.produto),
        estrutura_id: Number(form.estrutura),
        lote: form.lote,
        observacoes: form.observacoes || ''
      })
      await api.gerarItensOP(created.id, true) // já estoura a estrutura
      setSuccess(`OP ${created.numero} criada e itens gerados com sucesso!`)
    } catch (err) {
      console.error(err)
      const msg = err?.response?.data?.detail || 'Erro ao criar OP.'
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Criar Ordem de Produção</h1>
          <p className="text-gray-600">Informe número, produto, estrutura e lote</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova OP</CardTitle>
          <CardDescription>Após salvar, os itens da estrutura serão gerados</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numero">Número *</Label>
              <Input id="numero" value={form.numero} onChange={e => handleChange('numero', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lote">Lote *</Label>
              <Input id="lote" value={form.lote} onChange={e => handleChange('lote', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Produto *</Label>
              <Select
                value={form.produto ? String(form.produto) : undefined}
                onValueChange={(v) => handleChange('produto', v)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione'} />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estrutura (BOM) *</Label>
              <Select
                value={form.estrutura ? String(form.estrutura) : undefined}
                onValueChange={(v) => handleChange('estrutura', v)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? 'Carregando...' : 'Selecione'} />
                </SelectTrigger>
                <SelectContent>
                  {estruturasFiltradas.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.descricao || 'Estrutura'} — {e?.produto?.nome || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Input id="observacoes" value={form.observacoes} onChange={e => handleChange('observacoes', e.target.value)} />
            </div>

            {error && (
              <div className="col-span-2">
                <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
              </div>
            )}
            {success && (
              <div className="col-span-2">
                <Alert className="border-green-200 bg-green-50">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              </div>
            )}

            <div className="col-span-2 flex gap-3">
              <Button type="submit" disabled={!canSave} className="flex items-center gap-2">
                <Save className="h-4 w-4" /> {loading ? 'Salvando...' : 'Salvar e Gerar Itens'}
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setForm({ numero: '', produto: '', estrutura: '', lote: '', observacoes: '' })
                setError(''); setSuccess('')
              }} className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default CriarOP
