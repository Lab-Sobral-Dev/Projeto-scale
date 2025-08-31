import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer'
import { Factory, RefreshCw, PlusCircle } from 'lucide-react'
import api from '@/services/api'
import { Link } from 'react-router-dom'

// ---------- Config ----------
const STATUS_LABEL = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada'
}
const MANY_ITEMS_THRESHOLD = 10 // a partir daqui, limitar a 2 colunas

// ---------- Helpers ----------
const normalize = (data) => Array.isArray(data) ? data : (data?.results ?? [])

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)')
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else mql.addListener(onChange)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else mql.removeListener(onChange)
    }
  }, [])
  return isMobile
}

const ProgressoBar = ({ pct }) => (
  <div className="h-2 bg-muted rounded">
    <div className="h-2 bg-primary rounded" style={{ width: `${Math.min(Math.max(pct,0),100)}%` }} />
  </div>
)

// ---------- Componente ----------
const Ops = () => {
  const [ops, setOps] = useState([])
  const [itens, setItens] = useState([])
  const [selId, setSelId] = useState(null)

  const [loading, setLoading] = useState(false)
  const [loadingItens, setLoadingItens] = useState(false)

  const [error, setError] = useState('')

  const [filtroStatus, setFiltroStatus] = useState('todas')
  const [busca, setBusca] = useState('')

  const [openDetalhe, setOpenDetalhe] = useState(false)
  const isMobile = useIsMobile()

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await api.getOPs({ ordering: '-criada_em' })
      const list = normalize(resp)
      setOps(list)
      if (selId && openDetalhe) await carregarItens(selId)
    } catch (e) {
      console.error(e)
      setError('Falha ao carregar OPs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable react-hooks/exhaustive-deps */ }, [])

  const opsFiltradas = useMemo(() => {
    const f1 = ops.filter(o => (filtroStatus === 'todas' ? true : o.status === filtroStatus))
    if (!busca) return f1
    const needle = busca.toLowerCase()
    return f1.filter(o =>
      (String(o.numero) || '').toLowerCase().includes(needle) ||
      (o.lote || '').toLowerCase().includes(needle) ||
      (o?.produto?.nome || '').toLowerCase().includes(needle)
    )
  }, [ops, filtroStatus, busca])

  const carregarItens = async (id) => {
    setLoadingItens(true); setError('')
    try {
      const it = await api.getOPItems(id)
      setItens(normalize(it))
    } catch (e) {
      console.error(e)
      setError('Falha ao carregar itens da OP.')
    } finally {
      setLoadingItens(false)
    }
  }

  const abrirDetalhe = async (id) => {
    setSelId(id)
    setOpenDetalhe(true)
    setItens([])
    await carregarItens(id)
  }

  const fecharDetalhe = () => {
    setOpenDetalhe(false)
    setSelId(null)
    setItens([])
  }

  const progresso = (item) => {
    const nec = Number(item.quantidade_necessaria || 0)
    const pes = Number(item.quantidade_pesada || 0)
    return nec > 0 ? (pes / nec) * 100 : 0
  }

  const opSelecionada = selId ? ops.find(o => o.id === selId) : null

  // grid dinâmico: limita a 2 colunas quando há muitos itens
  const gridColsClass = itens.length >= MANY_ITEMS_THRESHOLD
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3'
    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'

  // Conteúdo reutilizável do detalhe (Dialog/Drawer)
  const DetalheConteudo = () => (
    <>
      {opSelecionada && (
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Status:</span> {STATUS_LABEL[opSelecionada.status] || opSelecionada.status}
            {opSelecionada.criada_em && (
              <> • <span className="font-medium">Criada em:</span> {new Date(opSelecionada.criada_em).toLocaleString('pt-BR')}</>
            )}
          </div>
        </div>
      )}

      {/* Grid de itens responsivo */}
      <div className="mt-4 max-h-[65vh] overflow-y-auto pr-1">
        {loadingItens && (
          <div className={gridColsClass}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-md border p-4 animate-pulse">
                <div className="h-4 w-3/4 bg-muted rounded mb-3" />
                <div className="h-3 w-1/2 bg-muted rounded mb-2" />
                <div className="h-3 w-2/3 bg-muted rounded mb-2" />
                <div className="h-2 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        )}

        {!loadingItens && itens.length === 0 && (
          <p className="py-6 text-center text-muted-foreground">Sem itens para esta OP.</p>
        )}

        {!loadingItens && itens.length > 0 && (
          <div className={gridColsClass}>
            {itens.map((it) => {
              const nec = Number(it.quantidade_necessaria || 0)
              const pes = Number(it.quantidade_pesada || 0)
              const rest = Math.max(nec - pes, 0)
              const pct = progresso(it)

              return (
                <div key={it.id} className="rounded-md border p-4 space-y-3">
                  <div className="text-sm font-medium">
                    {it?.materia_prima?.codigo_interno ? `${it.materia_prima.codigo_interno} — ` : ''}
                    {it?.materia_prima?.nome || '—'}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded bg-muted/40 p-2">
                      <div className="text-muted-foreground">Necessário</div>
                      <div className="font-semibold">{nec.toFixed(3)} {it.unidade}</div>
                    </div>
                    <div className="rounded bg-muted/40 p-2">
                      <div className="text-muted-foreground">Pesado</div>
                      <div className="font-semibold">{pes.toFixed(3)} {it.unidade}</div>
                    </div>
                    <div className="rounded bg-muted/40 p-2">
                      <div className="text-muted-foreground">Restante</div>
                      <div className="font-semibold">{rest.toFixed(3)} {it.unidade}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                    <ProgressoBar pct={pct} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Factory className="h-8 w-8 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ordens de Produção</h1>
            <p className="text-gray-600">Criação, saldos e progresso por matéria-prima</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> {loading ? 'Atualizando…' : 'Atualizar'}
          </Button>
          <Link to="/ops/nova">
            <Button className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" /> Nova OP
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Pesquisar</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="aberta">Aberta</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Buscar (nº OP, lote ou produto)</Label>
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Ex.: OP-2025, L250826-01, Agualemã…"
            />
          </div>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Lista de OPs ocupa toda a largura */}
      <Card>
        <CardHeader><CardTitle>Lista</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">#</th>
                  <th>Produto</th>
                  <th>Lote</th>
                  <th>Status</th>
                  <th>Criada em</th>
                </tr>
              </thead>
              <tbody>
                {opsFiltradas.map(o => (
                  <tr
                    key={o.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => abrirDetalhe(o.id)}
                    title="Toque para ver detalhes"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') abrirDetalhe(o.id)}}
                  >
                    <td className="py-2">{o.numero}</td>
                    <td className="max-w-[420px] truncate">{o?.produto?.nome || '—'}</td>
                    <td>{o.lote}</td>
                    <td>{STATUS_LABEL[o.status] || o.status}</td>
                    <td>{o.criada_em ? new Date(o.criada_em).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
                {opsFiltradas.length === 0 && (
                  <tr><td colSpan="5" className="py-6 text-center text-muted-foreground">Nenhuma OP encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detalhe responsivo: Drawer no mobile, Dialog no desktop */}
      {isMobile ? (
        <Drawer open={openDetalhe} onOpenChange={(open) => { if (!open) fecharDetalhe() }}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader>
              <DrawerTitle>
                {opSelecionada
                  ? `OP ${opSelecionada.numero} • ${opSelecionada?.produto?.nome || '—'} • Lote ${opSelecionada.lote}`
                  : 'Detalhes da OP'}
              </DrawerTitle>
              {opSelecionada && (
                <DrawerDescription>
                  Visualize saldos e acompanhe o progresso da pesagem por matéria-prima.
                </DrawerDescription>
              )}
            </DrawerHeader>

            <div className="px-4 pb-2">
              <DetalheConteudo />
            </div>

            <DrawerFooter className="pt-2">
              <Button variant="outline" onClick={fecharDetalhe}>Fechar</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={openDetalhe} onOpenChange={(open) => { if (!open) fecharDetalhe() }}>
          <DialogContent className="sm:max-w-5xl w-[95vw]">
            <DialogHeader>
              <DialogTitle>
                {opSelecionada
                  ? `OP ${opSelecionada.numero} • ${opSelecionada?.produto?.nome || '—'} • Lote ${opSelecionada.lote}`
                  : 'Detalhes da OP'}
              </DialogTitle>
              {opSelecionada && (
                <DialogDescription>
                  Visualize saldos e acompanhe o progresso da pesagem por matéria-prima.
                </DialogDescription>
              )}
            </DialogHeader>

            <DetalheConteudo />

            <DialogFooter>
              <Button variant="outline" onClick={fecharDetalhe}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default Ops
