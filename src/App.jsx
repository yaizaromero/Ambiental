import { useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  // Estados de la UI
  const [status, setStatus] = useState('BOOTING...');
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [output, setOutput] = useState('');
  const [currentColor, setCurrentColor] = useState('#000000');

  // Referencias (para cosas que no renderizan o el Canvas)
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const isDrawing = useRef(false);

  // Inicialización del Worker y Eventos
  useEffect(() => {
    // Importación especial de Vite para Workers
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current.postMessage({ type: 'load' });

    workerRef.current.onmessage = (e) => {
      const { status, percent, result, message } = e.data;

      switch (status) {
        case 'init':
          setStatus('INICIALIZANDO...');
          break;
        case 'progress':
          setProgress(percent);
          setStatus(`CARGANDO CORE... ${percent}%`);
          break;
        case 'ready':
          setStatus('ONLINE');
          setProgress(100);
          setIsReady(true);
          break;
        case 'thinking':
          setIsThinking(true);
          setOutput('');
          break;
        case 'complete':
          setIsThinking(false);
          typeWriterEffect(result);
          break;
        case 'error':
          setStatus('ERROR FATAL');
          console.error(message);
          break;
      }
    };

    // Inicializar canvas en blanco
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return () => workerRef.current.terminate();
  }, []);

  // Efecto máquina de escribir
  const typeWriterEffect = (text) => {
    const cleanText = text.replace('<|endoftext|>', '').trim();
    let i = 0;
    setOutput('');
    const interval = setInterval(() => {
      setOutput((prev) => prev + cleanText.charAt(i));
      i++;
      if (i >= cleanText.length) clearInterval(interval);
    }, 30);
  };

  // Funciones de Dibujo
  const startDrawing = (e) => {
    isDrawing.current = true;
    draw(e);
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Soporte para ratón y touch
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = currentColor;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  // Acciones
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setOutput('');
  };

  const handleAnalyze = () => {
    const imageUrl = canvasRef.current.toDataURL('image/png');
    workerRef.current.postMessage({ type: 'analyze', image: imageUrl });
  };

  return (
    <div className="container">
      {/* Barra de Progreso */}
      <div style={{ width: '100%' }}>
        <div className="progress-track">
          <div 
            className="progress-bar" 
            style={{ width: `${progress}%`, opacity: isReady ? 0 : 1 }}
          ></div>
        </div>
        <div className="header">
          <span style={{ color: 'var(--accent)' }}>SYSTEM</span>
          <span style={{ color: isReady ? 'var(--success)' : '#666' }}>
            {status}
          </span>
        </div>
      </div>

      {/* Pizarra */}
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {/* Herramientas */}
      <div className="tools">
        {['#000000', '#cf6679', '#03dac6', '#3700b3'].map((color) => (
          <div
            key={color}
            className={`color-btn ${currentColor === color ? 'active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => setCurrentColor(color)}
          />
        ))}
        <button className="clear-btn" onClick={clearCanvas} title="Borrar">
          🗑️
        </button>
      </div>

      {/* Resultado */}
      <p className="output-text">
        {isThinking ? 'PROCESANDO...' : output ? `"${output}"` : ''}
      </p>

      {/* Botón Principal */}
      <button
        className={`analyze-btn ${isReady ? 'visible' : ''}`}
        onClick={handleAnalyze}
        disabled={isThinking || !isReady}
      >
        {isThinking ? '...' : 'ANALIZAR'}
      </button>
    </div>
  );
}

export default App;