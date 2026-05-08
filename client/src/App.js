import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import './App.css';

const SERVER = 'http://localhost:3001';

const AGENT_COLORS = {
  'Analyst': '#3b82f6',
  "Devil's Advocate": '#ef4444',
  'Creative Thinker': '#8b5cf6',
  'Ethics Checker': '#10b981',
  'Moderator': '#f59e0b'
};

const AGENT_ICONS = {
  'Analyst': '🔬',
  "Devil's Advocate": '⚔️',
  'Creative Thinker': '🎨',
  'Ethics Checker': '⚖️',
  'Moderator': '🧑‍⚖️'
};

export default function App() {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [round1, setRound1] = useState([]);
  const [round2, setRound2] = useState([]);
  const [scores1, setScores1] = useState([]);
  const [scores2, setScores2] = useState([]);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [socketId, setSocketId] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SERVER);
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketId(socket.id);
    });

    socket.on('debate:status', ({ message }) => {
      setStatus(message);
    });

    socket.on('debate:round1Complete', ({ responses }) => {
      setRound1(responses);
    });

    socket.on('debate:scores', ({ scores }) => {
      setScores1(scores);
    });

    socket.on('debate:round2Complete', ({ responses }) => {
      setRound2(responses);
    });

    socket.on('debate:scores2', ({ scores }) => {
      setScores2(scores);
    });

    socket.on('debate:final', (data) => {
      setFinalAnswer(data.finalAnswer);
      setStatus('Debate complete!');
      setIsRunning(false);
    });

    socket.on('debate:error', ({ error }) => {
      setStatus(`Error: ${error}`);
      setIsRunning(false);
    });

    return () => socket.disconnect();
  }, []);

  const startDebate = async () => {
    if (!question.trim()) return;

    // Reset state
    setRound1([]);
    setRound2([]);
    setScores1([]);
    setScores2([]);
    setFinalAnswer(null);
    setIsRunning(true);
    setStatus('Starting debate...');

    await axios.post(`${SERVER}/debate`, {
      question,
      socketId
    });
  };

  const getScore = (agentName, scores) => {
    const found = scores.find(s => s.agentName === agentName);
    return found ? found.averageScore : null;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>🤖</span>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Multi-Agent Debate System</h1>
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>4 AI agents debate • peer scoring • consensus protocol</p>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Question Input */}
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid #334155' }}>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Ask a complex question... e.g. Should AI be used in hiring decisions?"
            disabled={isRunning}
            style={{
              width: '100%', background: '#0f172a', border: '1px solid #334155',
              borderRadius: '8px', padding: '12px', color: '#f1f5f9',
              fontSize: '15px', resize: 'none', height: '80px',
              boxSizing: 'border-box', marginBottom: '12px'
            }}
          />
          <button
            onClick={startDebate}
            disabled={isRunning || !question.trim()}
            style={{
              background: isRunning ? '#334155' : '#3b82f6',
              color: 'white', border: 'none', borderRadius: '8px',
              padding: '10px 24px', fontSize: '15px', cursor: isRunning ? 'not-allowed' : 'pointer',
              fontWeight: 500
            }}
          >
            {isRunning ? '⏳ Debating...' : '🚀 Start Debate'}
          </button>

          {status && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isRunning && <span>⚡</span>}
              {status}
            </div>
          )}
        </div>

        {/* Round 1 */}
        {round1.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Round 1 — Independent Responses
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {round1.map(agent => {
                const score = getScore(agent.agentName, scores1);
                const color = AGENT_COLORS[agent.agentName] || '#64748b';
                return (
                  <div key={agent.agentId} style={{ background: '#1e293b', borderRadius: '12px', border: `1px solid ${color}44`, overflow: 'hidden' }}>
                    <div style={{ background: `${color}22`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${color}44` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{AGENT_ICONS[agent.agentName]}</span>
                        <span style={{ fontWeight: 500, fontSize: '14px', color }}>{agent.agentName}</span>
                      </div>
                      {score && (
                        <span style={{
                          background: score >= 6.5 ? '#10b98133' : '#ef444433',
                          color: score >= 6.5 ? '#10b981' : '#ef4444',
                          padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500
                        }}>
                          {score}/10 {score >= 6.5 ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '14px 16px', fontSize: '13px', lineHeight: '1.7', color: '#cbd5e1' }}>
                      {agent.response}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Round 2 */}
        {round2.length > 0 && round2.some(r => r.revised) && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Round 2 — Revised Responses
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {round2.filter(r => r.revised).map(agent => {
                const score = getScore(agent.agentName, scores2);
                const color = AGENT_COLORS[agent.agentName] || '#64748b';
                return (
                  <div key={agent.agentId} style={{ background: '#1e293b', borderRadius: '12px', border: `1px solid ${color}44`, overflow: 'hidden' }}>
                    <div style={{ background: `${color}22`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${color}44` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{AGENT_ICONS[agent.agentName]}</span>
                        <span style={{ fontWeight: 500, fontSize: '14px', color }}>{agent.agentName}</span>
                        <span style={{ fontSize: '11px', color: '#f59e0b', background: '#f59e0b22', padding: '1px 8px', borderRadius: '10px' }}>revised</span>
                      </div>
                      {score && (
                        <span style={{
                          background: score >= 6.5 ? '#10b98133' : '#ef444433',
                          color: score >= 6.5 ? '#10b981' : '#ef4444',
                          padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500
                        }}>
                          {score}/10 {score >= 6.5 ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '14px 16px', fontSize: '13px', lineHeight: '1.7', color: '#cbd5e1' }}>
                      {agent.response}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Final Answer */}
        {finalAnswer && (
          <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #f59e0b44', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div style={{ background: '#f59e0b22', padding: '14px 20px', borderBottom: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🧑‍⚖️</span>
              <div>
                <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '15px' }}>Moderator — Final Synthesised Answer</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Consensus reached after peer review</div>
              </div>
            </div>
            <div style={{ padding: '20px', fontSize: '14px', lineHeight: '1.8', color: '#e2e8f0' }}>
              {finalAnswer.response}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}