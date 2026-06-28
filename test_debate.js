require('dotenv').config();
const { runRound1, runScoring, runRound2, runModerator } = require('./src/orchestrator');

const QUESTION = 'Should AI be open-sourced or kept proprietary?';

(async () => {
  console.log('='.repeat(60));
  console.log('MULTI-AGENT DEBATE TRIAL — qwen3:14b');
  console.log('Question:', QUESTION);
  console.log('='.repeat(60));

  const startTime = Date.now();

  // Round 1
  console.log('\n📢 Round 1 — all agents thinking independently...\n');
  const round1 = await runRound1(QUESTION);
  round1.forEach(r => {
    console.log(`\n--- ${r.agentName} (Round 1) ---`);
    console.log(r.response);
  });

  // Scoring
  console.log('\n📢 Scoring — agents evaluating each other...\n');
  const scoring = await runScoring(QUESTION, round1);
  console.log('\n====== SCORES ======');
  scoring.agentAverages.forEach(s =>
    console.log(`  ${s.agentName}: ${s.averageScore}/10 — ${s.passedThreshold ? '✅ PASS' : '❌ FAIL'}`)
  );

  const allPassed = scoring.agentAverages.every(a => a.passedThreshold);

  // Round 2 if needed
  let finalRound = round1;
  if (!allPassed) {
    console.log('\n📢 Round 2 — flagged agents revising...\n');
    finalRound = await runRound2(QUESTION, round1, scoring.agentAverages);
    finalRound.forEach(r => {
      if (r.revised) {
        console.log(`\n--- ${r.agentName} (REVISED) ---`);
        console.log(r.response);
      }
    });

    const scoring2 = await runScoring(QUESTION, finalRound);
    console.log('\n====== ROUND 2 SCORES ======');
    scoring2.agentAverages.forEach(s =>
      console.log(`  ${s.agentName}: ${s.averageScore}/10 — ${s.passedThreshold ? '✅ PASS' : '❌ FAIL'}`)
    );
  }

  // Moderator
  console.log('\n📢 Moderator synthesising final answer...\n');
  const final = await runModerator(QUESTION, finalRound);
  console.log('='.repeat(60));
  console.log('🏆 FINAL ANSWER (Moderator)');
  console.log('='.repeat(60));
  console.log(final.response);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Total time: ${elapsed}s`);
  console.log('✅ DEBATE COMPLETE');
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
