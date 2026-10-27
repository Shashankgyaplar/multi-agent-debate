const mongoose = require('mongoose');

const NodeSchema = new mongoose.Schema({
  ip: { type: String, default: '' },
  port: { type: String, default: '' },
  model: { type: String, default: '' },
  role: { type: String, default: '' },
  note: { type: String, default: '' }
}, { _id: false });

const AgentRoundSchema = new mongoose.Schema({
  agentId: { type: String, required: true },
  agentName: { type: String, required: true },
  model: { type: String, default: '' },
  nodeIp: { type: String, default: '' },
  responseTimeMs: { type: Number, default: 0 },
  wordCount: { type: Number, default: 0 },
  response: { type: String, default: '' },
  scores: {
    accuracy: { type: Number, default: 0 },
    logic: { type: Number, default: 0 },
    relevance: { type: Number, default: 0 },
    average: { type: Number, default: 0 }
  },
  passed: { type: Boolean, default: false },
  revised: { type: Boolean, default: false },
  previousScore: { type: Number, default: null }
}, { _id: false });

const RoundSchema = new mongoose.Schema({
  roundNumber: { type: Number, required: true },
  agents: [AgentRoundSchema],
  allPassed: { type: Boolean, default: false },
  roundTimeMs: { type: Number, default: 0 }
}, { _id: false });

const FinalAnswerSchema = new mongoose.Schema({
  response: { type: String, default: '' },
  responseTimeMs: { type: Number, default: 0 },
  wordCount: { type: Number, default: 0 },
  model: { type: String, default: '' },
  nodeIp: { type: String, default: '' }
}, { _id: false });

const MetadataSchema = new mongoose.Schema({
  avgResponseTimeMs: { type: Number, default: 0 },
  fastestAgent: { type: String, default: '' },
  slowestAgent: { type: String, default: '' },
  highestScore: { type: Number, default: 0 },
  lowestScore: { type: Number, default: 0 },
  totalTokensEstimate: { type: Number, default: 0 }
}, { _id: false });

const DebateSchema = new mongoose.Schema({
  debateId: { type: String, required: true, unique: true },
  question: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  totalTimeMs: { type: Number, default: 0 },
  totalRounds: { type: Number, default: 1 },
  consensusReached: { type: Boolean, default: false },
  maxRoundsHit: { type: Boolean, default: false },
  nodes: [NodeSchema],
  rounds: [RoundSchema],
  finalAnswer: FinalAnswerSchema,
  metadata: MetadataSchema
}, {
  timestamps: true
});

module.exports = mongoose.model('Debate', DebateSchema);
