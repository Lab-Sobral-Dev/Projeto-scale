import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '@/services/api';

// Ícones
import { ArrowLeft, Edit3, Printer, Scale, Package2, Layers, Factory, QrCode, User, Clock, Weight, Ticket, Tag } from 'lucide-react';

// ================= UI mínima =================
const Card = ({ children, className }) => <div className={`rounded-xl border bg-card text-card-foreground shadow ${className}`}>{children}</div>;
const CardContent = ({ children, className }) => <div className={`p-6 pt-0 ${className}`}>{children}</div>;
const CardHeader = ({ children, className }) => <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>{children}</div>;
const CardTitle = ({ children, className }) => <h3 className={`font-semibold leading-none tracking-tight text-xl ${className}`}>{children}</h3>;
const CardDescription = ({ children, className }) => <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>;
const Button = ({ children, onClick, variant = 'default', className, ...props }) => {
    const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2';
    const variants = {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
    };
    return <button onClick={onClick} className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
};
const Alert = ({ children, variant = 'default', className }) => {
    const base = 'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-10';
    const variants = { destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive' };
    return <div className={`${base} ${variants[variant] || ''} ${className}`}>{children}</div>;
};
const AlertDescription = ({ children, className }) => <p className={`text-sm [&_p]:leading-relaxed ${className}`}>{children}</p>;
const Separator = ({ className }) => <div className={`shrink-0 bg-border h-[1px] w-full ${className}`} />;

// ============ Helpers/formatters ============
const tz = 'America/Fortaleza';
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: tz }) : '-');
const KG_IN_G = 1000;
const toNum = (x) => (x == null ? null : Number(x));
const kgToG = (kg) => (kg == null ? null : kg * KG_IN_G);

// Precisão em gramas equivalente às casas da balança (em kg). 3 casas kg = 1 g.
// Mesma regra usada no módulo de relatórios (reports/services/formatters.py).
const casasGramas = (casasKg) => Math.max((casasKg == null ? 3 : Number(casasKg)) - 3, 0);
// Massa em gramas no padrão pt-BR com casas decimais fixas.
const fmtMassaG = (valorG, casas) => {
    if (valorG == null || isNaN(valorG)) return '-';
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
    }).format(Number(valorG));
};

export default function PesagemDetalhe() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [p, setP] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setError('');
                const data = await api.getPesagem(id);
                if (!alive) return;
                setP(data);
            } catch (e) {
                console.error('Erro ao carregar a pesagem:', e);
                setError('Não foi possível carregar a pesagem. Verifique sua conexão com a API.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false };
    }, [id]);

    const resolved = useMemo(() => {
        if (!p) return null;

        // Dados básicos
        const produto = p?.op?.produto?.nome || p?.produto?.nome || p?.produto_nome || '-';
        const materia = p?.item_op?.materia_prima?.nome || p?.materia_prima?.nome || p?.materia_prima_nome || '-';
        const opNumero = p?.op?.numero || p?.op || p?.op_numero || '-';
        const loteOP = p?.op?.lote || p?.lote || '-';
        const loteMP = p?.lote_mp || p?.loteMP || ''; // opcional
        const balanca = p?.balanca?.nome || p?.balanca_nome || '-';
        const pesador = p?.pesador || '-';
        const data = fmtDT(p?.data_hora);

        // === Unidades: backend atual ===
        // - bruto: kg
        // - tara: kg
        // - líquido: g
        // Também aceitamos aliases *_kg / *_g
        const brutoKg = toNum(p?.bruto ?? p?.bruto_kg);
        const taraKg = toNum(p?.tara ?? p?.tara_kg);
        const liquidoGFromAPI = toNum(p?.liquido ?? p?.liquido_g ?? p?.peso_liquido);

        const brutoG = kgToG(brutoKg);
        const taraG = kgToG(taraKg);

        // líquido preferencialmente do backend; se ausente, calcula por diferença já em g
        const liquidoG = (liquidoGFromAPI != null)
            ? liquidoGFromAPI
            : (brutoG != null && taraG != null ? (brutoG - taraG) : null);

        const codigo = p?.codigo_interno || '-';
        const isOPLinked = !!p?.op || !!p?.item_op;

        // Casas decimais (em g) conforme a balança usada na pesagem.
        const casasG = casasGramas(p?.balanca?.casas_decimais);

        return { produto, materia, opNumero, loteOP, loteMP, balanca, pesador, data, brutoG, taraG, liquidoG, casasG, codigo, isOPLinked };
    }, [p]);

    const onEtiqueta = async () => {
        try {
            const blob = await api.gerarEtiquetaPDF(id);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener');
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (e) {
            console.error('Erro ao gerar etiqueta:', e);
            setError('Falha ao gerar etiqueta. Verifique se o ID está correto.');
        }
    };

    function InfoRow({ icon: Icon, label, value }) {
        return (
            <div className="rounded border p-3 bg-white">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">{label}</span>
                </div>
                <div className="text-sm text-gray-900">{value}</div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <Scale className="h-8 w-8 text-blue-600" />
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Detalhe da Pesagem</h1>
                        <p className="text-gray-600">ID #{id}</p>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                    </Button>
                    <Link to={`/pesagens/${id}/editar`}>
                        <Button>
                            <Edit3 className="h-4 w-4 mr-2" /> Editar
                        </Button>
                    </Link>
                    <Button variant="secondary" onClick={onEtiqueta}>
                        <Printer className="h-4 w-4 mr-2" /> Etiqueta
                    </Button>
                </div>
            </div>

            {!!error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Informações</CardTitle>
                    <CardDescription>Visualização completa da pesagem</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoRow icon={Package2} label="Produto" value={resolved?.produto || (loading ? '—' : '-')} />
                    <InfoRow icon={Layers} label="Matéria-prima" value={resolved?.materia || (loading ? '—' : '-')} />
                    <InfoRow icon={Factory} label="OP" value={resolved?.opNumero || (loading ? '—' : '-')} />
                    <InfoRow icon={Ticket} label="Lote (OP)" value={resolved?.loteOP || (loading ? '—' : '-')} />
                    <InfoRow icon={Tag} label="Lote MP" value={resolved?.loteMP || '—'} />

                    {/* Pesos sempre em gramas na UI, na precisão da balança */}
                    <InfoRow icon={Weight} label="Peso Bruto" value={resolved?.brutoG != null ? `${fmtMassaG(resolved.brutoG, resolved.casasG)} g` : '-'} />
                    <InfoRow icon={Weight} label="Tara" value={resolved?.taraG != null ? `${fmtMassaG(resolved.taraG, resolved.casasG)} g` : '-'} />
                    <InfoRow icon={Weight} label="Peso Líquido" value={resolved?.liquidoG != null ? `${fmtMassaG(resolved.liquidoG, resolved.casasG)} g` : '-'} />

                    <InfoRow icon={QrCode} label="Código Interno" value={resolved?.codigo || '-'} />
                    <InfoRow icon={Scale} label="Balança" value={resolved?.balanca || '-'} />
                    <InfoRow icon={User} label="Pesador" value={resolved?.pesador || '-'} />
                    <InfoRow icon={Clock} label="Data/Hora" value={resolved?.data || '-'} />

                    <div className="col-span-full">
                        <Separator className="my-2" />
                        <p className="text-sm text-gray-600">
                            Vínculo: {resolved?.isOPLinked ? 'OP/ItemOP' : 'Produto+Matéria-prima (legado)'}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
