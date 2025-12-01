// src/components/BackupCard.jsx
import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, RefreshCcw, HardDrive, RotateCcw, AlertTriangle } from "lucide-react"
import api from "@/services/api" // <--- Importa a instância configurada do Axios
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:8000/api")
const AUTH_ME_URL = `${API_BASE}/usuarios/auth/me/`

export default function BackupCard({ isAdmin }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [canExecute, setCanExecute] = useState(!!isAdmin)
  const [restoring, setRestoring] = useState(false) // Novo state para o restore

  // Descobre permissão se a prop não foi informada
  useEffect(() => {
    let mounted = true
    const hydratePerm = async () => {
      if (typeof isAdmin === "boolean") {
        setCanExecute(isAdmin)
        return
      }
      try {
        // Usa api.get para aproveitar o interceptor de token se houver
        const { data } = await api.get("/usuarios/auth/me/")
        const admin =
          data?.is_staff === true ||
          data?.is_superuser === true ||
          String(data?.tipo || "").toLowerCase().includes("admin")
        if (mounted) setCanExecute(admin)
      } catch {
        if (mounted) setCanExecute(false)
      }
    }
    hydratePerm()
    return () => { mounted = false }
  }, [isAdmin])

  const carregar = async () => {
    try {
      const { data } = await api.get("/registro/backups/")
      setItems(data)
    } catch (e) {
      console.error("Erro ao carregar lista de backups:", e)
    }
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

  // --- NOVA FUNÇÃO DE RESTORE ---
  const restaurar = async (id) => {
    try {
      setRestoring(true)
      // Chama a rota que cria o snapshot de segurança e restaura o banco
      await api.post(`/registro/backups/${id}/restore/`)

      alert("Sistema restaurado com sucesso! A página será recarregada para aplicar os dados antigos.")
      window.location.reload()
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message
      alert("ERRO CRÍTICO AO RESTAURAR: " + msg)
    } finally {
      setRestoring(false)
    }
  }

  // --- DOWNLOAD CORRIGIDO ---
  const baixar = async (id) => {
    try {
      const response = await api.get(`/registro/backups/${id}/download/`, {
        responseType: 'blob',
      })

      const cd = response.headers['content-disposition']
      let filename = `backup-${id}.sql.gz`

      if (cd) {
        const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd)
        if (match) {
          filename = decodeURIComponent(match[1].replace(/^UTF-8''/, "").replace(/['"]/g, ""))
        }
      }

      const blob = new Blob([response.data], { type: response.headers['content-type'] })
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")

      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()

      link.remove()
      window.URL.revokeObjectURL(objectUrl)

    } catch (err) {
      console.error(err)
      if (err.response && err.response.data instanceof Blob) {
        try {
          const errorText = await err.response.data.text()
          const errorJson = JSON.parse(errorText)
          alert("Erro no download: " + (errorJson.detail || "Falha desconhecida"))
        } catch {
          alert("Erro no download: Ocorreu um erro na requisição.")
        }
      } else {
        alert("Erro no download: " + (err?.message || "Erro desconhecido"))
      }
    }
  }

  useEffect(() => { carregar() }, [])

  return (
    <Card className="w-full border-t-4 border-t-blue-600">
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
                  <td className="py-2">
                    {b.size_bytes ? (b.size_bytes / 1024 / 1024).toFixed(2) + " MB" : "0 B"}
                  </td>
                  <td className="py-2">
                    <span className={b.status === "success" ? "text-green-600 font-medium" : "text-red-600"}>
                      {b.status === "success" ? "OK" : "Erro"}
                    </span>
                  </td>
                  <td className="py-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => baixar(b.id)}
                      disabled={b.status !== "success"}
                    >
                      <Download className="w-4 h-4 mr-1" /> Baixar
                    </Button>

                    {/* BOTÃO DE RESTORE (SÓ PARA ADMIN E SE STATUS=SUCCESS) */}
                    {canExecute && b.status === "success" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">
                            <RotateCcw className="w-4 h-4 mr-1" /> Restaurar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                              <AlertTriangle className="w-6 h-6" /> Perigo: Restaurar Banco de Dados
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Você está prestes a restaurar o backup de <strong>{new Date(b.created_at).toLocaleString()}</strong>.
                              <br /><br />
                              <span className="font-bold text-red-600">
                                ISSO SUBSTITUIRÁ OS DADOS ATUAIS PELOS DADOS DESTA DATA.
                              </span>
                              <br />
                              Um backup de segurança dos dados atuais será criado automaticamente antes da operação, mas o sistema voltará no tempo. Tem certeza absoluta?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => restaurar(b.id)}
                              disabled={restoring}
                            >
                              {restoring ? "Restaurando..." : "Sim, Restaurar Sistema"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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