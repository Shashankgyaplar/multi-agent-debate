import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import { useCouncilAudio } from './useCouncilAudio';

const SERVER = 'http://localhost:3001';

const AGENTS = {
  'Analyst':          { emoji: '🔬', color: '#2383e2', bg: '#e8f0fc' },
  "Devil's Advocate": { emoji: '⚡', color: '#d44c47', bg: '#fce8e8' },
  'Creative Thinker': { emoji: '✦',  color: '#9065b0', bg: '#f0e8fc' },
  'Ethics Checker':   { emoji: '⚖',  color: '#0d7f5f', bg: '#e8f7f2' },
  'Moderator':        { emoji: '◎',  color: '#c57f30', bg: '#fdf3e3' },
};

const DEFAULT_MODELS = [
  'qwen3:8b',
  'qwen3:14b',
  'qwen3:8b-q4_K_M',
  'phi4-mini',
  'llama3.2:3b',
  'gemma3:4b',
  'custom'
];

const DEFAULT_ROLES = [
  'Analyst',
  "Devil's Advocate",
  'Creative Thinker',
  'Ethics Checker',
  'Moderator'
];

function createDefaultNode(index) {
  const role = DEFAULT_ROLES[index % DEFAULT_ROLES.length];
  return {
    id: `node-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`,
    ip: index === 0 ? '127.0.0.1' : `192.168.1.${10 + index}`,
    port: '11434',
    role: role,
    model: role === 'Creative Thinker' || role === 'Ethics Checker' ? 'qwen3:8b' : 'qwen3:14b',
    customModel: '',
    note: index === 0 ? "Orchestrator laptop" : '',
    isOrchestrator: index === 0,
    status: 'untested',
    responseTime: null
  };
}

function formatDuration(ms) {
  if (!ms || isNaN(ms)) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatRelativeTime(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AgentCard({ agent, score, isSpeaking, onSpeak }) {
  const cfg = AGENTS[agent.agentName] || { emoji: '○', color: '#787774', bg: '#f1f1ef' };
  const pass = score !== null && score >= 6.5;
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      background: '#fff',
      border: isSpeaking ? '1.5px solid #0284c7' : '1px solid #e9e9e7',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '8px',
      animation: 'fadeUp 0.35s ease forwards',
      boxShadow: isSpeaking ? '0 0 0 2px #38bdf8, 0 6px 18px rgba(56, 189, 248, 0.22)' : 'none',
      transition: 'all 0.25s ease',
      opacity: 0,
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: '10px',
          cursor: 'pointer', userSelect: 'none',
          background: isSpeaking ? '#f0f9ff' : '#ffffff',
          transition: 'background 0.2s ease'
        }}
      >
        <div style={{
          width: '30px', height: '30px', borderRadius: '6px',
          background: cfg.bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '15px', flexShrink: 0
        }}>{cfg.emoji}</div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#37352f', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{agent.agentName}</span>
            {isSpeaking && (
              <span style={{
                fontSize: '10px', fontWeight: 700,
                color: '#0284c7', background: '#e0f2fe',
                border: '1px solid #bae6fd',
                padding: '1px 6px', borderRadius: '10px',
                letterSpacing: '0.02em'
              }}>
                🗣️ Speaking
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#9b9a97', marginTop: '1px' }}>
            Round {agent.round} · {agent.model || 'qwen3:14b'}
          </div>
        </div>

        {/* Listen Button */}
        {onSpeak && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSpeak();
            }}
            style={{
              background: isSpeaking ? '#e0f2fe' : '#f8fafc',
              border: isSpeaking ? '1px solid #7dd3fc' : '1px solid #e2e8f0',
              color: isSpeaking ? '#0284c7' : '#64748b',
              borderRadius: '5px',
              padding: '3px 7px',
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            title={isSpeaking ? 'Stop speaking' : 'Listen to this agent'}
          >
            <span>{isSpeaking ? '⏹' : '🔊'}</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>{isSpeaking ? 'Stop' : 'Listen'}</span>
          </button>
        )}

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
          {/* Crisis Adaptive Action badge */}
          {agent.crisisTwist && (
            <div style={{
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: '6px',
              padding: '7px 10px',
              marginBottom: '10px',
              fontSize: '11.5px',
              color: '#9a3412',
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              lineHeight: 1.4
            }}>
              <span style={{ fontWeight: 700, color: '#c2410c', whiteSpace: 'nowrap' }}>⚡ Crisis Adaptive Pivot:</span>
              <span>Directly resolving: <em>"{agent.crisisTwist}"</em></span>
            </div>
          )}

          {agent.assignedTask && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '6px 10px',
              marginBottom: '10px',
              fontSize: '12px',
              color: '#475569',
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px'
            }}>
              <span style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>🎯 Assigned Focus:</span>
              <span>{agent.assignedTask}</span>
            </div>
          )}
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

// --- PART 2: LIVE STATS PANEL ---
function LiveStatsPanel({ isOpen, onClose, elapsedMs, currentRound, roundStatus, agentStats, nodes, isRunning, totalTimeMs }) {
  const rolesList = ['Analyst', "Devil's Advocate", 'Creative Thinker', 'Ethics Checker'];

  return (
    <div style={{
      position: 'fixed',
      top: '52px',
      right: isOpen ? '0' : '-360px',
      width: '350px',
      height: 'calc(100vh - 52px)',
      background: '#ffffff',
      borderLeft: '1px solid #e9e9e7',
      boxShadow: isOpen ? '-4px 0 20px rgba(0,0,0,0.05)' : 'none',
      transition: 'right 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 90,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      padding: '20px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📊</span>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#37352f' }}>Live Debate Telemetry</h2>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: '18px', color: '#9b9a97', cursor: 'pointer' }}
        >×</button>
      </div>

      {/* SECTION 1: DEBATE TIMER */}
      <div style={{
        background: '#f7f7f5', border: '1px solid #e9e9e7', borderRadius: '8px',
        padding: '16px', marginBottom: '16px', textAlign: 'center'
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
          Debate Timer
        </div>
        <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'monospace', color: '#37352f' }}>
          {formatDuration(isRunning ? elapsedMs : (totalTimeMs || elapsedMs))}
        </div>
        <div style={{ fontSize: '12px', color: isRunning ? '#0d7f5f' : '#37352f', marginTop: '4px', fontWeight: 500 }}>
          {isRunning ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0d7f5f', animation: 'pulse 1s infinite' }} />
              Live Debate Active
            </span>
          ) : (
            totalTimeMs ? `Debate complete (${formatDuration(totalTimeMs)})` : 'Ready to start'
          )}
        </div>
      </div>

      {/* SECTION 2: ROUND PROGRESS */}
      <div style={{ background: '#ffffff', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#37352f' }}>Round Progress</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#2383e2' }}>Round {currentRound} / 4</span>
        </div>
        <div style={{ height: '6px', background: '#f1f1ef', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (currentRound / 4) * 100)}%`,
            background: '#2383e2',
            transition: 'width 0.4s ease'
          }} />
        </div>
        <div style={{ fontSize: '12px', color: '#9b9a97' }}>
          Status: <strong style={{ color: '#37352f', fontWeight: 600 }}>{roundStatus}</strong>
        </div>
      </div>

      {/* SECTION 3: AGENT RESPONSE TIMES */}
      <div style={{ background: '#ffffff', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Agent Telemetry
        </div>
        {rolesList.map(role => {
          const cfg = AGENTS[role] || { emoji: '○', color: '#37352f', bg: '#f1f1ef' };
          const stats = agentStats[role] || {};
          const nodeObj = nodes.find(n => n.role === role);
          const modelName = nodeObj ? (nodeObj.model === 'custom' ? nodeObj.customModel : nodeObj.model) : (role === 'Creative Thinker' || role === 'Ethics Checker' ? 'qwen3:8b' : 'qwen3:14b');

          return (
            <div key={role} style={{
              padding: '8px 0', borderBottom: '1px solid #f1f1ef',
              display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                    {cfg.emoji}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#37352f' }}>{role}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontFamily: 'monospace', color: stats.responseTimeMs ? '#37352f' : '#9b9a97' }}>
                    {stats.responseTimeMs ? `${(stats.responseTimeMs / 1000).toFixed(1)}s` : '--'}
                  </span>
                  <span style={{
                    fontSize: '12px', fontWeight: 600,
                    color: stats.score !== undefined && stats.score !== null ? (stats.passed ? '#0d7f5f' : '#d44c47') : '#9b9a97'
                  }}>
                    {stats.score !== undefined && stats.score !== null ? `${stats.score}` : '--'}
                  </span>
                  <span style={{ fontSize: '13px' }}>
                    {stats.passed === true ? <span style={{ color: '#0d7f5f' }}>✓</span> : stats.passed === false ? <span style={{ color: '#d44c47' }}>✗</span> : <span style={{ color: '#c7c6c3' }}>-</span>}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '10px', color: '#9b9a97', paddingLeft: '30px' }}>
                {modelName}
              </div>
            </div>
          );
        })}
      </div>

      {/* SECTION 4: NODE LATENCY */}
      <div style={{ background: '#ffffff', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Node Latency
        </div>
        {nodes.map(n => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f7f7f5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: n.status === 'connected' ? '#0d7f5f' : '#d44c47',
                display: 'inline-block'
              }} />
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#37352f' }}>{n.ip}</span>
              <span style={{ fontSize: '11px', color: '#9b9a97' }}>({n.role})</span>
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: n.responseTime ? '#0d7f5f' : '#9b9a97' }}>
              {n.responseTime ? `${n.responseTime}ms` : '--'}
            </span>
          </div>
        ))}
      </div>

      {/* SECTION 5: CONSENSUS STATUS */}
      <div style={{ background: '#ffffff', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Consensus Scores
          </div>
          <span style={{ fontSize: '10px', color: '#9b9a97' }}>Target: 6.5</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
          {rolesList.map(role => {
            const stats = agentStats[role] || {};
            const score = stats.score || 0;
            const pass = score >= 6.5;

            return (
              <div key={role}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                  <span style={{ color: '#37352f', fontWeight: 500 }}>{role}</span>
                  <span style={{ color: pass ? '#0d7f5f' : (score > 0 ? '#d44c47' : '#9b9a97'), fontWeight: 600 }}>
                    {score > 0 ? `${score}/10` : '--'}
                  </span>
                </div>
                <div style={{ height: '6px', background: '#f1f1ef', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(score / 10) * 100}%`,
                    background: pass ? '#0d7f5f' : '#d44c47',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- PART 2.5: LEFT MISSION CONTROL DECK ---
function LeftMissionDeck({
  isOpen,
  onClose,
  currentRound,
  roundStatus,
  isRunning,
  finalAnswer,
  taskAssignments,
  nodes,
  agentStats,
  isWideScreen
}) {
  // Pipeline Stages
  const stages = [
    { id: 1, label: 'Work Breakdown', desc: 'Lead orchestrator assigns tasks', active: isRunning && taskAssignments.length === 0, done: taskAssignments.length > 0 },
    { id: 2, label: 'Round 1: Opinions', desc: 'Parallel independent research', active: isRunning && currentRound === 1 && !roundStatus.includes('Scoring'), done: currentRound > 1 || finalAnswer !== null },
    { id: 3, label: 'Peer Review', desc: 'Cross-agent score evaluation', active: isRunning && roundStatus.includes('Scoring'), done: currentRound > 1 || finalAnswer !== null },
    { id: 4, label: 'Round 2: Revision', desc: 'Flagged agents revise arguments', active: isRunning && currentRound >= 2 && !roundStatus.includes('Moderator'), done: finalAnswer !== null },
    { id: 5, label: 'Synthesis', desc: 'Moderator unifies consensus', active: isRunning && roundStatus.includes('Moderator'), done: finalAnswer !== null },
    { id: 6, label: 'Interactive Q&A', desc: 'Council follow-up discussion', active: finalAnswer !== null, done: false }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: '52px',
      left: isOpen ? '0' : '-330px',
      width: '300px',
      height: 'calc(100vh - 52px)',
      background: '#ffffff',
      borderRight: '1px solid #e9e9e7',
      boxShadow: isOpen ? '4px 0 20px rgba(0,0,0,0.03)' : 'none',
      transition: 'left 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 89,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      padding: '18px 16px',
      fontFamily: 'inherit'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '24px', height: '24px', borderRadius: '5px',
            background: '#edf2fe', color: '#1a73e8',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px'
          }}>🧭</span>
          <div>
            <h2 style={{ fontSize: '13.5px', fontWeight: 700, color: '#37352f' }}>Council Mission Deck</h2>
            <div style={{ fontSize: '10.5px', color: '#9b9a97' }}>Distributed multi-agent pipeline</div>
          </div>
        </div>
        {!isWideScreen && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '18px', color: '#9b9a97', cursor: 'pointer' }}
          >×</button>
        )}
      </div>

      {/* SECTION 1: LIVE PIPELINE STEPPER */}
      <div style={{
        background: '#fafafa', border: '1px solid #e9e9e7', borderRadius: '8px',
        padding: '12px 14px', marginBottom: '14px'
      }}>
        <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#787774', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
          Debate Pipeline Progress
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stages.map((st, i) => {
            const isCurrent = st.active;
            const isCompleted = st.done;
            return (
              <div key={st.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', position: 'relative' }}>
                {i < stages.length - 1 && (
                  <div style={{
                    position: 'absolute', left: '9px', top: '20px', bottom: '-8px', width: '2px',
                    background: isCompleted ? '#0d7f5f' : '#e9e9e7', zIndex: 1
                  }} />
                )}
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: isCompleted ? '#0d7f5f' : (isCurrent ? '#2383e2' : '#ffffff'),
                  color: isCompleted || isCurrent ? '#ffffff' : '#9b9a97',
                  border: isCompleted ? 'none' : (isCurrent ? '2px solid #2383e2' : '2px solid #dcdcd9'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9.5px', fontWeight: 700, flexShrink: 0, zIndex: 2,
                  boxShadow: isCurrent ? '0 0 0 3px rgba(35, 131, 226, 0.2)' : 'none',
                  animation: isCurrent ? 'pulse 1.4s infinite' : 'none'
                }}>
                  {isCompleted ? '✓' : st.id}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '11.5px', fontWeight: isCurrent ? 600 : 500,
                    color: isCurrent ? '#2383e2' : (isCompleted ? '#0d7f5f' : '#37352f')
                  }}>
                    {st.label}
                  </div>
                  <div style={{ fontSize: '10px', color: '#9b9a97', lineHeight: 1.25 }}>
                    {st.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: ACTIVE AGENT ROSTER */}
      <div style={{
        background: '#ffffff', border: '1px solid #e9e9e7', borderRadius: '8px',
        padding: '12px 14px', marginBottom: '14px'
      }}>
        <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#787774', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          Agent Specializations ({nodes.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {nodes.map(n => {
            const cfg = AGENTS[n.role] || { emoji: '○', color: '#37352f', bg: '#f1f1ef' };
            const stat = agentStats[n.role] || {};
            const assigned = (taskAssignments || []).find(t => t.agentName === n.role);

            return (
              <div key={n.id} style={{
                background: '#fafafa', border: '1px solid #f1f1ef', borderRadius: '6px',
                padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: '2px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '11px' }}>{cfg.emoji}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#37352f' }}>{n.role}</span>
                  </div>
                  <span style={{
                    fontSize: '9.5px', fontWeight: 500,
                    color: stat.isThinking ? '#2383e2' : (stat.score ? '#0d7f5f' : '#9b9a97')
                  }}>
                    {stat.isThinking ? 'Thinking...' : (stat.score ? `${stat.score}/10` : 'Ready')}
                  </span>
                </div>
                {assigned && (
                  <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.3, marginTop: '2px' }}>
                    🎯 {assigned.specificTask}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- PART 3: HISTORY PAGE ---
function HistoryPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedDebate, setExpandedDebate] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        axios.get(`${SERVER}/logs?page=${page}&limit=10`),
        axios.get(`${SERVER}/logs/stats`)
      ]);
      setLogs(logsRes.data.debates || []);
      setTotalPages(logsRes.data.pages || 1);
      setStats(statsRes.data || null);
    } catch (err) {
      console.error('Failed to load debate history:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleDelete = async (e, debateId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this debate log permanently?')) return;
    try {
      await axios.delete(`${SERVER}/logs/${debateId}`);
      fetchHistory();
      if (expandedDebate?.debateId === debateId) setExpandedDebate(null);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleExport = () => {
    window.open(`${SERVER}/logs/export`, '_blank');
  };

  const filteredLogs = logs.filter(l =>
    !search.trim() || l.question?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ animation: 'fadeUp 0.3s ease forwards' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#37352f', marginBottom: '4px', letterSpacing: '-0.02em' }}>
            Debate History & Research Logs
          </h1>
          <p style={{ fontSize: '14px', color: '#9b9a97' }}>
            Review past multi-agent debates, timing telemetry, peer scores, and export raw logs for research.
          </p>
        </div>

        <button
          onClick={handleExport}
          className="btn btn-secondary"
          style={{ flexShrink: 0 }}
        >
          📥 Export JSON
        </button>
      </div>

      {/* Summary Cards Top */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px', marginBottom: '2rem'
        }}>
          <div style={{ background: '#f7f7f5', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase' }}>Total Debates</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#37352f', marginTop: '4px' }}>{stats.totalDebates}</div>
          </div>
          <div style={{ background: '#f7f7f5', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase' }}>Avg Rounds</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#2383e2', marginTop: '4px' }}>{stats.avgRounds}</div>
          </div>
          <div style={{ background: '#f7f7f5', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase' }}>Consensus Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0d7f5f', marginTop: '4px' }}>{stats.consensusRate}%</div>
          </div>
          <div style={{ background: '#f7f7f5', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase' }}>Avg Total Time</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#c57f30', marginTop: '4px' }}>{formatDuration(stats.avgTotalTimeMs)}</div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          className="form-control"
          placeholder="🔍 Search past debate questions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '10px 14px', fontSize: '14px' }}
        />
      </div>

      {/* Debate List */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9b9a97', fontSize: '14px' }}>
          Loading debate logs...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={{
          background: '#f7f7f5', border: '1px border #e9e9e7', borderRadius: '8px',
          padding: '3rem 1.5rem', textAlign: 'center', color: '#9b9a97'
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📜</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#37352f' }}>No debate logs found</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>Start a new debate or try clearing your search query.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredLogs.map(debate => {
            const truncatedQ = debate.question?.length > 80 ? debate.question.slice(0, 80) + '...' : debate.question;
            const modelsUsed = Array.from(new Set((debate.nodes || []).map(n => n.model).filter(Boolean)));

            return (
              <div
                key={debate.debateId}
                onClick={() => setExpandedDebate(expandedDebate?.debateId === debate.debateId ? null : debate)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e9e9e7',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: expandedDebate?.debateId === debate.debateId ? '0 2px 10px rgba(0,0,0,0.04)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#37352f', lineHeight: 1.4 }}>
                      {truncatedQ}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#9b9a97' }}>
                        {formatRelativeTime(debate.timestamp)}
                      </span>
                      <span style={{ color: '#e9e9e7' }}>·</span>
                      <span style={{ fontSize: '12px', color: '#9b9a97', fontFamily: 'monospace' }}>
                        ⏱ {formatDuration(debate.totalTimeMs)}
                      </span>
                      <span style={{ color: '#e9e9e7' }}>·</span>
                      <span style={{ fontSize: '12px', color: '#9b9a97' }}>
                        {debate.totalRounds} round{debate.totalRounds > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {debate.consensusReached ? (
                      <span style={{
                        fontSize: '11px', fontWeight: 600,
                        color: '#0d7f5f', background: '#e8f7f2',
                        border: '1px solid #b8e8d8',
                        padding: '3px 9px', borderRadius: '12px'
                      }}>Consensus Reached</span>
                    ) : (
                      <span style={{
                        fontSize: '11px', fontWeight: 600,
                        color: '#c57f30', background: '#fdf3e3',
                        border: '1px solid #f5d9a8',
                        padding: '3px 9px', borderRadius: '12px'
                      }}>Max Rounds Hit</span>
                    )}

                    <button
                      onClick={(e) => handleDelete(e, debate.debateId)}
                      title="Delete log"
                      style={{
                        background: 'none', border: 'none',
                        fontSize: '14px', color: '#d44c47',
                        cursor: 'pointer', padding: '4px'
                      }}
                    >🗑</button>
                  </div>
                </div>

                {/* Model Tags */}
                {modelsUsed.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {modelsUsed.map((m, idx) => (
                      <span key={idx} style={{
                        fontSize: '10px', color: '#787774', background: '#f1f1ef',
                        padding: '2px 6px', borderRadius: '4px'
                      }}>{m}</span>
                    ))}
                  </div>
                )}

                {/* Expanded Details View */}
                {expandedDebate?.debateId === debate.debateId && (
                  <div style={{
                    marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f1ef',
                    animation: 'fadeUp 0.3s ease forwards'
                  }} onClick={(e) => e.stopPropagation()}>

                    {/* Full Question */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Full Question
                      </div>
                      <div style={{ fontSize: '14px', color: '#37352f', background: '#f7f7f5', padding: '10px 12px', borderRadius: '6px' }}>
                        {debate.question}
                      </div>
                    </div>

                    {/* Metadata & Telemetry Breakdown */}
                    {debate.metadata && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '10px', marginBottom: '16px', background: '#f7f7f5', padding: '12px', borderRadius: '6px'
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', color: '#9b9a97' }}>Avg Agent Response</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#37352f' }}>
                            {debate.metadata.avgResponseTimeMs ? `${(debate.metadata.avgResponseTimeMs / 1000).toFixed(1)}s` : '--'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#9b9a97' }}>Fastest Agent</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0d7f5f' }}>
                            {debate.metadata.fastestAgent || '--'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#9b9a97' }}>Slowest Agent</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#d44c47' }}>
                            {debate.metadata.slowestAgent || '--'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#9b9a97' }}>Score Range</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#2383e2' }}>
                            {debate.metadata.lowestScore || 0} - {debate.metadata.highestScore || 0} / 10
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#9b9a97' }}>Est. Total Tokens</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#c57f30' }}>
                            ~{debate.metadata.totalTokensEstimate || 0}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Score Progression CSS Bar Chart */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b9a97', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Score Progression Across Rounds
                      </div>
                      {(debate.rounds || []).map(r => (
                        <div key={r.roundNumber} style={{ marginBottom: '8px' }}>
                          <div style={{ fontSize: '11px', color: '#9b9a97', marginBottom: '4px' }}>
                            Round {r.roundNumber} ({formatDuration(r.roundTimeMs)})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {(r.agents || []).map(a => {
                              const score = a.scores?.average || 0;
                              const cfg = AGENTS[a.agentName] || { color: '#9b9a97' };
                              return (
                                <div key={a.agentName} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '11px', width: '110px', flexShrink: 0, color: '#37352f' }}>
                                    {a.agentName}
                                  </span>
                                  <div style={{ flex: 1, height: '8px', background: '#f1f1ef', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${(score / 10) * 100}%`,
                                      background: a.passed ? '#0d7f5f' : '#d44c47',
                                      borderRadius: '4px'
                                    }} />
                                  </div>
                                  <span style={{ fontSize: '11px', width: '35px', textAlign: 'right', fontWeight: 600, color: cfg.color }}>
                                    {score}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Final Answer */}
                    {debate.finalAnswer && (
                      <div style={{ background: '#fdf9f0', border: '1px solid #f5d9a8', borderRadius: '8px', padding: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#c57f30', marginBottom: '8px' }}>
                          ◎ Moderator Final Synthesis
                        </div>
                        <div className="md">
                          <ReactMarkdown>{debate.finalAnswer.response}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '2rem' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: '13px', color: '#9b9a97' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Navigation State: 'debate' | 'nodes' | 'history'
  const [activePage, setActivePage] = useState('debate');
  const [nodeCount, setNodeCount] = useState(() => {
    const saved = localStorage.getItem('council_node_count');
    return saved ? Math.min(8, Math.max(2, parseInt(saved, 10))) : 4;
  });
  const [nodes, setNodes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [saveNotification, setSaveNotification] = useState('');

  // Debate State
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
  const chatBottomRef = useRef(null);

  // Dynamic Task Assignment & Post-Debate Chat State
  const [taskAssignments, setTaskAssignments] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatTargetAgent, setChatTargetAgent] = useState('moderator');

  // Trial Features: Council Broadcast (Voice Mode) & God Mode (Live Crisis)
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isCrisisModalOpen, setIsCrisisModalOpen] = useState(false);
  const [crisisInput, setCrisisInput] = useState('');
  const [activeCrisisTwist, setActiveCrisisTwist] = useState(null);
  const [isInjectingCrisis, setIsInjectingCrisis] = useState(false);
  const councilAudio = useCouncilAudio();

  const buildDebateSpeechQueue = () => {
    const queue = [];
    if (round1 && round1.length > 0) {
      round1.forEach(a => {
        queue.push({ role: a.agentName, text: a.response });
      });
    }
    if (round2 && round2.length > 0) {
      round2.filter(a => a.revised).forEach(a => {
        queue.push({ role: a.agentName, text: `Revised position: ${a.response}` });
      });
    }
    if (finalAnswer && finalAnswer.response) {
      queue.push({ role: 'Moderator', text: finalAnswer.response });
    }
    return queue;
  };

  // Live Telemetry Panel State
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalTimeMs, setTotalTimeMs] = useState(null);
  const [currentRoundNumber, setCurrentRoundNumber] = useState(1);
  const [roundStatus, setRoundStatus] = useState('Ready');
  const [agentLiveStats, setAgentLiveStats] = useState({});

  // Left Mission Deck State
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [isLeftDeckOpen, setIsLeftDeckOpen] = useState(true);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load saved nodes configuration on startup
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await axios.get(`${SERVER}/config/nodes`);
        if (res.data && Array.isArray(res.data.nodes) && res.data.nodes.length >= 2) {
          const loadedNodes = res.data.nodes.map((n, i) => ({
            ...createDefaultNode(i),
            ...n,
            status: n.status || 'untested'
          }));
          setNodes(loadedNodes);
          setNodeCount(loadedNodes.length);
          localStorage.setItem('council_node_count', loadedNodes.length);
        } else {
          const initial = Array.from({ length: nodeCount }, (_, i) => createDefaultNode(i));
          setNodes(initial);
        }
      } catch (err) {
        console.warn('Could not load saved config, using defaults:', err.message);
        const initial = Array.from({ length: nodeCount }, (_, i) => createDefaultNode(i));
        setNodes(initial);
      }
    };
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll live status of nodes
  const refreshNodeStatuses = async () => {
    try {
      const res = await axios.get(`${SERVER}/config/status`);
      if (res.data && Array.isArray(res.data.nodes)) {
        setNodes(prevNodes => {
          return prevNodes.map(node => {
            const match = res.data.nodes.find(n => n.ip === node.ip && n.port === node.port);
            if (match) {
              return { ...node, status: match.status, responseTime: match.responseTime ?? node.responseTime };
            }
            return node;
          });
        });
      }
    } catch (err) {
      console.warn('Status check failed:', err.message);
    }
  };

  useEffect(() => {
    refreshNodeStatuses();
    const interval = setInterval(refreshNodeStatuses, 15000);
    return () => clearInterval(interval);
  }, []);

  // Socket connection & Telemetry Listeners
  useEffect(() => {
    const socket = io(SERVER);
    socketRef.current = socket;

    socket.on('connect', () => setSocketId(socket.id));

    socket.on('debate:status', ({ message }) => {
      setStatuses(p => [...p, message]);
      if (message.includes('thinking')) setRoundStatus('Agents thinking...');
      else if (message.includes('Scoring')) setRoundStatus('Scoring...');
      else if (message.includes('revising')) setRoundStatus('Revising...');
      else if (message.includes('Moderator')) setRoundStatus('Moderator synthesizing...');
    });

    socket.on('debate:roundStart', ({ roundNumber }) => {
      setCurrentRoundNumber(roundNumber);
      setRoundStatus(`Round ${roundNumber} started`);
    });

    socket.on('debate:agentStart', ({ agentName }) => {
      setAgentLiveStats(prev => ({
        ...prev,
        [agentName]: { ...(prev[agentName] || {}), isThinking: true }
      }));
    });

    socket.on('debate:agentComplete', ({ agentName, responseTimeMs }) => {
      setAgentLiveStats(prev => ({
        ...prev,
        [agentName]: { ...(prev[agentName] || {}), responseTimeMs, isThinking: false }
      }));
    });

    socket.on('debate:scoreUpdate', ({ agentName, score, passed }) => {
      setAgentLiveStats(prev => ({
        ...prev,
        [agentName]: { ...(prev[agentName] || {}), score, passed }
      }));
    });

    socket.on('debate:timerTick', ({ elapsedMs }) => {
      setElapsedMs(elapsedMs);
    });

    socket.on('debate:taskAssignments', ({ assignments }) => {
      if (Array.isArray(assignments)) setTaskAssignments(assignments);
    });

    socket.on('debate:round1Complete', ({ responses }) => setRound1(responses));
    socket.on('debate:scores', ({ scores }) => setScores1(scores));
    socket.on('debate:round2Complete', ({ responses, crisisTwist }) => {
      setRound2(responses);
      if (crisisTwist) setActiveCrisisTwist(crisisTwist);
    });
    socket.on('debate:scores2', ({ scores }) => setScores2(scores));

    socket.on('debate:crisisInjected', ({ twist }) => {
      setActiveCrisisTwist(twist);
      setStatuses(p => [...p, `🚨 Emergency Directive Injected: "${twist}"`]);
    });

    socket.on('debate:final', (data) => {
      setFinalAnswer(data.finalAnswer);
      if (data.taskAssignments && Array.isArray(data.taskAssignments)) {
        setTaskAssignments(data.taskAssignments);
      }
      if (data.crisisTwist) {
        setActiveCrisisTwist(data.crisisTwist);
      }
      setIsRunning(false);
      setRoundStatus('Complete');
      setTotalTimeMs(data.metadata?.totalTimeMs || elapsedMs);
      setStatuses(p => [...p, 'Debate complete.']);
    });

    socket.on('debate:error', ({ error }) => {
      setStatuses(p => [...p, `Error: ${error}`]);
      setIsRunning(false);
      setRoundStatus('Error');
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [round1, round2, finalAnswer, statuses]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatSending]);

  // Node editing handlers
  const handleNodeCountChange = (newCount) => {
    if (newCount < 2 || newCount > 8) return;
    setNodeCount(newCount);
    localStorage.setItem('council_node_count', newCount.toString());

    setNodes(prev => {
      if (newCount > prev.length) {
        const added = Array.from({ length: newCount - prev.length }, (_, i) =>
          createDefaultNode(prev.length + i)
        );
        return [...prev, ...added];
      } else {
        return prev.slice(0, newCount);
      }
    });
  };

  const updateNodeField = (index, field, value) => {
    setNodes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const markOrchestrator = (targetIndex) => {
    setNodes(prev => prev.map((node, idx) => ({
      ...node,
      isOrchestrator: idx === targetIndex
    })));
  };

  const testSingleNode = async (index) => {
    const node = nodes[index];
    const actualModel = node.model === 'custom' ? node.customModel : node.model;
    updateNodeField(index, 'status', 'testing');

    try {
      const res = await axios.post(`${SERVER}/config/test`, {
        ip: node.ip,
        port: node.port || '11434',
        model: actualModel || 'qwen3:14b'
      });

      if (res.data.status === 'connected') {
        setNodes(prev => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            status: 'connected',
            responseTime: res.data.responseTime
          };
          return updated;
        });
      } else {
        setNodes(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], status: 'offline', responseTime: null };
          return updated;
        });
      }
    } catch (err) {
      setNodes(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'offline', responseTime: null };
        return updated;
      });
    }
  };

  const testAllNodes = async () => {
    setIsTestingAll(true);
    await Promise.all(nodes.map((_, i) => testSingleNode(i)));
    setIsTestingAll(false);
  };

  const saveConfiguration = async () => {
    setIsSaving(true);
    setSaveNotification('');
    try {
      await axios.post(`${SERVER}/config/nodes`, { nodes });
      setSaveNotification('Configuration saved successfully!');
      setTimeout(() => setSaveNotification(''), 3000);
    } catch (err) {
      setSaveNotification(`Error saving config: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const [bottomMode, setBottomMode] = useState('chat');
  const [newTopicInput, setNewTopicInput] = useState('');

  const startDebateWithQuestion = async (customQ) => {
    const qToRun = (customQ || question).trim();
    if (!qToRun || isRunning) return;
    setQuestion(qToRun);
    setRound1([]); setRound2([]); setScores1([]); setScores2([]);
    setFinalAnswer(null); setStatuses([]); setElapsedMs(0); setTotalTimeMs(null);
    setAgentLiveStats({});
    setTaskAssignments([]);
    setChatMessages([]);
    setChatInput('');
    setNewTopicInput('');
    setActiveCrisisTwist(null);
    setCrisisInput('');
    councilAudio.stop();
    setIsRunning(true);
    setIsPanelOpen(true); // Automatically slide in live stats panel on debate start
    setCurrentRoundNumber(1);
    setRoundStatus('Starting...');
    try {
      await axios.post(`${SERVER}/debate`, { question: qToRun, socketId });
    } catch (err) {
      console.error('Failed to start debate:', err);
      setStatuses(p => [...p, `Connection Error: Cannot reach backend server at ${SERVER}. Make sure node server.js is running.`]);
      setIsRunning(false);
      setRoundStatus('Connection Failed');
    }
  };

  const startDebate = () => startDebateWithQuestion(question);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatSending) return;
    const userMsg = { role: 'user', content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatSending(true);

    try {
      const debateTranscript = round1.map(r => `[${r.agentName}]: ${r.response}`).join('\n\n');
      const res = await axios.post(`${SERVER}/debate/chat`, {
        question,
        finalAnswer: finalAnswer?.response || '',
        transcript: debateTranscript,
        messages: updatedMessages,
        targetAgent: chatTargetAgent
      });

      if (res.data && res.data.reply) {
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', sender: res.data.roleName || 'Council', content: res.data.reply }
        ]);
      }
    } catch (err) {
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', sender: 'System', content: `⚠️ Error communicating with AI: ${err.message}` }
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const getScore = (name, scores) => scores.find(s => s.agentName === name)?.averageScore ?? null;
  const hasRevisions = round2.some(r => r.revised);
  const connectedCount = nodes.filter(n => n.status === 'connected').length;
  const totalNodesCount = nodes.length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #ffffff; color: #37352f; font-family: 'Inter', -apple-system, sans-serif; min-height: 100vh; overflow-x: hidden; }
        textarea, input, select { outline: none; font-family: inherit; }
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
        
        .node-card {
          background: #ffffff;
          border: 1px solid #e9e9e7;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          transition: all 0.2s ease;
        }
        .node-card:hover {
          border-color: #d0d0ce;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .input-label {
          font-size: 11px;
          font-weight: 600;
          color: #9b9a97;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 4px;
          display: block;
        }
        .form-control {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #e9e9e7;
          border-radius: 6px;
          font-size: 13px;
          color: #37352f;
          background: #fafaf9;
          transition: border-color 0.15s ease;
        }
        .form-control:focus {
          border-color: #2383e2;
          background: #ffffff;
        }
        .btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .btn-primary {
          background: #37352f;
          color: #ffffff;
        }
        .btn-primary:hover:not(:disabled) {
          background: #201f1c;
        }
        .btn-secondary {
          background: #ffffff;
          color: #37352f;
          border-color: #e9e9e7;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #f7f7f5;
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      {/* Topbar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '52px', background: '#ffffffee',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e9e9e7',
        display: 'flex', alignItems: 'center',
        padding: '0 1.5rem', gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setActivePage('debate')}>
          <span style={{ fontSize: '18px' }}>◎</span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#37352f', letterSpacing: '-0.01em' }}>COUNCIL</span>
        </div>
        
        <span style={{ color: '#e9e9e7' }}>·</span>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setActivePage('debate')}
            style={{
              background: activePage === 'debate' ? '#f1f1ef' : 'transparent',
              border: 'none', borderRadius: '6px',
              padding: '5px 10px', fontSize: '13px', fontWeight: activePage === 'debate' ? 600 : 500,
              color: activePage === 'debate' ? '#37352f' : '#9b9a97',
              cursor: 'pointer'
            }}
          >
            Multi-Agent Debate
          </button>

          <button
            onClick={() => setActivePage('nodes')}
            style={{
              background: activePage === 'nodes' ? '#f1f1ef' : 'transparent',
              border: 'none', borderRadius: '6px',
              padding: '5px 10px', fontSize: '13px', fontWeight: activePage === 'nodes' ? 600 : 500,
              color: activePage === 'nodes' ? '#37352f' : '#9b9a97',
              cursor: 'pointer'
            }}
          >
            Node Manager
          </button>

          <button
            onClick={() => setActivePage('history')}
            style={{
              background: activePage === 'history' ? '#f1f1ef' : 'transparent',
              border: 'none', borderRadius: '6px',
              padding: '5px 10px', fontSize: '13px', fontWeight: activePage === 'history' ? 600 : 500,
              color: activePage === 'history' ? '#37352f' : '#9b9a97',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
            }}
          >
            🕒 History
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Connected Nodes Indicator */}
          <button
            onClick={() => setActivePage('nodes')}
            title="Manage nodes configuration"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '20px',
              background: connectedCount >= 2 ? '#e8f7f2' : '#fce8e8',
              border: `1px solid ${connectedCount >= 2 ? '#b8e8d8' : '#f5b8b8'}`,
              fontSize: '12px', fontWeight: 600,
              color: connectedCount >= 2 ? '#0d7f5f' : '#d44c47',
              cursor: 'pointer'
            }}
          >
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: connectedCount >= 2 ? '#0d7f5f' : '#d44c47',
              display: 'inline-block',
              animation: connectedCount >= 2 ? 'pulse 1.4s infinite' : 'none'
            }} />
            {connectedCount}/{totalNodesCount} nodes online
          </button>

          {/* Voice Broadcast Toggle */}
          {activePage === 'debate' && (
            <button
              onClick={() => {
                if (isVoiceMode) {
                  councilAudio.stop();
                  setIsVoiceMode(false);
                } else {
                  setIsVoiceMode(true);
                  const speechItems = buildDebateSpeechQueue();
                  if (speechItems.length > 0) {
                    councilAudio.playQueue(speechItems);
                  }
                }
              }}
              className="btn btn-secondary"
              style={{
                padding: '5px 10px', fontSize: '12px',
                background: isVoiceMode ? '#eff6ff' : '#ffffff',
                color: isVoiceMode ? '#2563eb' : '#37352f',
                border: isVoiceMode ? '1px solid #bfdbfe' : '1px solid #e9e9e7',
                fontWeight: isVoiceMode ? 600 : 500,
                display: 'inline-flex', alignItems: 'center', gap: '5px'
              }}
              title="Toggle Council Audio Voice Broadcast"
            >
              <span>{councilAudio.isPlaying && !councilAudio.isPaused ? '🔊' : '🎙️'}</span>
              <span>{isVoiceMode ? (councilAudio.isPlaying ? 'Broadcasting...' : 'Voice: On') : 'Voice Broadcast'}</span>
            </button>
          )}

          {/* God Mode Trigger */}
          {activePage === 'debate' && (
            <button
              onClick={() => setIsCrisisModalOpen(true)}
              className="btn btn-secondary"
              style={{
                padding: '5px 10px', fontSize: '12px',
                background: activeCrisisTwist ? '#fef2f2' : '#fffbeb',
                color: activeCrisisTwist ? '#dc2626' : '#d97706',
                border: activeCrisisTwist ? '1.5px solid #fca5a5' : '1px solid #fde68a',
                fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '5px'
              }}
              title="Inject sudden crisis constraint into active debate"
            >
              <span style={{ animation: activeCrisisTwist ? 'pulse 1s infinite' : 'none' }}>⚡</span>
              <span>{activeCrisisTwist ? 'Crisis Active' : 'God Mode'}</span>
            </button>
          )}

          {/* Left Mission Deck Toggle */}
          {activePage === 'debate' && (
            <button
              onClick={() => setIsLeftDeckOpen(o => !o)}
              className="btn btn-secondary"
              style={{
                padding: '5px 10px', fontSize: '12px',
                background: isLeftDeckOpen ? '#f1f1ef' : '#ffffff'
              }}
            >
              🧭 Mission Deck
            </button>
          )}

          {/* Live Telemetry Panel Toggle */}
          {activePage === 'debate' && (
            <button
              onClick={() => setIsPanelOpen(o => !o)}
              className="btn btn-secondary"
              style={{
                padding: '5px 10px', fontSize: '12px',
                background: isPanelOpen ? '#f1f1ef' : '#ffffff'
              }}
            >
              📊 Live Stats
            </button>
          )}
        </div>
      </div>

      {/* Slide-in / Docked Left Mission Deck */}
      <LeftMissionDeck
        isOpen={isLeftDeckOpen && activePage === 'debate'}
        onClose={() => setIsLeftDeckOpen(false)}
        currentRound={currentRoundNumber}
        roundStatus={roundStatus}
        isRunning={isRunning}
        finalAnswer={finalAnswer}
        taskAssignments={taskAssignments}
        nodes={nodes}
        agentStats={agentLiveStats}
        isWideScreen={windowWidth >= 1200}
      />

      {/* Slide-in Live Telemetry Panel */}
      <LiveStatsPanel
        isOpen={isPanelOpen && activePage === 'debate'}
        onClose={() => setIsPanelOpen(false)}
        elapsedMs={elapsedMs}
        currentRound={currentRoundNumber}
        roundStatus={roundStatus}
        agentStats={agentLiveStats}
        nodes={nodes}
        isRunning={isRunning}
        totalTimeMs={totalTimeMs}
      />

      {/* Main Container */}
      <div style={{
        maxWidth: activePage === 'nodes' ? '820px' : (activePage === 'history' ? '920px' : '720px'),
        margin: '0 auto',
        padding: '76px 1.5rem 6rem',
        marginLeft: (isLeftDeckOpen && activePage === 'debate' && windowWidth >= 1200) ? '320px' : 'auto',
        marginRight: (isPanelOpen && activePage === 'debate') ? '370px' : 'auto',
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        
        {/* PAGE 1: NODE MANAGER */}
        {activePage === 'nodes' && (
          <div style={{ animation: 'fadeUp 0.3s ease forwards' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#37352f', marginBottom: '4px', letterSpacing: '-0.02em' }}>
                  COUNCIL — Node Manager
                </h1>
                <p style={{ fontSize: '14px', color: '#9b9a97', lineHeight: 1.5 }}>
                  Configure laptops running Ollama across your network to participate in the multi-agent debate.
                </p>
              </div>

              <button
                onClick={() => setActivePage('debate')}
                className="btn btn-secondary"
                style={{ flexShrink: 0 }}
              >
                ← Back to Debate
              </button>
            </div>

            {/* Node Count Selector */}
            <div style={{
              background: '#f7f7f5', border: '1px solid #e9e9e7',
              borderRadius: '8px', padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '2rem'
            }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#37352f' }}>
                  How many nodes?
                </div>
                <div style={{ fontSize: '12px', color: '#9b9a97', marginTop: '2px' }}>
                  Choose between 2 and 8 laptops for the debate system
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => handleNodeCountChange(nodeCount - 1)}
                  disabled={nodeCount <= 2}
                  style={{
                    width: '32px', height: '32px', borderRadius: '6px',
                    border: '1px solid #e9e9e7', background: '#fff',
                    fontSize: '16px', fontWeight: 600, color: '#37352f',
                    cursor: nodeCount <= 2 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: nodeCount <= 2 ? 0.4 : 1
                  }}
                >-</button>

                <span style={{ fontSize: '16px', fontWeight: 700, minWidth: '60px', textAlign: 'center', color: '#37352f' }}>
                  {nodeCount} Nodes
                </span>

                <button
                  onClick={() => handleNodeCountChange(nodeCount + 1)}
                  disabled={nodeCount >= 8}
                  style={{
                    width: '32px', height: '32px', borderRadius: '6px',
                    border: '1px solid #e9e9e7', background: '#fff',
                    fontSize: '16px', fontWeight: 600, color: '#37352f',
                    cursor: nodeCount >= 8 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: nodeCount >= 8 ? 0.4 : 1
                  }}
                >+</button>
              </div>
            </div>

            {/* Node Cards List */}
            {nodes.map((node, index) => {
              const roleCfg = AGENTS[node.role] || { emoji: '○', color: '#37352f', bg: '#f1f1ef' };
              const roleColor = roleCfg.color;

              return (
                <div
                  key={node.id || index}
                  className="node-card"
                  style={{ borderLeft: `5px solid ${roleColor}` }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: roleCfg.bg, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '14px'
                      }}>
                        {roleCfg.emoji}
                      </div>

                      <div>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#37352f' }}>
                          Node {index + 1}
                        </span>
                        {node.isOrchestrator && (
                          <span style={{
                            marginLeft: '8px', fontSize: '11px', fontWeight: 600,
                            color: '#2383e2', background: '#e8f0fc',
                            padding: '2px 7px', borderRadius: '4px', border: '1px solid #c8dcf8'
                          }}>
                            Orchestrator + Agent
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Pill & Ping */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500 }}>
                        {node.status === 'testing' && (
                          <span style={{ color: '#2383e2', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2383e2', animation: 'pulse 1s infinite' }} />
                            Testing...
                          </span>
                        )}
                        {node.status === 'connected' && (
                          <span style={{ color: '#0d7f5f', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0d7f5f', animation: 'pulse 1.4s infinite' }} />
                            Connected {node.responseTime ? `(${node.responseTime}ms)` : ''}
                          </span>
                        )}
                        {node.status === 'offline' && (
                          <span style={{ color: '#d44c47', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d44c47' }} />
                            Offline
                          </span>
                        )}
                        {node.status === 'untested' && (
                          <span style={{ color: '#9b9a97', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9b9a97' }} />
                            Untested
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => testSingleNode(index)}
                        disabled={node.status === 'testing'}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Test
                      </button>
                    </div>
                  </div>

                  {/* Card Form Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    {/* IP Address */}
                    <div>
                      <label className="input-label">IP Address</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="192.168.1.__"
                        value={node.ip}
                        onChange={e => updateNodeField(index, 'ip', e.target.value)}
                      />
                    </div>

                    {/* Port */}
                    <div>
                      <label className="input-label">Port</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="11434"
                        value={node.port}
                        onChange={e => updateNodeField(index, 'port', e.target.value)}
                      />
                    </div>

                    {/* Agent Role */}
                    <div>
                      <label className="input-label">Agent Role</label>
                      <select
                        className="form-control"
                        value={node.role}
                        onChange={e => updateNodeField(index, 'role', e.target.value)}
                      >
                        {DEFAULT_ROLES.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    {/* Model */}
                    <div>
                      <label className="input-label">Model Name</label>
                      <select
                        className="form-control"
                        value={node.model}
                        onChange={e => updateNodeField(index, 'model', e.target.value)}
                      >
                        {DEFAULT_MODELS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Custom Model Input if custom is selected */}
                  {node.model === 'custom' && (
                    <div style={{ marginBottom: '12px' }}>
                      <label className="input-label">Custom Model Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. mistral:7b-instruct"
                        value={node.customModel}
                        onChange={e => updateNodeField(index, 'customModel', e.target.value)}
                      />
                    </div>
                  )}

                  {/* Note Field & Orchestrator Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <label className="input-label">Note (Optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Shashank's Victus laptop"
                        value={node.note}
                        onChange={e => updateNodeField(index, 'note', e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '16px' }}>
                      <input
                        type="radio"
                        id={`orchestrator-${index}`}
                        name="orchestratorNode"
                        checked={node.isOrchestrator}
                        onChange={() => markOrchestrator(index)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor={`orchestrator-${index}`} style={{ fontSize: '12px', color: '#37352f', cursor: 'pointer', userSelect: 'none' }}>
                        Set as Orchestrator + Agent
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Bottom Actions Bar */}
            <div style={{
              background: '#f7f7f5', border: '1px solid #e9e9e7',
              borderRadius: '8px', padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '12px', marginTop: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={testAllNodes}
                  disabled={isTestingAll}
                  className="btn btn-secondary"
                >
                  {isTestingAll ? 'Testing All...' : '⚡ Test All Connections'}
                </button>

                <button
                  onClick={saveConfiguration}
                  disabled={isSaving}
                  className="btn btn-secondary"
                >
                  {isSaving ? 'Saving...' : '💾 Save Configuration'}
                </button>

                {saveNotification && (
                  <span style={{ fontSize: '12px', color: saveNotification.includes('Error') ? '#d44c47' : '#0d7f5f', fontWeight: 500 }}>
                    {saveNotification}
                  </span>
                )}
              </div>

              <button
                onClick={() => setActivePage('debate')}
                disabled={connectedCount < 2}
                className="btn btn-primary"
                style={{
                  background: connectedCount >= 2 ? '#37352f' : '#f1f1ef',
                  color: connectedCount >= 2 ? '#ffffff' : '#9b9a97',
                  borderColor: connectedCount >= 2 ? '#37352f' : '#e9e9e7'
                }}
              >
                Go to Debate →
              </button>
            </div>
            {connectedCount < 2 && (
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#d44c47', marginTop: '6px' }}>
                At least 2 nodes must be connected to start a debate.
              </div>
            )}

          </div>
        )}

        {/* PAGE 2: EXISTING DEBATE UI */}
        {activePage === 'debate' && (
          <div style={{ animation: 'fadeUp 0.3s ease forwards' }}>
            {/* Title Header */}
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#37352f', marginBottom: '6px', letterSpacing: '-0.02em' }}>
                Multi-Agent Council
              </h1>
              <p style={{ fontSize: '14px', color: '#9b9a97', lineHeight: 1.6 }}>
                AI agents debate your question across your configured laptops, score each other on accuracy and logic, then a Moderator synthesises the final answer.
              </p>
            </div>

            {/* Agent pills — only on landing */}
            {!round1.length && !isRunning && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '2rem' }}>
                {nodes.map(n => {
                  const cfg = AGENTS[n.role] || { emoji: '○', color: '#37352f', bg: '#f1f1ef' };
                  return (
                    <div key={n.id} style={{
                      display: 'flex', alignItems: 'center', gap: '7px',
                      background: cfg.bg, border: `1px solid ${cfg.color}22`,
                      borderRadius: '6px', padding: '6px 12px'
                    }}>
                      <span style={{ fontSize: '13px' }}>{cfg.emoji}</span>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: cfg.color }}>{n.role}</span>
                      <span style={{ fontSize: '10px', color: '#9b9a97' }}>({n.ip})</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ height: '1px', background: '#e9e9e7', marginBottom: '1.5rem' }} />

            {/* TOP QUESTION AREA:
                Before/during debate: User inputs question here at the top.
                After debate completes (finalAnswer): Transitions to a pinned mission pill,
                while the active typing console moves to the bottom below Moderator Analysis! */}
            {finalAnswer ? (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e9e9e7',
                borderRadius: '8px',
                padding: '14px 18px',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                animation: 'fadeUp 0.3s ease forwards',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: '#0d7f5f', background: '#e8f7f2',
                      padding: '2px 8px', borderRadius: '4px',
                      display: 'inline-flex', alignItems: 'center', gap: '5px'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0d7f5f' }} />
                      Debate Complete · Consensus Reached
                    </span>
                    <span style={{ fontSize: '11px', color: '#9b9a97' }}>
                      (Active typing console moved below Moderator analysis for follow-ups ↓)
                    </span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#37352f', lineHeight: 1.5 }}>
                    {question}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setRound1([]); setRound2([]); setScores1([]); setScores2([]);
                    setFinalAnswer(null); setStatuses([]); setElapsedMs(0); setTotalTimeMs(null);
                    setAgentLiveStats({}); setTaskAssignments([]); setChatMessages([]);
                    setQuestion('');
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '7px 14px', flexShrink: 0 }}
                >
                  + New Debate Topic
                </button>
              </div>
            ) : (
              <div style={{
                background: '#f7f7f5', border: '1px solid #e9e9e7',
                borderRadius: '8px', marginBottom: '1.5rem', overflow: 'hidden',
                animation: 'fadeUp 0.35s ease forwards'
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
            )}

            {/* Status log */}
            <StatusRow items={statuses} isRunning={isRunning} />

            {/* Emergency Crisis Directive Banner */}
            {activeCrisisTwist && (
              <div style={{
                background: 'linear-gradient(90deg, #fff1f2 0%, #fff7ed 100%)',
                border: '1.5px solid #fca5a5',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 14px rgba(225, 29, 72, 0.1)',
                animation: 'fadeUp 0.3s ease'
              }}>
                <span style={{ fontSize: '24px' }}>🚨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#e11d48', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Crisis Protocol Active — Emergency Directive Dispatched
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#881337', marginTop: '2px' }}>
                    "{activeCrisisTwist}"
                  </div>
                  <div style={{ fontSize: '11px', color: '#9f1239', marginTop: '2px' }}>
                    Distributed nodes will pivot their positions and resolve this constraint in Round 2.
                  </div>
                </div>
                <button
                  onClick={() => setActiveCrisisTwist(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '18px',
                    color: '#9f1239',
                    cursor: 'pointer'
                  }}
                  title="Dismiss emergency banner"
                >×</button>
              </div>
            )}

            {/* Inline God Mode Trigger */}
            {(isRunning || round1.length > 0) && !finalAnswer && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <button
                  onClick={() => setIsCrisisModalOpen(true)}
                  style={{
                    background: activeCrisisTwist ? '#fef2f2' : '#fffbeb',
                    color: activeCrisisTwist ? '#b91c1c' : '#b45309',
                    border: activeCrisisTwist ? '1px solid #fecaca' : '1px solid #fde68a',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                  }}
                >
                  <span>⚡</span>
                  <span>{activeCrisisTwist ? 'Crisis Active (Modify)' : 'God Mode: Inject Crisis Twist'}</span>
                </button>
              </div>
            )}

            {/* Autonomous Task Assignment Panel */}
            {taskAssignments.length > 0 && (
              <div style={{
                background: '#fcfcfc',
                border: '1px solid #e9e9e7',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '12px',
                animation: 'fadeUp 0.35s ease forwards'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '5px',
                    background: '#edf2fe', color: '#1a73e8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px'
                  }}>⚡</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#37352f' }}>
                      Autonomous Work Allocation (Lead Orchestrator)
                    </div>
                    <div style={{ fontSize: '11px', color: '#9b9a97' }}>
                      Decomposed the user's objective and assigned specialized tasks to each agent:
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '10px'
                }}>
                  {taskAssignments.map((t, idx) => {
                    const cfg = AGENTS[t.agentName] || { emoji: '○', color: '#37352f', bg: '#f1f1ef' };
                    return (
                      <div key={idx} style={{
                        background: '#ffffff',
                        border: '1px solid #e9e9e7',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: cfg.bg,
                            color: cfg.color,
                            fontWeight: 600
                          }}>
                            {cfg.emoji} {t.agentName}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#55534e', lineHeight: '1.5' }}>
                          {t.specificTask}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Round 1 */}
            {round1.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <Divider label="Independent responses" round={1} />
                {round1.map(agent => (
                  <AgentCard
                    key={agent.agentId}
                    agent={agent}
                    score={getScore(agent.agentName, scores1)}
                    isSpeaking={councilAudio.isPlaying && councilAudio.currentRole === agent.agentName}
                    onSpeak={() => {
                      if (councilAudio.isPlaying && councilAudio.currentRole === agent.agentName) {
                        councilAudio.stop();
                      } else {
                        councilAudio.playSingle(agent.agentName, agent.response);
                      }
                    }}
                  />
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
                  <AgentCard
                    key={agent.agentId}
                    agent={agent}
                    score={getScore(agent.agentName, scores2)}
                    isSpeaking={councilAudio.isPlaying && councilAudio.currentRole === agent.agentName}
                    onSpeak={() => {
                      if (councilAudio.isPlaying && councilAudio.currentRole === agent.agentName) {
                        councilAudio.stop();
                      } else {
                        councilAudio.playSingle(agent.agentName, agent.response);
                      }
                    }}
                  />
                ))}
              </div>
            )}

            {/* Scores 2 */}
            {scores2.length > 0 && hasRevisions && (
              <ScorePanel scores={scores2} label="Peer review — Round 2" />
            )}

            {/* Final Answer */}
            {finalAnswer && (
              <div style={{
                background: '#fdf9f0',
                border: (councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') ? '1.5px solid #0284c7' : '1px solid #f5d9a8',
                borderRadius: '8px', overflow: 'hidden',
                animation: 'fadeUp 0.4s ease forwards', marginTop: '8px',
                boxShadow: (councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') ? '0 0 0 2px #38bdf8, 0 6px 18px rgba(56, 189, 248, 0.22)' : 'none',
                transition: 'all 0.25s ease'
              }}>
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid #f5d9a8',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#fdf3e3'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '30px', height: '30px', borderRadius: '6px',
                      background: '#fdf3e3', border: '1px solid #f5d9a8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px'
                    }}>◎</div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#c57f30', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Moderator — Final Synthesis</span>
                        {(councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') && (
                          <span style={{
                            fontSize: '10px', fontWeight: 700,
                            color: '#0284c7', background: '#e0f2fe',
                            border: '1px solid #bae6fd',
                            padding: '1px 6px', borderRadius: '10px'
                          }}>
                            🗣️ Speaking
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9b9a97', marginTop: '1px' }}>
                        Consensus reached · all agents reviewed
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') {
                        councilAudio.stop();
                      } else {
                        councilAudio.playSingle('Moderator', finalAnswer.response);
                      }
                    }}
                    style={{
                      background: (councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') ? '#e0f2fe' : '#ffffff',
                      border: '1px solid #f5d9a8',
                      color: (councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') ? '#0284c7' : '#c57f30',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    title="Listen to final synthesis"
                  >
                    <span>{(councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') ? '⏹' : '🔊'}</span>
                    <span>{(councilAudio.isPlaying && councilAudio.currentRole === 'Moderator') ? 'Stop' : 'Listen'}</span>
                  </button>
                </div>
                <div style={{ padding: '16px' }}>
                  <div className="md">
                    <ReactMarkdown>{finalAnswer.response}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Council Follow-Up Chat (In-Memory, Zero DB) */}
            {finalAnswer && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e9e9e7',
                borderRadius: '8px',
                overflow: 'hidden',
                marginTop: '12px',
                animation: 'fadeUp 0.4s ease forwards'
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #e9e9e7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#fafafa'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '6px',
                      background: '#e8f0fe', color: '#1a73e8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px'
                    }}>💬</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#37352f' }}>
                        Interactive Council Follow-Up
                      </div>
                      <div style={{ fontSize: '11px', color: '#9b9a97' }}>
                        Chat with the Moderator or specific agents · In-memory session
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#787774', fontWeight: 500 }}>Target:</span>
                    <select
                      value={chatTargetAgent}
                      onChange={e => setChatTargetAgent(e.target.value)}
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '5px',
                        border: '1px solid #dcdcd9',
                        background: '#ffffff',
                        color: '#37352f',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="moderator">Moderator (Final Synthesis)</option>
                      {round1.map(a => (
                        <option key={a.agentName} value={a.agentName}>{a.agentName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Message Log */}
                <div style={{
                  padding: '16px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  background: '#fcfcfc'
                }}>
                  {chatMessages.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '24px 12px',
                      color: '#9b9a97',
                      fontSize: '12.5px'
                    }}>
                      💡 Want to challenge an argument, get deeper technical details, or ask a follow-up? Ask below!
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          animation: 'fadeUp 0.2s ease forwards'
                        }}
                      >
                        <div style={{
                          fontSize: '10.5px',
                          fontWeight: 500,
                          color: '#9b9a97',
                          marginBottom: '3px',
                          paddingLeft: '4px',
                          paddingRight: '4px'
                        }}>
                          {msg.role === 'user' ? 'You' : (msg.sender || 'Council')}
                        </div>
                        <div style={{
                          maxWidth: '85%',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          lineHeight: '1.6',
                          background: msg.role === 'user' ? '#2383e2' : '#ffffff',
                          color: msg.role === 'user' ? '#ffffff' : '#37352f',
                          border: msg.role === 'user' ? 'none' : '1px solid #e9e9e7',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                          {msg.role === 'user' ? (
                            msg.content
                          ) : (
                            <div className="md" style={{ color: 'inherit' }}>
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {isChatSending && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', color: '#9b9a97', fontSize: '12px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2383e2', animation: 'pulse 1s infinite' }} />
                      Council AI is responding...
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Bottom Console Mode Selector */}
                <div style={{
                  padding: '8px 14px',
                  borderTop: '1px solid #e9e9e7',
                  borderBottom: '1px solid #f1f1ef',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f8f9fa'
                }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => setBottomMode('chat')}
                      style={{
                        padding: '4px 10px', borderRadius: '5px',
                        fontSize: '11.5px', fontWeight: bottomMode === 'chat' ? 600 : 500,
                        border: bottomMode === 'chat' ? '1px solid #2383e2' : '1px solid #e2e8f0',
                        background: bottomMode === 'chat' ? '#edf2fe' : '#ffffff',
                        color: bottomMode === 'chat' ? '#2383e2' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.15s ease'
                      }}
                    >
                      💬 Council Follow-Up Q&A
                    </button>
                    <button
                      onClick={() => setBottomMode('new_topic')}
                      style={{
                        padding: '4px 10px', borderRadius: '5px',
                        fontSize: '11.5px', fontWeight: bottomMode === 'new_topic' ? 600 : 500,
                        border: bottomMode === 'new_topic' ? '1px solid #0d7f5f' : '1px solid #e2e8f0',
                        background: bottomMode === 'new_topic' ? '#e8f7f2' : '#ffffff',
                        color: bottomMode === 'new_topic' ? '#0d7f5f' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.15s ease'
                      }}
                    >
                      ⚡ Start Brand New Topic
                    </button>
                  </div>
                  <span style={{ fontSize: '11px', color: '#9b9a97' }}>
                    {bottomMode === 'chat' ? 'Ask follow-up questions' : 'Starts fresh debate with all agents'}
                  </span>
                </div>

                {/* Input Area Based on Selected Mode */}
                {bottomMode === 'chat' ? (
                  <div style={{
                    padding: '10px 14px',
                    display: 'flex',
                    gap: '8px',
                    background: '#ffffff'
                  }}>
                    <input
                      type="text"
                      placeholder="Ask a follow-up or challenge the consensus..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      disabled={isChatSending}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #dcdcd9',
                        fontSize: '13px',
                        background: '#ffffff',
                        color: '#37352f'
                      }}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={isChatSending || !chatInput.trim()}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: chatInput.trim() && !isChatSending ? '#2383e2' : '#f1f1ef',
                        color: chatInput.trim() && !isChatSending ? '#ffffff' : '#9b9a97',
                        fontWeight: 600,
                        fontSize: '12.5px',
                        cursor: chatInput.trim() && !isChatSending ? 'pointer' : 'default',
                        transition: 'all 0.15s'
                      }}
                    >
                      {isChatSending ? '...' : 'Send'}
                    </button>
                  </div>
                ) : (
                  <div style={{
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    background: '#ffffff'
                  }}>
                    <textarea
                      placeholder="Type a new debate topic to start a full multi-agent consensus run..."
                      value={newTopicInput}
                      onChange={e => setNewTopicInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          startDebateWithQuestion(newTopicInput);
                        }
                      }}
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #dcdcd9',
                        fontSize: '13px',
                        background: '#ffffff',
                        color: '#37352f',
                        resize: 'none',
                        lineHeight: 1.5
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#9b9a97' }}>Ctrl + Enter to start</span>
                      <button
                        onClick={() => startDebateWithQuestion(newTopicInput)}
                        disabled={!newTopicInput.trim()}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          background: newTopicInput.trim() ? '#37352f' : '#f1f1ef',
                          color: newTopicInput.trim() ? '#ffffff' : '#9b9a97',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          cursor: newTopicInput.trim() ? 'pointer' : 'not-allowed',
                          transition: 'all 0.15s'
                        }}
                      >
                        Start New Debate →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}

        {/* PAGE 3: HISTORY PAGE */}
        {activePage === 'history' && <HistoryPage />}

      </div>

      {/* Floating Council Podcast Mini-Player */}
      {(isVoiceMode || councilAudio.isPlaying) && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: '40px',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 12px 35px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1)',
          animation: 'fadeUp 0.3s ease forwards',
          backdropFilter: 'blur(8px)'
        }}>
          {/* Waveform Equalizer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px' }}>
            {[8, 16, 12, 18, 10, 14].map((h, i) => (
              <span
                key={i}
                style={{
                  width: '3px',
                  height: councilAudio.isPlaying && !councilAudio.isPaused ? `${h}px` : '4px',
                  borderRadius: '2px',
                  background: '#38bdf8',
                  transition: 'height 0.2s ease',
                  animation: councilAudio.isPlaying && !councilAudio.isPaused ? `pulse 0.${6 + (i % 3)}s infinite alternate` : 'none'
                }}
              />
            ))}
          </div>

          {/* Speaker Info */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: '135px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🗣️</span>
              <span>{councilAudio.currentRole || 'Council Broadcast'}</span>
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
              {councilAudio.isPlaying
                ? (councilAudio.isPaused ? 'Paused' : `Speaking (${councilAudio.currentIndex + 1}/${councilAudio.queueLength})`)
                : (round1.length > 0 ? 'Ready to broadcast' : 'Awaiting debate responses')}
            </div>
          </div>

          {/* Audio Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Play/Pause */}
            <button
              onClick={() => {
                if (councilAudio.isPlaying) {
                  if (councilAudio.isPaused) councilAudio.resume();
                  else councilAudio.pause();
                } else {
                  const queue = buildDebateSpeechQueue();
                  if (queue.length > 0) councilAudio.playQueue(queue);
                }
              }}
              style={{
                background: '#38bdf8',
                color: '#0f172a',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700
              }}
              title={councilAudio.isPlaying && !councilAudio.isPaused ? 'Pause' : 'Play'}
            >
              {councilAudio.isPlaying && !councilAudio.isPaused ? '⏸' : '▶'}
            </button>

            {/* Skip Next */}
            {councilAudio.isPlaying && (
              <button
                onClick={councilAudio.skip}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '4px'
                }}
                title="Skip to next agent"
              >
                ⏭
              </button>
            )}

            {/* Speed Selector */}
            <button
              onClick={() => {
                const nextSpeed = councilAudio.speed === 1.0 ? 1.25 : (councilAudio.speed === 1.25 ? 1.5 : 1.0);
                councilAudio.changeSpeed(nextSpeed);
              }}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                border: 'none',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Playback speed"
            >
              {councilAudio.speed}x
            </button>

            {/* Close Button */}
            <button
              onClick={() => {
                councilAudio.stop();
                setIsVoiceMode(false);
              }}
              style={{
                background: 'transparent',
                color: '#64748b',
                border: 'none',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '2px 6px',
                marginLeft: '4px'
              }}
              title="Close Voice Broadcast"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* God Mode Emergency Crisis Dispatch Modal */}
      {isCrisisModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
            border: '1.5px solid #fed7aa',
            animation: 'fadeUp 0.25s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>⚡</span>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#9a3412', margin: 0 }}>
                    God Mode — Inject Crisis Directive
                  </h3>
                  <p style={{ fontSize: '11.5px', color: '#78716c', margin: '2px 0 0' }}>
                    Disrupt the cluster mid-debate. All 4 distributed nodes will be forced to adapt in Round 2.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCrisisModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#a8a29e', cursor: 'pointer' }}
              >×</button>
            </div>

            {/* Quick-Pick Scenarios */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Instant Crisis Presets
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  {
                    icon: '🚨',
                    title: '90% Budget Slash',
                    desc: 'Emergency funding cut by 90%. All cloud GPUs revoked. Must pivot immediately to zero-cost open-source tools.'
                  },
                  {
                    icon: '🛡️',
                    title: 'Catastrophic Zero-Day Leak',
                    desc: 'Critical zero-day exploit leaked online. Assume existing encryption and network stack is compromised.'
                  },
                  {
                    icon: '⚖️',
                    title: 'Emergency Regulatory Embargo',
                    desc: 'Government executive order bans all proprietary LLMs & cloud data transfer effective tonight.'
                  }
                ].map((preset, idx) => (
                  <div
                    key={idx}
                    onClick={() => setCrisisInput(preset.desc)}
                    style={{
                      border: crisisInput === preset.desc ? '1.5px solid #ea580c' : '1px solid #e7e5e4',
                      background: crisisInput === preset.desc ? '#fff7ed' : '#fafaf9',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#44403c' }}>
                      <span>{preset.icon}</span>
                      <span>{preset.title}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#78716c', marginTop: '2px', lineHeight: 1.3 }}>
                      {preset.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Or Write Custom Crisis Constraint
              </div>
              <textarea
                value={crisisInput}
                onChange={(e) => setCrisisInput(e.target.value)}
                placeholder="e.g. Critical power outage across regional datacenters, latency increases to 10 seconds..."
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: '6px',
                  border: '1px solid #d6d3d1',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsCrisisModalOpen(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!crisisInput.trim()) return;
                  setIsInjectingCrisis(true);
                  try {
                    const res = await axios.post(`${SERVER}/debate/twist`, { twist: crisisInput });
                    setActiveCrisisTwist(res.data.twist);
                    setIsCrisisModalOpen(false);
                  } catch (e) {
                    console.error('Failed to inject twist:', e);
                    setActiveCrisisTwist(crisisInput.trim());
                    setIsCrisisModalOpen(false);
                  } finally {
                    setIsInjectingCrisis(false);
                  }
                }}
                disabled={!crisisInput.trim() || isInjectingCrisis}
                style={{
                  background: '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: (!crisisInput.trim() || isInjectingCrisis) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)'
                }}
              >
                <span>🚨</span>
                <span>{isInjectingCrisis ? 'Dispatching...' : 'Dispatch Emergency Twist'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}