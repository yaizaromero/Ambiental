import { useEffect, useRef, useState, useCallback } from "react";
import RagPanel from "./rag/RagPanel"; 
import "./index.css";

const AGENTES = {
  "White Agent": { nombre: "White Agent", desc: "Data Processor", color: "#f8f9fa", texto: "#212529", icon: "⚪" },
  "Red Agent": { nombre: "Red Agent", desc: "Sentiment Analyst", color: "#ffebee", texto: "#c62828", icon: "🔴" },
  "Black Agent": { nombre: "Black Agent", desc: "Risk Evaluator", color: "#212121", texto: "#ffffff", icon: "⚫" },
  "Yellow Agent": { nombre: "Yellow Agent", desc: "Value Seeker", color: "#fff9c4", texto: "#fbc02d", icon: "🟡" },
  "Green Agent": { nombre: "Green Agent", desc: "Creative Generator", color: "#e8f5e9", texto: "#2e7d32", icon: "🟢" },
  "Blue Agent": { nombre: "Blue Agent", desc: "Process Facilitator", color: "#e3f2fd", texto: "#1565c0", icon: "🔵" }
};

export default function App() {
  // === REFS WORKERS ===
  const audioWorker = useRef(null);
  const agentWorker = useRef(null);
  const visionWorker = useRef(null);
  
  // === STATE GLOBAL ===
  const [audioStatus, setAudioStatus] = useState("booting");
  const [allMessages, setAllMessages] = useState([]);      
  const [contextMessages, setContextMessages] = useState([]); 

  const [agentStatus, setAgentStatus] = useState("booting");
  const [agentResult, setAgentResult] = useState(null);
  const [agentResponse, setAgentResponse] = useState("");

  const [visionStatus, setVisionStatus] = useState("Iniciando...");
  const [visionProgress, setVisionProgress] = useState(0);
  const [isVisionReady, setIsVisionReady] = useState(false);
  const [visionOutput, setVisionOutput] = useState("");
  const [currentColor, setCurrentColor] = useState("#000000");
  const [visionPrompt, setVisionPrompt] = useState("Analiza la usabilidad de este esquema");
  
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  
  // Referencias específicas de Audio
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  // ESTADO DE MODO RAG
  const [isRagMode, setIsRagMode] = useState(false);

  // ----------------------------------------------------------------
  // 1. GESTIÓN DE CICLO DE VIDA DE WORKERS (SECUENCIAL)
  // ----------------------------------------------------------------

  // FASE 1: Iniciar solo Audio y Agentes (Ligeros)
  const startLightWorkers = useCallback(() => {
    console.log("🟢 Fase 1: Iniciando servicios ligeros (Secuencial)...");

    // 1. Prioridad: AUDIO (Whisper es ligero pero sensible)
    if (!audioWorker.current) {
        setAudioStatus("Initializing...");
        audioWorker.current = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
        audioWorker.current.onmessage = (e) => {
            const msg = e.data;
            if (msg.status === "ready") setAudioStatus("ready");
            if (msg.status === "complete" && msg.output) {
                const newMsg = { text: msg.output, time: new Date().toLocaleTimeString() };
                setAllMessages((prev) => [...prev, newMsg]);
                setContextMessages((prev) => [...prev, newMsg].slice(-8));
            }
        };
        audioWorker.current.postMessage({ type: "load" });
    }

    // 2. Secundario: AGENTES (Esperar 3s a que Audio estabilice su VRAM)
    // IMPORTANTE: Este delay evita la colisión de contextos WebGPU
    setTimeout(() => {
        if (!agentWorker.current) {
            setAgentStatus("Loading AI...");
            agentWorker.current = new Worker(new URL("./worker_agents.js", import.meta.url), { type: "module" });
            agentWorker.current.onmessage = (e) => {
                const { status, result, generatedText, advice } = e.data;
                if (status === 'ready') setAgentStatus('ready');
                else if (status === 'working') setAgentStatus('working');
                else if (status === 'complete') { setAgentStatus('ready'); setAgentResult(result); setAgentResponse(generatedText); }
                else if (status === 'complete_ux') { setVisionStatus('Completed'); setVisionOutput(advice); setAgentStatus('ready'); }
            };
            agentWorker.current.postMessage({ type: 'preload' }); 
        }
    }, 3000); // <--- Delay crucial

  }, []);

  // FASE 2: Iniciar Visión (Pesado - GPU)
  const startHeavyWorker = useCallback(() => {
    console.log("🔵 Fase 2: Iniciando motor de Visión...");
    
    if (!visionWorker.current) {
        setVisionStatus("Waiting GPU...");
        
        // Pequeño delay extra de seguridad antes de instanciar
        setTimeout(() => {
            if (isRagMode) return; // Abortar si el usuario volvió a pulsar RAG
            
            visionWorker.current = new Worker(new URL("./worker_vision.js", import.meta.url), { type: "module" });
            visionWorker.current.onmessage = (e) => {
                const { status, percent, result, description, userPrompt, message } = e.data;

                if (status === 'init') setVisionStatus('Initializing...');
                else if (status === 'loading_model') setVisionStatus(message || 'Loading...');
                else if (status === 'progress') { setVisionProgress(percent); setVisionStatus(`${percent.toFixed(0)}%`); }
                else if (status === 'ready') { setIsVisionReady(true); setVisionStatus('Ready'); setVisionProgress(100); }
                else if (status === 'analyzing') setVisionStatus('Analyzing...');
                else if (status === 'vision_complete') {
                     setVisionStatus('Thinking UX...');
                     if (agentWorker.current) {
                        agentWorker.current.postMessage({ type: 'ux_audit', description: description, userPrompt: userPrompt });
                     }
                }
                else if (status === 'complete' || status === 'done') { setVisionStatus('Completed'); setVisionOutput(result); }
            };
            visionWorker.current.postMessage({ type: 'load' });
        }, 500);
    }
  }, [isRagMode]);

  // Función para MATAR todos los workers
  const killAllWorkers = useCallback(() => {
    console.log("🛑 Deteniendo servicios para RAG...");
    
    if (visionWorker.current) { visionWorker.current.terminate(); visionWorker.current = null; }
    setVisionStatus("Pausado (RAG)");
    setIsVisionReady(false);

    if (audioWorker.current) { audioWorker.current.terminate(); audioWorker.current = null; }
    setAudioStatus("Pausado (RAG)");
    
    if (agentWorker.current) { agentWorker.current.terminate(); agentWorker.current = null; }
    setAgentStatus("Pausado (RAG)");
  }, []);

  useEffect(() => {
    let timerRestart = null;
    let timerHeavy = null;

    if (isRagMode) {
        killAllWorkers();
    } else {
        console.log("⏳ Iniciando secuencia de restauración...");
        
        // PASO A: Esperar 3 SEGUNDOS (antes 2.5) para limpieza profunda post-RAG
        timerRestart = setTimeout(() => {
            startLightWorkers(); // Inicia Audio... y a los 3s inicia Agentes
            
            // PASO B: Esperar 8 SEGUNDOS TOTALES (3 iniciales + 5 extra) para Visión
            // Esto asegura que Audio y Agentes ya estén cargados antes de meter Florence
            timerHeavy = setTimeout(() => {
                startHeavyWorker();
            }, 5000); // 5 segundos después de invocar startLightWorkers

        }, 3000); 
    }

    return () => {
        clearTimeout(timerRestart);
        clearTimeout(timerHeavy);
    };
  }, [isRagMode, killAllWorkers, startLightWorkers, startHeavyWorker]);

  // Arranque inicial (Primera carga)
  useEffect(() => {
    startLightWorkers();
    startHeavyWorker();
    return () => killAllWorkers();
  }, []); // eslint-disable-line

  // ----------------------------------------------------------------
  // FUNCIONES DE AUDIO
  // ----------------------------------------------------------------
  async function startRecording() {
    if (isRagMode) return alert("Espera a que termine el RAG");
    if (!audioWorker.current) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(processor);
        processor.connect(audioContext.destination);

        let audioBuffer = [];
        processor.onaudioprocess = (e) => {
          audioBuffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
          if (audioBuffer.length >= 16) { 
            const flat = new Float32Array(audioBuffer.reduce((acc, val) => acc + val.length, 0));
            let offset = 0;
            audioBuffer.forEach(b => { flat.set(b, offset); offset += b.length; });
            audioBuffer = [];
            const energy = flat.reduce((sum, v) => sum + Math.abs(v), 0) / flat.length;
            if (energy > 0.01 && audioWorker.current) {
                audioWorker.current.postMessage({ type: "generate", data: { audio: flat } });
            }
          }
        };
        setAudioStatus("recording");
    } catch (err) { console.error(err); setAudioStatus("error"); }
  }

  function stopRecording() {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setAudioStatus("ready");
  }

  const analyzeTranscription = () => {
    if (isRagMode) return;
    if (!agentWorker.current) return;
    if (contextMessages.length === 0) return;
    setAgentStatus('working');
    setAgentResult(null);
    setAgentResponse('');
    const bufferText = contextMessages.map(msg => msg.text).join(" "); 
    agentWorker.current.postMessage({ text: bufferText });
  };

  // ----------------------------------------------------------------
  // FUNCIONES CANVAS
  // ----------------------------------------------------------------
  const getCoordinates = (nativeEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (nativeEvent.clientX - rect.left) * scaleX, y: (nativeEvent.clientY - rect.top) * scaleY };
  };

  const startDrawing = ({ nativeEvent }) => {
    const { x, y } = getCoordinates(nativeEvent);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(x, y); ctx.strokeStyle = currentColor; ctx.lineWidth = 3; ctx.lineCap = 'round';
    isDrawing.current = true;
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing.current) return;
    const { x, y } = getCoordinates(nativeEvent);
    const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(x, y); ctx.stroke();
  };

  const stopDrawing = () => { if(canvasRef.current) { const ctx = canvasRef.current.getContext('2d'); ctx.closePath(); } isDrawing.current = false; };
  
  const clearCanvas = () => {
    const ctx = canvasRef.current.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); setVisionOutput("");
  };
  
  const analyzeCanvas = async () => {
    if (isRagMode) return alert("Espera a que termine el RAG");
    if (!visionWorker.current || !isVisionReady) return;
    const blob = await new Promise(resolve => canvasRef.current.toBlob(resolve, 'image/png'));
    visionWorker.current.postMessage({ type: 'analyze', image: blob, prompt: visionPrompt });
  };

  const currentAgent = agentResult ? AGENTES[agentResult.labels[0]] : null;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      
      {/* COLUMNA 1 */}
      <div style={{ width: '33.33%', minWidth: '400px', backgroundColor: '#020617', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
            <h1 style={{ margin: '0 0 10px 0', fontSize: '1.4rem', textAlign: 'center' }}>🧠 Brainstorming</h1>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                <StatusBadge status={audioStatus} label="Audio" />
                <StatusBadge status={agentStatus} label="Agent" />
            </div>
            
            {isRagMode && (
                <div style={{textAlign:'center', color:'#eab308', fontSize:'0.8rem', padding:'5px', background:'#422006', borderRadius:'4px', marginBottom:'10px'}}>
                    ⚠️ Servicios detenidos para RAG
                </div>
            )}
            
            <div className="controls" style={{ display: 'flex', gap: '8px', justifyContent: 'center', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '8px', opacity: isRagMode ? 0.4 : 1, transition: 'opacity 0.3s' }}>
                <button onClick={startRecording} disabled={isRagMode || audioStatus !== "ready"} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: audioStatus === 'recording' ? '#dc2626' : '#334155', color: 'white', border:'none', cursor: isRagMode || audioStatus !== "ready" ? 'not-allowed' : 'pointer' }}>
                   {audioStatus === 'recording' ? '● Rec' : '▶ Start'}
                </button>
                <button onClick={stopRecording} disabled={isRagMode || audioStatus !== "recording"} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: '#334155', color: 'white', border:'none', cursor: isRagMode || audioStatus !== "recording" ? 'not-allowed' : 'pointer' }}>
                    ⏹ Stop
                </button>
                <button onClick={analyzeTranscription} disabled={isRagMode || contextMessages.length === 0} style={{ flex: 2, padding: '8px', background: '#2563eb', color: 'white', border:'none', borderRadius:'6px', cursor: isRagMode || contextMessages.length === 0 ? 'not-allowed' : 'pointer' }}>
                    ⚡ AI Help
                </button>
            </div>
        </div>

        <div style={{ flex: 1, padding: '15px', overflowY: 'auto' }}>
            {allMessages.map((m, i) => (
               <div key={i} style={{ marginBottom: '8px', color:'#e2e8f0', fontSize:'0.9rem', display: 'flex', gap: '10px' }}>
                 <span style={{ color: '#64748b', fontSize: '0.75rem', minWidth: '50px', fontFamily: 'monospace' }}>{m.time}</span>
                 <span>{m.text}</span>
               </div>
            ))}
        </div>

        <div style={{ flex: 1, padding: '15px', backgroundColor: currentAgent ? '#fff' : '#0f172a', color: currentAgent ? '#000' : '#fff', overflowY: 'auto', borderTop: '1px solid #334155' }}>
             {currentAgent && (
                 <div style={{fontWeight:'bold', marginBottom:'10px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                     <span style={{fontSize:'1.5rem'}}>{currentAgent.icon}</span> 
                     {currentAgent.nombre}
                 </div>
             )}
             <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{agentResponse}</div>
        </div>
      </div>

      {/* COLUMNA 2 */}
      <div style={{ width: '33.33%', minWidth: '400px', backgroundColor: '#0f172a', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
          <div className="vision-panel">
              <h2 style={{ color: '#e2e8f0', fontSize:'1.2rem', display:'flex', alignItems:'center', gap:'10px' }}>
                👁️ Vision <StatusBadge status={visionStatus} label="Engine" />
              </h2>
              
              {!isVisionReady && !isRagMode && (
                <div style={{ width: '100%', marginBottom: '10px' }}>
                  <div className="progress-track"><div className="progress-bar" style={{ width: `${visionProgress}%` }}></div></div>
                </div>
              )}

              <div className="canvas-container" style={{ position: 'relative' }}>
                {isRagMode && (
                    <div style={{ position: 'absolute', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.9)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', borderRadius:'8px' }}>
                        <span style={{ fontSize: '2rem' }}>🔒</span>
                        <p style={{ marginTop: '10px' }}>GPU Reserved for RAG</p>
                    </div>
                )}
                <canvas ref={canvasRef} width={500} height={300} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseOut={stopDrawing} />
              </div>

              <div className="tools">
                 {['#000000', '#ef4444', '#10b981', '#3b82f6', '#f59e0b'].map((color) => (
                  <div key={color} className={`color-btn ${currentColor === color ? 'active' : ''}`} style={{ backgroundColor: color }} onClick={() => setCurrentColor(color)} />
                 ))}
                 <div style={{ width: '1px', height: '20px', background: '#475569', margin: '0 5px' }}></div>
                 <button className="clear-btn" onClick={clearCanvas} style={{cursor:'pointer'}} title="Delete">🗑️</button>
              </div>

              <button onClick={analyzeCanvas} disabled={isRagMode || !isVisionReady} style={{ width: '100%', padding: '12px', marginTop: '10px', background: isVisionReady ? '#3b82f6' : '#1e293b', color: 'white', border:'none', borderRadius:'8px', cursor: isRagMode || !isVisionReady ? 'not-allowed' : 'pointer', opacity: isVisionReady ? 1 : 0.6 }}>
                {isRagMode ? 'Paused System' : '✨ Analyze Design'}
              </button>
              
              {visionOutput && <div className="vision-output" style={{ marginTop:'15px' }}><strong>Análisis Visual:</strong><br/>{visionOutput}</div>}
          </div>
      </div>

      {/* COLUMNA 3 */}
      <div style={{ flex: 1, backgroundColor: '#020617', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <RagPanel onRagActivity={setIsRagMode} />
      </div>

    </div>
  );
}

function StatusBadge({ status, label }) {
    const s = String(status).toLowerCase();
    let color = "#94a3b8";
    if (s.includes("ready") || s.includes("listo")) color = "#10b981";
    if (s.includes("loading") || s.includes("reiniciando") || s.includes("iniciando") || s.includes("esperando")) color = "#3b82f6";
    if (s.includes("apagado") || s.includes("pausado")) color = "#ef4444";
    if (s.includes("recording")) color = "#ef4444";
    
    return (
      <span style={{ padding: '2px 8px', borderRadius: '12px', background: '#1e293b', fontSize: '10px', border: `1px solid ${color}`, color: '#e2e8f0', marginLeft:'5px' }}>
        {label} <span style={{ color: color, fontWeight: 'bold' }}>{status}</span>
      </span>
    );
}