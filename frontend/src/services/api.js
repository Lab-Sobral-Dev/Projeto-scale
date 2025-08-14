// Serviço de API para Django DRF + SimpleJWT
// Base paths: /api/registro/... e /api/usuarios/...

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:8000/api";

const REGISTRO_BASE = `${API_BASE_URL}/registro`;
const USUARIOS_BASE = `${API_BASE_URL}/usuarios`;

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
  }

  // ===== Request genérico com retry após refresh (401) =====
  async request(url, options = {}, { retry = true } = {}) {
    const token = this.access;
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const config = { ...options, headers };

    const res = await fetch(url, config);

    if (res.status === 401 && retry && this.refresh) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        const retryHeaders = {
          ...headers,
          Authorization: `Bearer ${this.access}`,
        };
        const res2 = await fetch(url, { ...options, headers: retryHeaders });
        if (!res2.ok) throw await this._asError(res2);
        return this._parseBody(res2);
      }
    }

    if (!res.ok) throw await this._asError(res);
    return this._parseBody(res);
  }

  async _asError(res) {
    let payload = {};
    try { payload = await res.json(); } catch { }
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    return err;
  }
  async _parseBody(res) {
    try { return await res.json(); } catch { return null; }
  }

  // ===== Auth (/api/usuarios/auth/...) =====
  async login({ username, password }) {
    const data = await this.request(
      `${this.baseUsuarios}/auth/login/`,
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      { retry: false }
    );
    if (data?.access) this.setTokens({ access: data.access, refresh: data.refresh });
    return data;
  }

  async refreshToken() {
    return this.tryRefresh();
  }

  async tryRefresh() {
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
    return true;
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
    return this.request(`${this.baseRegistro}/materias-primas/${qs ? `?${qs}` : ""}`);
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

  // ===== Pesagens (/api/registro/pesagens/) =====
  async getPesagens(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`${this.baseRegistro}/pesagens/${qs ? `?${qs}` : ""}`);
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

  // ===== Etiqueta PDF (/api/registro/etiqueta/<id>/) =====
  async gerarEtiquetaPDF(id) {
    const url = `${this.baseRegistro}/etiqueta/${id}/`;
    const token = this.access;

    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    if (res.status === 401 && this.refresh) {
      const ok = await this.tryRefresh();
      if (ok) {
        const res2 = await fetch(url, {
          headers: { Authorization: `Bearer ${this.access}` },
        });
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        return res2.blob();
      }
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
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


  // ===== Dashboard helper (opcional no front) =====
  async getDashboardStats() {
    const pesagens = await this.getPesagens();
    const produtos = await this.getProdutos();
    const materias = await this.getMateriasPrimas();

    const pesList = Array.isArray(pesagens) ? pesagens : (pesagens?.results ?? []);
    const produtosCount = Array.isArray(produtos) ? produtos.length : (produtos?.count ?? 0);
    const materiasCount = Array.isArray(materias) ? materias.length : (materias?.count ?? 0);

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const startWeek = new Date(now);
    startWeek.setDate(startWeek.getDate() - startWeek.getDay());
    const startWeekKey = startWeek.toISOString().slice(0, 10);

    const pesagensHoje = pesList.filter(p => (p.data_hora || '').startsWith(todayKey)).length;
    const pesagensSemana = pesList.filter(p => (p.data_hora || '') >= startWeekKey).length;

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
