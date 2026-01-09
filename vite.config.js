import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Excluimos ambas versiones por seguridad y el motor ONNX
    exclude: ['@xenova/transformers', '@huggingface/transformers', 'onnxruntime-web'],
  },
  build: {
    target: 'esnext' // Permite características modernas de JS que la IA necesita
  }
})