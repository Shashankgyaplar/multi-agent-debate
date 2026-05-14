import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';

const SERVER = 'http://localhost:3001';

const AGENTS = {
  'Analyst':          { emoji: '🔬', color: '#2383e2', bg: '#e8f0fc' },
  "Devil's Advocate": { emoji: '⚡', color: '#d44c47', bg: '#fce8e8' },
  'Creative Thinker': { emoji: '✦',  color: '#9065b0', bg: '#f0e8fc' },
  'Ethics Checker':   { emoji: '⚖',  color: '#0d7f5f', bg: '#e8f7f2' },
  'Moderator':        { emoji: '◎',  color: '#c57f30', bg: '#fdf3e3' },
};

function AgentCard({ agent, score }) {
  const cfg = AGENTS[agent.agentName] || { emoji: '○', color: '#787774', bg: '#f1f1ef' };
  const pass = score !== null && score >= 6.5;
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e9e9e7',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '8px',
      animation: 'fadeUp 0.35s ease forwards',
      opacity: 0,
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: '10px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          width: '30px', height: '30px', borderRadius: '6px',
          background: cfg.bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '15px', flexShrink: 0
        }}>{cfg.emoji}</div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#37352f' }}>
            {agent.agentName}
          </div>
          <div style={{ fontSize: '11px', color: '#9b9a97', marginTop: '1px' }}>
            Round {agent.round} · qwen3:8b
          </div>
        </div>

        {agent.revised && (
          <span style={{
            fontSize: '11px', fontWeight: 500,
            color: '#c57f30', background: '#fdf3e3',
            border: '1px solid #f5d9a8',
            padding: '2px 8px', borderRadius: '4px'
          }}>Revised</span>
        )}

        {score !== null && (
          <span style={{
            fontSize: '13px', fontWeight: 600,
            color: pass ? '#0d7f5f' : '#d44c47',
            background: pass ? '#e8f7f2' : '#fce8e8',
            padding: '3px 10px', borderRadius: '20px',
            border: `1px solid ${pass ? '#b8e8d8' : '#f5b8b8'}`
          }}>{score}/10</span>
        )}

        <span style={{
          color: '#c7c6c3', fontSize: '12px',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s', display: 'block'
        }}>▶</span>
      </div>

      {/* Score bar */}
      {score !== null && (
        <div style={{ height: '2px', background: '#f1f1ef', margin: '0 16px' }}>
          <div style={{
            height: '100%', borderRadius: '1px',
            width: `${(score / 10) * 100}%`,
            background: pass ? '#0d7f5f' : '#d44c47',
            transition: 'width 0.8s ease'
          }} />
        </div>
      )}

      {/* Body */}
      {open && (
        <div style={{
          padding: '12px 16px 16px',
          borderTop: '1px solid #f1f1ef',
        }}>
          <div className="md">
            <ReactMarkdown>{agent.response}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorePanel({ scores, label }) {
  if (!scores.length) return null;
  return (
    <div style={{
      background: '#f7f7f5',
      border: '1px solid #e9e9e7',
      borderRadius: '8px',
      padding: '14px 16px',
      marginBottom: '24px'
    }}>
      <div style={{
        fontSize: '11px', fontWeight: 600, color: '#9b9a97',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: '12px'
      }}>{label}</div>
      {scores.map((s, i) => {
        const cfg = AGENTS[s.agentName] || { color: '#9b9a97', bg: '#f1f1ef', emoji: '○' };
        const pass = s.passedThreshold;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            marginBottom: i < scores.length - 1 ? '10px' : 0
          }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '5px',
              background: cfg.bg, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '12px', flexShrink: 0
            }}>{cfg.emoji}</div>
            <div style={{ fontSize: '13px', color: '#37352f', width: '140px', flexShrink: 0 }}>
              {s.agentName}
            </div>
            <div style={{ flex: 1, height: '4px', background: '#e9e9e7', borderRadius: '2px' }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                width: `${((s.averageScore || 0) / 10) * 100}%`,
                background: pass ? '#0d7f5f' : '#d44c47',
                transition: 'width 0.8s ease'
              }} />
            </div>
            <span style={{
              fontSize: '12px', fontWeight: 600, width: '48px',
              textAlign: 'right', flexShrink: 0,
              color: pass ? '#0d7f5f' : '#d44c47'
            }}>{s.averageScore ?? '—'}/10</span>
            <span style={{ fontSize: '12px', color: pass ? '#0d7f5f' : '#d44c47' }}>
              {pass ? '✓' : '✗'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusRow({ items, isRunning }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: '20px' }}>
      {items.map((msg, i) => {
        const isLast = i === items.length - 1;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 0', opacity: isLast ? 1 : 0.4
          }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
              background: isLast && isRunning ? '#0d7f5f' : '#d4d4d0',
              animation: isLast && isRunning ? 'pulse 1.4s infinite' : 'none'
            }} />
            <span style={{ fontSize: '13px', color: isLast ? '#37352f' : '#9b9a97' }}>
              {msg}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Divider({ label, round }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      marginBottom: '16px', marginTop: '8px'
    }}>
      {round && (
        <span style={{
          fontSize: '11px', fontWeight: 600, color: '#9b9a97',
          background: '#f1f1ef', border: '1px solid #e9e9e7',
          padding: '2px 8px', borderRadius: '4px', flexShrink: 0
        }}>Round {round}</span>
      )}
      <span style={{ fontSize: '12px', fontWeight: 500, color: '#9b9a97', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: '#e9e9e7' }} />
    </div>
  );
}

export default function App() {
  const [question, setQuestion] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [round1, setRound1] = useState([]);
  const [round2, setRound2] = useState([]);
  const [scores1, setScores1] = useState([]);
  const [scores2, setScores2] = useState([]);
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [socketId, setSocketId] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const socket = io(SERVER);
    socketRef.current = socket;
    socket.on('connect', () => setSocketId(socket.id));
    socket.on('debate:status', ({ message }) => setStatuses(p => [...p, message]));
    socket.on('debate:round1Complete', ({ responses }) => setRound1(responses));
    socket.on('debate:scores', ({ scores }) => setScores1(scores));
    socket.on('debate:round2Complete', ({ responses }) => setRound2(responses));
    socket.on('debate:scores2', ({ scores }) => setScores2(scores));
    socket.on('debate:final', (data) => {
      setFinalAnswer(data.finalAnswer);
      setIsRunning(false);
      setStatuses(p => [...p, 'Debate complete.']);
    });
    socket.on('debate:error', ({ error }) => {
      setStatuses(p => [...p, `Error: ${error}`]);
      setIsRunning(false);
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [round1, round2, finalAnswer, statuses]);

  const startDebate = async () => {
    if (!question.trim() || isRunning) return;
    setRound1([]); setRound2([]); setScores1([]); setScores2([]);
    setFinalAnswer(null); setStatuses([]);
    setIsRunning(true);
    await axios.post(`${SERVER}/debate`, { question, socketId });
  };

  const getScore = (name, scores) => scores.find(s => s.agentName === name)?.averageScore ?? null;
  const hasRevisions = round2.some(r => r.revised);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #ffffff; color: #37352f; font-family: 'Inter', -apple-system, sans-serif; min-height: 100vh; }
        textarea { outline: none; font-family: inherit; }
        button { font-family: inherit; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e9e9e7; border-radius: 6px; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        .md { font-size: 14px; line-height: 1.75; color: #37352f; }
        .md p { margin-bottom: 8px; }
        .md p:last-child { margin-bottom: 0; }
        .md strong { font-weight: 600; color: #37352f; }
        .md em { font-style: italic; }
        .md ul { padding-left: 20px; margin-bottom: 8px; }
        .md ol { padding-left: 20px; margin-bottom: 8px; }
        .md li { margin-bottom: 4px; }
        .md h1, .md h2, .md h3 { font-weight: 600; margin-bottom: 6px; margin-top: 12px; color: #37352f; }
        .md h3 { font-size: 14px; }
        .md code { background: #f1f1ef; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
        .md blockquote { border-left: 3px solid #e9e9e7; padding-left: 12px; color: #9b9a97; margin: 8px 0; }
      `}</style>

      {/* Topbar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '48px', background: '#ffffffee',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e9e9e7',
        display: 'flex', alignItems: 'center',
        padding: '0 2rem', gap: '12px'
      }}>
        <span style={{ fontSize: '18px' }}>◎</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#37352f' }}>Council</span>
        <span style={{ color: '#e9e9e7' }}>·</span>
        <span style={{ fontSize: '13px', color: '#9b9a97' }}>Multi-Agent Debate</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isRunning && (
            <span style={{ fontSize: '12px', color: '#0d7f5f', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#0d7f5f', display: 'inline-block',
                animation: 'pulse 1.4s infinite'
              }} />
              Debating...
            </span>
          )}
        </div>
      </div>

      {/* Page */}
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '72px 2rem 6rem' }}>

        {/* Title */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#37352f', marginBottom: '6px', letterSpacing: '-0.02em' }}>
            Multi-Agent Council
          </h1>
          <p style={{ fontSize: '14px', color: '#9b9a97', lineHeight: 1.6 }}>
            Four AI agents debate your question, score each other on accuracy and logic, then a Moderator synthesises the final answer.
          </p>
        </div>

        {/* Agent pills — only on landing */}
        {!round1.length && !isRunning && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {Object.entries(AGENTS).slice(0, 4).map(([name, cfg]) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                background: cfg.bg, border: `1px solid ${cfg.color}22`,
                borderRadius: '6px', padding: '6px 12px'
              }}>
                <span style={{ fontSize: '13px' }}>{cfg.emoji}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: cfg.color }}>{name}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: '1px', background: '#e9e9e7', marginBottom: '1.5rem' }} />

        {/* Input */}
        <div style={{
          background: '#f7f7f5', border: '1px solid #e9e9e7',
          borderRadius: '8px', marginBottom: '1.5rem', overflow: 'hidden'
        }}>
          <div style={{
            padding: '10px 14px 2px', fontSize: '11px',
            fontWeight: 600, color: '#9b9a97',
            textTransform: 'uppercase', letterSpacing: '0.08em'
          }}>Question</div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') startDebate(); }}
            placeholder="Ask anything complex or nuanced..."
            disabled={isRunning}
            rows={3}
            style={{
              width: '100%', background: 'transparent', border: 'none',
              padding: '6px 14px 14px', color: '#37352f',
              fontSize: '15px', lineHeight: 1.7, resize: 'none',
            }}
          />
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderTop: '1px solid #e9e9e7', background: '#fff'
          }}>
            <span style={{ fontSize: '11px', color: '#c7c6c3' }}>Ctrl + Enter to start</span>
            <button
              onClick={startDebate}
              disabled={isRunning || !question.trim()}
              style={{
                background: isRunning || !question.trim() ? '#f1f1ef' : '#37352f',
                color: isRunning || !question.trim() ? '#9b9a97' : '#fff',
                border: 'none', borderRadius: '6px',
                padding: '8px 18px', fontSize: '13px', fontWeight: 500,
                cursor: isRunning || !question.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >{isRunning ? 'Running...' : 'Start Debate'}</button>
          </div>
        </div>

        {/* Status log */}
        <StatusRow items={statuses} isRunning={isRunning} />

        {/* Round 1 */}
        {round1.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <Divider label="Independent responses" round={1} />
            {round1.map(agent => (
              <AgentCard key={agent.agentId} agent={agent} score={getScore(agent.agentName, scores1)} />
            ))}
          </div>
        )}

        {/* Scores 1 */}
        {scores1.length > 0 && <ScorePanel scores={scores1} label="Peer review — Round 1" />}

        {/* Round 2 */}
        {hasRevisions && (
          <div style={{ marginBottom: '8px' }}>
            <Divider label="Revised responses" round={2} />
            {round2.filter(r => r.revised).map(agent => (
              <AgentCard key={agent.agentId} agent={agent} score={getScore(agent.agentName, scores2)} />
            ))}
          </div>
        )}

        {/* Scores 2 */}
        {scores2.length > 0 && hasRevisions && (
          <ScorePanel scores={scores2} label="Peer review — Round 2" />
        )}

        {/* Final answer */}
        {finalAnswer && (
          <div style={{
            background: '#fdf9f0', border: '1px solid #f5d9a8',
            borderRadius: '8px', overflow: 'hidden',
            animation: 'fadeUp 0.4s ease forwards', marginTop: '8px'
          }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #f5d9a8',
              display: 'flex', alignItems: 'center', gap: '10px',
              background: '#fdf3e3'
            }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '6px',
                background: '#fdf3e3', border: '1px solid #f5d9a8',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px'
              }}>◎</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#c57f30' }}>
                  Moderator — Final Synthesis
                </div>
                <div style={{ fontSize: '11px', color: '#9b9a97', marginTop: '1px' }}>
                  Consensus reached · all agents reviewed
                </div>
              </div>
            </div>
            <div style={{ padding: '16px' }}>
              <div className="md">
                <ReactMarkdown>{finalAnswer.response}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </>
  );
}