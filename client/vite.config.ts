import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      // Node orchestrator (Express on 4000)
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Python AI engine (FastAPI on 8000) — audio files + health
      '/audio': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
