require("dotenv").config();
const path = require("path");
const express = require("express");
const crypto = require("crypto");

const memory = require("./memory");
const { buildPersona } = require("./agentLogic");
const { startAgentLoop } = require("./scheduler");
const { getProvider } = require("./llm");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ---------- Required endpoint 1: initialize ----------
app.post("/api/agent/init", async (req, res) => {
  try {
    const { persona } = req.body || {};
    if (!persona || !persona.name || !persona.domain) {
      return res.status(400).json({ error: "Request must include persona.name and persona.domain" });
    }

    const agentId = crypto.randomUUID();
    const fullPersona = await buildPersona(persona.name, persona.domain, {
      tone: persona.tone,
      language: persona.language,
      llmMode: persona.mode,
    });
    memory.createAgent(agentId, fullPersona);

    startAgentLoop(agentId); // <-- this is the autonomy: no further calls needed

    console.log(`[init] agent ${agentId} initialized as "${fullPersona.name}" (${fullPersona.domain}) using ${getProvider()} mode`);
    res.json({ agentId });
  } catch (err) {
    console.error("[init] failed:", err);
    res.status(500).json({ error: "Failed to initialize agent" });
  }
});

// ---------- Required endpoint 2: feed ----------
app.get("/api/agent/feed", (req, res) => {
  const { agentId } = req.query;
  if (!agentId) return res.status(400).json({ error: "agentId query param is required" });

  const agent = memory.getAgent(agentId);
  if (!agent) return res.status(404).json({ error: "Unknown agentId" });

  const posts = agent.posts.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    text: p.text,
    rationale: p.rationale,
    sources: p.sources,
  }));

  res.json({ posts });
});

// ---------- Optional extras (not required by the spec, handy for demoing) ----------

// Inspect the full persona + internal state for an agent.
app.get("/api/agent/debug", (req, res) => {
  const { agentId } = req.query;
  const agent = memory.getAgent(agentId);
  if (!agent) return res.status(404).json({ error: "Unknown agentId" });
  res.json({
    agentId: agent.agentId,
    persona: agent.persona,
    postCount: agent.posts.length,
    lastCycleAt: agent.lastCycleAt,
    createdAt: agent.createdAt,
    llmMode: getProvider(agent.persona.llmMode),
    cycleIntervalMs: Number(process.env.CYCLE_INTERVAL_MS || 120000),
    firstCycleDelayMs: Number(process.env.FIRST_CYCLE_DELAY_MS || 15000),
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    llmMode: getProvider(),
    endpoints: ["POST /api/agent/init", "GET /api/agent/feed?agentId=..."],
  });
});

app.listen(PORT, () => {
  console.log(`AI persona agent server listening on http://localhost:${PORT}`);
  console.log(`LLM mode: ${getProvider()} ${getProvider() === "template" ? "(no API key set — using deterministic fallback text)" : ""}`);

  // Resilience: if this process restarts (host sleep/wake, redeploy, crash
  // recovery) while agents from a prior run are still in the JSON store,
  // resume their publishing loops automatically. Without this, a restart
  // would silently end autonomy for any already-initialized agent even
  // though its data survived — exactly the failure mode a free host's
  // idle-sleep behavior would otherwise cause during a 48hr evaluation.
  const existingAgentIds = memory.listAgentIds();
  if (existingAgentIds.length) {
    console.log(`[boot] resuming publishing loops for ${existingAgentIds.length} existing agent(s)`);
    existingAgentIds.forEach((agentId) => startAgentLoop(agentId));
  }
});
