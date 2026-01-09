// src/worker.js
// Worker para la clasificación de texto (Intención de usuario / Sombreros)

// 1. CAMBIO IMPORTANTE: Usamos la CDN para que no busque en node_modules
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0';

// Configuración: No buscar modelos en disco local, usar caché del navegador
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton del modelo
class OrquestadorPipeline {
    static task = 'zero-shot-classification';
    static model = 'Xenova/mobilebert-uncased-mnli'; 
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
  const { text } = event.data;
  if (!text) return;

  try {
    // 1. Notificar carga
    let classifier = await OrquestadorPipeline.getInstance((data) => {
      if (data.status === 'progress') {
        self.postMessage({ 
          status: 'loading', 
          output: { status: 'Cargando clasificador', progress: data.progress } 
        });
      }
    });

    // 2. Definir las etiquetas (Intenciones)
    // Las ponemos en inglés porque este modelo entiende mejor el inglés, 
    // aunque clasifica texto en español perfectamente.
    const candidate_labels = [
      "critical risk problem",          // Sombrero Negro
      "creative idea new alternative",  // Sombrero Verde
      "objective fact data number",     // Sombrero Blanco
      "emotion feeling intuition",      // Sombrero Rojo
      "positive benefit advantage",     // Sombrero Amarillo
      "process summary organization"    // Sombrero Azul
    ];

    // 3. Ejecutar clasificación
    const output = await classifier(text, candidate_labels);

    // 4. Devolver resultado
    self.postMessage({
      status: 'complete',
      result: output
    });

  } catch (err) {
    self.postMessage({
      status: 'error',
      output: err.message
    });
  }
});