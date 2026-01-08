// src/rag/ragWorker.js
// Worker para indexar y consultar texto usando embeddings con @xenova/transformers
// embeddings + busqueda semántica por similaridad coseno
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0";
import { chunkText, cosineSimilarity, topK } from "./ragUtils.js";

env.allowLocalModels = false;
env.useBrowserCache = true;

// Estado en memoria del worker
let chunks = [];
let embeddings = []; // array de Float32Array
let embedder = null;
const preferredDevice = "wasm";


async function getEmbedder(progress_callback) {
  if (!embedder) {
    // Modelo recomendado en enunciado
    embedder = await pipeline("feature-extraction", "Xenova/paraphrase-MiniLM-L3-v2", {
      progress_callback,
      device: preferredDevice
    });
  }
  return embedder;
}

function meanPoolAndNormalize(output) {
  // output suele ser: [1, tokens, hidden]
  const tokenEmbeddings = output[0]; // tokens x hidden
  const tokens = tokenEmbeddings.length;
  const dim = tokenEmbeddings[0].length;

  const v = new Float32Array(dim);
  for (let t = 0; t < tokens; t++) {
    const row = tokenEmbeddings[t];
    for (let d = 0; d < dim; d++) v[d] += row[d];
  }
  for (let d = 0; d < dim; d++) v[d] /= tokens;

  // normalize
  let norm = 0;
  for (let d = 0; d < dim; d++) norm += v[d] * v[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < dim; d++) v[d] /= norm;

  return v;
}

async function embedText(text) {
  const model = await getEmbedder((x) => self.postMessage({ type: "loading", payload: x }));

  const out = await model(text, {
    pooling: "mean",
    normalize: true,
  });

  // out suele ser { data: Float32Array } o Float32Array
  const vec = out.data ?? out;
  return vec;
}



self.addEventListener("message", async (event) => {
  const { type, payload } = event.data;

  try {
    if (type === "INDEX_TEXT") {
      self.postMessage({ type: "STATUS", payload: { status: "Preparando chunks..." } });
      const { text, chunkSize, overlap, maxChunks } = payload;

      const allChunks = chunkText(text, { chunkSize, overlap });
      chunks = typeof maxChunks === "number" ? allChunks.slice(0, maxChunks) : allChunks;

      embeddings = [];
      self.postMessage({ type: "STATUS", payload: { status: "Indexando chunks...", total: chunks.length } });

      for (let i = 0; i < chunks.length; i++) {
        const emb = await embedText(chunks[i]);
        embeddings.push(emb);
        if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
          self.postMessage({ type: "PROGRESS", payload: { done: i + 1, total: chunks.length } });
        }
      }

      self.postMessage({ type: "STATUS", payload: { status: "Finalizando indexación..." } });

      self.postMessage({
        type: "INDEX_DONE",
        payload: { chunksCount: chunks.length },
      });
    }

    if (type === "QUERY") {
      const { question, top_k = 5 } = payload;
      if (!chunks.length || !embeddings.length) {
        self.postMessage({ type: "ERROR", payload: "No hay PDF indexado todavía." });
        return;
      }

      const qEmb = await embedText(`Pregunta: ${question}. Responde usando el documento.`);


      const scored = embeddings.map((emb, idx) => ({
        idx,
        score: cosineSimilarity(qEmb, emb),
      }));

      const best = topK(scored, top_k).map(({ idx, score }) => ({
        score,
        chunk: chunks[idx],
        idx,
      }));

      self.postMessage({ type: "QUERY_DONE", payload: { best } });
    }
  } catch (err) {
    self.postMessage({ type: "ERROR", payload: String(err?.message || err) });
  }
});
