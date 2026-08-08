// llm.js
// Thin wrapper so the rest of the app doesn't care which provider (or no
// provider) is configured. Returns parsed JSON when json:true is passed.

// Resolve which provider to use. `forced` (from a persona's chosen mode) can be
// "anthropic" | "openai" | "template" | "auto"/undefined. If a forced provider's
// key isn't actually configured, we fall through to auto-detection rather than
// silently failing — the resolved mode is what callers should display to the user.
function getProvider(forced) {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (forced === "anthropic" && hasAnthropic) return "anthropic";
  if (forced === "openai" && hasOpenAI) return "openai";
  if (forced === "template") return "template";
  if (hasAnthropic) return "anthropic";
  if (hasOpenAI) return "openai";
  return "template";
}

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in LLM output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callAnthropic(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

async function callOpenAI(system, user) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// generate: returns raw text
async function generate(system, user, opts = {}) {
  const provider = getProvider(opts.forced);
  if (provider === "anthropic") return callAnthropic(system, user);
  if (provider === "openai") return callOpenAI(system, user);
  throw new Error("No LLM provider configured; caller should use fallback path");
}

// generateJson: returns parsed JSON, retries once on parse failure
async function generateJson(system, user, opts = {}) {
  const sys = `${system}\n\nRespond with ONLY a single valid JSON object. No prose, no markdown fences, no preamble.`;
  const raw = await generate(sys, user, opts);
  try {
    return extractJson(raw);
  } catch {
    const retry = await generate(
      sys + "\nYour previous response was not valid JSON. Try again — JSON ONLY.",
      user,
      opts
    );
    return extractJson(retry);
  }
}

module.exports = { generate, generateJson, getProvider };
