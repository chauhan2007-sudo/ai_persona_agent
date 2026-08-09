# AI Usage Log

This project was built end-to-end in conversation with Claude (Anthropic).
Below is a chronological log of the prompts/requests that drove development,
summarized from the actual conversation.

---

**1. Initial brief**
Pasted the full hackathon problem statement (autonomous AI/tech persona,
topic discovery, editorial judgment, memory, autonomous publishing,
`POST /api/agent/init` + `GET /api/agent/feed` contract) and asked for help
building it as a "purely vibe coding" project.

**2. Stack decision**
Confirmed: Node.js + Express, local-first (deploy later), no LLM API key
committed yet (either Anthropic or OpenAI, or none).

**3. Initial build**
Requested a working implementation. Built:
- `server.js` — the two required endpoints
- `agentLogic.js` — persona generation, editorial judgment, post writing
- `topicSources.js` — live topic discovery via Hacker News (Algolia API) and
  arXiv (no API key required for either)
- `scheduler.js` — the autonomy loop (`setInterval` per agent)
- `memory.js` — JSON-file persistence
- `llm.js` — Anthropic/OpenAI wrapper with a deterministic "template mode"
  fallback so the app works with zero API keys configured

During this build, a bug was caught and fixed: the no-key fallback editorial
judgment logic was initially scoring a marketing-style headline higher than
a technically substantive one — directly contradicting the persona's own
stated editorial standards. Fixed with explicit marketing/substance keyword
signals and verified with a targeted test.

**4. "Tell me what you have created" / frontend request**
Asked for a summary of the build, then requested a frontend + backend that
could run on localhost. Added a full dashboard (`public/index.html`,
`app.js`, `styles.css`) served by the same Express app — persona init form,
live persona card, auto-polling dispatch feed, countdown to next cycle.

**5. Local run troubleshooting**
Walked through `npm`/Node install issues, `npm install`, and confirming the
dashboard rendered correctly via screenshots.

**6. Hackathon rules recap + compliance check**
Asked me to recall the full rule set, then specifically asked whether the
build honored the "Out of Scope" list (no real social posting, no
multi-platform, no images/video, no engagement analytics, no multi-agent
architecture, no human intervention after init).

**7. Removed human-intervention risk**
On review, a "Run cycle now" demo button (and its backend route) was
identified as a potential ambiguity around "no human intervention after
init," even though the evaluator would never call it. Requested it be
stripped out entirely — removed from both `public/app.js`/`index.html` and
`server.js`.

**8. Feature request: domain/tone/language/mode dropdowns + multi-persona tabs**
Requested five UI/UX additions: a categorized domain dropdown with a custom
"type your own" option, a tone preset selector, a language selector, an
LLM-engine ("mode") selector, and a "+" button to run multiple personas.
Each was checked against the hackathon rules before building — specifically,
multiple personas were implemented as fully **independent** agents (separate
`init`/`feed` pairs), explicitly *not* a collaborating multi-agent system,
since the brief lists multi-agent architectures under Out of Scope.
Backend changes: `llm.js` and `agentLogic.js` extended to accept optional
`tone`/`language`/`mode` fields (all backward-compatible — a plain
`{name, domain}` init call behaves identically to before).

**9. UI refinement**
Requested smaller dropdown arrows and the "Other — type your own" option
moved to the top of each dropdown's option list (without changing the
default selected value).

**10. Deployment**
Asked to deploy to a free host. Discussed trade-offs between Render
(persistent process, required for the `setInterval` autonomy loop) vs.
Vercel (serverless, would need an external cron trigger + external database
to work at all — confirmed via live web search on Vercel's current Hobby-tier
cron limits). Chose Render. Added a resilience fix in `server.js` so that if
the host sleeps/restarts, any already-initialized agent's publishing loop
automatically resumes on boot, rather than silently stopping. Walked through
GitHub repo creation, git init/commit/push, and the full Render Web Service
setup (build/start commands, env vars, free-tier sleep behavior).

**11. Keeping the deployment awake**
Set up UptimeRobot to ping `/api/status` every 5 minutes so the Render free
instance doesn't sleep during the 48-hour evaluation window.

**12. Live verification**
Ran `curl` against the deployed `/api/agent/init` and `/api/agent/feed`
endpoints directly on the live Render URL to confirm real autonomous
publishing (topic discovery → editorial rejection of a marketing candidate
in favor of a substantive one → written post with rationale + sources),
including confirming a second, different dispatch appeared later with no
manual intervention and no repeated topic.

**13. UI polish pass**
Requested the interface look "simple but a little attractive." Added: a
persona avatar (initials in a circular badge), a domain badge with a
category icon, elevated/rounded dispatch cards with hover states, pill-style
source links, a redesigned pill-shaped tab bar, a themed scrollbar, and a
dashed-border empty state — without changing any backend logic or the
required API contract.

---

All architecture decisions, trade-offs (e.g. Render vs. Vercel, template-mode
fallback design, multi-persona independence vs. collaboration), and rule
compliance checks were discussed and reasoned through in conversation before
implementation, not generated blind from the brief alone.
