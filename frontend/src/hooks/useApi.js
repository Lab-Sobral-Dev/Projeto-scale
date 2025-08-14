import { useState, useEffect } from 'react'
import apiService from '../services/api'

// Hook genérico para operações de API
export const useApi = (apiCall, dependencies = []) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await apiCall()
        setData(result)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, dependencies)

  const refetch = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await apiCall()
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, refetch }
}

// Hook específico para produtos
export const useProdutos = () => {
  return useApi(() => apiService.getProdutos())
}

// Hook específico para matérias-primas
export const useMateriasPrimas = () => {
  return useApi(() => apiService.getMateriasPrimas())
}

// Hook específico para pesagens
export const usePesagens = (filters = {}) => {
  return useApi(() => apiService.getPesagens(filters), [JSON.stringify(filters)])
}

// Hook específico para dashboard
export const useDashboard = () => {
  return useApi(() => apiService.getDashboardStats())
}

// Hook para operações CRUD
export const useCrud = (entityName) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const create = async (data) => {
    try {
      setLoading(true)
      setError(null)
      
      let result
      switch (entityName) {
        case 'produtos':
          result = await apiService.createProduto(data)
          break
        case 'materias-primas':
          result = await apiService.createMateriaPrima(data)
          break
        case 'pesagens':
          result = await apiService.createPesagem(data)
          break
        default:
          throw new Error(`Entity ${entityName} not supported`)
      }
      
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const update = async (id, data) => {
    try {
      setLoading(true)
      setError(null)
      
      let result
      switch (entityName) {
        case 'produtos':
          result = await apiService.updateProduto(id, data)
          break
        case 'materias-primas':
          result = await apiService.updateMateriaPrima(id, data)
          break
        case 'pesagens':
          result = await apiService.updatePesagem(id, data)
          break
        default:
          throw new Error(`Entity ${entityName} not supported`)
      }
      
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    try {
      setLoading(true)
      setError(null)
      
      switch (entityName) {
        case 'produtos':
          await apiService.deleteProduto(id)
          break
        case 'materias-primas':
          await apiService.deleteMateriaPrima(id)
          break
        case 'pesagens':
          await apiService.deletePesagem(id)
          break
        default:
          throw new Error(`Entity ${entityName} not supported`)
      }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    create,
    update,
    remove,
    loading,
    error
  }
}

// Hook para autenticação
export const useAuth = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const login = async (credentials) => {
    try {
      setLoading(true)
      setError(null)
      const result = await apiService.login(credentials)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      setLoading(true)
      setError(null)
      await apiService.logout()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    login,
    logout,
    loading,
    error
  }
}

