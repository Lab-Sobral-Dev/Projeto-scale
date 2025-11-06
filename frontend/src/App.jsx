// src/App.jsx
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

// Relatórios
import ReportsHome from '@/pages/reports/Index'
import Pesagens from '@/pages/reports/Pesagens'
import Lotes from '@/pages/reports/Lotes'
import Balancas from '@/pages/reports/Balancas'
import Produtos from '@/pages/reports/Produtos'
import MPs from '@/pages/reports/MPs'
import Estrutura from '@/pages/reports/Estrutura'
import Usuarios from '@/pages/reports/Usuarios'
import Permissoes from '@/pages/reports/Permissoes'
import AuditoriaAcoes from '@/pages/reports/AuditoriaAcoes'
import AuditoriaExclusoes from '@/pages/reports/AuditoriaExclusoes'
import AuditoriaAuthErros from '@/pages/reports/AuditoriaAuthErros'
import Backups from '@/pages/reports/Backups'
import Restores from '@/pages/reports/Restores'

import './App.css'

// Guard simples para admin|supervisor nos relatórios
const RequireReportViewer = ({ children }) => {
  const userData = JSON.parse(localStorage.getItem('user') || 'null')
  const papel = userData?.perfil?.papel || userData?.papel // dependendo de como você populou o objeto
  if (papel === 'admin' || papel === 'supervisor') return children
  return <Navigate to="/" replace />
}

function App() {
  const [user, setUser] = useState(null)
  const [bootChecked, setBootChecked] = useState(false)

  useEffect(() => {
    const access = localStorage.getItem('access')
    const userData = localStorage.getItem('user')
    if (access && userData) setUser(JSON.parse(userData))
    setBootChecked(true)
  }, [])

  const handleLogin = (userData, accessToken) => {
    localStorage.setItem('access', accessToken)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    localStorage.removeItem('user')
    setUser(null)
  }

  if (!bootChecked) return null

  return (
    <Router>
      <Routes>
        {/* Público */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        {/* Alterar senha (autenticado) */}
        <Route
          path="/alterar-senha"
          element={
            <RequireAuth>
              <AlterarSenha />
            </RequireAuth>
          }
        />

        {/* Área autenticada (layout padrão) */}
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

          {/* Relatórios (admin|supervisor) */}
          <Route
            element={
              <RequireReportViewer>
                <></>
              </RequireReportViewer>
            }
          >
            <Route path="/relatorios" element={<ReportsHome />} />
            <Route path="/relatorios/pesagens" element={<Pesagens />} />
            <Route path="/relatorios/lotes" element={<Lotes />} />
            <Route path="/relatorios/balancas" element={<Balancas />} />
            <Route path="/relatorios/produtos" element={<Produtos />} />
            <Route path="/relatorios/mps" element={<MPs />} />
            <Route path="/relatorios/estrutura" element={<Estrutura />} />
            <Route path="/relatorios/usuarios" element={<Usuarios />} />
            <Route path="/relatorios/permissoes" element={<Permissoes />} />
            <Route path="/relatorios/auditoria/acoes" element={<AuditoriaAcoes />} />
            <Route path="/relatorios/auditoria/exclusoes" element={<AuditoriaExclusoes />} />
            <Route path="/relatorios/auditoria/auth" element={<AuditoriaAuthErros />} />
            <Route path="/relatorios/backups" element={<Backups />} />
            <Route path="/relatorios/restores" element={<Restores />} />
          </Route>
        </Route>

        {/* Área exclusiva admin */}
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
