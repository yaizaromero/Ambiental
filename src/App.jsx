import { useEffect, useState, useRef } from 'react';
import './App.css';
import RagPanel from './rag/RagPanel.jsx';


function App() {
  // Estado para guardar lo que escribe el usuario y la respuesta de la IA
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('Listo');
  
  // Referencia al Worker (nuestro cerebro en segundo plano)
  const worker = useRef(null);

  // Al iniciar la web, creamos el worker
  useEffect(() => {
    worker.current = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module'
    });

    // Qué hacer cuando el worker nos responde
    worker.current.onmessage = (e) => {
      const { status, output, result } = e.data;
      
      if (status === 'loading') {
        // Mostrar barra de progreso si está descargando el modelo
        setStatus(`Cargando modelo... ${output.status} ${output.progress || ''}%`);
      } else if (status === 'complete') {
        setStatus('Análisis completado');
        setResult(result); // Guardamos el resultado para mostrarlo
      }
    };

    return () => worker.current.terminate();
  }, []);

  const clasificarTexto = () => {
    setStatus('Analizando...');
    // Enviamos el texto al worker
    worker.current.postMessage({ text: inputText });
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>🧠 Orquestador de Sombreros (Prueba)</h1>
      
      <textarea 
        rows="4" 
        cols="50"
        placeholder="Escribe una frase (ej: 'Eso es demasiado arriesgado y costará mucho dinero')"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
      />
      <br />
      <button onClick={clasificarTexto} disabled={status === 'Analizando...'}>
        Analizar Intención
      </button>

      <p><strong>Estado:</strong> {status}</p>

      {result && (
        <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '10px' }}>
          <h3>Resultado:</h3>
          <p>La IA cree que esto es: <strong>{result.labels[0]}</strong></p>
          <p>(Confianza: {(result.scores[0] * 100).toFixed(2)}%)</p>
        </div>
      )}
      <hr style={{ margin: '30px 0' }} />
      <RagPanel />
    </div>
  );
}

export default App;