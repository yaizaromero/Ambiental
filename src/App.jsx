import { useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  const [status, setStatus] = useState('BOOTING...');
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [output, setOutput] = useState('');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [prompt, setPrompt] = useState('Analiza la usabilidad de este esquema'); // Prompt por defecto

  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current.postMessage({ type: 'load' });

    workerRef.current.onmessage = (e) => {
      const { status, percent, result, message } = e.data;

      switch (status) {
        case 'init':
          setStatus('INICIALIZANDO ENGINE...');
          break;
        case 'loading_model':
          setStatus('DESCARGANDO NEURAL NET...');
          break;
        case 'progress':
          setProgress(percent);
          setStatus(`CARGANDO CORE... ${percent}%`);
          break;
        case 'ready':
          setIsReady(true);
          setStatus('SISTEMA ONLINE');
          setProgress(0);
          break;
        case 'thinking':
          setIsThinking(true);
          setStatus('PROCESANDO PIZARRA...');
          break;
        case 'done':
          setIsThinking(false);
          setStatus('ANÁLISIS COMPLETADO');
          setOutput(result);
          break;
        case 'error':
          setStatus('ERROR DEL SISTEMA');
          setOutput(message);
          setIsThinking(false);
          break;
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  /* --- Lógica de Dibujo (Igual que antes) --- */
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    isDrawing.current = true;
    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => { isDrawing.current = false; };
  
  const getCoordinates = (e, canvas) => {
    if (e.touches) {
      const rect = canvas.getBoundingClientRect();
      return {
        offsetX: e.touches[0].clientX - rect.left,
        offsetY: e.touches[0].clientY - rect.top
      };
    }
    return { offsetX: e.nativeEvent.offsetX, offsetY: e.nativeEvent.offsetY };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setOutput('');
  };

  // Inicializar fondo blanco (importante para la IA)
  useEffect(() => {
    if(canvasRef.current) clearCanvas();
  }, []);

  const handleAnalyze = () => {
    if (!isReady || isThinking) return;
    const canvas = canvasRef.current;
    const image = canvas.toDataURL('image/png');
    workerRef.current.postMessage({ type: 'analyze', image, prompt });
  };

  return (
    <div className="container">
      <div className="header">
        <span style={{ fontWeight: 'bold' }}>AI ARCHITECT</span>
        <div style={{ fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--accent)' }}>SYSTEM: </span>
          <span style={{ color: isReady ? 'var(--success)' : '#666' }}>
            {status}
          </span>
        </div>
      </div>

      {/* Tu barra de progreso original */}
      {progress > 0 && progress < 100 && (
        <div className="progress-track">
          <div 
            className="progress-bar" 
            style={{ 
              width: `${progress}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 0.2s'
            }} 
          ></div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        style={{ background: 'white', cursor: 'crosshair', borderRadius: '4px' }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      <div className="tools">
        {['#000000', '#cf6679', '#03dac6', '#3700b3'].map((color) => (
          <div
            key={color}
            className={`color-btn ${currentColor === color ? 'active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => setCurrentColor(color)}
          />
        ))}
        <button className="clear-btn" onClick={clearCanvas} title="Borrar">🗑️</button>
      </div>

      {/* Prompt input: Integrado discretamente */}
      <input 
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Pregunta algo sobre el dibujo..."
        style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid #333',
            color: 'var(--text)',
            padding: '8px',
            marginTop: '10px',
            outline: 'none',
            fontSize: '0.9rem',
            textAlign: 'center'
        }}
      />

      {/* Resultado */}
      <p className="output-text" style={{ fontSize: '0.95rem', minHeight: '60px' }}>
        {isThinking ? '...' : output}
      </p>

      {/* Botón Principal (Estilo Original) */}
      <button 
        onClick={handleAnalyze} 
        disabled={!isReady || isThinking}
        style={{
            marginTop: '10px',
            width: '100%',
            background: isReady ? '#333' : '#222',
            color: isReady ? 'white' : '#555',
            cursor: isReady ? 'pointer' : 'default',
            borderColor: isReady ? 'var(--accent)' : 'transparent'
        }}
      >
        ANALIZAR PIZARRA
      </button>
    </div>
  );
}

export default App;