# Sistema de Pesagem - Frontend

Frontend React desenvolvido para o Sistema de Gerenciamento de Pesagem de Matéria-Prima, construído com Vite, Tailwind CSS e shadcn/ui.

## 🚀 Tecnologias Utilizadas

- **React 19** - Biblioteca JavaScript para construção de interfaces
- **Vite** - Build tool e servidor de desenvolvimento
- **Tailwind CSS** - Framework CSS utilitário
- **shadcn/ui** - Componentes de UI modernos e acessíveis
- **Lucide React** - Ícones SVG
- **React Router DOM** - Roteamento para aplicações React
- **Framer Motion** - Animações e transições

## 📋 Funcionalidades Implementadas

### 🔐 Autenticação
- Tela de login com validação
- Controle de acesso via JWT (simulado)
- Logout seguro

### 📊 Dashboard
- Visão geral do sistema
- Estatísticas de pesagens
- Ações rápidas
- Últimas pesagens registradas

### ⚖️ Nova Pesagem
- Formulário completo para registro de pesagens
- Cálculo automático do peso líquido
- Validações em tempo real
- Geração de etiquetas

### 📈 Histórico de Pesagens
- Listagem completa de pesagens
- Filtros avançados (produto, MP, OP, lote, data, pesador)
- Ações para visualizar, editar e gerar etiquetas
- Paginação e busca

### 📦 Cadastro de Produtos
- CRUD completo de produtos
- Campos: nome, código interno, volume padrão, unidade
- Status ativo/inativo
- Busca e filtros

### 🧱 Cadastro de Matérias-Primas
- CRUD completo de matérias-primas
- Campos: nome, status ativo/inativo
- Estatísticas de cadastros
- Interface intuitiva

### 👤 Perfil do Usuário
- Informações do usuário logado
- Detalhes da sessão atual
- Permissões por tipo de usuário
- Logout

### 🏷️ Geração de Etiquetas
- Prévia da etiqueta antes da impressão
- Layout com duas etiquetas por página
- Dados completos da pesagem
- Opções de impressão e download PDF

## 🎨 Design e UX

- **Design Responsivo**: Funciona perfeitamente em desktop, tablet e mobile
- **Interface Moderna**: Utiliza componentes shadcn/ui com design system consistente
- **Acessibilidade**: Componentes acessíveis com suporte a leitores de tela
- **Animações Suaves**: Transições e micro-interações com Framer Motion
- **Feedback Visual**: Estados de loading, sucesso e erro
- **Navegação Intuitiva**: Sidebar responsiva com indicadores visuais

## 🛠️ Instalação e Configuração

### Pré-requisitos
- Node.js 18+ 
- pnpm (recomendado) ou npm

### Passos para instalação

1. **Clone o repositório**
   ```bash
   git clone <url-do-repositorio>
   cd scale/frontend
   ```

2. **Instale as dependências**
   ```bash
   pnpm install
   # ou
   npm install
   ```

3. **Configure as variáveis de ambiente**
   ```bash
   cp .env.example .env
   ```
   
   Edite o arquivo `.env` com as configurações do backend:
   ```env
   REACT_APP_API_URL=http://localhost:8000/api
   ```

4. **Inicie o servidor de desenvolvimento**
   ```bash
   pnpm run dev
   # ou
   npm run dev
   ```

5. **Acesse a aplicação**
   ```
   http://localhost:5173
   ```

## 🔑 Credenciais de Teste

Para testar a aplicação, use as seguintes credenciais:

- **Usuário**: `admin`
- **Senha**: `admin`

## 📁 Estrutura do Projeto

```
src/
├── components/           # Componentes React
│   ├── ui/              # Componentes shadcn/ui
│   ├── Dashboard.jsx    # Tela principal
│   ├── Login.jsx        # Tela de login
│   ├── Layout.jsx       # Layout principal
│   ├── NovaPesagem.jsx  # Formulário de pesagem
│   ├── Historico.jsx    # Histórico de pesagens
│   ├── CadastroProduto.jsx
│   ├── CadastroMateriaPrima.jsx
│   ├── PerfilUsuario.jsx
│   └── GeracaoEtiqueta.jsx
├── services/            # Serviços de API
│   └── api.js          # Cliente HTTP para backend
├── hooks/              # Hooks personalizados
│   └── useApi.js       # Hook para operações de API
├── assets/             # Recursos estáticos
├── App.jsx             # Componente principal
├── App.css             # Estilos globais
└── main.jsx            # Ponto de entrada
```

## 🔌 Integração com Backend

O frontend está preparado para integração com o backend Django através de:

- **API REST**: Comunicação via endpoints RESTful
- **Autenticação JWT**: Sistema de tokens para autenticação
- **CRUD Completo**: Operações para produtos, matérias-primas e pesagens
- **Upload de Arquivos**: Suporte para geração de etiquetas PDF

### Endpoints Esperados

```
GET    /api/produtos/              # Listar produtos
POST   /api/produtos/              # Criar produto
PUT    /api/produtos/{id}/         # Atualizar produto
DELETE /api/produtos/{id}/         # Excluir produto

GET    /api/materias-primas/       # Listar matérias-primas
POST   /api/materias-primas/       # Criar matéria-prima
PUT    /api/materias-primas/{id}/  # Atualizar matéria-prima
DELETE /api/materias-primas/{id}/  # Excluir matéria-prima

GET    /api/pesagens/              # Listar pesagens
POST   /api/pesagens/              # Criar pesagem
PUT    /api/pesagens/{id}/         # Atualizar pesagem
DELETE /api/pesagens/{id}/         # Excluir pesagem

GET    /api/etiqueta/{id}/         # Gerar etiqueta PDF

POST   /api/auth/login/            # Login
POST   /api/auth/logout/           # Logout
```

## 📱 Responsividade

A aplicação é totalmente responsiva e funciona em:

- **Desktop**: Layout completo com sidebar fixa
- **Tablet**: Layout adaptado com sidebar colapsável
- **Mobile**: Interface otimizada para toque com menu hambúrguer

## 🎯 Próximos Passos

Para produção, considere:

1. **Configurar variáveis de ambiente** para diferentes ambientes
2. **Implementar autenticação real** com o backend Django
3. **Adicionar testes unitários** com Jest e React Testing Library
4. **Configurar CI/CD** para deploy automatizado
5. **Implementar PWA** para uso offline
6. **Adicionar monitoramento** de erros e performance

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Suporte

Para dúvidas ou suporte, entre em contato através de:

- Email: suporte@sistema-pesagem.com
- Issues: [GitHub Issues](https://github.com/seu-usuario/sistema-pesagem/issues)

---

Desenvolvido com ❤️ usando React, Vite e Tailwind CSS

