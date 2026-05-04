import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useMe } from '@/hooks/useMe'
import api from '@/services/api'

function clearSession() {
  localStorage.removeItem('access')
  localStorage.removeItem('refresh')
  localStorage.removeItem('user')
  localStorage.removeItem('allowed_screens')
  localStorage.removeItem('pwd_flags')
}

function isTokenExpired(token) {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const exp = Number(payload?.exp)
    if (!exp) return false
    return exp * 1000 <= Date.now()
  } catch {
    // token inválido/malformado: tratar como expirado
    return true
  }
}

export default function RequireAuth({ children }) {
  const { isAuthenticated, loadingMe } = useMe()
  const location = useLocation()
  const access = localStorage.getItem('access')
  const refresh = localStorage.getItem('refresh')

  const accessExpired = useMemo(() => isTokenExpired(access), [access])
  const [checkingRefresh, setCheckingRefresh] = useState(false)
  const [refreshOk, setRefreshOk] = useState(false)

  useEffect(() => {
    let mounted = true

    async function tryRefreshOnBoot() {
      if (!accessExpired || !refresh) return
      setCheckingRefresh(true)
      const ok = await api.refreshToken()
      if (!mounted) return

      setRefreshOk(ok)
      setCheckingRefresh(false)

      if (!ok) {
        clearSession()
        sessionStorage.setItem('session_expired', '1')
      }
    }

    tryRefreshOnBoot()
    return () => {
      mounted = false
    }
  }, [accessExpired, refresh])

  if (checkingRefresh) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
    </div>
  )

  if (accessExpired && !refreshOk) {
    clearSession()
    if (refresh) sessionStorage.setItem('session_expired', '1')
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (loadingMe) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
    </div>
  )
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}