// src/rag/ragWorker.js
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0";
import { chunkText } from "./ragUtils.js"; // Asegúrate de importar tu función chunkText si la tienes fuera

env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor = null;
let generator = null;
let db = [];

self.addEventListener("message", async (event) => {
  const { type, payload } = event.data;

  try {
    // ---------------------------------------------------------
    // INDEXACIÓN
    // ---------------------------------------------------------
    if (type === "INDEX_TEXT") {
      const { text } = payload;

      // 1. Cargar Extractor
      if (!extractor) {
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          progress_callback: (data) => {
            if (data.status === 'progress' && data.file.includes("onnx")) {
              const percent = Math.round((data.loaded / data.total) * 100);
              self.postMessage({
                type: "download_progress",
                payload: { percent: percent, model: "all-MiniLM-L6-v2 (Embeddings)" }
              });
            }
          }
        });
      }

      // 2. Cargar Generador
      if (!generator) {
        generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-783M', {
          progress_callback: (data) => {
            if (data.status === 'progress' && data.file.includes("onnx")) {
              const percent = Math.round((data.loaded / data.total) * 100);
              self.postMessage({
                type: "download_progress",
                payload: { percent: percent, model: "LaMini-Flan-T5 (Generador)" }
              });
            }
          }
        });
      }

      self.postMessage({ type: "STATUS", payload: "Indexando documento..." });

      // Usamos chunkText importado o definido localmente
      const chunks = chunkText(text, 150); 
      db = [];

      for (let i = 0; i < chunks.length; i++) {
        const output = await extractor(chunks[i], { pooling: 'mean', normalize: true });
        db.push({
          text: chunks[i],
          embedding: output.data
        });

        if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
          const percent = Math.round(((i + 1) / chunks.length) * 100);
          self.postMessage({ type: "index_progress", payload: { percent } });
        }
      }

      self.postMessage({ type: "INDEX_DONE", payload: { chunksCount: db.length } });
    }

    // ---------------------------------------------------------
    // BÚSQUEDA (QUERY) - AQUÍ ESTÁ EL CAMBIO CLAVE
    // ---------------------------------------------------------
    if (type === "QUERY") {
      const { question } = payload;
      if (!db.length) throw new Error("No hay PDF indexado.");

      self.postMessage({ type: "STATUS", payload: "Pensando respuesta..." });

      // 1. Crear embedding de la pregunta
      const qOutput = await extractor(question, { pooling: 'mean', normalize: true });
      const qEmbed = qOutput.data;

      // 2. Comparar con la base de datos (Producto punto / Similitud Coseno)
      const scores = db.map(doc => {
        let dot = 0;
        for (let i = 0; i < doc.embedding.length; i++) {
          dot += doc.embedding[i] * qEmbed[i];
        }
        return { text: doc.text, score: dot };
      });

      // 3. Ordenar y coger los mejores 2
      scores.sort((a, b) => b.score - a.score);
      const top2 = scores.slice(0, 2);
      const context = top2.map(s => s.text).join("\n");

      console.log("Contexto recuperado:", context); // Para depurar


      // 4. GENERACIÓN: Prompt 
      // LaMini-Flan-T5 espera exactamente "Question: ... Context: ..."
      const prompt = `Question: ${question} Context: ${context}\n\nAnswer:`;

      const genModel = await (generator || pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-783M'));

      const result = await genModel(prompt, {
        max_new_tokens: 150,
        temperature: 0.1,
        repetition_penalty: 1.2,
        do_sample: false
      });

      self.postMessage({ 
        type: "QUERY_DONE", 
        payload: { 
            answer: result[0].generated_text,
            sources: top2 // top2 es un array de objetos: { text: "...", score: 0.85... }
        } 
      });
    }

  } catch (err) {
    console.error(err);
    self.postMessage({ type: "ERROR", payload: err.message });
  }
});