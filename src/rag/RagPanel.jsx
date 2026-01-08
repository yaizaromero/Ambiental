// src/rag/RagPanel.jsx
//UI Drag & Drop para cargar PDF y hacer consultas RAG
import { useEffect, useRef, useState } from "react";
import { extractTextFromPdfFile } from "./pdfText.js";

export default function RagPanel() {
  const workerRef = useRef(null);

  const [pdfName, setPdfName] = useState("");
  const [pdfStats, setPdfStats] = useState(null);
  const [status, setStatus] = useState("Listo");
  const [progress, setProgress] = useState(null);
 

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState([]);
  const [isIndexed, setIsIndexed] = useState(false);


  // Settings (puedes ajustar)
  const [chunkSize] = useState(1200);
  const [overlap] = useState(200);
  const [topK] = useState(5);

  useEffect(() => {
    workerRef.current = new Worker(new URL("./ragWorker.js", import.meta.url), {
      type: "module",
    });

    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === "loading") {
        // Descarga/carga del modelo (primera vez)
        setStatus(`Cargando modelo embeddings... ${payload?.status || ""} ${payload?.progress ?? ""}`);
      }

      if (type === "STATUS") {
        setStatus(payload.status);
        setProgress(null);
      }

      if (type === "PROGRESS") {
        setProgress(payload);
        setStatus(`Indexando... ${payload.done}/${payload.total}`);
      }

      if (type === "INDEX_DONE") {
        setIsIndexed(true);
        setStatus(`✅ PDF indexado (${payload.chunksCount} chunks)`);
        setProgress(null);
        
      }

      if (type === "QUERY_DONE") {
        if (!payload.best?.length) {
            setResults([]);
            setAnswer("");
            setStatus("⚠️ No encontré texto relevante en el PDF para esa pregunta.");
            return;
        }

        setResults(payload.best);
        const topText = payload.best.slice(0,2).map(x => x.chunk).join("\n\n");
        setAnswer(simpleAnswerFromChunks(question, topText));
        setStatus("✅ Consulta completada");
        }



      if (type === "ERROR") {
        setStatus(`❌ Error: ${payload}`);
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  async function handleFile(file) {
    if (!file) return;
    setIsIndexed(false);
    setResults([]);
    setAnswer("");
    setPdfName(file.name);
    setStatus("Leyendo PDF...");

    const { text, pagesIndexed, totalPages } = await extractTextFromPdfFile(file, { maxPages: 50 });
    setPdfStats({ pagesIndexed, totalPages, chars: text.length });

    setStatus("Indexando (esto puede tardar la primera vez)...");
    setStatus("Enviando a indexación...");
    workerRef.current.postMessage({
      type: "INDEX_TEXT",
      payload: {
        text,
        chunkSize,
        overlap,
        maxChunks: 80, // limit para que no se muera (ajusta si queréis)
      },
    });
  }

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") handleFile(file);
    else setStatus("❌ Arrastra un PDF válido");
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  function ask() {
    if (!isIndexed) {
        setStatus("❌ Error: No hay PDF indexado todavía.");
        return;
    }

    if (!question.trim()) {
        return;
    }

    setStatus("Buscando en el PDF...");
    setResults([]);

    workerRef.current.postMessage({
        type: "QUERY",
        payload: {
        question,
        top_k: topK,
        },
    });
  }

  function simpleAnswerFromChunks(q, ctx) {
    const cleaned = (ctx || "")
        .replace(/-\s+/g, "")      // por si quedara algún "eviden- cia"
        .replace(/\s+/g, " ")
        .trim();

    // Divide en frases “razonables”
    const sentences = cleaned.split(/(?<=[.!?])\s+/);

    let out = "";
    for (const s of sentences) {
        if (!s) continue;
        if ((out + " " + s).trim().length > 420) break;
        out = (out + " " + s).trim();
        if (sentences.indexOf(s) >= 2) break; // máximo ~3 frases
    }

    // fallback
    if (!out) out = cleaned.slice(0, 420);

    return out + (out.length < cleaned.length ? "…" : "");
}


  return (
    <div style={{ marginTop: 30, padding: 16, border: "1px solid #444", borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>📄 RAG Local (PDF)</h2>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        style={{
          padding: 16,
          border: "2px dashed #777",
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <strong>Drag & Drop PDF aquí</strong>
        <div style={{ opacity: 0.85, marginTop: 6 }}>
          {pdfName ? `PDF: ${pdfName}` : "Aún no has cargado ningún PDF"}
        </div>
        {pdfStats && (
          <div style={{ opacity: 0.85, marginTop: 6 }}>
            Páginas indexadas: {pdfStats.pagesIndexed}/{pdfStats.totalPages} · Texto: {pdfStats.chars} chars
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Estado:</strong> {status}
        {progress && (
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Progreso: {progress.done}/{progress.total}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pregunta sobre el PDF (ej: ¿Cuál fue el presupuesto del año pasado?)"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #666" }}
        />
        <button onClick={ask} disabled={!question || !isIndexed}>
          Preguntar
        </button>
      </div>
      {answer && (
        <div style={{ marginTop: 16, textAlign: "left", padding: 12, border: "1px solid #555", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>🧾 Respuesta (basada en el PDF)</h3>
          <div>{answer}</div>
        </div>
      )}

      {results?.length > 0 && (
        <div style={{ marginTop: 16, textAlign: "left" }}>
          <h3>🔎 Top chunks relevantes</h3>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                padding: 10,
                border: "1px solid #555",
                borderRadius: 10,
                marginBottom: 10,
              }}
            >
              <div style={{ opacity: 0.9 }}>
                <strong>Score:</strong> {r.score.toFixed(4)} · <strong>Chunk #{r.idx}</strong>
              </div>
              <div style={{ marginTop: 6, opacity: 0.95 }}>{r.chunk}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
