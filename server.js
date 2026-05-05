require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runRound1, runScoring, runModerator } = require('./src/orchestrator');

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

    const round1 = await runRound1(question);
    const scoring = await runScoring(question, round1);
    const finalAnswer = await runModerator(question, round1);

    res.json({
      question,
      agentResponses: round1,
      scoring: scoring.agentAverages,
      finalAnswer,
      metadata: {
        totalAgents: round1.length,
        allPassed: scoring.agentAverages.every(a => a.passedThreshold),
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