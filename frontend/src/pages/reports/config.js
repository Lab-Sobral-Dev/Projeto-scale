// src/pages/reports/config.js
import {
  Calendar, FileDown, Printer, Search, User, Weight, ShieldAlert,
  ClipboardList, Network, Package, Layers, Users, MonitorCog
} from 'lucide-react'

/**
 * Cada entrada descreve:
 *  - title: título da página
 *  - path: endpoint do backend (após /api/reports)
 *  - columns: colunas da tabela (key -> header)
 *  - filters: campos do formulário (tipos: text | date | select)
 *  - exportParams: parâmetros padrão para exportação PDF/CSV
 */

const DEFAULT_EXPORT_PARAMS = {
  pdf: { paper: 'A4', orientation: 'landscape', font_size: '9' },
  csv: {},
}

export const REPORTS = {
  pesagens: {
    title: 'Relatório de Pesagens',
    path: '/pesagens/',
    columns: [
      { key: 'data_hora', header: 'Data/Hora' },
      { key: 'op_numero', header: 'OP' },
      { key: 'produto', header: 'Produto' },
      { key: 'materia_prima', header: 'Matéria-Prima' },
      { key: 'pesador', header: 'Pesador' },
      { key: 'bruto', header: 'Bruto (kg)' },
      { key: 'tara', header: 'Tara (kg)' },
      { key: 'liquido', header: 'Líquido (g)' },
      { key: 'lote_mp', header: 'Lote MP' },
      { key: 'balanca_nome', header: 'Balança' },
      { key: 'codigo_interno', header: 'Código Interno' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date', icon: Calendar },
      { name: 'data_final', label: 'Data final', type: 'date', icon: Calendar },
      { name: 'produto', label: 'Produto', type: 'select', icon: Package, options: [{ value: '__all__', label: 'Todos' }] },
      { name: 'materia_prima', label: 'Matéria-Prima', type: 'text', icon: Layers },
      { name: 'op', label: 'OP', type: 'text', icon: ClipboardList },
      { name: 'lote', label: 'Lote', type: 'text', icon: ClipboardList },
      { name: 'operador', label: 'Operador', type: 'text', icon: User },
      {
        name: 'status',
        label: 'Status da OP',
        type: 'select',
        options: [
          { value: '__all__', label: 'Todos' },
          { value: 'aberta', label: 'Aberta' },
          { value: 'em_andamento', label: 'Em andamento' },
          { value: 'concluida', label: 'Concluída' },
          { value: 'cancelada', label: 'Cancelada' },
        ]
      },
      { name: 'balanca', label: 'Balança', type: 'text', icon: Network },
    ],
    primaryIcon: Weight,
    exportParams: DEFAULT_EXPORT_PARAMS
  },


  balancas: {
    title: 'Utilização de Balanças',
    path: '/balancas/',
    columns: [
      { key: 'balanca', header: 'Balança' },
      { key: 'count', header: 'Qtd. Pesagens' },
      { key: 'min', header: 'Primeira Utilização' },
      { key: 'max', header: 'Última Utilização' },
      { key: 'ultima_calibracao', header: 'Última Calibração' },
      { key: 'frequencia_calibracao_dias', header: 'Frequência (dias)' },
      { key: 'calibracao_realizada', header: 'Calibração Realizada?' },
      { key: 'em_calibracao', header: 'Em Calibração?' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date', icon: Calendar },
      { name: 'data_final', label: 'Data final', type: 'date', icon: Calendar },
      { name: 'balanca', label: 'Balança', type: 'text', icon: Network },
      { name: 'produto', label: 'Produto', type: 'select', icon: Package, options: [{ value: '__all__', label: 'Todos' }] },
      { name: 'materia_prima', label: 'Matéria-Prima', type: 'text', icon: Layers },
    ],
    primaryIcon: Network,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  produtos: {
    title: 'Produtos Cadastrados',
    path: '/produtos/',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'nome', header: 'Nome' },
      { key: 'codigo_interno', header: 'Código Interno' },
      { key: 'ativo', header: 'Ativo' },
    ],
    filters: [
      {
        name: 'status',
        label: 'Ativo?',
        type: 'select',
        options: [
          { value: '__all__', label: 'Todos' },
          { value: 'true', label: 'Sim' },
          { value: 'false', label: 'Não' },
        ]
      },
      { name: 'codigo_interno', label: 'Cód. Interno', type: 'text', icon: MonitorCog },
    ],
    primaryIcon: Package,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  mps: {
    title: 'Matérias-Primas',
    path: '/materias-primas/',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'nome', header: 'Nome' },
      { key: 'codigo_interno', header: 'Código Interno' },
      { key: 'ativo', header: 'Ativo' },
    ],
    filters: [
      {
        name: 'status',
        label: 'Ativo?',
        type: 'select',
        options: [
          { value: '__all__', label: 'Todos' },
          { value: 'true', label: 'Sim' },
          { value: 'false', label: 'Não' },
        ]
      },
      { name: 'codigo_interno', label: 'Cód. Interno', type: 'select', icon: MonitorCog, options: [{ value: '__all__', label: 'Todos' }] },
      { name: 'nome', label: 'Nome', type: 'select', icon: Layers, options: [{ value: '__all__', label: 'Todos' }] },
    ],
    primaryIcon: Layers,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  estrutura: {
    title: 'Estrutura de Produto',
    path: '/estrutura/',
    columns: [
      { key: 'produto', header: 'Produto' },
      { key: 'estrutura', header: 'Estrutura' },
      { key: 'materia_prima', header: 'Matéria-Prima' },
      { key: 'quantidade_por_lote_g', header: 'Qtd por Lote (g)' },
      { key: 'mp_ativa', header: 'MP Ativa?' },
    ],
    filters: [
      { name: 'produto', label: 'Produto', type: 'select', icon: Package, options: [{ value: '__all__', label: 'Todos' }] },
      {
        name: 'status_mp',
        label: 'MP Ativa?',
        type: 'select',
        options: [
          { value: '__all__', label: 'Todas' },
          { value: 'true', label: 'Sim' },
          { value: 'false', label: 'Não' },
        ]
      },
    ],
    primaryIcon: Layers,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  usuarios: {
    title: 'Usuários',
    path: '/usuarios/',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'username', header: 'Usuário' },
      { key: 'first_name', header: 'Nome' },
      { key: 'last_name', header: 'Sobrenome' },
      { key: 'email', header: 'Email' },
      { key: 'last_login', header: 'Último login' },
      { key: 'is_active', header: 'Ativo' },
      { key: 'perfil', header: 'Perfil' },
    ],
    filters: [
      {
        name: 'perfil',
        label: 'Perfil',
        type: 'select',
        options: [
          { value: '__all__', label: 'Todos' },
          { value: 'operador', label: 'Operador' },
          { value: 'supervisor', label: 'Supervisor' },
          { value: 'admin', label: 'Administrador' },
        ]
      },
      { name: 'nome', label: 'Nome/Usuário', type: 'text', icon: Users },
      { name: 'email', label: 'E-mail', type: 'text', icon: Users },
      {
        name: 'status',
        label: 'Ativo?',
        type: 'select',
        options: [
          { value: '__all__', label: 'Todos' },
          { value: 'true', label: 'Sim' },
          { value: 'false', label: 'Não' },
        ]
      },
    ],
    primaryIcon: Users,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  permissoes: {
    title: 'Permissões e Telas',
    path: '/permissoes/',
    columns: [
      { key: 'usuario', header: 'Usuário' },
      { key: 'perfil', header: 'Perfil' },
      { key: 'telas', header: 'Telas permitidas' },
      { key: 'concedido_por', header: 'Permissão concedida por' },
    ],
    filters: [
      {
        name: 'perfil',
        label: 'Perfil',
        type: 'select',
        options: [
          { value: '__all__', label: 'Todos' },
          { value: 'operador', label: 'Operador' },
          { value: 'supervisor', label: 'Supervisor' },
          { value: 'admin', label: 'Administrador' },
        ]
      },
      { name: 'usuario', label: 'Usuário', type: 'text', icon: Users },
    ],
    primaryIcon: MonitorCog,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  aud_acoes: {
    title: 'Administração — Alterações de Dados',
    dynamicFilters: true,
    path: '/auditoria/acoes/',
    columns: [
      { key: 'timestamp', header: 'Data/Hora (GMT-3)' },
      { key: 'usuario', header: 'Usuário' },
      { key: 'tipo_alteracao', header: 'Tipo de alteração' },
      { key: 'registro', header: 'Registro' },
      { key: 'motivo', header: 'Motivo' },
      { key: 'descricao', header: 'Descrição da ação', wrap: true },
      { key: 'antes', header: 'Antes da alteração', wrap: true, multiline: true },
      { key: 'depois', header: 'Depois da alteração', wrap: true, multiline: true },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date', icon: Calendar },
      { name: 'data_final', label: 'Data final', type: 'date', icon: Calendar },
      { name: 'usuario', label: 'Usuário', type: 'select', icon: Users, options: [{ value: '__all__', label: 'Todos' }] },
      { name: 'action', label: 'Ação', type: 'select', icon: ShieldAlert, options: [{ value: '__all__', label: 'Todas' }] },
      { name: 'model', label: 'Modelo', type: 'select', icon: ClipboardList, options: [{ value: '__all__', label: 'Todos' }] },
    ],
    primaryIcon: ShieldAlert,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  aud_auth: {
    title: 'Administração — Erros e Login',
    dynamicFilters: true,
    path: '/auditoria/auth-erros/',
    columns: [
      { key: 'timestamp', header: 'Data/Hora (GMT-3)' },
      { key: 'usuario_informado', header: 'Usuário informado' },
      { key: 'usuario', header: 'Usuário identificado' },
      { key: 'resultado_tentativa', header: 'Resultado da tentativa de login' },
      { key: 'falha_usuario', header: 'Usuário incorreto?' },
      { key: 'falha_senha', header: 'Senha incorreta?' },
      { key: 'motivo', header: 'Motivo da falha', wrap: true, multiline: true },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date' },
      { name: 'data_final', label: 'Data final', type: 'date' },
      { name: 'usuario', label: 'Usuário identificado', type: 'select', options: [{ value: '__all__', label: 'Todos' }] },
      { name: 'usuario_informado', label: 'Usuário informado', type: 'select', options: [{ value: '__all__', label: 'Todos' }] },
    ],
    primaryIcon: ShieldAlert,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  backups: {
    title: 'Backups',
    path: '/backups/',
    columns: [
      { key: 'timestamp', header: 'Data/Hora' },
      { key: 'usuario', header: 'Usuário' },
      { key: 'tipo', header: 'Tipo' },
      { key: 'arquivo', header: 'Arquivo' },
      { key: 'tamanho', header: 'Tamanho' },
      { key: 'obs', header: 'Obs.' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date' },
      { name: 'data_final', label: 'Data final', type: 'date' },
    ],
    primaryIcon: FileDown,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  restores: {
    title: 'Restaurações',
    path: '/restores/',
    columns: [
      { key: 'timestamp', header: 'Data/Hora' },
      { key: 'usuario', header: 'Usuário' },
      { key: 'arquivo', header: 'Arquivo Origem' },
      { key: 'resultado', header: 'Resultado' },
      { key: 'obs', header: 'Obs.' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date' },
      { name: 'data_final', label: 'Data final', type: 'date' },
    ],
    primaryIcon: Printer,
    exportParams: DEFAULT_EXPORT_PARAMS
  }
}
