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
            className={`text-sm flex items-start gap-2 ${ok ? 'text-green-600' : 'text-gray-600'}`}
            role="status"
            aria-live="polite"
        >
            <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${ok ? 'bg-green-100 border-green-300' : 'bg-gray-100 border-gray-300'}`}
                aria-hidden="true"
            >
                {ok ? '✓' : '•'}
            </span>
            <span className={`${ok ? 'line-through decoration-green-400/60' : ''}`}>
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
    const score = ['min', 'upper', 'lower', 'digit', 'symbol'].reduce((acc, k) => acc + (meets[k] ? 1 : 0), 0)
    const percent = (score / 5) * 100
    const strengthLabel =
        score <= 1 ? 'Muito fraca' :
            score === 2 ? 'Fraca' :
                score === 3 ? 'Média' :
                    score === 4 ? 'Forte' : 'Excelente'

    const barColor =
        score <= 1 ? 'bg-red-500' :
            score === 2 ? 'bg-orange-500' :
                score === 3 ? 'bg-yellow-500' :
                    score === 4 ? 'bg-green-500' : 'bg-emerald-600'

    return (
        <div className="rounded-md border bg-white/60">
            <div className="px-3 py-2 border-b text-xs font-semibold text-gray-700 uppercase tracking-wide">
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
                    <label htmlFor="pwd-strength" className="text-xs font-medium text-gray-700">
                        Força da senha: <span className="font-semibold">{strengthLabel}</span>
                    </label>
                    <div className="mt-1 h-2 w-full rounded bg-gray-200" id="pwd-strength" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={5}>
                        <div
                            className={`h-2 rounded ${barColor} transition-all`}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                        Dica: combine letras, números e símbolos. Evite sequências (1234, abcd) e dados pessoais.
                    </p>
                </div>

                <div className="mt-3 pt-3 border-t">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Confirmação</div>
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
    const reason = location.state?.reason || (flags.mustChange ? 'reset' : flags.expired ? 'expired' : null)

    const meets = useMemo(() => ({
        min: hasMin(pwd),
        upper: hasUpper(pwd),
        lower: hasLower(pwd),
        digit: hasDigit(pwd),
        symbol: hasSymbol(pwd),
        match: pwd && confirm && pwd === confirm,
    }), [pwd, confirm])

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
            <Card className="w-full max-w-md shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        {!logoError ? (
                            <img
                                src="/logo.png"
                                alt="Logo"
                                className="h-12 w-auto"
                                onError={() => setLogoError(true)}
                            />
                        ) : (
                            <div className="p-3 bg-blue-100 rounded-full">
                                <Scale className="h-8 w-8 text-blue-600" />
                            </div>
                        )}
                    </div>
                    <CardTitle className="text-2xl font-bold">Scale - Alterar Senha</CardTitle>
                    <CardDescription>
                        {reason === 'reset' && 'Sua senha foi redefinida pelo administrador. Defina uma nova senha para continuar.'}
                        {reason === 'expired' && 'Sua senha expirou. Defina uma nova senha para continuar.'}
                        {!reason && 'Por segurança, altere sua senha.'}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        {/* Senha atual */}
                        <div className="space-y-2">
                            <Label htmlFor="current">Senha atual</Label>
                            <div className="relative">
                                <Input
                                    id="current"
                                    type={showCurrent ? 'text' : 'password'}
                                    value={current}
                                    onChange={(e) => { setCurrent(e.target.value); setError('') }}
                                    autoComplete="current-password"
                                    required
                                    disabled={loading}
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowCurrent(v => !v)}
                                    aria-label={showCurrent ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                                >
                                    {showCurrent ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                                </Button>
                            </div>
                        </div>

                        {/* Nova senha */}
                        <div className="space-y-2">
                            <Label htmlFor="new">Nova senha</Label>
                            <div className="relative">
                                <Input
                                    id="new"
                                    type={showNew ? 'text' : 'password'}
                                    value={pwd}
                                    onChange={(e) => { setPwd(e.target.value); setError('') }}
                                    autoComplete="new-password"
                                    required
                                    disabled={loading}
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowNew(v => !v)}
                                    aria-label={showNew ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                                >
                                    {showNew ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                                </Button>
                            </div>
                        </div>

                        {/* Confirmar senha */}
                        <div className="space-y-2">
                            <Label htmlFor="confirm">Confirmar nova senha</Label>
                            <div className="relative">
                                <Input
                                    id="confirm"
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirm}
                                    onChange={(e) => { setConfirm(e.target.value); setError('') }}
                                    autoComplete="new-password"
                                    required
                                    disabled={loading}
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowConfirm(v => !v)}
                                    aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                                >
                                    {showConfirm ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                                </Button>
                            </div>
                        </div>

                        {/* Regras de senha (organizado) */}
                        <PasswordRules meets={meets} />

                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Salvando...' : 'Salvar nova senha'}
                        </Button>

                        <p className="text-xs text-gray-500 text-center">
                            Evite repetir senhas antigas e não use informações pessoais óbvias.
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

export default AlterarSenha
