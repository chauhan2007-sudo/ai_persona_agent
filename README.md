# Autonomous AI Persona Agent

An autonomous AI/tech persona that discovers topics from live sources, exercises
editorial judgment, writes in a consistent voice, remembers what it's published,
and keeps publishing over time with zero human input after initialization.

## Quick start

```bash
npm install
cp .env.example .env
# optional: put ANTHROPIC_API_KEY or OPENAI_API_KEY in .env for real LLM writing.
# leave both blank to run in "template mode" (deterministic, no API calls) — the
# whole pipeline (discovery -> judgment -> writing -> memory -> feed) still works.
npm start
```

Server starts on `http://localhost:3000` — open that URL in a browser for the
**dashboard UI** (init form, live persona card, auto-refreshing dispatch feed).
The same Express server also serves the raw JSON API below.

### Dashboard

`public/index.html` + `app.js` + `styles.css` — a "newsroom wire desk" UI:

- **Persona name** — free text.
- **Domain / beat** — categorized dropdown (AI Security, ML Engineering, Robotics,
  AI Ethics, Developer Advocacy, AI Product, Open Source), or pick "Other" to
  type any domain freely.
- **Tone** — optional preset (Motivational, Professional, Funny, Formal,
  Informal, Sarcastic, Analytical, Casual) that shapes the persona's voice at
  generation time. Leave on "Auto" to let the persona invent its own tone.
- **Language** — pick from common languages or "Other" to type your own.
  Honesty note: this only works with a real LLM key configured. In template
  (no-key) mode there's no translation engine, so posts stay in English and
  the app tells you so rather than faking a translation.
- **Writing engine (mode)** — force Claude, OpenAI, or offline template mode,
  or leave it on Auto to use whichever key is present in `.env`. If you force
  an engine that has no key configured, it quietly falls back to template
  mode rather than erroring.
- **`+` tab** — spin up another, fully independent persona side by side for
  your own comparison/testing. Each one is a completely separate `init`/`feed`
  pair with its own agentId — they never read or influence each other. This
  is a deliberate design choice, not a shortcut: the hackathon brief lists
  "multi-agent architectures" under **Out of Scope**, and coordinating
  personas would blur the "one coherent identity" requirement the judges are
  scoring. So the `+` button gives you N independent single-agent instances,
  never N agents "working together."

None of the above touches the required API contract. A plain evaluator call —
`POST /api/agent/init` with just `{"persona": {"name": ..., "domain": ...}}`
— behaves exactly as before: tone/language/mode all default sensibly
(Auto / English / Auto) when omitted.

### Try it via curl (same API the dashboard uses)

```bash
# 1. Initialize (called exactly once)
curl -X POST http://localhost:3000/api/agent/init \
  -H "Content-Type: application/json" \
  -d '{"persona": {"name": "Ada", "domain": "AI Security"}}'
# -> {"agentId": "..."}

# Optional extended fields (all optional — evaluator never sends these):
curl -X POST http://localhost:3000/api/agent/init \
  -H "Content-Type: application/json" \
  -d '{"persona": {"name": "Riya", "domain": "AI Product", "tone": "motivational", "language": "Hindi", "mode": "anthropic"}}'

# 2. Poll the feed (this is the ONLY endpoint the evaluator calls after init)
curl "http://localhost:3000/api/agent/feed?agentId=<agentId>"
```

Right after init the feed will be `{"posts": []}` — the first cycle runs after
`FIRST_CYCLE_DELAY_MS` (default 15s), then cycles repeat every
`CYCLE_INTERVAL_MS` (default 2 min, jittered ±25%) for as long as the process
stays alive. Turn `CYCLE_INTERVAL_MS` down to `20000` or so in `.env` while
developing so you're not waiting minutes between posts.

Two extra (non-spec) endpoints for demoing/inspection — neither one publishes
anything or advances the schedule, so they don't count as human intervention:
- `GET /api/agent/debug?agentId=...` — inspect the generated persona.
- `GET /api/status` — basic server/mode health check.

## How it maps to the requirements

| Requirement | Implementation |
|---|---|
| Topic discovery | `topicSources.js` pulls live results from the Hacker News (Algolia) search API and the arXiv Atom feed API — both public, no key required, filtered by the persona's domain. |
| Editorial judgment | `agentLogic.js:judgeTopics` — the LLM (or a keyword-based fallback) scores candidates against the persona's own stated standards and can reject an entire batch. |
| Consistent persona | `agentLogic.js:buildPersona` invents a bio/tone/style/stances/standards **once**, at init, from the given name+domain, and stores it; every later judgment and post generation call is conditioned on that same stored persona. |
| Memory | `memory.js` (JSON-file store) keeps every published post and topic title/key; each cycle's prompt is given the list of previously published titles to avoid repeats. |
| Autonomous publishing over time | `scheduler.js` — `init` starts a `setTimeout`/`setInterval` loop scoped to that `agentId`. It keeps firing on its own; no further HTTP calls are needed to produce new posts. |
| Publishing rationale | Every stored post includes `rationale` (why selected + why relevant now, from the judgment step) and `sources` (the source URL(s) used). |

## Deploying (free hosting)

This app needs a host that keeps a **persistent Node process** alive — not a
serverless/functions platform — because the autonomy mechanism is a
`setInterval` loop living inside the running process. Serverless platforms
(Vercel/Netlify functions) would kill that loop between requests, breaking
the "publish over time with no further input" requirement.

**Recommended: [Render](https://render.com) free Web Service** — genuinely
free, no credit card, runs a real persistent Node process.

### Steps

1. **Push this project to GitHub** (Render deploys from a git repo):
   ```bash
   cd ai-persona-agent
   git init
   git add .
   git commit -m "AI persona agent"
   # create an empty repo on github.com first, then:
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```

2. Go to [render.com](https://render.com) → sign up (GitHub login is fastest)
   → **New +** → **Web Service** → connect the repo you just pushed.

3. Fill in:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

4. Under **Environment**, add (only what you actually have):
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — optional, leave unset to run in template mode
   - `CYCLE_INTERVAL_MS` — e.g. `2700000` (45 min) so a 48hr window yields a
     reasonable ~60+ posts; tune to taste
   - `FIRST_CYCLE_DELAY_MS` — e.g. `30000`
   - You do **not** need to set `PORT` — Render sets it automatically and
     `server.js` already reads `process.env.PORT`.

5. Click **Create Web Service**. First deploy takes a couple of minutes.
   You'll get a public URL like `https://your-app-name.onrender.com`.

6. Test it exactly like the evaluator will:
   ```bash
   curl -X POST https://your-app-name.onrender.com/api/agent/init \
     -H "Content-Type: application/json" \
     -d '{"persona": {"name": "Ada", "domain": "AI Security"}}'

   curl "https://your-app-name.onrender.com/api/agent/feed?agentId=<agentId>"
   ```
   The dashboard is also live at the root URL if you want to watch it visually.

### One honest caveat about the free tier

Render's free Web Services **sleep after ~15 minutes with no incoming HTTP
requests**, and wake on the next request (with a ~30-60s cold-start delay).
While asleep, the publishing timer is paused — not lost, just paused; the
`[boot] resuming publishing loops...` logic in `server.js` automatically
resumes any existing agent's loop the moment the process wakes back up.

To avoid gaps entirely during your 48hr evaluation window, set up a free
uptime pinger to hit your app every 5-10 minutes so it never sleeps:
- [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org)
  (both free) → monitor `https://your-app-name.onrender.com/api/status`
  every 5 minutes.

This is a legitimate keep-alive ping, not a form of "human intervention" in
the hackathon sense — it never touches `/init` or influences what gets
published, it just prevents the host from sleeping.

### Alternatives if Render doesn't work for you

- **Fly.io** — free allowance, also runs a real persistent process, but
  requires a credit card on file (not charged on the free tier).
- **Railway** — free trial credit rather than a permanent free tier; fine
  for a 48hr evaluation window specifically.

Avoid Vercel, Netlify, and Cyclic for this project — they're serverless and
will not keep the `setInterval` loop alive between requests.


- **Persistence vs. schedule**: post data survives a server restart (JSON
  file). The `setInterval` loop itself is re-established automatically on
  boot for any agent already in the store (see `server.js` startup block) —
  this specifically covers free-host sleep/wake cycles during a long
  evaluation window.
- **Template mode**: with no LLM key configured, persona generation, editorial
  judgment, and post writing all fall back to deterministic logic (see
  `agentLogic.js`) instead of failing. This means the full pipeline is
  demoable immediately; add a key later for meaningfully better writing.
- **Sources**: only two are wired up (HN + arXiv) but `topicSources.js` is a
  narrow, single-purpose module — adding a third live source is a ~15 line
  addition (fetch + map to `{title, summary, url, source}`).
