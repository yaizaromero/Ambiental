import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0";
import { chunkText } from "./ragUtils.js";

// Configuración de rendimiento máximo
env.allowLocalModels = false;
env.useBrowserCache = true;

// El extractor es muy ligero, puede quedarse residente
let extractor = null;
let db = [];

self.addEventListener("message", async (event) => {
  const { type, payload } = event.data;

  try {
    if (type === "INDEX_TEXT") {
      const { text } = payload;
      db = []; 

      if (!extractor) {
        self.postMessage({ type: "STATUS", payload: "Iniciando buscador..." });
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          device: "webgpu" 
        });
      }

      const chunks = chunkText(text, 300);
      self.postMessage({ type: "STATUS", payload: `Indexando ${chunks.length} partes...` });
      
      for (let i = 0; i < chunks.length; i++) {
        const output = await extractor(chunks[i], { pooling: 'mean', normalize: true });
        db.push({ text: chunks[i], embedding: output.data });
        if (i % 10 === 0) self.postMessage({ type: "STATUS", payload: `Procesando PDF... ${Math.round(((i+1)/chunks.length)*100)}%` });
      }
      self.postMessage({ type: "INDEX_COMPLETE" });
    }

    if (type === "ASK_QUESTION") {
      const { question } = payload;
      
      if (!extractor) throw new Error("Sube un PDF primero.");

      // 1. Búsqueda rápida
      const qOutput = await extractor(question, { pooling: 'mean', normalize: true });
      const qEmbed = qOutput.data;
      const scores = db.map(doc => {
        let dot = 0;
        for (let i = 0; i < doc.embedding.length; i++) dot += doc.embedding[i] * qEmbed[i];
        return { text: doc.text, score: dot };
      }).sort((a, b) => b.score - a.score).slice(0, 3);
      
      const context = scores.map(s => s.text).join("\n\n");

      // 2. CARGA DEL MODELO PESADO (Ahora seguro porque la GPU está vacía)
      self.postMessage({ type: "STATUS", payload: "🚀 Cargando Cerebro (GPU)..." });
      
      // Usamos el modelo ORIGINAL 783M sin restricciones de cuantización
      const generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
        device: "webgpu",
        progress_callback: (data) => {
            if (data.status === 'progress') {
                const percent = Math.round((data.loaded / data.total) * 100);
                self.postMessage({ type: "download_progress", payload: { percent, model: "Generador AI" } });
            }
        }
      });

      self.postMessage({ type: "STATUS", payload: "Escribiendo respuesta..." });

      const prompt = `Question: ${question}\n\nContext: ${context}\n\nAnswer:`;
      
      const result = await generator(prompt, {
        max_new_tokens: 256,
        temperature: 0.1,
        do_sample: false,
        repetition_penalty: 1.2
      });

      // 3. LIMPIEZA TOTAL (Descargar modelo)
      self.postMessage({ type: "STATUS", payload: "♻️ Limpiando memoria..." });
      await generator.dispose(); 
      
      self.postMessage({
        type: "ANSWER_COMPLETE",
        payload: {
          answer: result[0].generated_text,
          sources: scores
        }
      });
    }

  } catch (err) {
    console.error(err);
    self.postMessage({ type: "ERROR", payload: err.message });
  }
});