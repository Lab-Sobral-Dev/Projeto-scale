// src/components/BackupCard.jsx
import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, RefreshCcw, HardDrive } from "lucide-react"
import api from "@/services/api"

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:8000/api")
const AUTH_ME_URL = `${API_BASE}/usuarios/auth/me/`

export default function BackupCard({ isAdmin }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [canExecute, setCanExecute] = useState(!!isAdmin) // fail-safe

  // Descobre permissão se a prop não foi informada
  useEffect(() => {
    let mounted = true
    const hydratePerm = async () => {
      if (typeof isAdmin === "boolean") {
        setCanExecute(isAdmin)
        return
      }
      try {
        const { data } = await api.get(AUTH_ME_URL.replace(API_BASE, "")) // mantém base do api service
        const admin =
          data?.is_staff === true ||
          data?.is_superuser === true ||
          String(data?.tipo || "").toLowerCase().includes("admin")
        if (mounted) setCanExecute(admin)
      } catch {
        // se falhar, assume false
        if (mounted) setCanExecute(false)
      }
    }
    hydratePerm()
    return () => { mounted = false }
  }, [isAdmin])

  const carregar = async () => {
    const { data } = await api.get("/registro/backups/")
    setItems(data)
  }

  const executar = async () => {
    try {
      setLoading(true)
      await api.post("/registro/backups/execute/")
      await carregar()
      alert("Backup concluído com sucesso.")
    } catch (e) {
      alert("Falha ao executar backup: " + (e?.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
    }
  }

  // --- DOWNLOAD COM JWT NO HEADER ---
  const baixar = async (id) => {
    try {
      const base = (import.meta.env?.VITE_API_BASE_URL || "").replace(/\/+$/, "")
      const url = `${base}/registro/backups/${id}/download/`

      // use a mesma chave do restante do app
      const token = localStorage.getItem("access")
      if (!token) {
        alert("Sessão expirada. Faça login novamente.")
        return
      }

      const resp = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(msg || `Erro HTTP ${resp.status}`)
      }

      const blob = await resp.blob()
      const cd = resp.headers.get("Content-Disposition") || ""
      const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd)
      let filename = match ? decodeURIComponent(match[1].replace(/^UTF-8''/, "")) : `backup-${id}.bin`

      const link = document.createElement("a")
      const objectUrl = window.URL.createObjectURL(blob)
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
    } catch (err) {
      alert("Erro no download: " + (err?.message || err))
    }
  }

  useEffect(() => { carregar() }, [])

  return (
    <Card className="w-full">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          <CardTitle>Backups do Banco</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={carregar}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Atualizar
          </Button>
          {canExecute && (
            <Button onClick={executar} disabled={loading}>
              <Download className="w-4 h-4 mr-2" />
              {loading ? "Executando..." : "Backup completo"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-3">
          O backup inclui todos os apps (registro, usuários, logs etc.) e fica disponível para download.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                <th className="py-2">Quando</th>
                <th className="py-2">Quem</th>
                <th className="py-2">Engine</th>
                <th className="py-2">Tamanho</th>
                <th className="py-2">Status</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(b => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="py-2">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="py-2">{b.executed_by || "—"}</td>
                  <td className="py-2">{b.engine}</td>
                  <td className="py-2">{(b.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                  <td className="py-2">{b.status === "success" ? "OK" : "Erro"}</td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => baixar(b.id)}
                      disabled={b.status !== "success"}
                    >
                      <Download className="w-4 h-4 mr-1" /> Baixar
                    </Button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan="6" className="py-4 text-center text-muted-foreground">Nenhum backup ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
