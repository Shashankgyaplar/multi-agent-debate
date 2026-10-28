# 🧠 Multi-Agent Debate System

A distributed AI council where multiple locally-running LLM agents debate any question, score each other's answers, revise under pressure, and synthesise a final consensus — all in real time across your local network.

---

## What It Does

You submit a question. A council of four AI agents — each with a distinct role — independently investigates it. They score each other's responses, flag weak answers, and revise them. A Moderator agent synthesises everything into one final, balanced answer. The entire process streams live to a React frontend via WebSockets.

Each agent runs on a separate machine on your LAN, powered by [Ollama](https://ollama.com). No cloud APIs. No external dependencies. Fully local and private.

---

## Agents

| Agent | Role | Default Model |
|---|---|---|
| **Analyst** | Structured, evidence-based factual analysis | `qwen3:14b` |
| **Devil's Advocate** | Challenges assumptions, argues the opposite | `qwen3:14b` |
| **Creative Thinker** | Lateral thinking, novel angles, unexpected analogies | `qwen3:8b` |
| **Ethics Checker** | Flags bias, risks, and fairness concerns | `qwen3:8b` |
| **Moderator** | Synthesises all arguments into the final consensus | `qwen3:14b` |

Models are configurable per node. Any Ollama-compatible model works.

---

## How a Debate Works

```
1. Lead Orchestrator  →  Decomposes the question and assigns each agent a sub-task
2. Round 1            →  All agents respond in parallel (their assigned angle)
3. Scoring            →  Each agent scores every other agent (accuracy / logic / relevance, 1–10)
4. Revision Rounds    →  Agents below 6.5/10 revise using peer feedback  (up to 4 rounds total)
5. Moderator          →  Reads the full transcript and delivers the final synthesised answer
```

Live crisis injection is also supported: you can POST a "twist" mid-debate and every agent must immediately adapt their arguments to the new constraint.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                    │
│         (real-time via Socket.IO)                   │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────┐
│              Express + Socket.IO Server              │
│  ┌─────────────────────────────────────────────┐    │
│  │               Orchestrator                  │    │
│  │  generateTaskAssignments → runRound1        │    │
│  │  runScoring → runRound2 (×N) → runModerator │    │
│  └─────────────────────────────────────────────┘    │
│                     ↕ Ollama API                    │
│  ┌──────────┬───────────────┬──────────┬──────────┐ │
│  │  Node 1  │    Node 2     │  Node 3  │  Node 4  │ │
│  │ Ollama   │    Ollama     │  Ollama  │  Ollama  │ │
│  │ (LAN IP) │   (LAN IP)   │ (LAN IP) │ (LAN IP) │ │
│  └──────────┴───────────────┴──────────┴──────────┘ │
│                                                     │
│       Logs → MongoDB (primary) or JSON files        │
└─────────────────────────────────────────────────────┘
```

---

## Project Structure

```
multi-agent-debate/
├── server.js              # Express server — all API routes and debate orchestration entry point
├── config.json            # Active node configuration (IPs, models, roles)
├── .env                   # Environment variables (PORT, MONGODB_URI, OLLAMA_URL)
│
├── src/
│   ├── agents.js          # Agent and Moderator definitions (roles, prompts, default models)
│   ├── orchestrator.js    # Core debate logic (rounds, scoring, revision, moderation, chat)
│   └── ollama.js          # Ollama API client with remote fallback to localhost
│
├── models/
│   └── Debate.js          # Mongoose schema for persisted debate logs
│
├── logs/                  # JSON fallback logs when MongoDB is unavailable
│
└── client/                # React frontend (CRA)
    ├── src/
    └── package.json
```

---

## Prerequisites

- **Node.js** v18+ on the server machine
- **[Ollama](https://ollama.com)** running on every participating node
- All machines on the **same local network**
- **MongoDB** (optional — file-based fallback is built in)

Pull the models you want to use on each Ollama node before starting:

```bash
ollama pull qwen3:14b
ollama pull qwen3:8b
# or any other model you prefer
```

> **Important:** Ollama must be bound to `0.0.0.0` so other machines on the LAN can reach it.
>
> ```bash
> OLLAMA_HOST=0.0.0.0 ollama serve
> ```

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/Shashankgyaplar/multi-agent-debate.git
cd multi-agent-debate
```

### 2. Install server dependencies

```bash
npm install
```

### 3. Install client dependencies

```bash
cd client && npm install && cd ..
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/council
OLLAMA_URL=http://localhost:11434
```

All three variables are optional — the defaults above are used if the file is empty or missing. If MongoDB is unreachable, the system automatically falls back to JSON file logging inside `/logs`.

### 5. Configure your nodes

Edit `config.json` to map each LAN machine to an agent role:

```json
{
  "nodes": [
    {
      "id": "1",
      "ip": "192.168.1.10",
      "port": "11434",
      "role": "Analyst",
      "model": "qwen3:14b",
      "note": "My laptop"
    },
    {
      "id": "2",
      "ip": "192.168.1.11",
      "port": "11434",
      "role": "Devil's Advocate",
      "model": "phi4-mini",
      "note": "Teammate's machine"
    },
    {
      "id": "3",
      "ip": "192.168.1.12",
      "port": "11434",
      "role": "Creative Thinker",
      "model": "qwen3:8b",
      "note": ""
    },
    {
      "id": "4",
      "ip": "192.168.1.13",
      "port": "11434",
      "role": "Ethics Checker",
      "model": "qwen3:8b",
      "note": ""
    }
  ]
}
```

**Available roles:** `Analyst`, `Devil's Advocate`, `Creative Thinker`, `Ethics Checker`, `Moderator`

You can also use a custom model name by setting `"model": "custom"` and `"customModel": "your-model-name"`.

Node configuration can also be managed live through the UI or via the API (see endpoints below).

---

## Running

### Start the backend server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Server runs at `http://localhost:3001`.

### Start the React frontend

```bash
cd client && npm start
```

Frontend runs at `http://localhost:3000`.

---

## API Reference

### Debate

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/debate` | Start a debate. Body: `{ "question": "...", "crisisTwist": "..." }` |
| `POST` | `/debate/twist` | Inject a live crisis twist into the active debate. Body: `{ "twist": "..." }` |
| `POST` | `/debate/chat` | Follow-up chat with an agent after the debate. Body: `{ "question", "finalAnswer", "transcript", "messages", "targetAgent" }` |

### Logs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/logs` | List all debates (paginated). Query: `?page=1&limit=10` |
| `GET` | `/logs/stats` | Aggregate statistics across all debates |
| `GET` | `/logs/export` | Download all logs as a JSON file |
| `GET` | `/logs/:debateId` | Single debate detail |
| `DELETE` | `/logs/:debateId` | Delete a debate log |

### Node Configuration

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/config/nodes` | Get current node configuration |
| `POST` | `/config/nodes` | Save node configuration. Body: `{ "nodes": [...] }` |
| `POST` | `/config/test` | Test a single node connection. Body: `{ "ip": "...", "port": "..." }` |
| `GET` | `/config/status` | Check connection status of all configured nodes |

---

## WebSocket Events

The server emits real-time events to the frontend via Socket.IO:

| Event | Payload | Description |
|---|---|---|
| `debate:status` | `{ message }` | General status updates |
| `debate:taskAssignments` | `{ assignments }` | Sub-tasks assigned to each agent |
| `debate:roundStart` | `{ roundNumber, startTime }` | A new round has begun |
| `debate:agentStart` | `{ agentName, startTime }` | An agent has started responding |
| `debate:agentComplete` | `{ agentName, responseTimeMs, wordCount }` | An agent has finished |
| `debate:round1Complete` | `{ responses }` | All Round 1 responses ready |
| `debate:scores` | `{ scores }` | Round 1 scores |
| `debate:round2Complete` | `{ responses, crisisTwist }` | Revised responses ready |
| `debate:scores2` | `{ scores }` | Round 2+ scores |
| `debate:scoreUpdate` | `{ agentName, score, passed }` | Individual score update |
| `debate:crisisInjected` | `{ twist, timestamp }` | Live crisis twist injected |
| `debate:final` | `{ question, taskAssignments, finalAnswer, metadata }` | Debate complete |
| `debate:timerTick` | `{ elapsedMs }` | Elapsed time tick (every 1 second) |
| `debate:error` | `{ error }` | Error during debate |

---

## Scoring System

Each agent scores every other agent after each round on three dimensions:

- **Accuracy** — factual correctness (1–10)
- **Logic** — quality of reasoning (1–10)
- **Relevance** — how well the response addresses the question (1–10)

The three scores are averaged. An agent **passes** if its peer-averaged score is **≥ 6.5 / 10**.

Any agent that fails is required to revise in the next round. The debate continues until all agents pass or the maximum of **4 rounds** is reached. The Moderator then synthesises regardless.

---

## Crisis Twist

You can inject an emergency constraint into a running debate at any time:

```bash
curl -X POST http://localhost:3001/debate/twist \
  -H "Content-Type: application/json" \
  -d '{"twist": "Assume the internet goes offline globally in 24 hours."}'
```

All agents immediately adapt their arguments to address the new constraint in the next revision round. The Moderator's final answer will also explicitly resolve the crisis.

---

## Debate Logging

Every debate is saved automatically with:

- Full transcript per agent, per round
- Accuracy / logic / relevance scores
- Response time and word count per agent
- Fastest and slowest agent
- Total tokens estimated
- Whether consensus was reached
- Whether the max round limit was hit
- Crisis twist, if any was injected

**Primary storage:** MongoDB (if `MONGODB_URI` is set and reachable)  
**Fallback storage:** JSON files in `/logs/`

Both sources are merged and deduplicated automatically in the `/logs` API.

---

## Resilience

- If a remote Ollama node is unreachable, the system falls back to your local Ollama instance automatically.
- If MongoDB is down, all logs are written to JSON files and merged back when the DB reconnects on the next query.
- If the orchestrator LLM fails to generate task assignments, deterministic role-based fallback tasks are used.
- If an agent returns malformed JSON during scoring, neutral scores (6 / 10) are substituted to keep the debate moving.

---

## License

ISC
