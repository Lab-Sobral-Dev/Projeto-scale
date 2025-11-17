import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Scale, Eye, EyeOff } from 'lucide-react'
import api from '@/services/api'

// validação local (espelha o backend)
const hasMin = (s) => (s || '').length >= 8
const hasUpper = (s) => /[A-Z]/.test(s || '')
const hasLower = (s) => /[a-z]/.test(s || '')
const hasDigit = (s) => /\d/.test(s || '')
const hasSymbol = (s) => /[^\w\s]/.test(s || '')

function Rule({ ok, children }) {
    return (
        <li
            className={`text-sm flex items-start gap-2 ${ok ? 'text-emerald-600' : 'text-slate-600'}`}
            role="status"
            aria-live="polite"
        >
            <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${ok ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-100 border-slate-300'
                    }`}
                aria-hidden="true"
            >
                {ok ? '✓' : '•'}
            </span>
            <span className={ok ? 'line-through decoration-emerald-400/60' : ''}>
                {children}
            </span>
        </li>
    )
}

function readPwdFlags() {
    try {
        const raw = localStorage.getItem('pwd_flags')
        if (!raw) return { mustChange: false, expired: false }
        const parsed = JSON.parse(raw)
        return { mustChange: !!parsed.mustChange, expired: !!parsed.expired }
    } catch {
        return { mustChange: false, expired: false }
    }
}

function PasswordRules({ meets }) {
    const score = ['min', 'upper', 'lower', 'digit', 'symbol'].reduce(
        (acc, k) => acc + (meets[k] ? 1 : 0),
        0
    )
    const percent = (score / 5) * 100
    const strengthLabel =
        score <= 1
            ? 'Muito fraca'
            : score === 2
                ? 'Fraca'
                : score === 3
                    ? 'Média'
                    : score === 4
                        ? 'Forte'
                        : 'Excelente'

    const barColor =
        score <= 1
            ? 'bg-red-500'
            : score === 2
                ? 'bg-orange-500'
                : score === 3
                    ? 'bg-yellow-500'
                    : score === 4
                        ? 'bg-green-500'
                        : 'bg-emerald-600'

    return (
        <div className="rounded-md border border-slate-200 bg-slate-50/80">
            <div className="px-3 py-2 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wide bg-white/70">
                Requisitos mínimos
            </div>

            <div className="p-3">
                <ul className="space-y-2">
                    <Rule ok={meets.min}>Mínimo de 8 caracteres</Rule>
                    <Rule ok={meets.upper}>Pelo menos 1 letra maiúscula</Rule>
                    <Rule ok={meets.lower}>Pelo menos 1 letra minúscula</Rule>
                    <Rule ok={meets.digit}>Pelo menos 1 número</Rule>
                    <Rule ok={meets.symbol}>Pelo menos 1 símbolo</Rule>
                </ul>

                <div className="mt-4" aria-live="polite">
                    <label
                        htmlFor="pwd-strength"
                        className="text-xs font-medium text-slate-700"
                    >
                        Força da senha:{' '}
                        <span className="font-semibold">{strengthLabel}</span>
                    </label>
                    <div
                        className="mt-1 h-2 w-full rounded bg-slate-200"
                        id="pwd-strength"
                        role="progressbar"
                        aria-valuenow={score}
                        aria-valuemin={0}
                        aria-valuemax={5}
                    >
                        <div
                            className={`h-2 rounded ${barColor} transition-all`}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                        Dica: combine letras, números e símbolos. Evite sequências (1234, abcd) e dados pessoais.
                    </p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                        Confirmação
                    </div>
                    <ul className="mt-2">
                        <Rule ok={meets.match}>A confirmação confere com a nova senha</Rule>
                    </ul>
                </div>
            </div>
        </div>
    )
}

const AlterarSenha = () => {
    const navigate = useNavigate()
    const location = useLocation()

    const [current, setCurrent] = useState('')
    const [pwd, setPwd] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showCurrent, setShowCurrent] = useState(false)
    const [showNew, setShowNew] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [logoError, setLogoError] = useState(false) // fallback da logo

    const flags = readPwdFlags()
    const reason =
        location.state?.reason ||
        (flags.mustChange ? 'reset' : flags.expired ? 'expired' : null)

    const meets = useMemo(
        () => ({
            min: hasMin(pwd),
            upper: hasUpper(pwd),
            lower: hasLower(pwd),
            digit: hasDigit(pwd),
            symbol: hasSymbol(pwd),
            match: pwd && confirm && pwd === confirm,
        }),
        [pwd, confirm]
    )

    useEffect(() => {
        // rota protegida, mas sem layout
        const token = localStorage.getItem('access')
        if (!token) navigate('/login', { replace: true })
    }, [navigate])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (loading) return
        setError('')

        if (!meets.min || !meets.upper || !meets.lower || !meets.digit || !meets.symbol) {
            setError('A nova senha não atende à política de complexidade.')
            return
        }
        if (!meets.match) {
            setError('A confirmação da nova senha não confere.')
            return
        }

        setLoading(true)
        try {
            await api.changePassword({
                current_password: current,
                new_password: pwd,
                confirm_password: confirm,
            })

            // limpa sessão e volta ao login
            localStorage.removeItem('pwd_flags')
            localStorage.removeItem('allowed_screens')
            localStorage.removeItem('access')
            localStorage.removeItem('refresh')

            navigate('/login', {
                replace: true,
                state: { msg: 'Senha alterada com sucesso. Faça login novamente.' },
            })
        } catch (err) {
            const msg =
                err?.payload?.detail ||
                err?.response?.data?.detail ||
                'Não foi possível alterar a senha. Verifique os dados e tente novamente.'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
            <div className="relative w-full max-w-md">
                {/* Glow laranja discreto atrás do card, igual ao login */}
                <div className="pointer-events-none absolute inset-0 -z-10">
                    <div className="absolute -inset-10 bg-gradient-to-tr from-orange-500/20 via-transparent to-orange-400/20 blur-3xl" />
                </div>

                <Card className="w-full shadow-2xl border border-white/10 bg-white/95 backdrop-blur-sm rounded-2xl overflow-hidden transition-all duration-300">
                    <CardHeader className="space-y-1 text-center relative pb-6">
                        {/* Faixa laranja no topo, igual login */}
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500" />

                        <div className="flex justify-center mt-4 mb-4">
                            {!logoError ? (
                                <img
                                    src="/logo.png"
                                    alt="Logo"
                                    className="h-20 w-auto drop-shadow-md"
                                    onError={() => setLogoError(true)}
                                />
                            ) : (
                                <div className="p-3 bg-orange-50 rounded-full border border-orange-200">
                                    <Scale className="h-8 w-8 text-orange-500" />
                                </div>
                            )}
                        </div>

                        <CardTitle className="text-2xl font-bold text-slate-900">
                            Alterar senha
                        </CardTitle>
                        <CardDescription className="text-sm text-slate-500">
                            {reason === 'reset' &&
                                'Sua senha foi redefinida pelo administrador. Defina uma nova senha para continuar.'}
                            {reason === 'expired' &&
                                'Sua senha expirou. Defina uma nova senha para continuar.'}
                            {!reason && 'Por segurança, altere sua senha regularmente.'}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="pb-6">
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {/* Senha atual */}
                            <div className="space-y-2">
                                <Label
                                    htmlFor="current"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Senha atual
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="current"
                                        type={showCurrent ? 'text' : 'password'}
                                        value={current}
                                        onChange={(e) => {
                                            setCurrent(e.target.value)
                                            setError('')
                                        }}
                                        autoComplete="current-password"
                                        required
                                        disabled={loading}
                                        className="w-full pr-10 bg-slate-50/80 border-slate-200 
                    focus-visible:ring-2 focus-visible:ring-orange-500
                    focus-visible:border-orange-500
                    focus-visible:ring-offset-1 focus-visible:ring-offset-white transition-all"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-slate-400 hover:text-orange-500 transition-colors"
                                        onClick={() => setShowCurrent((v) => !v)}
                                        aria-label={showCurrent ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                                    >
                                        {showCurrent ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Nova senha */}
                            <div className="space-y-2">
                                <Label
                                    htmlFor="new"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Nova senha
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="new"
                                        type={showNew ? 'text' : 'password'}
                                        value={pwd}
                                        onChange={(e) => {
                                            setPwd(e.target.value)
                                            setError('')
                                        }}
                                        autoComplete="new-password"
                                        required
                                        disabled={loading}
                                        className="w-full pr-10 bg-slate-50/80 border-slate-200 
                    focus-visible:ring-2 focus-visible:ring-orange-500
                    focus-visible:border-orange-500
                    focus-visible:ring-offset-1 focus-visible:ring-offset-white transition-all"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-slate-400 hover:text-orange-500 transition-colors"
                                        onClick={() => setShowNew((v) => !v)}
                                        aria-label={showNew ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                                    >
                                        {showNew ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Confirmar senha */}
                            <div className="space-y-2">
                                <Label
                                    htmlFor="confirm"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Confirmar nova senha
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="confirm"
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirm}
                                        onChange={(e) => {
                                            setConfirm(e.target.value)
                                            setError('')
                                        }}
                                        autoComplete="new-password"
                                        required
                                        disabled={loading}
                                        className="w-full pr-10 bg-slate-50/80 border-slate-200 
                    focus-visible:ring-2 focus-visible:ring-orange-500
                    focus-visible:border-orange-500
                    focus-visible:ring-offset-1 focus-visible:ring-offset-white transition-all"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-slate-400 hover:text-orange-500 transition-colors"
                                        onClick={() => setShowConfirm((v) => !v)}
                                        aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                                    >
                                        {showConfirm ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Regras de senha */}
                            <PasswordRules meets={meets} />

                            {error && (
                                <Alert className="border-red-300 bg-red-50 text-red-700" variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold
                shadow-md shadow-orange-500/40 border-0 transition-all duration-200
                active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none"
                                disabled={loading}
                            >
                                {loading ? 'Salvando...' : 'Salvar nova senha'}
                            </Button>

                            <p className="text-xs text-slate-400 text-center pt-2">
                                Evite repetir senhas antigas e não use informações pessoais óbvias.
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default AlterarSenha
