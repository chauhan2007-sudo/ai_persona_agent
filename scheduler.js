// scheduler.js
// This is what makes the agent "autonomous" rather than request-driven:
// once init() schedules a loop, that loop keeps firing on its own timer
// for as long as the process is alive — no further HTTP calls required.

const { discoverTopics, topicKey } = require("./topicSources");
const { judgeTopics, writePost } = require("./agentLogic");
const memory = require("./memory");

const timers = new Map(); // agentId -> interval handle

function jitter(ms, pct = 0.25) {
  const delta = ms * pct;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

async function runCycle(agentId) {
  const agent = memory.getAgent(agentId);
  if (!agent) return;

  try {
    const candidates = await discoverTopics(agent.persona.domain);
    const publishedTitles = agent.posts.map((p) => p.topicTitle).filter(Boolean);
    const judgment = await judgeTopics(agent.persona, candidates, publishedTitles);

    if (judgment.decision === "publish" && candidates[judgment.chosenIndex]) {
      const topic = candidates[judgment.chosenIndex];
      const text = await writePost(agent.persona, topic, judgment);
      const post = {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        text,
        rationale: `Selected: ${judgment.whySelected} Relevance: ${judgment.whyRelevantNow}`,
        sources: [topic.url],
        topicTitle: topic.title,
      };
      memory.addPost(agentId, post, topicKey(topic));
      console.log(`[scheduler] agent ${agentId} published: "${topic.title}"`);
    } else {
      memory.touchCycle(agentId);
      console.log(`[scheduler] agent ${agentId} rejected all candidates: ${judgment.reason || "no reason given"}`);
    }
  } catch (err) {
    console.error(`[scheduler] cycle failed for agent ${agentId}:`, err.message);
  }
}

function startAgentLoop(agentId) {
  const baseInterval = Number(process.env.CYCLE_INTERVAL_MS || 120000);
  const firstDelay = Number(process.env.FIRST_CYCLE_DELAY_MS || 15000);

  // First cycle after a short delay (proves publishing isn't instant/dumped).
  const firstTimer = setTimeout(async () => {
    await runCycle(agentId);
    // Then keep going on a jittered interval, forever, with no further input.
    const interval = setInterval(() => runCycle(agentId), jitter(baseInterval));
    timers.set(agentId, interval);
  }, firstDelay);

  timers.set(agentId, firstTimer);
}

function stopAgentLoop(agentId) {
  const t = timers.get(agentId);
  if (t) {
    clearTimeout(t);
    clearInterval(t);
    timers.delete(agentId);
  }
}

module.exports = { startAgentLoop, stopAgentLoop, runCycle };
