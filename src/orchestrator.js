const fs = require('fs');
const { callModel } = require('./ollama');
const { AGENTS, MODERATOR } = require('./agents');

function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function getActiveAgentsAndModerator() {
  let nodes = [];
  try {
    if (fs.existsSync('./config.json')) {
      const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
      if (Array.isArray(config.nodes) && config.nodes.length > 0) {
        nodes = config.nodes;
      }
    }
  } catch (err) {
    console.error('Error loading config.json in orchestrator:', err.message);
  }

  if (nodes.length === 0) {
    return {
      agents: AGENTS.map(a => ({ ...a, ip: '127.0.0.1', port: '11434' })),
      moderator: { ...MODERATOR, ip: '127.0.0.1', port: '11434' },
      allNodes: []
    };
  }

  const defaultPromptMap = {
    'Analyst': AGENTS[0].systemPrompt,
    "Devil's Advocate": AGENTS[1].systemPrompt,
    'Creative Thinker': AGENTS[2].systemPrompt,
    'Ethics Checker': AGENTS[3].systemPrompt,
    'Moderator': MODERATOR.systemPrompt
  };

  const debateAgents = [];
  let moderatorNode = null;

  nodes.forEach((node, index) => {
    const role = node.role || `Agent ${index + 1}`;
    const model = (node.model === 'custom' ? node.customModel : node.model) || 'qwen3:14b';
    const systemPrompt = defaultPromptMap[role] || `You are ${role} in a multi-expert debate. Give a concise, factual answer. Do not use <think> tags.`;

    const agentObj = {
      id: role.toLowerCase().replace(/[^a-z0-9]/g, '_') + `_${index}`,
      name: role,
      model: model,
      ip: node.ip || '127.0.0.1',
      port: node.port || '11434',
      note: node.note || '',
      systemPrompt: systemPrompt
    };

    if (role === 'Moderator') {
      moderatorNode = agentObj;
    } else {
      debateAgents.push(agentObj);
    }
  });

  if (!moderatorNode) {
    moderatorNode = {
      ...MODERATOR,
      ip: nodes[0]?.ip || '127.0.0.1',
      port: nodes[0]?.port || '11434',
      model: (nodes[0]?.model === 'custom' ? nodes[0]?.customModel : nodes[0]?.model) || MODERATOR.model,
      note: nodes[0]?.note || ''
    };
  }

  return {
    agents: debateAgents.length > 0 ? debateAgents : AGENTS.map(a => ({ ...a, ip: '127.0.0.1', port: '11434' })),
    moderator: moderatorNode,
    allNodes: nodes
  };
}

async function generateTaskAssignments(question, emit = () => {}) {
  const { agents, moderator, allNodes } = getActiveAgentsAndModerator();
  const orchNode = allNodes.find(n => n.isOrchestrator) || moderator || agents[0];

  const agentDescriptions = agents.map(a => `- ${a.name}`).join('\n');

  const assignmentPrompt = `You are the Lead Coordinator of an autonomous multi-agent AI council.
The user has submitted the following prompt:
"${question}"

The active agents in your council are:
${agentDescriptions}

Your job is to analyze the prompt, decompose the problem, and dynamically assign a distinct, specialized focus and concrete sub-task to each agent according to their role so they divide the work effectively.

For EACH agent listed above, specify 1-2 clear sentences detailing what specific sub-topic, questions, data, or critical angle they must investigate.

Reply with ONLY this JSON format (no other text, no markdown wrappers):
{
  "assignments": [
    ${agents.map(a => `{"agentName": "${a.name}", "specificTask": "..."}`).join(',\n    ')}
  ]
}`;

  console.log('\nLead Orchestrator: Generating dynamic task assignments...');
  emit('debate:status', { message: 'Lead Orchestrator: Analyzing prompt & dividing workload among agents...' });

  const fallbackAssignments = agents.map(a => {
    let defaultTask = `Focus on your core perspective as ${a.name} to address: "${question}".`;
    if (a.name.toLowerCase().includes('analyst')) {
      defaultTask = `Analyze empirical data, logical structure, facts, and concrete feasibility regarding: "${question}".`;
    } else if (a.name.toLowerCase().includes('devil')) {
      defaultTask = `Identify hidden assumptions, risks, edge cases, and counter-arguments against the consensus on: "${question}".`;
    } else if (a.name.toLowerCase().includes('creative')) {
      defaultTask = `Propose unconventional angles, innovative solutions, and cross-domain analogies for: "${question}".`;
    } else if (a.name.toLowerCase().includes('ethic')) {
      defaultTask = `Evaluate societal implications, fairness, bias, and stakeholder safety regarding: "${question}".`;
    }
    return {
      agentId: a.id,
      agentName: a.name,
      specificTask: defaultTask
    };
  });

  const orchModel = (orchNode?.model === 'custom' ? orchNode?.customModel : orchNode?.model) || 'phi4-mini';

  try {
    const raw = await callModel(
      orchModel,
      assignmentPrompt,
      'You are a precise task decomposition coordinator. Return valid JSON only.',
      600,
      orchNode.ip || '127.0.0.1',
      orchNode.port || '11434'
    );

    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(cleaned.substring(start, end + 1));
      if (Array.isArray(parsed.assignments) && parsed.assignments.length > 0) {
        const finalAssignments = agents.map(a => {
          const match = parsed.assignments.find(item => item.agentName && item.agentName.toLowerCase() === a.name.toLowerCase());
          return {
            agentId: a.id,
            agentName: a.name,
            specificTask: (match && match.specificTask) ? match.specificTask : (fallbackAssignments.find(f => f.agentName === a.name)?.specificTask || `Analyze: ${question}`)
          };
        });
        console.log('Successfully generated dynamic task assignments:');
        finalAssignments.forEach(fa => console.log(`  - ${fa.agentName}: ${fa.specificTask}`));
        emit('debate:taskAssignments', { assignments: finalAssignments });
        return finalAssignments;
      }
    }
  } catch (err) {
    console.warn('Orchestrator assignment LLM failed, using fallback assignments:', err.message);
  }

  console.log('Using fallback task assignments.');
  emit('debate:taskAssignments', { assignments: fallbackAssignments });
  return fallbackAssignments;
}

async function runRound1(question, taskAssignments = [], emit = () => {}) {
  const { agents } = getActiveAgentsAndModerator();
  const roundStartTime = Date.now();
  emit('debate:roundStart', { roundNumber: 1, startTime: roundStartTime });

  console.log(`\nRound 1: ${agents.length} agents answering in parallel...`);

  const promises = agents.map(async (agent) => {
    const startTime = Date.now();
    emit('debate:agentStart', { agentName: agent.name, startTime });

    const assignment = Array.isArray(taskAssignments) ? taskAssignments.find(t => t.agentName === agent.name || t.agentId === agent.id) : null;
    const specificTask = assignment ? assignment.specificTask : null;

    let userPromptText = `QUESTION: ${question}`;
    if (specificTask) {
      userPromptText += `\n\nYOUR ASSIGNED SUB-TASK & FOCUS AREA:\n${specificTask}\n\nDeliver your response addressing this assigned aspect with depth while staying true to your role as ${agent.name}.`;
    }

    const response = await callModel(
      agent.model,
      userPromptText,
      agent.systemPrompt,
      500,
      agent.ip,
      agent.port
    );

    const responseTimeMs = Date.now() - startTime;
    const wordCount = countWords(response);

    emit('debate:agentComplete', {
      agentName: agent.name,
      responseTimeMs,
      wordCount
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      model: agent.model,
      nodeIp: agent.ip,
      responseTimeMs,
      wordCount,
      response,
      round: 1,
      revised: false,
      previousScore: null,
      assignedTask: specificTask || null
    };
  });

  const results = await Promise.all(promises);
  const roundTimeMs = Date.now() - roundStartTime;
  emit('debate:roundComplete', { roundNumber: 1, roundTimeMs });

  console.log(`Round 1 complete in ${roundTimeMs}ms. All agents responded.`);
  return { results, roundTimeMs };
}

async function runScoring(question, roundResults, roundNumber = 1, emit = () => {}) {
  const { agents } = getActiveAgentsAndModerator();
  console.log('\nScoring round: Agents evaluating each other...');

  const scoringPromises = agents.map(async (agent) => {
    const otherAgents = roundResults.filter(r => r.agentName !== agent.name);
    if (otherAgents.length === 0) return { scorerId: agent.id, scorerName: agent.name, scores: [] };

    const otherResponsesText = otherAgents
      .map(r => `[${r.agentName}]: ${r.response}`)
      .join('\n\n');

    const expectedJsonTemplate = JSON.stringify({
      scores: otherAgents.map(a => ({ agentName: a.agentName, accuracy: 0, logic: 0, relevance: 0 }))
    });

    const scoringPrompt = `You are a judge scoring debate responses.

QUESTION: ${question}

RESPONSES TO SCORE:
${otherResponsesText}

Give honest scores 1-10 for each response. Be critical — not everyone deserves a 7.
A score of 9-10 = exceptional. 7-8 = good. 5-6 = average. Below 5 = poor.

Reply with ONLY this JSON structure, no other text:
${expectedJsonTemplate}

Replace the 0s with your actual scores.`;

    const raw = await callModel(
      agent.model,
      scoringPrompt,
      agent.systemPrompt,
      800,
      agent.ip,
      agent.port
    );

    try {
      const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      if (!cleaned) throw new Error('Empty response');

      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');

      if (start === -1 || end === -1) throw new Error('No JSON found');

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

  const agentAverages = roundResults
    .filter(r => r.agentId !== 'moderator')
    .map(agent => {
      const accuracyScores = [];
      const logicScores = [];
      const relevanceScores = [];
      const overallAvgScores = [];

      allScores.forEach(scorer => {
        if (!scorer.scores) return;
        const found = scorer.scores.find(s => s.agentName === agent.agentName);
        if (found) {
          const acc = typeof found.accuracy === 'number' ? found.accuracy : 6;
          const log = typeof found.logic === 'number' ? found.logic : 6;
          const rel = typeof found.relevance === 'number' ? found.relevance : 6;
          const avg = (acc + log + rel) / 3;

          accuracyScores.push(acc);
          logicScores.push(log);
          relevanceScores.push(rel);
          overallAvgScores.push(avg);
        }
      });

      const avgAcc = accuracyScores.length ? accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length : 6;
      const avgLog = logicScores.length ? logicScores.reduce((a, b) => a + b, 0) / logicScores.length : 6;
      const avgRel = relevanceScores.length ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length : 6;
      const overallAvg = overallAvgScores.length ? overallAvgScores.reduce((a, b) => a + b, 0) / overallAvgScores.length : 6;

      const finalAvg = parseFloat(overallAvg.toFixed(2));
      const passed = finalAvg >= 6.5;

      emit('debate:scoreUpdate', {
        agentName: agent.agentName,
        score: finalAvg,
        passed
      });

      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        averageScore: finalAvg,
        passedThreshold: passed,
        detailedScores: {
          accuracy: parseFloat(avgAcc.toFixed(1)),
          logic: parseFloat(avgLog.toFixed(1)),
          relevance: parseFloat(avgRel.toFixed(1)),
          average: finalAvg
        }
      };
    });

  console.log('\nScores summary:');
  agentAverages.forEach(a => {
    console.log(`  ${a.agentName}: ${a.averageScore}/10 — ${a.passedThreshold ? 'PASS' : 'FAIL'}`);
  });

  return { allScores, agentAverages };
}

async function runRound2(question, previousRoundResults, agentAverages, roundNumber = 2, emit = () => {}, crisisTwist = null) {
  const { agents } = getActiveAgentsAndModerator();
  const roundStartTime = Date.now();
  emit('debate:roundStart', { roundNumber, startTime: roundStartTime });

  console.log(`\nRound ${roundNumber}: Flagged agents revising...`);

  const failedAgents = agentAverages.filter(a => !a.passedThreshold);

  // If all passed and no crisis twist, no revision needed
  if (failedAgents.length === 0 && !crisisTwist) {
    console.log('All agents passed! No revision needed.');
    const roundTimeMs = Date.now() - roundStartTime;
    emit('debate:roundComplete', { roundNumber, roundTimeMs });
    return { results: previousRoundResults, roundTimeMs };
  }

  if (crisisTwist) {
    console.log(`🚨 CRISIS TWIST ACTIVE in Round ${roundNumber}: "${crisisTwist}"`);
    emit('debate:status', { message: `🚨 EMERGENCY PROTOCOL ACTIVE: Council adapting to crisis constraint...` });
  } else {
    console.log(`Flagged agents: ${failedAgents.map(a => a.agentName).join(', ')}`);
  }

  const allResponsesText = previousRoundResults
    .map(r => `[${r.agentName}]: ${r.response}`)
    .join('\n\n');

  const revisionPromises = agents.map(async (agent) => {
    const isFlagged = failedAgents.find(f => f.agentName === agent.name || f.agentId === agent.id);
    const original = previousRoundResults.find(r => r.agentName === agent.name || r.agentId === agent.id) || {};

    // If neither flagged nor crisis active, keep original
    if (!isFlagged && !crisisTwist) {
      console.log(`  ${agent.name} passed — keeping original response`);
      return {
        ...original,
        round: roundNumber,
        revised: false,
        crisisTwist: null
      };
    }

    const myPrevious = original;
    const myScore = agentAverages.find(a => a.agentName === agent.name || a.agentId === agent.id);

    let crisisDirective = '';
    if (crisisTwist) {
      crisisDirective = `
========================================
🚨 EMERGENCY CRISIS CONSTRAINT INJECTED BY COMMAND:
"${crisisTwist}"
========================================
CRITICAL INSTRUCTION: You MUST immediately acknowledge this crisis and adapt your strategy/argument to account for this sudden constraint. Explain how your approach survives or shifts under this new condition.
`;
    }

    const revisionPrompt = `You are ${agent.name}. ${
      isFlagged 
        ? `Your previous answer was scored ${myScore?.averageScore || 5}/10 by your peers — below the threshold.` 
        : `Your previous answer was strong, but an urgent crisis development has just been declared.`
    }

QUESTION: ${question}
${crisisDirective}
YOUR PREVIOUS ANSWER:
${myPrevious ? myPrevious.response : ''}

WHAT OTHER AGENTS SAID:
${allResponsesText}

YOUR TASK: Write a revised, improved answer.
${crisisTwist ? '- Directly address and adapt to the emergency crisis constraint' : '- Address weaknesses in your previous response'}
- Consider the other agents' perspectives
- Keep your unique ${agent.name} role and angle
- Be concise — 150-220 words max
- Do not use <think> tags. Just give your answer directly.`;

    console.log(`  ${agent.name} is revising${crisisTwist ? ' with crisis adaptation' : ''}...`);
    const startTime = Date.now();
    emit('debate:agentStart', { agentName: agent.name, startTime });

    const revised = await callModel(
      agent.model,
      revisionPrompt,
      agent.systemPrompt,
      650,
      agent.ip,
      agent.port
    );

    const responseTimeMs = Date.now() - startTime;
    const wordCount = countWords(revised);

    emit('debate:agentComplete', {
      agentName: agent.name,
      responseTimeMs,
      wordCount
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      model: agent.model,
      nodeIp: agent.ip,
      responseTimeMs,
      wordCount,
      response: revised,
      round: roundNumber,
      revised: true,
      previousScore: myScore ? myScore.averageScore : null,
      crisisTwist: crisisTwist || null
    };
  });

  const roundResults = await Promise.all(revisionPromises);
  const roundTimeMs = Date.now() - roundStartTime;
  emit('debate:roundComplete', { roundNumber, roundTimeMs });

  console.log(`Round ${roundNumber} complete in ${roundTimeMs}ms.`);
  return { results: roundResults, roundTimeMs };
}

async function runModerator(question, allRoundResults, emit = () => {}, crisisTwist = null) {
  const { moderator } = getActiveAgentsAndModerator();
  console.log('\nModerator: Synthesising final answer...');

  const startTime = Date.now();
  emit('debate:agentStart', { agentName: moderator.name || 'Moderator', startTime });

  const debateTranscript = allRoundResults
    .map(r => `[${r.agentName}]:\n${r.response}`)
    .join('\n\n---\n\n');

  let crisisContext = '';
  if (crisisTwist) {
    crisisContext = `\nNOTE ON EMERGENCY INTERVENTION:\nDuring the debate, the following emergency crisis constraint was injected by Council Command:\n"${crisisTwist}"\nEnsure the final consensus explicitly resolves this crisis constraint.\n`;
  }

  const moderatorPrompt = `
ORIGINAL QUESTION: ${question}
${crisisContext}
FULL DEBATE TRANSCRIPT:
${debateTranscript}

YOUR TASK:
Write the final synthesised consensus answer.
1. Synthesise the key insights and resolve contradictions from the agents.
2. If the question asks for code or an implementation, you MUST output the complete, final, production-ready code block incorporating all improvements, optimizations, and edge-case fixes debated by the agents.
3. Structure your response clearly with concise explanations.
`;

  const finalAnswer = await callModel(
    moderator.model,
    moderatorPrompt,
    moderator.systemPrompt,
    1800,
    moderator.ip,
    moderator.port
  );

  const responseTimeMs = Date.now() - startTime;
  const wordCount = countWords(finalAnswer);

  emit('debate:agentComplete', {
    agentName: moderator.name || 'Moderator',
    responseTimeMs,
    wordCount
  });

  return {
    agentId: 'moderator',
    agentName: moderator.name || 'Moderator',
    response: finalAnswer,
    responseTimeMs,
    wordCount,
    model: moderator.model,
    nodeIp: moderator.ip || '127.0.0.1',
    round: 'final'
  };
}

async function chatWithCouncil({ question, finalAnswer, transcript = '', messages = [], targetAgent = 'moderator' }) {
  const { agents, moderator } = getActiveAgentsAndModerator();

  let respondent = moderator;
  if (targetAgent && targetAgent !== 'moderator') {
    const found = agents.find(a => a.id === targetAgent || a.name.toLowerCase() === targetAgent.toLowerCase());
    if (found) respondent = found;
  }

  const roleName = respondent.name || 'Moderator';

  const historyLines = (messages || []).slice(-8).map(m => {
    const sender = m.role === 'user' ? 'User' : (m.sender || roleName);
    return `${sender}: ${m.content}`;
  }).join('\n\n');

  const chatPrompt = `You are participating in an interactive follow-up discussion.
You are responding as: ${roleName}.

CONTEXT OF PREVIOUS MULTI-AGENT DEBATE:
Topic: ${question}

${transcript ? `SUMMARY OF ARGUMENTS:\n${transcript}\n` : ''}
FINAL COUNCIL SYNTHESIS:
${finalAnswer || 'None'}

====================
FOLLOW-UP CONVERSATION:
${historyLines}
====================

Now, write your direct reply to the User's latest question.
Stay in character as ${roleName}. Reference the debate facts and final consensus when helpful.
Be concise, helpful, and direct (100-250 words). Do not use <think> tags.`;

  const startTime = Date.now();
  const rawReply = await callModel(
    respondent.model,
    chatPrompt,
    respondent.systemPrompt || `You are ${roleName}. Answer questions thoughtfully based on the multi-agent debate and final consensus.`,
    800,
    respondent.ip || '127.0.0.1',
    respondent.port || '11434'
  );
  const responseTimeMs = Date.now() - startTime;
  const reply = rawReply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return {
    reply,
    roleName,
    agentId: respondent.id,
    responseTimeMs
  };
}

module.exports = {
  runRound1,
  runScoring,
  runRound2,
  runModerator,
  generateTaskAssignments,
  chatWithCouncil,
  getActiveAgentsAndModerator,
  countWords
};