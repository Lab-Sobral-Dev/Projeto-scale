import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom'
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

/* ================================
   Helpers de papel no frontend
   ================================ */

const getUserRole = () => {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const data = JSON.parse(raw)

    // preferir campo "tipo" vindo do /auth/me
    return (
      data?.tipo ||          // 'admin' | 'supervisor' | 'operador'
      data?.perfil?.papel || // fallback se ainda vier assim
      data?.papel ||         // outro fallback
      null
    )
  } catch {
    return null
  }
}

// Guard simples baseado no papel local (admin|supervisor)
const isReportViewer = () => {
  const papel = getUserRole()
  return papel === 'admin' || papel === 'supervisor'
}

// Guard de saída para relatórios
function RequireReportViewerOutlet() {
  return isReportViewer() ? <Outlet /> : <Navigate to="/" replace />
}

// Apenas um agrupador com Outlet para a família /relatorios
function ReportsOutlet() {
  return <Outlet />
}

// Guard para rotas que podem ser usadas por supervisor OU admin
function RequireSupervisorOrAdmin({ children }) {
  const papel = getUserRole()
  if (papel === 'admin' || papel === 'supervisor') {
    return children
  }
  return <Navigate to="/" replace />
}

function App() {
  const [user, setUser] = useState(null)
  const [bootChecked, setBootChecked] = useState(false)

  useEffect(() => {
    const access = localStorage.getItem('access')
    const userData = localStorage.getItem('user')
    if (access && userData) {
      setUser(JSON.parse(userData))
    }
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
    localStorage.removeItem('allowed_screens')
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

        {/* Área autenticada (um único Layout) */}
        <Route
          element={
            <RequireAuth>
              <Layout user={user} onLogout={handleLogout} />
            </RequireAuth>
          }
        >
          {/* Rotas gerais (qualquer autenticado) */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/nova-pesagem" element={<NovaPesagem />} />
          <Route path="/ops" element={<Ops />} />
          <Route path="/ops/nova" element={<CriarOP />} />
          <Route path="/pesagens/:id" element={<PesagemDetalhe />} />
          <Route path="/historico" element={<Historico />} />
          <Route
            path="/perfil"
            element={<PerfilUsuario user={user} onLogout={handleLogout} />}
          />
          <Route path="/etiqueta/:id" element={<GeracaoEtiqueta />} />
          <Route path="/sobre" element={<Sobre />} />

          {/* ===== Telas de cadastro/estrutura/balanças (supervisor OU admin) ===== */}
          <Route
            path="/cadastro-produto"
            element={
              <RequireSupervisorOrAdmin>
                <CadastroProduto />
              </RequireSupervisorOrAdmin>
            }
          />
          <Route
            path="/cadastro-materia-prima"
            element={
              <RequireSupervisorOrAdmin>
                <CadastroMateriaPrima />
              </RequireSupervisorOrAdmin>
            }
          />
          <Route
            path="/balancas"
            element={
              <RequireSupervisorOrAdmin>
                <CadastroBalanca />
              </RequireSupervisorOrAdmin>
            }
          />
          <Route
            path="/estruturas"
            element={
              <RequireSupervisorOrAdmin>
                <Estruturas />
              </RequireSupervisorOrAdmin>
            }
          />
          <Route
            path="/estruturas/:id"
            element={
              <RequireSupervisorOrAdmin>
                <ComposicaoEstrutura />
              </RequireSupervisorOrAdmin>
            }
          />

          {/* ===== Rotas exclusivamente admin (ex: gestão de usuários, auditoria, edição avançada) ===== */}
          <Route
            path="/usuarios"
            element={
              <RequireAdmin>
                <UsuariosAdmin />
              </RequireAdmin>
            }
          />
          <Route
            path="/pesagens/:id/editar"
            element={
              <RequireAdmin>
                <PesagemEditar />
              </RequireAdmin>
            }
          />
          <Route
            path="/auditoria"
            element={
              <RequireAdmin>
                <LogsAuditoria />
              </RequireAdmin>
            }
          />

          {/* ===== Área de Relatórios (apenas admin|supervisor) ===== */}
          <Route element={<RequireReportViewerOutlet />}>
            {/* Grupo /relatorios com index e filhos relativos */}
            <Route path="/relatorios" element={<ReportsOutlet />}>
              <Route index element={<ReportsHome />} /> {/* /relatorios */}
              <Route path="pesagens" element={<Pesagens />} />
              <Route path="lotes" element={<Lotes />} />
              <Route path="balancas" element={<Balancas />} />
              <Route path="produtos" element={<Produtos />} />
              <Route path="mps" element={<MPs />} />
              <Route path="estrutura" element={<Estrutura />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="permissoes" element={<Permissoes />} />
              <Route path="auditoria/acoes" element={<AuditoriaAcoes />} />
              <Route path="auditoria/exclusoes" element={<AuditoriaExclusoes />} />
              <Route path="auditoria/auth" element={<AuditoriaAuthErros />} />
              <Route path="backups" element={<Backups />} />
              <Route path="restores" element={<Restores />} />
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
