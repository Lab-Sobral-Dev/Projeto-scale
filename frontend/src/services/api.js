// src/services/api.js
// Serviço de API para Django DRF + SimpleJWT
// Base paths: /api/registro/... e /api/usuarios/...

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  process.env.REACT_APP_API_URL ||
  "https://apiscale.laboratoriosobral.com.br/api";

const REGISTRO_BASE = `${API_BASE_URL}/registro`;
const USUARIOS_BASE = `${API_BASE_URL}/usuarios`;
const SESSION_EXPIRED_FLAG = "session_expired";

class ApiService {
  constructor() {
    this.baseRegistro = REGISTRO_BASE;
    this.baseUsuarios = USUARIOS_BASE;
  }

  // ===== Helpers de token =====
  get access() {
    return localStorage.getItem("access");
  }
  get refresh() {
    return localStorage.getItem("refresh");
  }
  setTokens({ access, refresh }) {
    if (access) localStorage.setItem("access", access);
    if (refresh) localStorage.setItem("refresh", refresh);
  }
  clearTokens() {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("allowed_screens");
    localStorage.removeItem("pwd_flags");
  }

  _flagSessionExpired() {
    try {
      sessionStorage.setItem(SESSION_EXPIRED_FLAG, "1");
    } catch {
      // sem acesso ao sessionStorage
    }
  }

  // ===== Navegação segura para login =====
  _redirectToLogin() {
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  // ===== Helpers de URL/query =====
  _qs(params) {
    if (!params) return "";
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const s = String(v).trim();
      if (s !== "") usp.set(k, s);
    });
    const q = usp.toString();
    return q ? `?${q}` : "";
  }

  _abs(path) {
    // aceita "/auditoria/" ou já absoluto
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  // ===== Atalhos HTTP estilo Axios =====
  async get(path, { params, headers } = {}) {
    const url = this._abs(path) + this._qs(params);
    return this.request(url, { method: "GET", headers });
  }

  async delete(path, { params, headers } = {}) {
    const url = this._abs(path) + this._qs(params);
    return this.request(url, { method: "DELETE", headers });
  }

  async post(path, body, { params, headers } = {}) {
    const url = this._abs(path) + this._qs(params);
    return this.request(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    });
  }

  async put(path, body, { params, headers } = {}) {
    const url = this._abs(path) + this._qs(params);
    return this.request(url, {
      method: "PUT",
      body: JSON.stringify(body),
      headers,
    });
  }

  async patch(path, body, { params, headers } = {}) {
    const url = this._abs(path) + this._qs(params);
    return this.request(url, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers,
    });
  }

  // ===== Request genérico com refresh (401) e fallback para login =====
  async request(url, options = {}, { retry = true } = {}) {
    const token = this.access;
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const config = { ...options, headers };

    let res;
    try {
      res = await fetch(url, config);
    } catch (networkErr) {
      // erro de rede (offline, CORS, etc.)
      const err = new Error("Falha de rede ao contatar o servidor.");
      err.status = 0;
      err.payload = null;
      err.response = { status: 0, data: null };
      throw err;
    }

    // tentativa de refresh para 401 (somente 401; 423 não tenta)
    if (res.status === 401 && retry && this.refresh) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        const retryHeaders = {
          ...headers,
          Authorization: `Bearer ${this.access}`,
        };
        const res2 = await fetch(url, { ...options, headers: retryHeaders });
        if (!res2.ok) {
          // se ainda assim voltou 401/403, limpar e ir para login
          if (res2.status === 401 || res2.status === 403) {
            if (res2.status === 401) this._flagSessionExpired();
            this.clearTokens();
            this._redirectToLogin();
          }
          throw await this._asError(res2);
        }
        return this._parseBody(res2);
      }
    }

    // 401/403 sem refresh válido -> logout + login
    if ((res.status === 401 || res.status === 403) && retry) {
      if (res.status === 401) this._flagSessionExpired();
      this.clearTokens();
      this._redirectToLogin();
    }

    if (!res.ok) throw await this._asError(res);
    return this._parseBody(res);
  }

  async _asError(res) {
    let payload = {};
    try {
      payload = await res.json();
    } catch {
      // corpo não-JSON
    }
    const err = new Error(payload?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    // compat com telas que leem err.response.data
    err.response = { status: res.status, data: payload };
    return err;
  }

  async _parseBody(res) {
    try {
      return await res.json();
    } catch {
      return null; // 204/sem corpo
    }
  }

  // ===== Auth (/api/usuarios/auth/...) =====
  async login({ username, password }) {
    const data = await this.request(
      `${this.baseUsuarios}/auth/login/`,
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      { retry: false } // não tenta refresh no login
    );
    if (data?.access) this.setTokens({ access: data.access, refresh: data.refresh });
    return data;
  }

  async refreshToken() {
    return this.tryRefresh();
  }

  async tryRefresh() {
    if (!this.refresh) return false;
    try {
      const res = await fetch(`${this.baseUsuarios}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: this.refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data?.access) {
        this.setTokens({ access: data.access });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async me() {
    return this.request(`${this.baseUsuarios}/auth/me/`);
  }

  async logout() {
    // SimpleJWT não tem logout server-side; limpamos localmente
    this.clearTokens();
    this._redirectToLogin();
    return true;
  }

  // ===== Segurança do usuário (admin) =====
  async getUserSecurity(userId) {
    return this.request(`${this.baseUsuarios}/security/${userId}/`);
  }

  async unlockUser(userId) {
    return this.request(`${this.baseUsuarios}/security/${userId}/unlock/`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async forceResetUser(userId, temporary_password) {
    const body = temporary_password ? { temporary_password } : {};
    return this.request(`${this.baseUsuarios}/security/${userId}/force-reset/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ===== Troca de senha (usuário autenticado) =====
  async changePassword({ current_password, new_password, confirm_password }) {
    return this.request(`${this.baseUsuarios}/auth/change-password/`, {
      method: "POST",
      body: JSON.stringify({ current_password, new_password, confirm_password }),
    });
  }

  // ===== Produtos (/api/registro/produtos/) =====
  async getProdutos(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`${this.baseRegistro}/produtos/${qs ? `?${qs}` : ""}`);
  }
  async getProduto(id) {
    return this.request(`${this.baseRegistro}/produtos/${id}/`);
  }
  async createProduto(produto) {
    return this.request(`${this.baseRegistro}/produtos/`, {
      method: "POST",
      body: JSON.stringify(produto),
    });
  }
  async updateProduto(id, produto) {
    return this.request(`${this.baseRegistro}/produtos/${id}/`, {
      method: "PUT",
      body: JSON.stringify(produto),
    });
  }
  async deleteProduto(id) {
    return this.request(`${this.baseRegistro}/produtos/${id}/`, {
      method: "DELETE",
    });
  }

  // ===== Matérias-Primas (/api/registro/materias-primas/) =====
  async getMateriasPrimas(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(
      `${this.baseRegistro}/materias-primas/${qs ? `?${qs}` : ""}`
    );
  }
  async getMateriaPrima(id) {
    return this.request(`${this.baseRegistro}/materias-primas/${id}/`);
  }
  async createMateriaPrima(mp) {
    return this.request(`${this.baseRegistro}/materias-primas/`, {
      method: "POST",
      body: JSON.stringify(mp),
    });
  }
  async updateMateriaPrima(id, mp) {
    return this.request(`${this.baseRegistro}/materias-primas/${id}/`, {
      method: "PUT",
      body: JSON.stringify(mp),
    });
  }
  async deleteMateriaPrima(id) {
    return this.request(`${this.baseRegistro}/materias-primas/${id}/`, {
      method: "DELETE",
    });
  }

  // ===== Balanças (/api/registro/balancas/) =====
  async getBalancas(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`${this.baseRegistro}/balancas/${qs ? `?${qs}` : ""}`);
  }
  async getBalanca(id) {
    return this.request(`${this.baseRegistro}/balancas/${id}/`);
  }
  async createBalanca(balanca) {
    return this.request(`${this.baseRegistro}/balancas/`, {
      method: "POST",
      body: JSON.stringify(balanca),
    });
  }
  async updateBalanca(id, balanca) {
    return this.request(`${this.baseRegistro}/balancas/${id}/`, {
      method: "PUT",
      body: JSON.stringify(balanca),
    });
  }
  async deleteBalanca(id) {
    return this.request(`${this.baseRegistro}/balancas/${id}/`, {
      method: "DELETE",
    });
  }

  // ===== Estruturas (BOM) (/api/registro/estruturas/) =====
  async getEstruturas(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(
      `${this.baseRegistro}/estruturas/${qs ? `?${qs}` : ""}`
    );
  }
  async getEstrutura(id) {
    return this.request(`${this.baseRegistro}/estruturas/${id}/`);
  }
  async getItensEstrutura(estruturaId) {
    return this.request(`${this.baseRegistro}/estruturas/${estruturaId}/itens/`);
  }
  async createItemEstrutura(item) {
    return this.request(`${this.baseRegistro}/itens-estrutura/`, {
      method: "POST",
      body: JSON.stringify(item),
    });
  }
  async updateItemEstrutura(id, item) {
    return this.request(`${this.baseRegistro}/itens-estrutura/${id}/`, {
      method: "PUT",
      body: JSON.stringify(item),
    });
  }
  async deleteItemEstrutura(id) {
    return this.request(`${this.baseRegistro}/itens-estrutura/${id}/`, {
      method: "DELETE",
    });
  }

  // ===== OPs (/api/registro/ops/) =====
  async getOPs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`${this.baseRegistro}/ops/${qs ? `?${qs}` : ""}`);
  }
  async getOP(id) {
    return this.request(`${this.baseRegistro}/ops/${id}/`);
  }
  async createOP(payload) {
    // { numero, produto_id, estrutura_id, lote, observacoes? }
    return this.request(`${this.baseRegistro}/ops/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
  async updateOP(id, payload) {
    return this.request(`${this.baseRegistro}/ops/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }
  async deleteOP(id) {
    return this.request(`${this.baseRegistro}/ops/${id}/`, {
      method: "DELETE",
    });
  }
  async gerarItensOP(opId, forcar = false) {
    const qs = forcar ? "?forcar=1" : "";
    return this.request(
      `${this.baseRegistro}/ops/${opId}/gerar-itens/${qs}`,
      {
        method: "POST",
      }
    );
  }
  async concluirSePossivelOP(opId) {
    return this.request(
      `${this.baseRegistro}/ops/${opId}/concluir-se-possivel/`,
      {
        method: "POST",
      }
    );
  }
  async getOPItems(opId) {
    return this.request(`${this.baseRegistro}/ops/${opId}/itens/`);
  }

  // ===== Itens-OP (CRUD direto se precisar) (/api/registro/itens-op/) =====
  async getItensOP(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`${this.baseRegistro}/itens-op/${qs ? `?${qs}` : ""}`);
  }
  async getItemOP(id) {
    return this.request(`${this.baseRegistro}/itens-op/${id}/`);
  }
  async updateItemOP(id, payload) {
    return this.request(`${this.baseRegistro}/itens-op/${id}/`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  // ===== Pesagens (/api/registro/pesagens/) =====
  async getPesagens(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(
      `${this.baseRegistro}/pesagens/${qs ? `?${qs}` : ""}`
    );
  }
  async getPesagem(id) {
    return this.request(`${this.baseRegistro}/pesagens/${id}/`);
  }
  async createPesagem(pesagem) {
    return this.request(`${this.baseRegistro}/pesagens/`, {
      method: "POST",
      body: JSON.stringify(pesagem),
    });
  }
  async createPesagemOP(payload) {
    // { op_id, item_op_id, bruto, tara, volume?, balanca_id?, codigo_interno? }
    return this.request(`${this.baseRegistro}/pesagens/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
  async updatePesagem(id, pesagem) {
    return this.request(`${this.baseRegistro}/pesagens/${id}/`, {
      method: "PUT",
      body: JSON.stringify(pesagem),
    });
  }
  async deletePesagem(id) {
    return this.request(`${this.baseRegistro}/pesagens/${id}/`, {
      method: "DELETE",
    });
  }

  // ===== Backups (/api/registro/backups/) =====
  async getBackups(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(
      `${this.baseRegistro}/backups/${qs ? `?${qs}` : ""}`
    );
  }

  async executeBackup() {
    return this.request(`${this.baseRegistro}/backups/execute/`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  // ===== Etiqueta PDF (/api/registro/etiqueta/<id>/) =====
  async gerarEtiquetaPDF(id) {
    const url = `${this.baseRegistro}/etiqueta/${id}/`;
    const call = async (authToken) => {
      const res = await fetch(url, {
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    };

    try {
      return await call(this.access);
    } catch (e) {
      // tenta refresh se 401
      if (String(e?.message || "").includes("401") && this.refresh) {
        const ok = await this.tryRefresh();
        if (ok) return await call(this.access);
      }
      throw e;
    }
  }

  // ===== Dashboard helper (opcional no front) =====
  async getDashboardStats() {
    const pesagens = await this.getPesagens();
    const produtos = await this.getProdutos();
    const materias = await this.getMateriasPrimas();

    const pesList = Array.isArray(pesagens)
      ? pesagens
      : pesagens?.results ?? [];
    const produtosCount = Array.isArray(produtos)
      ? produtos.length
      : produtos?.count ?? 0;
    const materiasCount = Array.isArray(materias)
      ? materias.length
      : materias?.count ?? 0;

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const startWeek = new Date(now);
    startWeek.setDate(startWeek.getDate() - startWeek.getDay());
    const startWeekKey = startWeek.toISOString().slice(0, 10);

    const pesagensHoje = pesList.filter((p) =>
      (p.data_hora || "").startsWith(todayKey)
    ).length;
    const pesagensSemana = pesList.filter(
      (p) => (p.data_hora || "") >= startWeekKey
    ).length;

    return {
      pesagensHoje,
      pesagensSemana,
      produtosCadastrados: produtosCount,
      materiasPrimas: materiasCount,
      ultimasPesagens: pesList.slice(0, 5),
    };
  }
}

const api = new ApiService();
export default api;