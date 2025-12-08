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

import BackupConsole from '@/components/BackupConsole'
import './App.css'

// IMPORTADO AGORA DO LOCAL CORRETO
import { getUserRole, canViewReports } from '@/utils/authRoles'

// Wrapper simples para relatórios
function RequireReportViewer({ children }) {
  // canViewReports já verifica se é admin ou supervisor
  return canViewReports() ? children : <Navigate to="/" replace />
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

        {/* Área autenticada (um único Layout para tudo) */}
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
          {/* edição de pesagem – permissão tratada dentro do componente */}
          <Route path="/pesagens/:id/editar" element={<PesagemEditar />} />
          <Route
            path="/perfil"
            element={<PerfilUsuario user={user} onLogout={handleLogout} />}
          />
          <Route path="/historico" element={<Historico />} />
          <Route path="/etiqueta/:id" element={<GeracaoEtiqueta />} />
          <Route path="/sobre" element={<Sobre />} />

          {/* Cadastros / Estruturas / Balanças (menu + backend controlam quem enxerga/escreve) */}
          <Route path="/cadastro-produto" element={<CadastroProduto />} />
          <Route path="/cadastro-materia-prima" element={<CadastroMateriaPrima />} />
          <Route path="/balancas" element={<CadastroBalanca />} />
          <Route path="/estruturas" element={<Estruturas />} />
          <Route path="/estruturas/:id" element={<ComposicaoEstrutura />} />

          {/* ===== Rotas apenas admin ===== */}
          <Route
            path="/usuarios"
            element={
              <RequireAdmin>
                <UsuariosAdmin />
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

          {/* === Tela independente de BACKUP === */}
          <Route
            path="/backups"
            element={
              <RequireAdmin>
                <BackupConsole />
              </RequireAdmin>
            }
          />

          {/* ===== Relatórios (admin|supervisor) ===== */}
          <Route
            path="/relatorios"
            element={
              <RequireReportViewer>
                <ReportsHome />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/pesagens"
            element={
              <RequireReportViewer>
                <Pesagens />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/lotes"
            element={
              <RequireReportViewer>
                <Lotes />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/balancas"
            element={
              <RequireReportViewer>
                <Balancas />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/produtos"
            element={
              <RequireReportViewer>
                <Produtos />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/mps"
            element={
              <RequireReportViewer>
                <MPs />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/estrutura"
            element={
              <RequireReportViewer>
                <Estrutura />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/usuarios"
            element={
              <RequireReportViewer>
                <Usuarios />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/permissoes"
            element={
              <RequireReportViewer>
                <Permissoes />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/auditoria/acoes"
            element={
              <RequireReportViewer>
                <AuditoriaAcoes />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/auditoria/exclusoes"
            element={
              <RequireReportViewer>
                <AuditoriaExclusoes />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/auditoria/auth"
            element={
              <RequireReportViewer>
                <AuditoriaAuthErros />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/backups"
            element={
              <RequireReportViewer>
                <Backups />
              </RequireReportViewer>
            }
          />
          <Route
            path="/relatorios/restores"
            element={
              <RequireReportViewer>
                <Restores />
              </RequireReportViewer>
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App