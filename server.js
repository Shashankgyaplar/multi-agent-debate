require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const {
  runRound1,
  runScoring,
  runRound2,
  runModerator,
  generateTaskAssignments,
  chatWithCouncil,
  getActiveAgentsAndModerator
} = require('./src/orchestrator');
const Debate = require('./models/Debate');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// MongoDB Connection & Health Flag
let isMongoConnected = false;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/council';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 3000
}).then(() => {
  isMongoConnected = true;
  console.log('[DATABASE] Connected to MongoDB at', MONGODB_URI);
}).catch((err) => {
  isMongoConnected = false;
  console.warn('[DATABASE] MongoDB connection failed. File fallback logging active:', err.message);
});

mongoose.connection.on('connected', () => { isMongoConnected = true; });
mongoose.connection.on('disconnected', () => { isMongoConnected = false; });
mongoose.connection.on('error', () => { isMongoConnected = false; });

// Helper: Save Debate Log gracefully
async function saveDebateLog(debateData) {
  try {
    if (isMongoConnected) {
      await Debate.create(debateData);
      console.log(`[LOGS] Debate ${debateData.debateId} saved to MongoDB.`);
      return;
    }
  } catch (mongoErr) {
    console.error(`[LOGS] MongoDB save error: ${mongoErr.message}. Using file fallback.`);
  }

  // Fallback to JSON File Logging
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    const fileName = debateData.debateId.startsWith('debate-') ? `${debateData.debateId}.json` : `debate-${debateData.debateId}.json`;
    const filePath = path.join(LOGS_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(debateData, null, 2), 'utf8');
    console.log(`[LOGS] Debate ${debateData.debateId} saved to file: ${filePath}`);
  } catch (fileErr) {
    console.error(`[LOGS] File save failed completely: ${fileErr.message}`);
  }
}

// Helper: Load all local file logs
function getLocalFileLogs() {
  try {
    if (!fs.existsSync(LOGS_DIR)) return [];
    const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
    const logs = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && parsed.debateId) {
          logs.push(parsed);
        }
      } catch {}
    }
    return logs;
  } catch (err) {
    console.error('Error reading local file logs:', err.message);
    return [];
  }
}

// Helper: Fetch all logs combined
async function getAllDebateLogsCombined() {
  let mongoLogs = [];
  if (isMongoConnected) {
    try {
      mongoLogs = await Debate.find().sort({ timestamp: -1 }).lean();
    } catch (err) {
      console.error('Error fetching MongoDB logs:', err.message);
    }
  }
  const fileLogs = getLocalFileLogs();
  
  // Deduplicate by debateId preferring MongoDB
  const map = new Map();
  fileLogs.forEach(log => map.set(log.debateId, log));
  mongoLogs.forEach(log => map.set(log.debateId, log));
  
  const combined = Array.from(map.values());
  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return combined;
}

app.get('/', (req, res) => {
  res.json({
    status: 'Multi-Agent Debate Server is running!',
    mongoConnected: isMongoConnected
  });
});

// --- API ENDPOINTS FOR LOGS ---

// GET /logs — Pagination & Search
app.get('/logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const allLogs = await getAllDebateLogsCombined();
    const total = allLogs.length;
    const pages = Math.ceil(total / limit) || 1;
    const debates = allLogs.slice(skip, skip + limit);

    res.json({ debates, total, page, pages });
  } catch (err) {
    console.error('Error GET /logs:', err.message);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// GET /logs/stats — Aggregate Statistics
app.get('/logs/stats', async (req, res) => {
  try {
    const allLogs = await getAllDebateLogsCombined();
    
    if (allLogs.length === 0) {
      return res.json({
        totalDebates: 0,
        avgRounds: 0,
        consensusRate: 0,
        avgTotalTimeMs: 0,
        mostUsedModels: [],
        avgScoresByRole: {}
      });
    }

    const totalDebates = allLogs.length;
    let sumRounds = 0;
    let consensusCount = 0;
    let sumTotalTime = 0;
    const modelCounts = {};
    const roleScores = {};

    allLogs.forEach(debate => {
      sumRounds += debate.totalRounds || 1;
      if (debate.consensusReached) consensusCount++;
      sumTotalTime += debate.totalTimeMs || 0;

      // Model usage
      if (Array.isArray(debate.nodes)) {
        debate.nodes.forEach(n => {
          if (n.model) {
            modelCounts[n.model] = (modelCounts[n.model] || 0) + 1;
          }
        });
      }

      // Agent role scores
      if (Array.isArray(debate.rounds)) {
        debate.rounds.forEach(r => {
          if (Array.isArray(r.agents)) {
            r.agents.forEach(a => {
              if (a.agentName && a.scores && typeof a.scores.average === 'number') {
                if (!roleScores[a.agentName]) roleScores[a.agentName] = [];
                roleScores[a.agentName].push(a.scores.average);
              }
            });
          }
        });
      }
    });

    const avgRounds = parseFloat((sumRounds / totalDebates).toFixed(2));
    const consensusRate = parseFloat(((consensusCount / totalDebates) * 100).toFixed(1));
    const avgTotalTimeMs = Math.round(sumTotalTime / totalDebates);

    const mostUsedModels = Object.entries(modelCounts)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count);

    const avgScoresByRole = {};
    Object.entries(roleScores).forEach(([role, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      avgScoresByRole[role] = parseFloat(avg.toFixed(2));
    });

    res.json({
      totalDebates,
      avgRounds,
      consensusRate,
      avgTotalTimeMs,
      mostUsedModels,
      avgScoresByRole
    });
  } catch (err) {
    console.error('Error GET /logs/stats:', err.message);
    res.status(500).json({ error: 'Failed to calculate stats' });
  }
});

// GET /logs/export — Downloadable JSON export
app.get('/logs/export', async (req, res) => {
  try {
    const allLogs = await getAllDebateLogsCombined();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="council-logs.json"');
    res.send(JSON.stringify(allLogs, null, 2));
  } catch (err) {
    console.error('Error GET /logs/export:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /logs/:debateId — Single Debate Detail
app.get('/logs/:debateId', async (req, res) => {
  try {
    const { debateId } = req.params;

    if (isMongoConnected) {
      const debate = await Debate.findOne({ debateId }).lean();
      if (debate) return res.json(debate);
    }

    const pathsToTry = [
      path.join(LOGS_DIR, `${debateId}.json`),
      path.join(LOGS_DIR, `debate-${debateId}.json`)
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        try {
          const fileData = JSON.parse(fs.readFileSync(p, 'utf8'));
          return res.json(fileData);
        } catch {}
      }
    }

    const allLogs = await getAllDebateLogsCombined();
    const found = allLogs.find(d => d.debateId === debateId || `debate-${d.debateId}` === debateId);
    if (found) return res.json(found);

    res.status(404).json({ error: 'Debate log not found' });
  } catch (err) {
    console.error(`Error GET /logs/${req.params.debateId}:`, err.message);
    res.status(500).json({ error: 'Failed to retrieve debate log' });
  }
});

// DELETE /logs/:debateId — Delete single debate log
app.delete('/logs/:debateId', async (req, res) => {
  try {
    const { debateId } = req.params;
    let deletedCount = 0;

    if (isMongoConnected) {
      const resMongo = await Debate.deleteOne({ debateId });
      deletedCount += resMongo.deletedCount;
    }

    const pathsToTry = [
      path.join(LOGS_DIR, `${debateId}.json`),
      path.join(LOGS_DIR, `debate-${debateId}.json`)
    ];

    pathsToTry.forEach(p => {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          deletedCount++;
        } catch {}
      }
    });

    res.json({ status: 'deleted', debateId, deletedCount });
  } catch (err) {
    console.error(`Error DELETE /logs/${req.params.debateId}:`, err.message);
    res.status(500).json({ error: 'Failed to delete debate log' });
  }
});

// --- NODE CONFIG ENDPOINTS ---

// Test single node connection
app.post('/config/test', async (req, res) => {
  const { ip, port } = req.body;
  const start = Date.now();
  try {
    await axios.get(
      `http://${ip}:${port || 11434}/api/version`,
      { timeout: 3000 }
    );
    res.json({ status: 'connected', responseTime: Date.now() - start });
  } catch (err) {
    try {
      await axios.get(
        `http://${ip}:${port || 11434}/api/tags`,
        { timeout: 3000 }
      );
      res.json({ status: 'connected', responseTime: Date.now() - start });
    } catch (err2) {
      res.json({ status: 'offline', error: err2.message });
    }
  }
});

// Save node config
app.post('/config/nodes', (req, res) => {
  const { nodes } = req.body;
  fs.writeFileSync('./config.json', JSON.stringify({ nodes }, null, 2));
  res.json({ status: 'saved' });
});

// Get node config
app.get('/config/nodes', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    res.json(config);
  } catch {
    res.json({ nodes: [] });
  }
});

// Get all nodes status
app.get('/config/status', async (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    const results = await Promise.all(
      (config.nodes || []).map(async (node) => {
        const start = Date.now();
        try {
          await axios.get(
            `http://${node.ip}:${node.port || 11434}/api/version`,
            { timeout: 2500 }
          );
          return { ...node, status: 'connected', responseTime: Date.now() - start };
        } catch {
          return { ...node, status: 'offline' };
        }
      })
    );
    res.json({ nodes: results });
  } catch {
    res.json({ nodes: [] });
  }
});

// --- DEBATE EXECUTION WITH COMPLETE LOGGING ---

// Active crisis twist for currently running debate
let activeCrisisTwist = null;

// POST /debate/twist — Inject live crisis twist into active debate
app.post('/debate/twist', (req, res) => {
  const { twist } = req.body;
  if (!twist || !twist.trim()) {
    return res.status(400).json({ error: 'Twist text is required' });
  }

  activeCrisisTwist = twist.trim();
  console.log(`\n🚨 LIVE CRISIS INJECTED: "${activeCrisisTwist}"`);

  io.emit('debate:crisisInjected', {
    twist: activeCrisisTwist,
    timestamp: Date.now()
  });

  res.json({ status: 'Crisis twist injected', twist: activeCrisisTwist });
});

app.post('/debate', async (req, res) => {
  const { question, socketId, crisisTwist } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  activeCrisisTwist = crisisTwist ? crisisTwist.trim() : null;
  res.json({ status: 'Debate started', question, crisisTwist: activeCrisisTwist });

  const emit = (event, data) => {
    if (socketId) io.to(socketId).emit(event, data);
  };

  const debateStartTime = Date.now();
  const debateId = `debate-${debateStartTime}`;

  // Start periodic timer tick (every 1 second)
  const timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - debateStartTime;
    emit('debate:timerTick', { elapsedMs });
  }, 1000);

  try {
    console.log('\n=== NEW DEBATE ===');
    console.log('Debate ID:', debateId);
    console.log('Question:', question);

    const MAX_ROUNDS = 4;
    const roundsLog = [];
    const activeInfo = getActiveAgentsAndModerator();

    // Dynamic Task Assignment / Role-Aware Contextual Briefing
    emit('debate:status', { message: 'Lead Orchestrator analyzing prompt & decomposing tasks...' });
    const taskAssignments = await generateTaskAssignments(question, emit);

    // Round 1
    emit('debate:status', { message: 'Round 1 — all agents investigating their assigned tasks in parallel...' });
    const round1Outcome = await runRound1(question, taskAssignments, emit);
    const round1Results = round1Outcome.results;
    emit('debate:round1Complete', { responses: round1Results });

    // Score Round 1
    emit('debate:status', { message: 'Scoring — agents evaluating each other...' });
    const scoring1Outcome = await runScoring(question, round1Results, 1, emit);
    emit('debate:scores', { scores: scoring1Outcome.agentAverages });

    // Build Round 1 Log
    const round1AgentsLog = round1Results.map(r => {
      const avgScoreObj = scoring1Outcome.agentAverages.find(a => a.agentName === r.agentName) || {};
      const detailed = avgScoreObj.detailedScores || {};
      return {
        agentId: r.agentId,
        agentName: r.agentName,
        model: r.model,
        nodeIp: r.nodeIp || '127.0.0.1',
        responseTimeMs: r.responseTimeMs || 0,
        wordCount: r.wordCount || 0,
        response: r.response,
        scores: {
          accuracy: detailed.accuracy || 6,
          logic: detailed.logic || 6,
          relevance: detailed.relevance || 6,
          average: avgScoreObj.averageScore || 6
        },
        passed: !!avgScoreObj.passedThreshold,
        revised: false,
        previousScore: null
      };
    });

    let roundNumber = 1;
    let allPassed = scoring1Outcome.agentAverages.every(a => a.passedThreshold);

    roundsLog.push({
      roundNumber: 1,
      agents: round1AgentsLog,
      allPassed,
      roundTimeMs: round1Outcome.roundTimeMs
    });

    let currentRoundResults = round1Results;
    let currentScoring = scoring1Outcome;

    console.log(`Round 1 complete. All passed: ${allPassed}`);

    // Iterative Rounds until consensus or MAX_ROUNDS
    while (!allPassed && roundNumber < MAX_ROUNDS) {
      roundNumber++;
      console.log(`\nStarting Round ${roundNumber}...`);
      emit('debate:status', { message: `Round ${roundNumber} — flagged agents revising...` });

      const round2Outcome = await runRound2(question, currentRoundResults, currentScoring.agentAverages, roundNumber, emit, activeCrisisTwist);
      const revisedResults = round2Outcome.results;
      emit('debate:round2Complete', { responses: revisedResults, crisisTwist: activeCrisisTwist });

      emit('debate:status', { message: `Scoring Round ${roundNumber}...` });
      const newScoring = await runScoring(question, revisedResults, roundNumber, emit);
      emit('debate:scores2', { scores: newScoring.agentAverages });

      currentRoundResults = revisedResults;
      currentScoring = newScoring;
      allPassed = newScoring.agentAverages.every(a => a.passedThreshold);

      const roundAgentsLog = revisedResults.map(r => {
        const avgScoreObj = newScoring.agentAverages.find(a => a.agentName === r.agentName) || {};
        const detailed = avgScoreObj.detailedScores || {};
        return {
          agentId: r.agentId,
          agentName: r.agentName,
          model: r.model,
          nodeIp: r.nodeIp || '127.0.0.1',
          responseTimeMs: r.responseTimeMs || 0,
          wordCount: r.wordCount || 0,
          response: r.response,
          scores: {
            accuracy: detailed.accuracy || 6,
            logic: detailed.logic || 6,
            relevance: detailed.relevance || 6,
            average: avgScoreObj.averageScore || 6
          },
          passed: !!avgScoreObj.passedThreshold,
          revised: !!r.revised,
          previousScore: r.previousScore ?? null,
          crisisTwist: r.crisisTwist || activeCrisisTwist || null
        };
      });

      roundsLog.push({
        roundNumber,
        agents: roundAgentsLog,
        allPassed,
        crisisTwist: activeCrisisTwist,
        roundTimeMs: round2Outcome.roundTimeMs
      });

      console.log(`Round ${roundNumber} complete. All passed: ${allPassed}`);
    }

    // Moderator Synthesis
    emit('debate:status', { message: 'Moderator synthesising final answer...' });
    const finalAnswerObj = await runModerator(question, currentRoundResults, emit, activeCrisisTwist);

    const totalTimeMs = Date.now() - debateStartTime;
    clearInterval(timerInterval);

    emit('debate:final', {
      question,
      taskAssignments,
      crisisTwist: activeCrisisTwist,
      finalAnswer: finalAnswerObj,
      metadata: {
        totalRounds: roundNumber,
        allPassed,
        crisisInjected: Boolean(activeCrisisTwist),
        timestamp: new Date().toISOString()
      }
    });

    // Assemble Metadata Metrics
    const allAgentResponses = [];
    const allScoresArray = [];

    roundsLog.forEach(r => {
      r.agents.forEach(a => {
        if (a.responseTimeMs > 0) {
          allAgentResponses.push({ agentName: a.agentName, time: a.responseTimeMs });
        }
        if (a.scores && typeof a.scores.average === 'number') {
          allScoresArray.push(a.scores.average);
        }
      });
    });

    const avgResponseTimeMs = allAgentResponses.length
      ? Math.round(allAgentResponses.reduce((sum, item) => sum + item.time, 0) / allAgentResponses.length)
      : 0;

    let fastestAgent = 'N/A';
    let slowestAgent = 'N/A';

    if (allAgentResponses.length > 0) {
      const sortedByTime = [...allAgentResponses].sort((a, b) => a.time - b.time);
      fastestAgent = sortedByTime[0].agentName;
      slowestAgent = sortedByTime[sortedByTime.length - 1].agentName;
    }

    const highestScore = allScoresArray.length ? Math.max(...allScoresArray) : 0;
    const lowestScore = allScoresArray.length ? Math.min(...allScoresArray) : 0;

    let totalWordsCount = finalAnswerObj.wordCount || 0;
    roundsLog.forEach(r => {
      r.agents.forEach(a => { totalWordsCount += (a.wordCount || 0); });
    });
    const totalTokensEstimate = Math.round(totalWordsCount * 1.3);

    // Save Complete Log Object
    const fullLogData = {
      debateId,
      question,
      taskAssignments,
      timestamp: new Date(debateStartTime),
      totalTimeMs,
      totalRounds: roundNumber,
      consensusReached: allPassed,
      maxRoundsHit: !allPassed && roundNumber >= MAX_ROUNDS,
      nodes: (activeInfo.allNodes || []).map(n => ({
        ip: n.ip || '127.0.0.1',
        port: n.port || '11434',
        model: n.model === 'custom' ? n.customModel : (n.model || 'qwen3:14b'),
        role: n.role || 'Agent',
        note: n.note || ''
      })),
      rounds: roundsLog,
      finalAnswer: {
        response: finalAnswerObj.response,
        responseTimeMs: finalAnswerObj.responseTimeMs || 0,
        wordCount: finalAnswerObj.wordCount || 0,
        model: finalAnswerObj.model,
        nodeIp: finalAnswerObj.nodeIp
      },
      metadata: {
        avgResponseTimeMs,
        fastestAgent,
        slowestAgent,
        highestScore,
        lowestScore,
        totalTokensEstimate
      }
    };

    // Save log asynchronously without blocking
    saveDebateLog(fullLogData).catch(e => console.error('Logging save error:', e.message));

  } catch (err) {
    clearInterval(timerInterval);
    console.error('Error during debate execution:', err.message);
    emit('debate:error', { error: err.message });
  }
});

// --- IN-MEMORY FOLLOW-UP CHAT (NO DATABASE NEEDED) ---
app.post('/debate/chat', async (req, res) => {
  try {
    const { question, finalAnswer, transcript, messages, targetAgent } = req.body;
    if (!question || !messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Question and at least one message are required.' });
    }

    const result = await chatWithCouncil({
      question,
      finalAnswer,
      transcript,
      messages,
      targetAgent
    });

    res.json(result);
  } catch (err) {
    console.error('Error in /debate/chat:', err.message);
    res.status(500).json({ error: err.message || 'Failed to process chat message' });
  }
});

io.on('connection', (socket) => {
  console.log('Frontend connected:', socket.id);
  socket.on('disconnect', () => console.log('Frontend disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\nDebate server running on http://localhost:${PORT}`);
});