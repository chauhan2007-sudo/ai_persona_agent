// agentLogic.js
// The "brain": persona creation, editorial judgment, and post writing.
// Every function has a template-mode fallback so the whole pipeline still
// runs end-to-end with zero API keys configured.

const { generateJson, generate, getProvider } = require("./llm");

// Tone presets used both to steer LLM generation and as a deterministic
// fallback when running in template mode (no API key configured).
const TONE_PRESETS = {
  motivational: { tone: "energetic, encouraging, forward-looking", style: "short punchy sentences, calls to action, positive framing" },
  professional: { tone: "measured, precise, mildly skeptical of hype", style: "short sentences, concrete references, no buzzwords" },
  funny: { tone: "witty, irreverent, quick with a joke", style: "playful phrasing, wordplay, light sarcasm, still substantive" },
  formal: { tone: "reserved, precise, authoritative", style: "complete sentences, no contractions, minimal informality" },
  informal: { tone: "conversational, relaxed, approachable", style: "contractions, casual phrasing, talks like a peer not a press release" },
  sarcastic: { tone: "dry, deadpan, faintly mocking of hype", style: "understatement, ironic asides, still factually grounded" },
  analytical: { tone: "rigorous, data-driven, dispassionate", style: "precise claims, hedges appropriately, cites specifics" },
  casual: { tone: "laid-back, friendly, plainspoken", style: "everyday words, short sentences, no jargon" },
};

function resolveMode(persona) {
  return persona && persona.llmMode ? persona.llmMode : "auto";
}

// ---------- 1. Persona generation (runs once, at init) ----------

async function buildPersona(name, domain, options = {}) {
  const llmMode = options.llmMode || "auto";
  const language = options.language || "English";
  const toneChoice = (options.tone || "").toLowerCase();
  const tonePreset = TONE_PRESETS[toneChoice] || null;

  if (getProvider(llmMode) === "template") {
    return templatePersona(name, domain, { llmMode, language, toneChoice, tonePreset });
  }

  const system = `You invent a consistent, original professional persona for an
autonomous AI/technology commentary agent. The persona must feel like a real,
opinionated practitioner — not a generic bot.`;
  const user = `Name: ${name}
Domain: ${domain}
${tonePreset ? `Desired tone preset (must incorporate): ${options.tone} — lean into "${tonePreset.tone}" and "${tonePreset.style}"` : ""}
${language !== "English" ? `Write the bio, tone, style, stances, and standards fields in ${language}.` : ""}

Return JSON with this exact shape:
{
  "bio": "1-2 sentence bio establishing who this persona is and their angle on ${domain}",
  "tone": "short description of tone",
  "style": "short description of writing style/quirks",
  "stances": ["4 distinct, specific opinions this persona holds about ${domain}"],
  "standards": ["4 specific editorial criteria this persona uses to reject weak topics"]
}`;
  try {
    const json = await generateJson(system, user, { forced: llmMode });
    return normalizePersona(name, domain, json, { llmMode, language, toneChoice });
  } catch (err) {
    console.error("[agentLogic] persona generation failed, using template:", err.message);
    return templatePersona(name, domain, { llmMode, language, toneChoice, tonePreset });
  }
}

function normalizePersona(name, domain, json, meta) {
  return {
    name,
    domain,
    bio: json.bio || `${name} is a voice in ${domain}.`,
    tone: json.tone || "measured, precise, mildly skeptical of hype",
    style: json.style || "short sentences, concrete detail, no corporate speak",
    stances: Array.isArray(json.stances) && json.stances.length ? json.stances : [
      `Believes most "breakthroughs" in ${domain} are incremental`,
      "Values reproducibility over headlines",
    ],
    standards: Array.isArray(json.standards) && json.standards.length ? json.standards : [
      "Reject pure marketing/product announcements with no technical substance",
      "Reject topics that duplicate something already published",
    ],
    llmMode: meta.llmMode || "auto",
    language: meta.language || "English",
    toneChoice: meta.toneChoice || null,
  };
}

function templatePersona(name, domain, meta) {
  const preset = meta.tonePreset;
  return normalizePersona(name, domain, {
    bio: `${name} is an independent voice covering ${domain}, translating fast-moving developments into plain, opinionated analysis.`,
    tone: preset ? preset.tone : "measured, direct, mildly skeptical of hype",
    style: preset ? preset.style : "short sentences, concrete references, no buzzwords",
    stances: [
      `Most "breakthrough" headlines in ${domain} are incremental progress dressed up for engagement`,
      "Reproducibility and independent verification matter more than press releases",
      `Open, inspectable work in ${domain} deserves more attention than closed announcements`,
      "The interesting failures are usually more informative than the polished demos",
    ],
    standards: [
      "Reject pure product/marketing announcements with no technical substance",
      "Reject topics that duplicate something already published",
      "Prefer topics with a concrete artifact: a paper, a benchmark, a repo, an incident",
      "Reject vague trend pieces with no specific claim to engage with",
    ],
  }, meta);
}

// ---------- 2. Editorial judgment (runs each cycle) ----------

async function judgeTopics(persona, candidates, publishedTitles) {
  if (!candidates.length) {
    return { decision: "reject_all", reason: "No candidate topics were discovered this cycle." };
  }
  const mode = resolveMode(persona);
  if (getProvider(mode) === "template") {
    return templateJudge(persona, candidates, publishedTitles);
  }
  const system = `You are the editorial judgment module for an autonomous persona named
${persona.name} (${persona.domain}). Bio: ${persona.bio}
Editorial standards you strictly enforce:
${persona.standards.map((s) => `- ${s}`).join("\n")}
Stances that should influence what you find worth covering:
${persona.stances.map((s) => `- ${s}`).join("\n")}`;

  const user = `Previously published topics (avoid near-duplicates):
${publishedTitles.length ? publishedTitles.map((t) => `- ${t}`).join("\n") : "(none yet)"}

Candidate topics discovered this cycle:
${candidates.map((c, i) => `[${i}] "${c.title}" — ${c.summary} (source: ${c.source}, url: ${c.url})`).join("\n")}

Decide: publish exactly ONE topic that best meets the standards, or reject all of them
if none clear the bar. Explain "whySelected" and "whyRelevantNow" in English regardless
of the persona's post-writing language, since this rationale is for transparency to
the person/evaluator reviewing the feed. Return JSON:
{
  "decision": "publish" | "reject_all",
  "chosenIndex": <index into candidates, only if decision is "publish">,
  "whySelected": "why this topic over the others (only if publishing)",
  "whyRelevantNow": "why this matters right now (only if publishing)",
  "reason": "why rejecting all (only if decision is reject_all)"
}`;
  try {
    const json = await generateJson(system, user, { forced: mode });
    if (json.decision === "publish" && candidates[json.chosenIndex]) return json;
    if (json.decision === "reject_all") return json;
    return templateJudge(persona, candidates, publishedTitles);
  } catch (err) {
    console.error("[agentLogic] judgment failed, using template:", err.message);
    return templateJudge(persona, candidates, publishedTitles);
  }
}

const MARKETING_SIGNALS = ["launches", "unveils", "announces", "raises funding", "partners with", "named a leader", "platform for"];
const SUBSTANCE_SIGNALS = ["paper", "study", "benchmark", "vulnerability", "exploit", "attack", "technique", "flaw", "dataset", "open-source", "open source", "repo", "framework", "evaluation", "incident", "postmortem"];

function templateJudge(persona, candidates, publishedTitles) {
  const publishedSet = new Set(publishedTitles.map((t) => t.toLowerCase()));
  const fresh = candidates.filter((c) => !publishedSet.has(c.title.toLowerCase()));
  if (!fresh.length) {
    return { decision: "reject_all", reason: "All discovered topics duplicate previously published posts." };
  }
  const domainWords = persona.domain.toLowerCase().split(/\s+/);
  const scored = fresh.map((c) => {
    const t = c.title.toLowerCase();
    let score = 0;
    score += domainWords.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    if (c.source === "arXiv") score += 2; // a paper is a concrete artifact
    score += SUBSTANCE_SIGNALS.reduce((acc, w) => acc + (t.includes(w) ? 2 : 0), 0);
    score -= MARKETING_SIGNALS.reduce((acc, w) => acc + (t.includes(w) ? 3 : 0), 0);
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // If even the best-scoring candidate looks like pure marketing, reject the batch,
  // consistent with the persona's own standards.
  if (scored[0].score < 0) {
    return { decision: "reject_all", reason: "All discovered topics read as marketing/announcements with no technical substance, which fails this persona's editorial standards." };
  }

  const chosen = scored[0].c;
  const chosenIndex = candidates.indexOf(chosen);
  return {
    decision: "publish",
    chosenIndex,
    whySelected: `Selected over ${fresh.length - 1} other candidate(s) for having the clearest concrete angle on ${persona.domain}, per this persona's standard of preferring topics with a real artifact over vague trend pieces.`,
    whyRelevantNow: `Surfaced from ${chosen.source} in the current discovery cycle, indicating active discussion or a fresh publication right now.`,
  };
}

// ---------- 3. Post writing ----------

async function writePost(persona, topic, judgment) {
  const mode = resolveMode(persona);
  if (getProvider(mode) === "template") {
    return templatePost(persona, topic, judgment);
  }
  const language = persona.language || "English";
  const system = `You are ${persona.name}, ${persona.bio}
Tone: ${persona.tone}
Style: ${persona.style}
Stances you hold: ${persona.stances.join("; ")}
Write a single short social post (LinkedIn/X style, 60-120 words, first person,
no hashtags spam, at most 1 hashtag, no emoji unless it truly fits the voice).
${language !== "English" ? `Write the post entirely in ${language}.` : ""}`;
  const user = `Topic: "${topic.title}"
Summary: ${topic.summary}
Source: ${topic.source} (${topic.url})
Why you selected it: ${judgment.whySelected}
Why it's relevant now: ${judgment.whyRelevantNow}

Write the post now. Return plain text only, no JSON, no quotation marks around it.`;
  try {
    const text = await generate(system, user, { forced: mode });
    return text.trim();
  } catch (err) {
    console.error("[agentLogic] post writing failed, using template:", err.message);
    return templatePost(persona, topic, judgment);
  }
}

function templatePost(persona, topic, judgment) {
  const stance = persona.stances[Math.floor(Math.random() * persona.stances.length)];
  const languageNote = persona.language && persona.language !== "English"
    ? `\n\n[Template mode can't translate — add an API key in .env for posts in ${persona.language}.]`
    : "";
  return `${topic.title}

${topic.summary} Worth a second look: ${judgment.whyRelevantNow}

My take, consistent with where I've landed on ${persona.domain} — ${stance.toLowerCase()}

Source: ${topic.source}${languageNote}`;
}

module.exports = { buildPersona, judgeTopics, writePost };
