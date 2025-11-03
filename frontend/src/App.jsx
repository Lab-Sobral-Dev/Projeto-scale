import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

import Login from './components/Login'
import AlterarSenha from './components/AlterarSenha'
import Dashboard from './components/Dashboard'
import NovaPesagem from './components/NovaPesagem'
import Ops from '@/components/Ops'
import CriarOP from '@/components/CriarOP'
import Historico from './components/Historico'
import CadastroProduto from './components/CadastroProduto'
import Estruturas from './components/Estruturas'
import ComposicaoEstrutura from './components/ComposicaoEstrutura'
import CadastroMateriaPrima from './components/CadastroMateriaPrima'
import PerfilUsuario from './components/PerfilUsuario'
import GeracaoEtiqueta from './components/GeracaoEtiqueta'
import Layout from './components/Layout'
import UsuariosAdmin from './components/usuarios'
import PesagemDetalhe from '@/components/PesagemDetalhe'
import PesagemEditar from '@/components/PesagemEditar'
import CadastroBalanca from './components/CadastroBalanca'
import RequireAuth from '@/components/auth/RequireAuth'
import RequireAdmin from '@/components/auth/RequireAdmin'
import Sobre from './components/Sobre'
import LogsAuditoria from './components/LogsAuditoria'


import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [bootChecked, setBootChecked] = useState(false)

  useEffect(() => {
    // Alinhar com o padrão "access"/"refresh"
    const access = localStorage.getItem('access')
    const userData = localStorage.getItem('user')
    if (access && userData) {
      setUser(JSON.parse(userData))
    }
    setBootChecked(true)
  }, [])

  const handleLogin = (userData, accessToken) => {
    // Guarde como "access" para padronizar com o restante do app
    localStorage.setItem('access', accessToken)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh') // se usar
    localStorage.removeItem('user')
    setUser(null)
  }

  if (!bootChecked) return null

  return (
    <Router>
      <Routes>
        {/* Rota pública de login */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        {/* Rota de alteração de senha — protegida, mas independente */}
        <Route
          path="/alterar-senha"
          element={
            <RequireAuth>
              <AlterarSenha />
            </RequireAuth>
          }
        />

        {/* Rotas privadas com layout comum */}
        <Route
          element={
            <RequireAuth>
              <Layout user={user} onLogout={handleLogout} />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/nova-pesagem" element={<NovaPesagem />} />
          <Route path="/ops" element={<Ops />} />
          <Route path="/ops/nova" element={<CriarOP />} />
          <Route path="/pesagens/:id" element={<PesagemDetalhe />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/perfil" element={<PerfilUsuario user={user} onLogout={handleLogout} />} />
          <Route path="/etiqueta/:id" element={<GeracaoEtiqueta />} />
          <Route path="/sobre" element={<Sobre />} />
        </Route>

        {/* Rotas exclusivas para admin */}
        <Route
          element={
            <RequireAdmin>
              <Layout user={user} onLogout={handleLogout} />
            </RequireAdmin>
          }
        >
          <Route path="/cadastro-produto" element={<CadastroProduto />} />
          <Route path="/estruturas" element={<Estruturas />} />
          <Route path="/estruturas/:id" element={<ComposicaoEstrutura />} />
          <Route path="/cadastro-materia-prima" element={<CadastroMateriaPrima />} />
          <Route path="/balancas" element={<CadastroBalanca />} />
          <Route path="/usuarios" element={<UsuariosAdmin />} />
          <Route path="/pesagens/:id/editar" element={<PesagemEditar />} />
          <Route path="/auditoria" element={<LogsAuditoria />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>

  )
}

export default App
