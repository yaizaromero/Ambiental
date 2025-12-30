import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // AQUI ESTÁ LA CLAVE: Añadimos 'onnxruntime-web' para que no lo rompa
    exclude: ['@xenova/transformers', 'onnxruntime-web'],
  },
})