import { useEffect, useRef, useState } from "react";
// CORRECCIÓN: Importamos esto solo una vez aquí arriba
import { extractTextFromPdfFile } from "./pdfText.js";

const styles = {
    container: { padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', color: '#e2e8f0', overflow: 'hidden' },
    header: { color: '#e2e8f0', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' },
    uploadArea: { background: '#1e293b', border: '2px dashed #334155', borderRadius: '12px', padding: '20px', textAlign: 'center', cursor: 'pointer', marginBottom: '15px' },
    chatContainer: { flex: 1, background: '#020617', borderRadius: '12px', border: '1px solid #334155', padding: '15px', overflowY: 'auto', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '15px' },
    messageUser: { alignSelf: 'flex-end', background: '#2563eb', color: 'white', padding: '10px 15px', borderRadius: '12px 12px 0 12px', maxWidth: '85%' },
    messageBot: { alignSelf: 'flex-start', background: '#1e293b', color: '#e2e8f0', padding: '10px 15px', borderRadius: '12px 12px 12px 0', maxWidth: '85%', border: '1px solid #334155' },
    inputGroup: { display: 'flex', gap: '10px' },
    input: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #475569', background: '#1e293b', color: 'white', outline: 'none' },
    button: { padding: '12px 20px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    sourceCard: { fontSize: '0.8rem', marginTop: '8px', background: '#0f172a', padding: '8px', borderRadius: '6px', borderLeft: '2px solid #8b5cf6' }
};

export default function RagPanel({ onRagActivity }) { 
  const workerRef = useRef(null);
  const chatEndRef = useRef(null);

  const [status, setStatus] = useState("Esperando PDF...");
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [question, setQuestion] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    // Asegúrate de que ragWorker.js está en la misma carpeta o la ruta es correcta
    workerRef.current = new Worker(new URL("./ragWorker.js", import.meta.url), { type: "module" });

    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === "STATUS") setStatus(payload);
      
      if (type === "download_progress") {
         setStatus(`Cargando... ${payload.percent}%`);
         setProgress(payload.percent);
      }

      if (type === "INDEX_COMPLETE") {
        setStatus("Listo.");
        setIsBusy(false);
        setIsReady(true);
        addMessage("system", "Documento indexado.");
      }

      if (type === "ANSWER_COMPLETE") {
        setIsBusy(false);
        setStatus("Listo");
        addMessage("bot", payload.answer, payload.sources);
        if (onRagActivity) onRagActivity(false); 
      }

      if (type === "ERROR") {
        setStatus("Error");
        setIsBusy(false);
        addMessage("system", "Error: " + payload);
        if (onRagActivity) onRagActivity(false);
      }
    };

    return () => workerRef.current?.terminate();
  }, [onRagActivity]);

  const addMessage = (role, text, sources = []) => {
      setChatHistory(prev => [...prev, { role, text, sources }]);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsBusy(true);
    setStatus("Leyendo PDF...");
    setChatHistory([]); 
    
    try {
      // CORRECCIÓN: Eliminamos la línea conflictiva "const { extractTextFromPdfFile } = await import..."
      // Usamos directamente la función importada al principio del archivo.
      const { text } = await extractTextFromPdfFile(file);
      
      setStatus("Indexando...");
      workerRef.current.postMessage({ type: "INDEX_TEXT", payload: { text } });
    } catch (err) {
      console.error(err);
      setStatus("Error PDF");
      setIsBusy(false);
    }
  };

  const ask = () => {
    if (!question.trim() || isBusy) return;
    
    const q = question;
    setQuestion("");
    addMessage("user", q);
    
    setIsBusy(true);
    setStatus("Liberando GPU..."); 
    if (onRagActivity) onRagActivity(true);

    // DELAY DE SEGURIDAD (1.5s)
    setTimeout(() => {
        setStatus("Generando...");
        workerRef.current.postMessage({ type: "ASK_QUESTION", payload: { question: q } });
    }, 1500);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>
        📄 Doc Chat <StatusBadge status={status} />
      </h2>

      <div style={styles.uploadArea}>
         <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} id="pdf-upload" />
         <label htmlFor="pdf-upload" style={{ cursor: 'pointer', display: 'block' }}>
            {isBusy && progress > 0 ? (
                <div style={{ width: '100%', background: '#334155', height: '4px', borderRadius: '2px' }}>
                    <div style={{ width: `${progress}%`, background: '#8b5cf6', height: '100%' }}></div>
                </div>
            ) : (
                <span>📂 {isReady ? "Cambiar PDF" : "Subir PDF"}</span>
            )}
         </label>
      </div>

      <div style={styles.chatContainer}>
        {chatHistory.map((msg, idx) => (
          <div key={idx} style={msg.role === 'user' ? styles.messageUser : styles.messageBot}>
            <div>{msg.text}</div>
            {msg.sources?.length > 0 && (
                <div style={{ marginTop: '10px', borderTop: '1px solid #334155', paddingTop: '5px' }}>
                    {msg.sources.map((src, i) => (
                        <div key={i} style={styles.sourceCard}>
                            <div style={{ fontWeight: 'bold', color: '#a78bfa' }}>{(src.score * 100).toFixed(0)}% Relevancia</div>
                            <div style={{ fontStyle: 'italic', color: '#cbd5e1' }}>"...{src.text.substring(0, 80)}..."</div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div style={styles.inputGroup}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={isReady ? "Pregunta..." : "Sube PDF"}
          style={{ ...styles.input, opacity: isReady ? 1 : 0.5 }}
          disabled={!isReady || isBusy}
        />
        <button onClick={ask} disabled={!isReady || isBusy} style={{ ...styles.button, opacity: isReady ? 1 : 0.5 }}>Enviar</button>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
    let color = "#94a3b8";
    if (status.includes("Listo")) color = "#10b981";
    if (status.includes("Cargando") || status.includes("Generando") || status.includes("Liberando") || status.includes("Leyendo")) color = "#8b5cf6";
    if (status.includes("Error")) color = "#ef4444";
    return <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', border: `1px solid ${color}`, color: color, marginLeft: 'auto' }}>{status}</span>;
}