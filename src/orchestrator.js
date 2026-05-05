const { callModel } = require('./ollama');
const { AGENTS, MODERATOR } = require('./agents');

async function runRound1(question) {
  console.log('\nRound 1: All agents answering in parallel...');

  const promises = AGENTS.map(agent =>
    callModel(
      agent.model,
      `QUESTION: ${question}`,
      agent.systemPrompt
    ).then(response => ({
      agentId: agent.id,
      agentName: agent.name,
      model: agent.model,
      response: response,
      round: 1
    }))
  );

  const results = await Promise.all(promises);
  console.log('Round 1 complete. All agents responded.');
  return results;
}

async function runScoring(question, round1Results) {
  console.log('\nScoring round: Agents evaluating each other...');

  const scoringPromises = AGENTS.map(async (agent) => {
    const myResponse = round1Results.find(r => r.agentId === agent.id);
    const otherAgents = round1Results.filter(r => r.agentId !== agent.id);

    const otherResponsesText = otherAgents
      .map(r => `[${r.agentName}]: ${r.response}`)
      .join('\n\n');

    const scoringPrompt = `You are a judge scoring debate responses.

QUESTION: ${question}

RESPONSES TO SCORE:
${otherResponsesText}

Give honest scores 1-10 for each response. Be critical — not everyone deserves a 7.
A score of 9-10 = exceptional. 7-8 = good. 5-6 = average. Below 5 = poor.

Reply with ONLY this JSON, no other text:
{"scores":[{"agentName":"${otherAgents[0].agentName}","accuracy":0,"logic":0,"relevance":0},{"agentName":"${otherAgents[1].agentName}","accuracy":0,"logic":0,"relevance":0},{"agentName":"${otherAgents[2].agentName}","accuracy":0,"logic":0,"relevance":0}]}

Replace the 0s with your actual scores.`;

    const raw = await callModel(
      agent.model,
      scoringPrompt,
      agent.systemPrompt,
      600
    );

    try {
  // Remove <think> blocks
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  if (!cleaned) {
    throw new Error('Empty response');
  }

  // Find the JSON — grab everything from first { to last }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1) {
    throw new Error('No JSON found');
  }

  const jsonStr = cleaned.substring(start, end + 1);
  const parsed = JSON.parse(jsonStr);

  if (!parsed.scores || !Array.isArray(parsed.scores)) {
    throw new Error('Invalid scores format');
  }

  console.log(`  ${agent.name} scored successfully`);
  return {
    scorerId: agent.id,
    scorerName: agent.name,
    scores: parsed.scores
  };

} catch (e) {
  console.log(`Warning: ${agent.name} failed scoring — ${e.message}`);
  console.log('Raw response:', raw.substring(0, 300));

  // Give default scores so the system doesn't break
  return {
    scorerId: agent.id,
    scorerName: agent.name,
    scores: otherAgents.map(a => ({
      agentName: a.agentName,
      accuracy: 6,
      logic: 6,
      relevance: 6
    }))
  };
}
  });

  const allScores = await Promise.all(scoringPromises);

  const agentAverages = round1Results
    .filter(r => r.agentId !== 'moderator')
    .map(agent => {
      const scoresForThisAgent = [];

      allScores.forEach(scorer => {
        if (!scorer.scores) return;
        const found = scorer.scores.find(s => s.agentName === agent.agentName);
        if (found) {
          const avg = (found.accuracy + found.logic + found.relevance) / 3;
          scoresForThisAgent.push(avg);
        }
      });

      const overallAvg = scoresForThisAgent.length > 0
        ? scoresForThisAgent.reduce((a, b) => a + b, 0) / scoresForThisAgent.length
        : null;

      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        averageScore: overallAvg ? parseFloat(overallAvg.toFixed(2)) : null,
        passedThreshold: overallAvg ? overallAvg >= 6.5 : null
      };
    });

  console.log('\nScores summary:');
  agentAverages.forEach(a => {
    console.log(`  ${a.agentName}: ${a.averageScore}/10 — ${a.passedThreshold ? 'PASS' : 'FAIL'}`);
  });

  return { allScores, agentAverages };
}

async function runModerator(question, allRoundResults) {
  console.log('\nModerator: Synthesising final answer...');

  const debateTranscript = allRoundResults
    .map(r => `[${r.agentName}]:\n${r.response}`)
    .join('\n\n---\n\n');

  const moderatorPrompt = `
ORIGINAL QUESTION: ${question}

FULL DEBATE TRANSCRIPT:
${debateTranscript}

Now write the final synthesised answer.
`;

  const finalAnswer = await callModel(
    MODERATOR.model,
    moderatorPrompt,
    MODERATOR.systemPrompt,
    1000
  );

  return {
    agentId: 'moderator',
    agentName: 'Moderator',
    response: finalAnswer,
    round: 'final'
  };
}

module.exports = { runRound1, runScoring, runModerator };