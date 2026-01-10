import { useEffect, useRef, useState } from "react";
import { extractTextFromPdfFile } from "./pdfText.js";

export default function RagPanel() {
  const workerRef = useRef(null);
  const chatContainerRef = useRef(null);

  const [pdfName, setPdfName] = useState("");
  const [status, setStatus] = useState("Esperando PDF...");
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [question, setQuestion] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    // Inicializar el Worker
    workerRef.current = new Worker(new URL("./ragWorker.js", import.meta.url), {
      type: "module",
    });

    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === "STATUS") {
        setStatus(payload);
        setIsBusy(true);
      }
      
      // CASO 1: Descargando Modelos de Internet
      if (type === "download_progress") {
         setStatus(`Descargando modelo: ${payload.model}...`);
         setProgress(payload.percent);
         setIsBusy(true);
      }

      // CASO 2: Procesando el PDF localmente
      if (type === "index_progress") {
         setStatus(`Analizando contenido del PDF...`);
         setProgress(payload.percent);
      }

      if (type === "INDEX_DONE") {
        setStatus(`✅ Listo. PDF indexado (${payload.chunksCount} fragmentos).`);
        setProgress(100); 
        setTimeout(() => setProgress(0), 1000); 
        setIsReady(true);
        setIsBusy(false);
      }

      if (type === "QUERY_DONE") {
        // AQUÍ RECIBIMOS LAS FUENTES (sources) DEL WORKER
        setChatHistory((prev) => [
          ...prev,
          { 
            type: "bot", 
            text: payload.answer, 
            sources: payload.sources // Guardamos las fuentes para mostrarlas
          },
        ]);
        setStatus("✅ Esperando pregunta...");
        setIsBusy(false);
      }

      if (type === "ERROR") {
        setStatus("❌ Error: " + payload);
        setIsBusy(false);
        setProgress(0);
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  async function handleFile(file) {
    if (!file) return;
    setPdfName(file.name);
    setIsReady(false);
    setChatHistory([]); 
    setStatus("Iniciando...");
    setProgress(0);
    setIsBusy(true);

    try {
      const { text } = await extractTextFromPdfFile(file, { maxPages: 50 });
      workerRef.current.postMessage({
        type: "INDEX_TEXT",
        payload: { text },
      });
    } catch (error) {
      setStatus("Error leyendo PDF: " + error.message);
      setIsBusy(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") handleFile(file);
  }

  function ask() {
    if (!question.trim() || !isReady || isBusy) return;
    setChatHistory((prev) => [...prev, { type: "user", text: question }]);
    setStatus("🧠 Pensando respuesta...");
    setIsBusy(true);
    workerRef.current.postMessage({
      type: "QUERY",
      payload: { question },
    });
    setQuestion("");
  }

  const styles = {
    container: {
      background: "#1e1e1e",
      color: "#e0e0e0",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      maxWidth: "800px",
      margin: "20px auto",
      border: "1px solid #333",
    },
    header: {
      margin: "0 0 20px 0",
      fontSize: "1.5rem",
      fontWeight: "600",
      color: "#fff",
      borderBottom: "1px solid #333",
      paddingBottom: "10px",
    },
    dropZone: {
      border: "2px dashed #444",
      borderRadius: "8px",
      padding: "20px",
      textAlign: "center",
      cursor: "pointer",
      background: "#252526",
      transition: "background 0.2s",
      marginBottom: "15px",
    },
    statusBar: {
      fontSize: "0.9rem",
      color: isBusy ? "#4caf50" : "#aaa",
      marginBottom: "5px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      height: "20px",
    },
    progressContainer: {
        width: "100%",
        height: "6px",
        background: "#333",
        borderRadius: "3px",
        marginBottom: "15px",
        overflow: "hidden",
        display: progress > 0 ? "block" : "none"
    },
    progressFill: {
        height: "100%",
        width: `${progress}%`,
        background: "#4caf50",
        transition: "width 0.2s ease-in-out" 
    },
    chatWindow: {
      height: "350px",
      overflowY: "auto",
      background: "#252526",
      borderRadius: "8px",
      padding: "15px",
      border: "1px solid #333",
      marginBottom: "15px",
      display: chatHistory.length === 0 ? "none" : "block",
    },
    inputGroup: { display: "flex", gap: "10px" },
    input: {
      flex: 1,
      padding: "12px",
      borderRadius: "6px",
      border: "1px solid #444",
      background: "#333",
      color: "white",
      fontSize: "1rem",
      outline: "none",
    },
    button: {
      padding: "10px 25px",
      background: isReady ? "#007acc" : "#444",
      color: "white",
      border: "none",
      borderRadius: "6px",
      fontWeight: "bold",
      cursor: isReady ? "pointer" : "not-allowed",
    },
    msgRow: { marginBottom: "12px", lineHeight: "1.5", fontSize: "0.95rem" },
    userLabel: { color: "#4fc1ff", fontWeight: "bold", marginRight: "8px" },
    botLabel: { color: "#4ec9b0", fontWeight: "bold", marginRight: "8px" }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.header}>RAG Local</h3>

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = "#333"; }}
        onDragLeave={(e) => { e.currentTarget.style.background = "#252526"; }}
        style={styles.dropZone}
      >
        <div style={{ fontSize: "1.2rem", marginBottom: "5px" }}>{pdfName ? "📄" : "📂"}</div>
        <div>{pdfName ? <span style={{color:"#fff", fontWeight:"bold"}}>{pdfName}</span> : "Arrastra tu PDF aquí"}</div>
      </div>

      <div style={styles.statusBar}>
        <span>{isBusy && <span className="loader" style={{marginRight:8}}>⚡</span>} {status}</span>
        {progress > 0 && <span style={{fontSize:"0.8em", color:"#888"}}>{progress}%</span>}
      </div>
      
      <div style={styles.progressContainer}>
          <div style={styles.progressFill}></div>
      </div>

      <div ref={chatContainerRef} style={styles.chatWindow}>
        {chatHistory.map((msg, index) => (
          <div key={index} style={styles.msgRow}>
            {msg.type === "user" ? (
                // MENSAJE USUARIO
                <> <span style={styles.userLabel}>You:</span> <span>{msg.text}</span> </>
            ) : (
                // MENSAJE BOT
                <div>
                    <span style={styles.botLabel}>AI:</span> 
                    <span>{msg.text}</span>
                    
                    {/* VISUALIZACIÓN DE FUENTES (CITATIONS) */}
                    {msg.sources && msg.sources.length > 0 && (
                        <details style={{ marginTop: "10px", fontSize: "0.85rem", color: "#aaa" }}>
                            <summary style={{ cursor: "pointer", listStyle: "none", userSelect: "none" }}>
                                🔍 Ver fuentes ({msg.sources.length})
                            </summary>
                            <div style={{ 
                                paddingLeft: "10px", 
                                borderLeft: "2px solid #444", 
                                marginTop: "5px",
                                display: "flex", 
                                flexDirection: "column", 
                                gap: "8px" 
                            }}>
                                {msg.sources.map((src, i) => (
                                    <div key={i} style={{ background: "#2a2a2a", padding: "8px", borderRadius: "4px" }}>
                                        <div style={{ fontWeight: "bold", color: "#4caf50", fontSize: "0.8em", marginBottom: "3px" }}>
                                            Fuente {i + 1} • Similitud: {(src.score * 100).toFixed(1)}%
                                        </div>
                                        <div style={{ fontStyle: "italic", color: "#ccc", fontSize: "0.9em" }}>
                                            "{src.text.substring(0, 150)}..." 
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.inputGroup}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={isReady ? "Ask a question in English..." : "Esperando PDF..."}
          style={styles.input}
          disabled={!isReady || isBusy}
        />
        <button onClick={ask} disabled={!isReady || isBusy} style={styles.button}>
          Preguntar
        </button>
      </div>
    </div>
  );
}