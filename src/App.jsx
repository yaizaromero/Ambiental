import { useEffect, useRef, useState } from "react";
import "./index.css";

// Configuración de los colores y descripciones de los agentes de los Seis Sombreros
const AGENTES = {
  "White Agent": { nombre: "White Agent", desc: "Data Processor", color: "#f8f9fa", texto: "#212529", icon: "⚪" },
  "Red Agent": { nombre: "Red Agent", desc: "Sentiment Analyst", color: "#ffebee", texto: "#c62828", icon: "🔴" },
  "Black Agent": { nombre: "Black Agent", desc: "Risk Evaluator", color: "#212121", texto: "#ffffff", icon: "⚫" },
  "Yellow Agent": { nombre: "Yellow Agent", desc: "Value Seeker", color: "#fff9c4", texto: "#fbc02d", icon: "🟡" },
  "Green Agent": { nombre: "Green Agent", desc: "Creative Generator", color: "#e8f5e9", texto: "#2e7d32", icon: "🟢" },
  "Blue Agent": { nombre: "Blue Agent", desc: "Process Facilitator", color: "#e3f2fd", texto: "#1565c0", icon: "🔵" }
};

export default function App() {
  // Referencias a los Web Workers
  const audioWorker = useRef(null);
  const agentWorker = useRef(null);
  
  // Referencias para el manejo de audio
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  // Estado del sistema de transcripción de audio
  const [audioStatus, setAudioStatus] = useState("booting");
  const [audioProgress, setAudioProgress] = useState(0);
  const [allMessages, setAllMessages] = useState([]);       // Historial completo de transcripciones
  const [contextMessages, setContextMessages] = useState([]); // Buffer de las últimas 8 transcripciones

  // Estado del sistema de agentes de análisis
  const [agentStatus, setAgentStatus] = useState("booting");
  const [agentProgress, setAgentProgress] = useState(0);
  const [agentWorkMessage, setAgentWorkMessage] = useState("");
  const [agentResult, setAgentResult] = useState(null);
  const [agentResponse, setAgentResponse] = useState("");

  // Inicialización del Worker de audio (Whisper)
  useEffect(() => {
    if (!audioWorker.current) {
      audioWorker.current = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      
      audioWorker.current.onmessage = (e) => {
        const msg = e.data;
        if (msg.status === "booted") setAudioStatus("booting");
        if (msg.status === "loading") {
          setAudioStatus("loading");
        }
        if (msg.status === "ready") {
          setAudioStatus("ready");
          setAudioProgress(100);
        }
        if (msg.status === "complete" && msg.output) {
          const newMsg = { text: msg.output, time: new Date().toLocaleTimeString() };

          // Actualización del historial completo
          setAllMessages((prev) => [...prev, newMsg]);

          // Actualización del buffer con los últimos 8 mensajes
          setContextMessages((prev) => {
            const updated = [...prev, newMsg].slice(-8);
            console.log("Current Context Messages:", updated);
            return updated;
          });
        }
        if (msg.status === "error") {
          setAudioStatus("error");
          console.error(msg.data);
        }
      };
      audioWorker.current.postMessage({ type: "load" });
    }
  }, []);

  // Inicialización del Worker de agentes (Six Hats)
  useEffect(() => {
    if (!agentWorker.current) {
      agentWorker.current = new Worker(new URL("./worker_agents.js", import.meta.url), { type: "module" });

      agentWorker.current.onmessage = (e) => {
        const { status, output, result, generatedText, message } = e.data;

        if (status === 'loading') {
          setAgentStatus('loading');
        } else if (status === 'ready') {
          setAgentStatus('ready');
          setAgentProgress(100); 
        } else if (status === 'working') {
          setAgentStatus('working');
          setAgentWorkMessage(message);
        } else if (status === 'complete') {
          setAgentStatus('ready');
          setAgentResult(result);
          setAgentResponse(generatedText);
        } else if (status === 'error') {
          setAgentStatus('error');
          console.error(output);
        }
      };

      agentWorker.current.postMessage({ type: 'preload' }); 
    }
    return () => agentWorker.current?.terminate();
  }, []);

  // Captura del audio del microfono
  async function startRecording() {
    if (!audioWorker.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    source.connect(processor);
    processor.connect(audioContext.destination);

    let audioBuffer = [];

    // Los datos de audio se procesan en chunks de 2 segundos aproximadamente
    processor.onaudioprocess = (e) => {
      audioBuffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      if (audioBuffer.length >= 16) {
        const chunkSize = audioBuffer[0].length;
        const flat = new Float32Array(audioBuffer.length * chunkSize);

        audioBuffer.forEach((b, i) => flat.set(b, i * chunkSize));
        audioBuffer = [];
        
        // Filtrado de audio con energía baja (silencio)
        const energy = flat.reduce((sum, v) => sum + Math.abs(v), 0) / flat.length;
        if (energy < 0.01) return;
        audioWorker.current.postMessage({ type: "generate", data: { audio: flat } });
      }
    };
    setAudioStatus("recording");
  }

  // Detención de la grabación y liberación de recursos
  function stopRecording() {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setAudioStatus("ready");
  }

  // Envío del contexto de transcripción
  const analyzeTranscription = () => {
    if (contextMessages.length === 0) return;

    setAgentStatus('working');
    setAgentResult(null);
    setAgentResponse('');

    // Se juntan las ultimas transcripciones en string, para enviarlas al agente
    const bufferText = contextMessages
      .map(msg => msg.text)
      .join(" "); 

    console.log("Sending Buffer to Agent (Last 8 lines):", bufferText);
    
    agentWorker.current.postMessage({ text: bufferText });
  };

  const currentAgent = agentResult ? AGENTES[agentResult.labels[0]] : null;
  const isAgentWorking = agentStatus === 'working' || agentStatus === 'loading';
  const isAgentLoading = agentStatus.includes('loading');

  return (
    <div className="app" style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      
      {/* Seccion estados de los modelos */}
      <div style={{ textAlign: 'center', marginBottom: '30px', marginTop: '20px' }}>
        <h1>🧠 Private Brainstorming</h1>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginBottom: '15px' }}>
           <StatusBadge status={audioStatus} label="Audio Model" />
           <StatusBadge status={agentStatus} label="Agent Model" />
        </div>
      </div>

      {/* Zona de los botones */}
      <div className="controls" style={{ 
          display: 'flex', 
          gap: '15px', 
          justifyContent: 'center', 
          marginBottom: '30px',
          padding: '20px',
          backgroundColor: '#1a1a1a',
          borderRadius: '12px'
      }}>
        <button 
          onClick={startRecording} 
          disabled={audioStatus !== "ready"}
          style={{ padding: '10px 25px', cursor: 'pointer', fontSize: '1.1rem', borderRadius: '6px' }}
        >
          ▶ Start
        </button>
        
        <button 
          onClick={stopRecording} 
          disabled={audioStatus !== "recording"}
          style={{ padding: '10px 25px', cursor: 'pointer', fontSize: '1.1rem', borderRadius: '6px' }}
        >
          ⏹ Stop
        </button>

        <div style={{ width: '2px', backgroundColor: '#444', margin: '0 10px' }}></div>

        <button 
            onClick={analyzeTranscription} 
            disabled={contextMessages.length === 0 || isAgentLoading || isAgentWorking}
            style={{ 
              padding: '10px 25px', 
              backgroundColor: '#4a90e2', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: isAgentWorking ? 'wait' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              opacity: contextMessages.length === 0 ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            {isAgentWorking ? 'Analyzing...' : 'Assistant Help'}
        </button>
      </div>

      {/* Diseño de dos columnas */}
      <div style={{ 
        display: 'flex', 
        gap: '20px',
        alignItems: 'stretch', 
        minHeight: '500px'
      }}>
        
        {/* Columna izquierda: Historial de transcripción */}
        <div style={{ 
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#111', 
            borderRadius: '12px', 
            overflow: 'hidden',
            border: '1px solid #333'
        }}>
          <div style={{ 
              backgroundColor: '#222', 
              padding: '0 20px', 
              height: '80px', 
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid #333'
          }}>
            <div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Transcription History</h3>
            </div>
          </div>
          
          <div className="chat" style={{ 
              flex: 1, 
              padding: '20px', 
              overflowY: 'auto',
              backgroundColor: '#000',
              maxHeight: '500px' 
          }}>
            {allMessages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '40px', color: '#666' }}>
                <p style={{ fontSize: '1.1rem', fontStyle: 'italic', margin: 0 }}>Waiting for speech...</p>
              </div>
            )}
            {allMessages.map((m, i) => (
              <div key={i} style={{ 
                  marginBottom: '12px', 
                  opacity: i < allMessages.length - 8 ? 0.5 : 1, 
                  transition: 'opacity 0.3s',
                  display: 'flex',
                  gap: '10px'
              }}>
                <span style={{ color: '#666', fontSize: '0.8rem', fontFamily: 'monospace', minWidth: '60px' }}>[{m.time}]</span> 
                <span style={{ color: '#fff', lineHeight: '1.4' }}>{m.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Columna derecha: Panel de agente */}
        <div style={{ 
             flex: 1,
             display: 'flex',
             flexDirection: 'column',
             borderRadius: '12px',
             overflow: 'hidden',
             border: currentAgent ? `2px solid ${currentAgent.color}` : '2px dashed #444',
             backgroundColor: '#111',
             position: 'relative'
        }}>
          
          {/* Estado: Procesando */}
          {isAgentWorking && (
             <div style={{ 
                 height: '100%', 
                 display: 'flex', 
                 flexDirection: 'column',
                 alignItems: 'center', 
                 justifyContent: 'center',
                 color: '#fff',
                 backgroundColor: '#111'
             }}>
                <LoadingSpinner />
                <p style={{ marginTop: '25px', fontSize: '1.2rem', color: '#4a90e2', fontWeight: 'bold' }}>
                  {agentWorkMessage}
                </p>
             </div>
          )}

          {/* Estado: Resultado disponible */}
          {!isAgentWorking && currentAgent && (
            <>
              <div style={{ 
                  backgroundColor: currentAgent.color, 
                  color: currentAgent.texto, 
                  padding: '0 20px', 
                  height: '80px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '15px',
              }}>
                <span style={{ fontSize: '35px' }}>{currentAgent.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{currentAgent.nombre}</h3>
                  <small style={{ opacity: 0.9 }}>{currentAgent.desc}</small>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: '0.85rem' }}>
                   <div>Confidence</div>
                   <div style={{ fontWeight: 'bold' }}>{(agentResult.scores[0] * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div style={{ 
                  padding: '25px', 
                  backgroundColor: '#ffffff', 
                  flex: 1, 
                  overflowY: 'auto',
                  maxHeight: '500px'
              }}>
                <div style={{ 
                    fontSize: '16px', 
                    lineHeight: '1.6', 
                    whiteSpace: 'pre-wrap',
                    color: '#000000',  
                }}>
                  {agentResponse || "Generating insight..."}
                </div>
              </div>
            </>
          )}

          {/* Estado: Inactivo */}
          {!isAgentWorking && !currentAgent && (
             <div style={{ 
                 height: '100%', 
                 display: 'flex', 
                 alignItems: 'center', 
                 justifyContent: 'center',
                 color: '#666',
             }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>🧠</div>
                    <p>Record audio, then click<br/><strong style={{ color: '#4a90e2' }}>Assistant Help</strong></p>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente estados de los modelos
function StatusBadge({ status, label }) {
  const colors = { 
      booting: "orange", 
      loading: "blue", 
      ready: "green", 
      recording: "red",
      working:"red", 
      error: "red" 
  };
  
  const s = status.includes("loading") ? "loading" : status;
  const badgeColor = colors[s] || 'black';

  return (
    <span style={{ 
        padding: '6px 12px', 
        borderRadius: '20px', 
        background: '#eee',       
        fontSize: '13px', 
        border: `2px solid ${badgeColor}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: '#000000'
    }}>
      <strong style={{ color: '#000000' }}>{label}:</strong> 
      
      <span style={{ 
          color: badgeColor, 
          fontWeight: 'bold', 
          textTransform: 'capitalize' 
      }}>
        {status}
      </span>
    </span>
  );
}

// Componente de spinner de carga
function LoadingSpinner() {
  return (
    <div className="spinner-container">
      <style>{`
        .spinner {
          width: 50px;
          height: 50px;
          border: 5px solid rgba(255, 255, 255, 0.1);
          border-left-color: #4a90e2; 
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div className="spinner"></div>
    </div>
  );
}