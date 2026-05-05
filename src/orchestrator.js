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

module.exports = { runRound1, runModerator };