const SLOTS_KEY = "aiPersonaAgentSlots"; // array of {agentId, label}

const els = {
  liveDot: document.getElementById("liveDot"),
  modeStat: document.getElementById("modeStat"),
  nextScanStat: document.getElementById("nextScanStat"),
  tabbar: document.getElementById("tabbar"),

  initForm: document.getElementById("initForm"),
  nameInput: document.getElementById("nameInput"),
  domainSelect: document.getElementById("domainSelect"),
  domainCustomInput: document.getElementById("domainCustomInput"),
  toneSelect: document.getElementById("toneSelect"),
  languageSelect: document.getElementById("languageSelect"),
  languageCustomInput: document.getElementById("languageCustomInput"),
  modeSelect: document.getElementById("modeSelect"),
  initBtn: document.getElementById("initBtn"),
  initHint: document.getElementById("initHint"),

  personaCard: document.getElementById("personaCard"),
  stampMode: document.getElementById("stampMode"),
  personaName: document.getElementById("personaName"),
  personaDomain: document.getElementById("personaDomain"),
  personaBio: document.getElementById("personaBio"),
  personaTone: document.getElementById("personaTone"),
  personaStances: document.getElementById("personaStances"),
  personaStandards: document.getElementById("personaStandards"),
  agentIdOut: document.getElementById("agentIdOut"),
  agentLanguageRow: document.getElementById("agentLanguageRow"),
  agentLanguageOut: document.getElementById("agentLanguageOut"),
  agentToneRow: document.getElementById("agentToneRow"),
  agentToneOut: document.getElementById("agentToneOut"),
  resetBtn: document.getElementById("resetBtn"),

  feedEmpty: document.getElementById("feedEmpty"),
  feedList: document.getElementById("feedList"),
};

// ---------- state ----------
// slots: independently-run personas, each its own init()/feed() pair — never
// coordinated with each other (see README: multi-agent collaboration is out
// of scope for the hackathon on purpose).
let slots = loadSlots();
let activeAgentId = slots.length ? slots[0].agentId : null; // null = "composing a new one"
let cycleIntervalMs = 120000;
let lastCycleAt = null;
let knownPostIds = new Set();

function loadSlots() {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSlots() {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---------- tab bar ----------
function renderTabs() {
  const tabButtons = slots
    .map((s) => {
      const active = s.agentId === activeAgentId;
      return `
        <button class="tab ${active ? "active" : ""}" data-agent-id="${s.agentId}">
          ${escapeHtml(s.label || "Untitled")}
          <span class="tab-close" data-close-id="${s.agentId}" title="Forget this persona">✕</span>
        </button>
      `;
    })
    .join("");
  els.tabbar.innerHTML = `${tabButtons}<button class="tab-add" id="addTabBtn" title="Add another independent persona">+</button>`;

  els.tabbar.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (e.target.classList.contains("tab-close")) return; // handled separately
      switchToAgent(btn.dataset.agentId);
    });
  });
  els.tabbar.querySelectorAll(".tab-close").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      forgetAgent(btn.dataset.closeId);
    });
  });
  document.getElementById("addTabBtn").addEventListener("click", () => {
    switchToAgent(null);
  });
}

function switchToAgent(agentId) {
  activeAgentId = agentId;
  knownPostIds = new Set();
  if (agentId === null) {
    showInitForm();
  } else {
    showPersonaLoadingThenLoad();
  }
  renderTabs();
}

function forgetAgent(agentId) {
  slots = slots.filter((s) => s.agentId !== agentId);
  saveSlots();
  if (activeAgentId === agentId) {
    activeAgentId = slots.length ? slots[0].agentId : null;
  }
  renderTabs();
  if (activeAgentId === null) {
    showInitForm();
  } else {
    showPersonaLoadingThenLoad();
  }
}

// ---------- domain / language "other" reveal ----------
els.domainSelect.addEventListener("change", () => {
  els.domainCustomInput.classList.toggle("hidden", els.domainSelect.value !== "__other__");
  if (els.domainSelect.value === "__other__") els.domainCustomInput.focus();
});
els.languageSelect.addEventListener("change", () => {
  els.languageCustomInput.classList.toggle("hidden", els.languageSelect.value !== "__other__");
  if (els.languageSelect.value === "__other__") els.languageCustomInput.focus();
});

function currentDomainValue() {
  if (els.domainSelect.value === "__other__") {
    return els.domainCustomInput.value.trim() || "AI Technology";
  }
  return els.domainSelect.value;
}
function currentLanguageValue() {
  if (els.languageSelect.value === "__other__") {
    return els.languageCustomInput.value.trim() || "English";
  }
  return els.languageSelect.value;
}

// ---------- form / persona / feed rendering ----------
function showInitForm() {
  els.initForm.classList.remove("hidden");
  els.personaCard.classList.add("hidden");
  els.initHint.textContent = "";
  els.initHint.classList.remove("error");
  els.modeStat.textContent = "mode: —";
  els.nextScanStat.textContent = "no agent yet";
  els.liveDot.classList.remove("active");
  els.feedEmpty.classList.remove("hidden");
  els.feedEmpty.textContent = "No dispatches yet. Initialize an agent on the left — the first dispatch lands shortly after, then the desk keeps filing on its own.";
  els.feedList.innerHTML = "";
}

function renderPersona(agent) {
  els.initForm.classList.add("hidden");
  els.personaCard.classList.remove("hidden");
  els.stampMode.textContent = agent.llmMode === "template" ? "TEMPLATE MODE" : `${agent.llmMode.toUpperCase()} MODE`;
  els.personaName.textContent = agent.persona.name;
  els.personaDomain.textContent = agent.persona.domain;
  els.personaBio.textContent = agent.persona.bio;
  els.personaTone.textContent = `${agent.persona.tone} — ${agent.persona.style}`;
  els.personaStances.innerHTML = agent.persona.stances.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  els.personaStandards.innerHTML = agent.persona.standards.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  els.agentIdOut.textContent = agent.agentId;

  if (agent.persona.language && agent.persona.language !== "English") {
    els.agentLanguageRow.classList.remove("hidden");
    els.agentLanguageOut.textContent = agent.persona.language;
  } else {
    els.agentLanguageRow.classList.add("hidden");
  }
  if (agent.persona.toneChoice) {
    els.agentToneRow.classList.remove("hidden");
    els.agentToneOut.textContent = agent.persona.toneChoice;
  } else {
    els.agentToneRow.classList.add("hidden");
  }

  els.modeStat.textContent = `mode: ${agent.llmMode}`;
  els.liveDot.classList.add("active");
  cycleIntervalMs = agent.cycleIntervalMs;
  lastCycleAt = agent.lastCycleAt;

  // keep tab label in sync with the generated persona name
  const slot = slots.find((s) => s.agentId === agent.agentId);
  if (slot && slot.label !== agent.persona.name) {
    slot.label = agent.persona.name;
    saveSlots();
    renderTabs();
  }
}

function renderFeed(posts) {
  if (!posts.length) {
    els.feedEmpty.classList.remove("hidden");
    els.feedEmpty.textContent = "No dispatches yet. The desk is still on its first scan — check back shortly.";
    els.feedList.innerHTML = "";
    return;
  }
  els.feedEmpty.classList.add("hidden");
  els.feedList.innerHTML = posts
    .map((p, i) => {
      knownPostIds.add(p.id);
      return `
        <li class="dispatch">
          <div class="dispatch-meta"><span class="dot">●</span> ${fmtTime(p.createdAt)} <span>· dispatch ${posts.length - i}</span></div>
          <p class="dispatch-text">${escapeHtml(p.text)}</p>
          <div class="dispatch-rationale">
            <strong>Rationale</strong>
            ${escapeHtml(p.rationale)}
          </div>
          <div class="dispatch-sources">
            ${(p.sources || []).map((s) => {
              let host = s;
              try { host = new URL(s).hostname; } catch {}
              return `<a href="${s}" target="_blank" rel="noopener noreferrer">${host}</a>`;
            }).join(" · ")}
          </div>
        </li>
      `;
    })
    .join("");
}

// ---------- polling (only the active tab) ----------
async function pollFeed() {
  if (!activeAgentId) return;
  try {
    const res = await fetch(`/api/agent/feed?agentId=${activeAgentId}`);
    if (!res.ok) return;
    const data = await res.json();
    renderFeed(data.posts || []);
  } catch (err) {
    console.error("feed poll failed", err);
  }
}

async function pollDebug() {
  if (!activeAgentId) return;
  try {
    const res = await fetch(`/api/agent/debug?agentId=${activeAgentId}`);
    if (!res.ok) return;
    const data = await res.json();
    renderPersona(data);
  } catch (err) {
    console.error("debug poll failed", err);
  }
}

async function showPersonaLoadingThenLoad() {
  await pollDebug();
  await pollFeed();
}

function updateCountdown() {
  if (!activeAgentId) {
    els.nextScanStat.textContent = "no agent yet";
    return;
  }
  if (!lastCycleAt) {
    els.nextScanStat.textContent = "first scan pending…";
    return;
  }
  const elapsed = Date.now() - new Date(lastCycleAt).getTime();
  const remaining = Math.max(0, cycleIntervalMs - elapsed);
  const secs = Math.ceil(remaining / 1000);
  els.nextScanStat.textContent = remaining > 0 ? `next scan in ~${secs}s` : "scanning…";
}

// ---------- init a new agent ----------
async function initAgent() {
  const name = els.nameInput.value.trim() || "Ada";
  const domain = currentDomainValue();
  const tone = els.toneSelect.value || undefined;
  const language = currentLanguageValue();
  const mode = els.modeSelect.value || "auto";

  els.initBtn.disabled = true;
  els.initHint.textContent = "Contacting desk…";
  els.initHint.classList.remove("error");
  try {
    const res = await fetch("/api/agent/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: { name, domain, tone, language, mode } }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    slots.push({ agentId: data.agentId, label: name });
    saveSlots();
    activeAgentId = data.agentId;
    knownPostIds = new Set();
    renderTabs();
    await showPersonaLoadingThenLoad();
  } catch (err) {
    els.initHint.textContent = `Could not initialize: ${err.message}`;
    els.initHint.classList.add("error");
  } finally {
    els.initBtn.disabled = false;
  }
}

els.initBtn.addEventListener("click", initAgent);

els.resetBtn.addEventListener("click", () => {
  if (activeAgentId) forgetAgent(activeAgentId);
});

// ---------- boot ----------
(async function boot() {
  renderTabs();
  if (activeAgentId) {
    await showPersonaLoadingThenLoad();
  } else {
    showInitForm();
  }
  setInterval(pollFeed, 5000);
  setInterval(pollDebug, 5000);
  setInterval(updateCountdown, 1000);
})();
