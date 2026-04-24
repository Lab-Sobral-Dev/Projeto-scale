import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Remove console.* e debugger do bundle de produção para evitar
    // exposição de stack traces e payloads internos no browser do usuário.
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}))
