import { Navigate, useLocation } from 'react-router-dom'
import { useMe } from '@/hooks/useMe'

function isTokenExpired(token) {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const exp = Number(payload?.exp)
    if (!exp) return false
    return exp * 1000 <= Date.now()
  } catch {
    return false
  }
}

export default function RequireAuth({ children }) {
  const { isAuthenticated, loadingMe } = useMe()
  const location = useLocation()
  const access = localStorage.getItem('access')

  if (isTokenExpired(access)) {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    localStorage.removeItem('user')
    localStorage.removeItem('allowed_screens')
    localStorage.removeItem('pwd_flags')
    sessionStorage.setItem('session_expired', '1')
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (loadingMe) return null
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}
