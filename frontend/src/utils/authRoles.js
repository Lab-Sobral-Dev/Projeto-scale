// src/utils/authRoles.js

// Lê o objeto "user" salvo no localStorage e tenta inferir o papel
export function getUserFromStorage() {
    try {
        const raw = localStorage.getItem('user')
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

export function getUserRole() {
    const data = getUserFromStorage()
    if (!data) return null

    // Preferimos o campo "tipo" vindo do /auth/me
    if (data.tipo) return data.tipo

    // Fallbacks para formatos anteriores
    if (data.perfil?.papel) return data.perfil.papel
    if (data.papel) return data.papel

    // Se não tiver nada, tentamos inferir:
    if (data.is_superuser || data.is_staff) return 'admin'

    return null
}

export function isAdmin() {
    const role = getUserRole()
    return role === 'admin'
}

export function isSupervisor() {
    const role = getUserRole()
    return role === 'supervisor'
}

// Supervisor OU Admin podem editar pesagem
export function canEditPesagem() {
    const role = getUserRole()
    return role === 'admin' || role === 'supervisor'
}

// Admin ou Supervisor podem ver relatórios
export function canViewReports() {
    const role = getUserRole()
    return role === 'admin' || role === 'supervisor'
}
