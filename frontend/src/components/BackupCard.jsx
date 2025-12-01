// src/components/BackupCard.jsx
import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, RefreshCcw, HardDrive } from "lucide-react"
import api from "@/services/api" // <--- Importa a instância configurada do Axios

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:8000/api")
const AUTH_ME_URL = `${API_BASE}/usuarios/auth/me/`

export default function BackupCard({ isAdmin }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [canExecute, setCanExecute] = useState(!!isAdmin)

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

  // --- DOWNLOAD CORRIGIDO ---
  const baixar = async (id) => {
    try {
      // 1. Faz a requisição usando a instância 'api' (já tem BaseURL e Token)
      // Definimos responseType: 'blob' para receber binário
      const response = await api.get(`/registro/backups/${id}/download/`, {
        responseType: 'blob',
      })

      // 2. Tenta extrair o nome do arquivo do header Content-Disposition
      // Nota: Axios traz headers em lowercase
      const cd = response.headers['content-disposition']
      let filename = `backup-${id}.sql.gz` // Nome padrão caso falhe a extração

      if (cd) {
        const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd)
        if (match) {
          // Remove aspas extras se houver e decodifica
          filename = decodeURIComponent(match[1].replace(/^UTF-8''/, "").replace(/['"]/g, ""))
        }
      }

      // 3. Cria um link temporário para forçar o download no navegador
      const blob = new Blob([response.data], { type: response.headers['content-type'] })
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")

      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()

      // Limpeza
      link.remove()
      window.URL.revokeObjectURL(objectUrl)

    } catch (err) {
      console.error(err)

      // Se o backend retornou um JSON de erro (ex: 404), ele virá como Blob.
      // Precisamos ler o texto do Blob para mostrar a mensagem correta.
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
                  <td className="py-2">
                    {b.size_bytes ? (b.size_bytes / 1024 / 1024).toFixed(2) + " MB" : "0 B"}
                  </td>
                  <td className="py-2">
                    <span className={b.status === "success" ? "text-green-600 font-medium" : "text-red-600"}>
                      {b.status === "success" ? "OK" : "Erro"}
                    </span>
                  </td>
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