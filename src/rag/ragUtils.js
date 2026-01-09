// src/rag/ragUtils.js
// Utilidades para RAG 

export function chunkText(text, chunkSize = 150) {
  // 1. Dividir todo el texto en palabras (split por espacios)
  const words = text.split(/\s+/);
  const chunks = [];
  
  // 2. Iterar con un overlap de 50 palabras (implícito: size - 50)
  //  i += size - 50. Si size es 150, avanza de 100 en 100 (overlap de 50).
  const step = chunkSize - 50; 
  
  for (let i = 0; i < words.length; i += step) {
    // Unir las palabras de nuevo en un string
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim().length > 0) {
        chunks.push(chunk);
    }
  }
  return chunks;
}

// (dot product), pero como los embeddings
// están normalizados, es matemáticamente igual a la similitud coseno.

export function cosineSimilarity(a, b) {
  let dot = 0;
  // Asumimos que a y b tienen la misma longitud
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Al estar normalizados por 'normalize: true', esto basta.
}