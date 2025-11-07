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
      { name: 'produto', label: 'Produto', type: 'text', icon: Package },
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

  lotes: {
    title: 'Relatório de Lotes Produzidos',
    path: '/lotes/',
    columns: [
      { key: 'criada_em', header: 'Criada em' },
      { key: 'op', header: 'OP' },
      { key: 'produto', header: 'Produto' },
      { key: 'lote', header: 'Lote' },
      { key: 'status', header: 'Status' },
      { key: 'total_pesado_g', header: 'Total Pesado (g)' },
      { key: 'itens', header: 'Itens' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date', icon: Calendar },
      { name: 'data_final', label: 'Data final', type: 'date', icon: Calendar },
      { name: 'produto', label: 'Produto', type: 'text', icon: Package },
      { name: 'materia_prima', label: 'Matéria-Prima', type: 'text', icon: Layers },
      { name: 'op', label: 'OP', type: 'text', icon: ClipboardList },
    ],
    primaryIcon: ClipboardList,
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
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date', icon: Calendar },
      { name: 'data_final', label: 'Data final', type: 'date', icon: Calendar },
      { name: 'balanca', label: 'Balança', type: 'text', icon: Network },
      { name: 'operador', label: 'Operador', type: 'text', icon: User },
      { name: 'produto', label: 'Produto', type: 'text', icon: Package },
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
      { name: 'descricao', label: 'Descrição/Nome', type: 'text', icon: Package },
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
      { name: 'codigo_interno', label: 'Cód. Interno', type: 'text', icon: MonitorCog },
      { name: 'nome', label: 'Nome', type: 'text', icon: Layers },
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
      { name: 'produto', label: 'Produto', type: 'text', icon: Package },
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
    title: 'Auditoria — Ações de Usuário',
    path: '/auditoria/acoes/',
    columns: [
      { key: 'timestamp', header: 'Data/Hora' },
      { key: 'usuario', header: 'Usuário' },
      { key: 'action', header: 'Ação' },
      { key: 'model', header: 'Modelo' },
      { key: 'object_pk', header: 'Objeto' },
      { key: 'path', header: 'Path' },
      { key: 'method', header: 'Método' },
      { key: 'status_code', header: 'Status' },
      { key: 'ip', header: 'IP' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date', icon: Calendar },
      { name: 'data_final', label: 'Data final', type: 'date', icon: Calendar },
      { name: 'usuario', label: 'Usuário', type: 'text', icon: Users },
      { name: 'action', label: 'Ação', type: 'text', icon: ShieldAlert },
      { name: 'model', label: 'Modelo', type: 'text', icon: ClipboardList },
    ],
    primaryIcon: ShieldAlert,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  aud_exclusoes: {
    title: 'Auditoria — Exclusões',
    path: '/auditoria/exclusoes/',
    columns: [
      { key: 'timestamp', header: 'Data/Hora' },
      { key: 'usuario', header: 'Usuário' },
      { key: 'model', header: 'Modelo' },
      { key: 'object_pk', header: 'Objeto' },
      { key: 'path', header: 'Path' },
      { key: 'status_code', header: 'Status' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date', icon: Calendar },
      { name: 'data_final', label: 'Data final', type: 'date', icon: Calendar },
      { name: 'usuario', label: 'Usuário', type: 'text' },
      { name: 'model', label: 'Modelo', type: 'text' },
    ],
    primaryIcon: ShieldAlert,
    exportParams: DEFAULT_EXPORT_PARAMS
  },

  aud_auth: {
    title: 'Auditoria — Erros e Login',
    path: '/auditoria/auth-erros/',
    columns: [
      { key: 'timestamp', header: 'Data/Hora' },
      { key: 'usuario', header: 'Usuário' },
      { key: 'action', header: 'Ação' },
      { key: 'status_code', header: 'Status' },
      { key: 'path', header: 'Path' },
      { key: 'ip', header: 'IP' },
    ],
    filters: [
      { name: 'data_inicial', label: 'Data inicial', type: 'date' },
      { name: 'data_final', label: 'Data final', type: 'date' },
      { name: 'usuario', label: 'Usuário', type: 'text' },
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
