import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es', // Obligatorio para que funcionen los workers como módulos
  },
  build: {
    target: 'esnext' // <--- AÑADE ESTO: Evita errores al construir la versión final
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers', 'onnxruntime-web'],
  },
  define: {
    global: 'globalThis',
  },
})