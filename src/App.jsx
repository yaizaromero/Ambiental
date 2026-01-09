import { useEffect, useRef, useState } from "react";
import "./index.css";

export default function App() {
  const workerRef = useRef(null);

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("booting");
  const [progress, setProgress] = useState(0);
  const [allMessages, setAllMessages] = useState([]);       // UI (historial completo)
  const [contextMessages, setContextMessages] = useState([]); // contexto (últimas 4)



  useEffect(() => {
    if (workerRef.current) return;

    const w = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });

    workerRef.current = w;

    w.onmessage = (e) => {
      const msg = e.data;

      if (msg.status === "booted") setStatus("booting");

      if (msg.status === "loading") {
        setStatus("loading");
        if (typeof msg.data?.progress === "number") {
          setProgress(Math.round(msg.data.progress * 100));
        }
      }

      if (msg.status === "ready") {
        setStatus("ready");
        setProgress(100);
      }

      if (msg.status === "complete" && msg.output) {
        const newMsg = {
          text: msg.output,
          time: new Date().toLocaleTimeString(),
        };

        //  UI: guarda TODO
        setAllMessages((prev) => [...prev, newMsg]);

        //  Contexto: solo últimas 4
        setContextMessages((prev) => {
          const updated = [...prev, newMsg];
          return updated.slice(-4);
        });
      }


      if (msg.status === "debug_context") {
        console.log("[Worker contextBuffer]", msg.data);
      }


      if (msg.status === "error") {
        setStatus("error");
        console.error(msg.data);
      }
    };

    w.postMessage({ type: "load" });
  }, []);

  useEffect(() => {
    console.log(
      "%c[Context buffer - last 4]",
      "color:#22c55e;font-weight:bold"
    );

    console.table(
      contextMessages.map((m, i) => ({
        index: i,
        time: m.time,
        text: m.text,
      }))
    );
  }, [contextMessages]);




  async function startRecording() {
    if (!workerRef.current) return;

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

    processor.onaudioprocess = (e) => {
      audioBuffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));

      // ~2 segundos de audio
      if (audioBuffer.length >= 16) {
        const chunkSize = audioBuffer[0].length;
        const flat = new Float32Array(audioBuffer.length * chunkSize);

        audioBuffer.forEach((b, i) => flat.set(b, i * chunkSize));
        audioBuffer = [];

        // 🔍 calcular energía media (voz vs silencio)
        const energy =
          flat.reduce((sum, v) => sum + Math.abs(v), 0) / flat.length;

        // 🚫 si es silencio, NO mandamos nada
        if (energy < 0.01) return;

        workerRef.current.postMessage({
          type: "generate",
          data: { audio: flat },
        });

      }
    };

    setStatus("recording");
  }

  function stopRecording() {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    processorRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;

    setStatus("ready");
  }

  return (
    <div className="app">
      <h1>🧠 Brainstorming Privado</h1>

      <StatusBadge status={status} />

      {status === "loading" && <ProgressBar value={progress} />}

      <div className="controls">
        <button onClick={startRecording} disabled={status !== "ready"}>
          ▶ Start
        </button>
        <button onClick={stopRecording} disabled={status !== "recording"}>
          ⏹ Stop
        </button>
      </div>

      <div className="transcript">
        <h3>📝 Transcripción</h3>

        {allMessages.length === 0 && (
          <p className="placeholder">Waiting for speech...</p>
        )}

        <div className="chat">
          {allMessages.map((m, i) => (
            <div key={i} className="chat-line">
              <span className="time">[{m.time}]</span>
              <span className="text">{m.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

}

function StatusBadge({ status }) {
  const labels = {
    booting: "Iniciando sistema",
    loading: "Cargando modelo",
    ready: "Listo",
    recording: "Grabando",
    error: "Error",
  };

  return <div className={`status ${status}`}>{labels[status] || status}</div>;
}

function ProgressBar({ value }) {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${value}%` }} />
      <span>{value}%</span>
    </div>
  );
}
