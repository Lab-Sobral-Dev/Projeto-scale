import { Navigate, useLocation } from 'react-router-dom'
import { useMe } from '@/hooks/useMe'

export default function RequireAdmin({ children }) {
  const { isAuthenticated, isAdmin, loadingMe } = useMe()
  const location = useLocation()

  if (loadingMe) return null
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (!isAdmin) return <Navigate to="/" replace state={{ from: location }} />
  return children
}
