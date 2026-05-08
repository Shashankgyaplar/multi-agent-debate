require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { runRound1, runScoring, runRound2, runModerator } = require('./src/orchestrator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Multi-Agent Debate Server is running!' });
});

app.post('/debate', async (req, res) => {
  const { question, socketId } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  // Send immediate response so frontend doesn't hang
  res.json({ status: 'Debate started', question });

  const emit = (event, data) => {
    if (socketId) io.to(socketId).emit(event, data);
  };

  try {
    console.log('\n=== NEW DEBATE ===');
    console.log('Question:', question);

    emit('debate:status', { message: 'Round 1 starting — all agents thinking...' });

    const round1 = await runRound1(question, emit);

    emit('debate:round1Complete', { responses: round1 });
    emit('debate:status', { message: 'Scoring round — agents evaluating each other...' });

    const scoring = await runScoring(question, round1);

    emit('debate:scores', { scores: scoring.agentAverages });
    emit('debate:status', { message: 'Round 2 — flagged agents revising...' });

    const round2 = await runRound2(question, round1, scoring.agentAverages);

    emit('debate:round2Complete', { responses: round2 });

    const scoring2 = await runScoring(question, round2);

    emit('debate:scores2', { scores: scoring2.agentAverages });
    emit('debate:status', { message: 'Moderator synthesising final answer...' });

    const finalAnswer = await runModerator(question, round2);

    emit('debate:final', {
      question,
      round1,
      scoring1: scoring.agentAverages,
      round2,
      scoring2: scoring2.agentAverages,
      finalAnswer,
      metadata: {
        totalAgents: round1.length,
        round1AllPassed: scoring.agentAverages.every(a => a.passedThreshold),
        round2AllPassed: scoring2.agentAverages.every(a => a.passedThreshold),
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('Error:', err.message);
    emit('debate:error', { error: err.message });
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