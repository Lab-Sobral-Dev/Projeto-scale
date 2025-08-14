import { useEffect, useState } from 'react'

export function useMe() {
  const [me, setMe] = useState(null)
  const [loadingMe, setLoadingMe] = useState(true)
  const [errorMe, setErrorMe] = useState('')
  const API = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api') + '/usuarios'

  useEffect(() => {
    let abort = false

    async function load() {
      setLoadingMe(true)
      setErrorMe('')
      try {
        const token = localStorage.getItem('access') || ''
        const res = await fetch(`${API}/auth/me/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!res.ok) {
          if (!abort) {
            setMe(null)
            setErrorMe('Falha ao carregar o usuário.')
          }
          return
        }
        const data = await res.json()
        if (!abort) setMe(data)
      } catch {
        if (!abort) setErrorMe('Erro de rede ao carregar o usuário.')
      } finally {
        if (!abort) setLoadingMe(false)
      }
    }

    load()

    // Reagir a mudanças do token feitas em outras abas/janelas
    const onStorage = (e) => {
      if (e.key === 'access') load()
    }
    window.addEventListener('storage', onStorage)

    return () => {
      abort = true
      window.removeEventListener('storage', onStorage)
    }
  }, [API])

  const isAdmin = !!me && (me.is_staff || me.papel === 'admin')
  const isAuthenticated = !!localStorage.getItem('access')

  return { me, isAdmin, isAuthenticated, loadingMe, errorMe }
}
