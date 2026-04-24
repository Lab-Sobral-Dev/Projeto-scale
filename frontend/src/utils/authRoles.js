// src/utils/authRoles.js

function _decodeJwtPayload(token) {
    try {
        const payload = JSON.parse(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        )
        if (payload.exp && payload.exp * 1000 < Date.now()) return null
        return payload
    } catch {
        return null
    }
}

function _getUserFromStorage() {
    try {
        const raw = localStorage.getItem('user')
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

export function getUserRole() {
    // Preferencial: papel embutido no JWT — não mutável via DevTools
    const access = localStorage.getItem('access')
    if (access) {
        const payload = _decodeJwtPayload(access)
        if (payload?.papel) return payload.papel
    }

    // Fallback para tokens emitidos antes desta correção (sem a claim 'papel')
    const data = _getUserFromStorage()
    if (!data) return null
    if (data.tipo) return data.tipo
    if (data.perfil?.papel) return data.perfil.papel
    if (data.papel) return data.papel
    if (data.is_superuser || data.is_staff) return 'admin'
    return null
}

export function isAdmin() {
    return getUserRole() === 'admin'
}

export function isSupervisor() {
    return getUserRole() === 'supervisor'
}

// Operador, Supervisor e Admin podem criar pesagem
export function canCreatePesagem() {
    const role = getUserRole()
    return role === 'admin' || role === 'supervisor' || role === 'operador'
}

// Apenas Supervisor e Admin podem editar pesagem
export function canEditPesagem() {
    const role = getUserRole()
    return role === 'admin' || role === 'supervisor'
}

// Admin ou Supervisor podem ver relatórios
export function canViewReports() {
    const role = getUserRole()
    return role === 'admin' || role === 'supervisor'
}
