// src/rag/pdfText.js
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";

// Configuración del worker para Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromPdfFile(file, { maxPages = 50 } = {}) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = Math.min(pdf.numPages, maxPages);
  let fullText = "";

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    
    // 1. Une las palabras de la página con espacios.
    // 2. Añade un espacio al final de la página para que no se pegue con la siguiente.
    // Sin saltos de línea (\n) ni marcadores de página.
    fullText += content.items.map((it) => it.str).join(" ") + " ";
  }

  return {
    text: fullText, // Devolvemos el texto "plano" y continuo
    pagesIndexed: totalPages,
    totalPages: pdf.numPages,
  };
}