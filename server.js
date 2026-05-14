require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { runRound1, runScoring, runRound2, runModerator } = require('./src/orchestrator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

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

  res.json({ status: 'Debate started', question });

  const emit = (event, data) => {
    if (socketId) io.to(socketId).emit(event, data);
  };

  try {
    console.log('\n=== NEW DEBATE ===');
    console.log('Question:', question);

    const MAX_ROUNDS = 4;

    // Round 1
    emit('debate:status', { message: 'Round 1 — all agents thinking independently...' });
    let currentRound = await runRound1(question);
    emit('debate:round1Complete', { responses: currentRound });

    // Score Round 1
    emit('debate:status', { message: 'Scoring — agents evaluating each other...' });
    let currentScoring = await runScoring(question, currentRound);
    emit('debate:scores', { scores: currentScoring.agentAverages });

    let roundNumber = 1;
    let allPassed = currentScoring.agentAverages.every(a => a.passedThreshold);

    console.log(`Round 1 complete. All passed: ${allPassed}`);

    // Keep revising until all pass or max rounds hit
    while (!allPassed && roundNumber < MAX_ROUNDS) {
      roundNumber++;
      console.log(`\nStarting Round ${roundNumber}...`);
      emit('debate:status', { message: `Round ${roundNumber} — flagged agents revising...` });

      const revised = await runRound2(question, currentRound, currentScoring.agentAverages);
      emit('debate:round2Complete', { responses: revised });

      emit('debate:status', { message: `Scoring Round ${roundNumber}...` });
      const newScoring = await runScoring(question, revised);
      emit('debate:scores2', { scores: newScoring.agentAverages });

      currentRound = revised;
      currentScoring = newScoring;
      allPassed = newScoring.agentAverages.every(a => a.passedThreshold);

      console.log(`Round ${roundNumber} complete. All passed: ${allPassed}`);
    }

    // Moderator always runs at the end
    emit('debate:status', { message: 'Moderator synthesising final answer...' });
    const finalAnswer = await runModerator(question, currentRound);

    emit('debate:final', {
      question,
      finalAnswer,
      metadata: {
        totalRounds: roundNumber,
        allPassed,
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