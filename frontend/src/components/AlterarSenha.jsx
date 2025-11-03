import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import api from '@/services/api'

// helpers de validação local (espelha o backend)
const hasMin = (s) => (s || '').length >= 10
const hasUpper = (s) => /[A-Z]/.test(s || '')
const hasLower = (s) => /[a-z]/.test(s || '')
const hasDigit = (s) => /\d/.test(s || '')
const hasSymbol = (s) => /[^\w\s]/.test(s || '')

function Rule({ ok, children }) {
    return (
        <li className={`text-sm ${ok ? 'text-green-600' : 'text-gray-500'}`}>
            {ok ? '✓' : '•'} {children}
        </li>
    )
}

function readPwdFlags() {
    try {
        const raw = localStorage.getItem('pwd_flags')
        if (!raw) return { mustChange: false, expired: false }
        const parsed = JSON.parse(raw)
        return {
            mustChange: !!parsed.mustChange,
            expired: !!parsed.expired,
        }
    } catch {
        return { mustChange: false, expired: false }
    }
}

const AlterarSenha = () => {
    const navigate = useNavigate()
    const location = useLocation()

    const [current, setCurrent] = useState('')
    const [pwd, setPwd] = useState('')
    const [confirm, setConfirm] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

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
        // Se não estiver logado, volte ao login
        const token = localStorage.getItem('access')
        if (!token) {
            navigate('/login', { replace: true })
        }
    }, [navigate])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (loading) return
        setError('')
        setSuccess('')

        // validação rápida no client
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

            // sucesso: limpar sessão e redirecionar para login com aviso
            localStorage.removeItem('pwd_flags')
            localStorage.removeItem('allowed_screens')
            localStorage.removeItem('access')
            localStorage.removeItem('refresh')

            // opcional: usar state para exibir mensagem no login
            navigate('/login', { replace: true, state: { msg: 'Senha alterada com sucesso. Faça login novamente.' } })
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
            <Card className="w-full max-w-lg shadow-xl">
                <CardHeader>
                    <CardTitle>Alterar Senha</CardTitle>
                    <CardDescription>
                        {reason === 'reset' && 'Sua senha foi redefinida pelo administrador. Defina uma nova senha para continuar.'}
                        {reason === 'expired' && 'Sua senha expirou. Defina uma nova senha para continuar.'}
                        {!reason && 'Por segurança, altere sua senha.'}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className="mb-4">
                            <AlertDescription>{success}</AlertDescription>
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="current">Senha atual</Label>
                            <Input
                                id="current"
                                type="password"
                                value={current}
                                onChange={(e) => { setCurrent(e.target.value); setError('') }}
                                autoComplete="current-password"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="new">Nova senha</Label>
                            <Input
                                id="new"
                                type="password"
                                value={pwd}
                                onChange={(e) => { setPwd(e.target.value); setError('') }}
                                autoComplete="new-password"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm">Confirmar nova senha</Label>
                            <Input
                                id="confirm"
                                type="password"
                                value={confirm}
                                onChange={(e) => { setConfirm(e.target.value); setError('') }}
                                autoComplete="new-password"
                                required
                                disabled={loading}
                            />
                        </div>

                        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 bg-white/50 rounded-md p-3">
                            <Rule ok={meets.min}>Mínimo de 10 caracteres</Rule>
                            <Rule ok={meets.upper}>Pelo menos 1 letra maiúscula</Rule>
                            <Rule ok={meets.lower}>Pelo menos 1 letra minúscula</Rule>
                            <Rule ok={meets.digit}>Pelo menos 1 número</Rule>
                            <Rule ok={meets.symbol}>Pelo menos 1 símbolo</Rule>
                            <Rule ok={meets.match}>Confirmação igual à nova senha</Rule>
                        </ul>

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Salvando...' : 'Salvar nova senha'}
                        </Button>

                        <p className="text-xs text-gray-500 text-center">
                            Dica: evite repetir senhas antigas e não use informações pessoais óbvias.
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

export default AlterarSenha
