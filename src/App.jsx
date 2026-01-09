import { useEffect, useState, useRef } from 'react';
import './App.css';

function App() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState(null);
  const [generatedResponse, setGeneratedResponse] = useState('');
  const [status, setStatus] = useState('Ready');

  const AGENTES = {
    "White Agent": { nombre: "White Agent", desc: "Data Processor", color: "#f8f9fa", texto: "#212529", icon: "⚪" },
    "Red Agent": { nombre: "Red Agent", desc: "Sentiment Analyst", color: "#ffebee", texto: "#c62828", icon: "🔴" },
    "Black Agent": { nombre: "Black Agent", desc: "Risk Evaluator", color: "#212121", texto: "#ffffff", icon: "⚫" },
    "Yellow Agent": { nombre: "Yellow Agent", desc: "Value Seeker", color: "#fff9c4", texto: "#fbc02d", icon: "🟡" },
    "Green Agent": { nombre: "Green Agent", desc: "Creative Generator", color: "#e8f5e9", texto: "#2e7d32", icon: "🟢" },
    "Blue Agent": { nombre: "Blue Agent", desc: "Process Facilitator", color: "#e3f2fd", texto: "#1565c0", icon: "🔵" }
  };

  const worker = useRef(null);

  useEffect(() => {
    worker.current = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module'
    });

    worker.current.onmessage = (e) => {
      const { status, output, result, generatedText } = e.data;
      
      if (status === 'loading') {
        setStatus(`${output.status} ${output.progress ? Math.round(output.progress) + '%' : ''}`);
      } else if (status === 'complete') {
        setStatus('Analysis complete');
        setResult(result);
        setGeneratedResponse(generatedText);
      } else if (status === 'error') {
        setStatus('Worker Error');
        console.error(output);
      }
    };

    return () => worker.current.terminate();
  }, []);

  const clasificarTexto = () => {
    if(!inputText.trim()) return;
    setStatus('Orchestrating...');
    setResult(null);
    setGeneratedResponse('');
    worker.current.postMessage({ text: inputText });
  };

  const currentAgent = result ? AGENTES[result.labels[0]] : null;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1>🧠 Hat Orchestrator</h1>
        <p style={{ color: '#666' }}>Local multi-agent system in browser</p>
      </header>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <textarea 
          rows="4" 
          placeholder="Enter an idea or statement (e.g., 'Launching without testing is risky')"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{ padding: '15px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
        />
        
        <button 
          onClick={clasificarTexto} 
          disabled={status.includes('Loading') || status === 'Orchestrating...'}
          style={{ 
            padding: '12px', 
            backgroundColor: '#333', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer',
            fontSize: '16px',
            opacity: (status.includes('Loading')) ? 0.7 : 1
          }}
        >
          {status.includes('Loading') ? 'Loading AI Models...' : 'Analyze & Invoke Agent'}
        </button>
      </div>

      <p style={{ textAlign: 'center', fontSize: '14px', color: '#888', marginTop: '10px' }}>
        <strong>System Status:</strong> {status}
      </p>

      {currentAgent && (
        <div className="agent-card" style={{ 
          marginTop: '30px', 
          border: `2px solid ${currentAgent.color}`,
          borderRadius: '15px',
          overflow: 'hidden',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            backgroundColor: currentAgent.color, 
            color: currentAgent.texto, 
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
          }}>
            <span style={{ fontSize: '40px' }}>{currentAgent.icon}</span>
            <div>
              <h2 style={{ margin: 0 }}>{currentAgent.nombre}</h2>
              <span style={{ opacity: 0.8 }}>{currentAgent.desc}</span>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
               <small>Confidence</small><br/>
               <strong>{(result.scores[0] * 100).toFixed(1)}%</strong>
            </div>
          </div>

          <div style={{ padding: '25px', backgroundColor: '#fff' }}>
            <h3 style={{ marginTop: 0, color: '#555' }}>Agent Response:</h3>
            {generatedResponse ? (
              <div style={{ 
                fontSize: '18px', 
                lineHeight: '1.6', 
                color: '#333', 
                whiteSpace: 'pre-wrap',
                borderLeft: `4px solid ${currentAgent.color === '#212121' ? '#999' : currentAgent.color}`,
                paddingLeft: '15px'
              }}>
                {generatedResponse}
              </div>
            ) : (
              <p><em>Generating response...</em></p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;