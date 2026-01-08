// src/rag/ragUtils.js
// Utilidades para RAG: chunking, similitud coseno, topK
export function chunkText(text, { chunkSize = 1200, overlap = 200 } = {}) {
  // chunkSize/overlap en caracteres (simple y robusto)
  const cleaned = (text || "")
    // une palabras cortadas por guion al final de línea: "contex-\n to" -> "contexto"
    .replace(/-\s*\n\s*/g, "")
    // normaliza saltos de línea a espacios
    .replace(/\n+/g, " ")
    // quita dobles espacios
    .replace(/\s+/g, " ")
    .trim();
  const chunks = [];

  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + chunkSize, cleaned.length);
    const chunk = cleaned.slice(i, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end === cleaned.length) break;
    i = end - overlap;
  }
  return chunks;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;

  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }

  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}


export function topK(arr, k = 5) {
  // arr: [{idx, score}]
  return arr.sort((x, y) => y.score - x.score).slice(0, k);
}
