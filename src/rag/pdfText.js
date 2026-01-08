// src/rag/pdfText.js
// Utilidades para extraer texto de PDFs usando pdf.js
//Leer PDF con pdfjs en el main thread

import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";

// IMPORTANTE: configurar worker de pdf.js para Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromPdfFile(file, { maxPages = 50 } = {}) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = Math.min(pdf.numPages, maxPages);
  let fullText = "";

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => it.str).join(" ");
    fullText += `\n\n[PAGE ${pageNum}] ${pageText}`;
  }

  return {
    text: fullText.trim(),
    pagesIndexed: totalPages,
    totalPages: pdf.numPages,
  };
}
