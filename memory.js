// memory.js
// Dead-simple JSON-file-backed persistence. Good enough for a hackathon demo,
// survives server restarts (the setInterval loops themselves do not survive
// a restart yet — see server.js note — but the data does).

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "agents.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ agents: {} }, null, 2));
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return { agents: {} };
  }
}

function writeAll(db) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function createAgent(agentId, persona) {
  const db = readAll();
  db.agents[agentId] = {
    agentId,
    persona,
    posts: [],
    publishedTopicKeys: [],
    createdAt: new Date().toISOString(),
    lastCycleAt: null,
  };
  writeAll(db);
  return db.agents[agentId];
}

function getAgent(agentId) {
  const db = readAll();
  return db.agents[agentId] || null;
}

function addPost(agentId, post, topicKey) {
  const db = readAll();
  const agent = db.agents[agentId];
  if (!agent) return null;
  agent.posts.unshift(post); // newest first
  if (topicKey) agent.publishedTopicKeys.push(topicKey);
  agent.lastCycleAt = new Date().toISOString();
  writeAll(db);
  return agent;
}

function touchCycle(agentId) {
  const db = readAll();
  const agent = db.agents[agentId];
  if (!agent) return;
  agent.lastCycleAt = new Date().toISOString();
  writeAll(db);
}

function listAgentIds() {
  const db = readAll();
  return Object.keys(db.agents);
}

module.exports = { createAgent, getAgent, addPost, touchCycle, listAgentIds };
