require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runRound1, runScoring, runRound2, runModerator } = require('./src/orchestrator');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Multi-Agent Debate Server is running!' });
});

app.post('/debate', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    console.log('\n=== NEW DEBATE ===');
    console.log('Question:', question);

    // Round 1
    const round1 = await runRound1(question);

    // Scoring
    const scoring = await runScoring(question, round1);

    // Round 2 — only if someone failed
    const round2 = await runRound2(question, round1, scoring.agentAverages);

    // Re-score after round 2
    const scoring2 = await runScoring(question, round2);

    // Moderator reads the best round
    const finalAnswer = await runModerator(question, round2);

    res.json({
      question,
      round1: round1,
      scoring1: scoring.agentAverages,
      round2: round2,
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
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\nDebate server running on http://localhost:${PORT}`);
  console.log('Make sure Ollama is running: ollama serve');
});