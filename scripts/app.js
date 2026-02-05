/* Mas'alah App
   Features:
   - Routing via hash (#welcome, #home, etc.)
   - Warm transitions (leave + enter)
   - Daily quiz lock (deterministic, no reroll)
   - Progress + streaks (localStorage)
   - Quiz UX: timer, progress bar, keyboard shortcuts
   - Hijri calendar (English + Arabic Islamic month names), click reminders
   - Zakat calculator
   - Private diary (local only) + export
   - PIN lock for protected routes (Diary + Progress)
   - NEW: wrong questions bolded in Results
   - NEW: Prev navigation during quiz (review explanations)
   - NEW: Gurfah (local groups, chat, question set builder)
*/

const app = document.getElementById("app");

/* =======================
   LocalStorage keys
======================= */
const STORAGE_KEY = "masalah_progress_v1";
const DAILY_KEY = "masalah_daily_v1";
const DIARY_KEY = "masalah_diary_v1";

const LOCK_PIN_HASH_KEY = "masalah_pin_hash_v1";
const LOCK_UNLOCKED_UNTIL_KEY = "masalah_unlocked_until_v1";

const GURFAH_KEY = "masalah_gurfah_v1";

// protect what you want
const PROTECTED_ROUTES = new Set(["diary", "progress"]);

/* =======================
   Quiz State
======================= */
const state = {
  allQuestions: [],
  quizQuestions: [],
  index: 0,
  score: 0,
  timed: true,
  secondsPerQuestion: 20,
  timerId: null,
  timeLeft: 20,
  lastSettings: null, // { category, level, timed, count, mode: "normal"|"daily" }
  isNavigating: false,
  currentRoute: "welcome",

  answered: false,
  correctIdx: null,

  intendedRoute: null,

  // Gurfah
  gurfah: {
    activeGroupId: null,
    activeTab: "chat", // "chat" | "sets"
  },
};

/* =======================
   Date helpers
======================= */
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISODate() {
  return todayISO();
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* =======================
   Progress storage
======================= */
function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { streakCount: 0, lastActiveDate: null, bestScores: {}, lastAttempt: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      streakCount: parsed.streakCount ?? 0,
      lastActiveDate: parsed.lastActiveDate ?? null,
      bestScores: parsed.bestScores ?? {},
      lastAttempt: parsed.lastAttempt ?? null,
    };
  } catch {
    return { streakCount: 0, lastActiveDate: null, bestScores: {}, lastAttempt: null };
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function updateStreak(progress) {
  const today = todayISO();
  const last = progress.lastActiveDate;

  if (!last) {
    progress.streakCount = 1;
    progress.lastActiveDate = today;
    return;
  }
  if (last === today) return;

  const diffDays = Math.round((new Date(today) - new Date(last)) / (1000 * 60 * 60 * 24));
  progress.streakCount = diffDays === 1 ? progress.streakCount + 1 : 1;
  progress.lastActiveDate = today;
}

/* =======================
   Questions data
======================= */
async function loadQuestions() {
  if (state.allQuestions.length) return state.allQuestions;

  const res = await fetch("data/questions.json");
  if (!res.ok) throw new Error("Could not load data/questions.json");
  state.allQuestions = await res.json();
  return state.allQuestions;
}

function pickRandom(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/* =======================
   Deterministic helpers
======================= */
function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function seededShuffle(arr, seedStr) {
  const copy = [...arr];
  let seed = hashStringToInt(seedStr);

  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* =======================
   Daily quiz (no reroll)
======================= */
function loadDailyState() {
  const raw = localStorage.getItem(DAILY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDailyState(daily) {
  localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
}

async function getOrCreateDailyQuiz(category, level, count) {
  const today = todayISO();
  const existing = loadDailyState();

  if (
    existing &&
    existing.date === today &&
    existing.category === category &&
    existing.level === level &&
    existing.count === count &&
    Array.isArray(existing.questionIds) &&
    existing.questionIds.length
  ) {
    return existing;
  }

  const all = await loadQuestions();
  const pool = all.filter((q) => q.category === category && q.level === level);

  if (!pool.length) {
    const empty = { date: today, category, level, count, questionIds: [] };
    saveDailyState(empty);
    return empty;
  }

  const seed = `masalah_daily_${today}_${category}_${level}`;
  const shuffled = seededShuffle(pool, seed);
  const chosen = shuffled.slice(0, Math.min(count, shuffled.length));
  const questionIds = chosen.map((q) => q.id);

  const daily = { date: today, category, level, count, questionIds };
  saveDailyState(daily);
  return daily;
}

function buildQuestionsByIds(all, ids) {
  const map = new Map(all.map((q) => [q.id, q]));
  const ordered = [];
  for (const id of ids) {
    const q = map.get(id);
    if (q) ordered.push(q);
  }
  return ordered;
}

/* =======================
   Timer
======================= */
function clearTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  clearTimer();
  state.timeLeft = state.secondsPerQuestion;

  const timeEl = document.getElementById("timeLeft");
  const barEl = document.getElementById("timeBar");
  const total = state.secondsPerQuestion;

  state.timerId = setInterval(() => {
    state.timeLeft -= 1;

    if (timeEl) timeEl.textContent = String(state.timeLeft);
    if (barEl) barEl.style.width = `${(state.timeLeft / total) * 100}%`;

    if (state.timeLeft <= 0) {
      clearTimer();
      showFeedback(null, { reason: "timeout" });
    }
  }, 1000);
}

/* =======================
   Haptics
======================= */
function vibrate(pattern) {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

/* =======================
   Toast
======================= */
let toastTimer = null;

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

/* =======================
   Icons (inline SVG)
======================= */
function icon(name) {
  const common =
    `fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"`;

  const wrap = (paths) =>
    `<span class="i"><svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg></span>`;

  switch (name) {
    case "spark":
      return wrap(
        `<path ${common} d="M12 2l1.2 4.2L17.4 8 13.2 9.2 12 13.4 10.8 9.2 6.6 8l4.2-1.8L12 2z"/>` +
          `<path ${common} d="M19 13l.7 2.5L22 16l-2.3.5L19 19l-.7-2.5L16 16l2.3-.5L19 13z"/>`
      );
    case "bolt":
      return wrap(`<path ${common} d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>`);
    case "target":
      return wrap(
        `<circle ${common} cx="12" cy="12" r="8"/>` +
          `<circle ${common} cx="12" cy="12" r="3"/>` +
          `<path ${common} d="M12 2v2M12 20v2M2 12h2M20 12h2"/>`
      );
    case "calendar":
      return wrap(
        `<path ${common} d="M8 2v3M16 2v3"/>` +
          `<path ${common} d="M4 7h16"/>` +
          `<path ${common} d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>`
      );
    case "trophy":
      return wrap(
        `<path ${common} d="M8 21h8"/>` +
          `<path ${common} d="M12 17v4"/>` +
          `<path ${common} d="M7 4h10v4a5 5 0 0 1-10 0V4z"/>` +
          `<path ${common} d="M7 6H4a2 2 0 0 0 2 4h1"/>` +
          `<path ${common} d="M17 6h3a2 2 0 0 1-2 4h-1"/>`
      );
    case "shield":
      return wrap(
        `<path ${common} d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z"/>` +
          `<path ${common} d="M9 12l2 2 4-5"/>`
      );
    case "book":
      return wrap(
        `<path ${common} d="M4 19a2 2 0 0 0 2 2h12"/>` +
          `<path ${common} d="M6 3h12v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>` +
          `<path ${common} d="M8 7h6"/>`
      );
    case "layers":
      return wrap(
        `<path ${common} d="M12 2l9 5-9 5-9-5 9-5z"/>` +
          `<path ${common} d="M3 12l9 5 9-5"/>` +
          `<path ${common} d="M3 17l9 5 9-5"/>`
      );
    case "check":
      return wrap(`<path ${common} d="M20 6L9 17l-5-5"/>`);
    case "users":
      return wrap(
        `<path ${common} d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0z"/>` +
          `<path ${common} d="M3 22a9 9 0 0 1 18 0"/>`
      );
    case "chat":
      return wrap(
        `<path ${common} d="M21 11.5a8 8 0 0 1-8 8H7l-4 3 1.2-4.6A8 8 0 1 1 21 11.5z"/>`
      );
    case "plus":
      return wrap(`<path ${common} d="M12 5v14M5 12h14"/>`);
    case "download":
      return wrap(
        `<path ${common} d="M12 3v12"/>` +
          `<path ${common} d="M7 10l5 5 5-5"/>` +
          `<path ${common} d="M5 21h14"/>`
      );
    case "upload":
      return wrap(
        `<path ${common} d="M12 21V9"/>` +
          `<path ${common} d="M7 14l5-5 5 5"/>` +
          `<path ${common} d="M5 3h14"/>`
      );
    case "trash":
      return wrap(
        `<path ${common} d="M3 6h18"/>` +
          `<path ${common} d="M8 6V4h8v2"/>` +
          `<path ${common} d="M6 6l1 16h10l1-16"/>`
      );
    default:
      return wrap(`<circle ${common} cx="12" cy="12" r="9"/>`);
  }
}

/* =======================
   Nav active state
======================= */
function setActiveNav(route) {
  document.querySelectorAll(".nav-btn[data-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === route);
  });
}

/* =======================
   Navigation helpers
======================= */
function go(route) {
  if (!route) return;
  window.location.hash = `#${route}`;
}

function bindGotoButtons() {
  app.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.goto));
  });
}

function bindNavRoutes() {
  document.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.route));
  });
}

/* =======================
   Screen transitions
======================= */
function beginTransition() {
  app.classList.add("screen");
  app.classList.add("is-leaving");
}
function endTransition() {
  app.classList.remove("is-leaving");
  app.classList.add("screen");
}
function withTransition(fn) {
  clearTimer();
  beginTransition();
  setTimeout(() => {
    fn();
    endTransition();
  }, 180);
}

/* =======================
   Keyboard support
======================= */
function handleQuizKeys(e) {
  if (state.currentRoute !== "quiz") return;

  const key = (e.key || "").toLowerCase();
  const isTyping =
    e.target &&
    (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);

  if (isTyping) return;

  if (key === "enter") {
    const nextBtn = document.getElementById("nextBtn");
    if (nextBtn && nextBtn.style.display !== "none") {
      e.preventDefault();
      nextBtn.click();
    }
    return;
  }

  const map = { a: 0, b: 1, c: 2, d: 3 };
  if (key in map) {
    const idx = map[key];
    const btn = document.querySelector(`.optionBtn[data-idx="${idx}"]`);
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  }
}

function bindGlobalKeyboard() {
  window.addEventListener("keydown", handleQuizKeys);
}

/* =======================
   PIN Lock (Local)
======================= */
function nowMs() {
  return Date.now();
}

function isUnlocked() {
  const until = Number(localStorage.getItem(LOCK_UNLOCKED_UNTIL_KEY) || "0");
  return nowMs() < until;
}

function lockNow() {
  localStorage.removeItem(LOCK_UNLOCKED_UNTIL_KEY);
}

function hasPin() {
  return !!localStorage.getItem(LOCK_PIN_HASH_KEY);
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function setPin(pin) {
  const hash = await sha256Hex(pin);
  localStorage.setItem(LOCK_PIN_HASH_KEY, hash);
  localStorage.setItem(LOCK_UNLOCKED_UNTIL_KEY, String(nowMs() + 30 * 60 * 1000));
}

async function verifyPin(pin) {
  const saved = localStorage.getItem(LOCK_PIN_HASH_KEY);
  if (!saved) return false;
  const hash = await sha256Hex(pin);
  return hash === saved;
}

function requireUnlock(route) {
  if (!PROTECTED_ROUTES.has(route)) return false;
  if (!hasPin()) return true;
  return !isUnlocked();
}

/* =======================
   GURFAH (Local community hub)
   - Groups
   - Chat inside group
   - Question set builder inside group
======================= */
function gurfahDefaultState() {
  return {
    profile: { displayName: "Guest" },
    groups: [],
  };
}

function loadGurfah() {
  try {
    const raw = localStorage.getItem(GURFAH_KEY);
    if (!raw) return gurfahDefaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return gurfahDefaultState();

    const profile = parsed.profile && typeof parsed.profile === "object" ? parsed.profile : {};
    const displayName = String(profile.displayName || "Guest").trim() || "Guest";

    const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
    return {
      profile: { displayName },
      groups,
    };
  } catch {
    return gurfahDefaultState();
  }
}

function saveGurfah(data) {
  localStorage.setItem(GURFAH_KEY, JSON.stringify(data));
}

function uid(prefix = "id") {
  const base =
    crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
  return `${prefix}_${base}`;
}

function findGroup(data, groupId) {
  return data.groups.find((g) => g.id === groupId) || null;
}

function ensureActiveGroup(data) {
  if (data.groups.length === 0) return null;
  if (state.gurfah.activeGroupId && findGroup(data, state.gurfah.activeGroupId)) {
    return state.gurfah.activeGroupId;
  }
  state.gurfah.activeGroupId = data.groups[0].id;
  return state.gurfah.activeGroupId;
}

function exportJsonDownload(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderGurfah() {
  state.currentRoute = "gurfah";

  const data = loadGurfah();
  ensureActiveGroup(data);

  const active = state.gurfah.activeGroupId ? findGroup(data, state.gurfah.activeGroupId) : null;
  const tab = state.gurfah.activeTab || "chat";

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0; display:flex; align-items:center; gap:10px;">
            ${icon("users")} Gurfah
          </h2>
          <p class="muted" style="margin:8px 0 0 0; line-height:1.6;">
            Groups, chat, and question sets. Local-only for now. Export and move it later.
          </p>
        </div>

        <div class="card" style="box-shadow:none; padding:12px; min-width:min(380px, 100%);">
          <div class="grid" style="gap:10px;">
            <label class="field" style="margin:0;">
              <span>Your display name</span>
              <input id="gf_name" type="text" value="${escapeHtml(data.profile.displayName)}" placeholder="Your name" />
            </label>

            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button id="gf_export" class="btn" type="button">
                <span class="btn-inner">${icon("download")}Export</span>
              </button>
              <button id="gf_import" class="btn" type="button">
                <span class="btn-inner">${icon("upload")}Import</span>
              </button>
              <button id="gf_reset" class="btn" type="button">
                <span class="btn-inner">${icon("trash")}Reset</span>
              </button>
            </div>

            <p class="muted" style="margin:0; font-size:12px;">
              Export saves your groups as JSON. Import restores them.
            </p>
          </div>
        </div>
      </div>

      <hr class="hr" />

      <div class="grid" style="grid-template-columns: 1fr 2fr; gap:12px;">
        <div class="card" style="box-shadow:none;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <h3 style="margin:0;">Groups</h3>
            <button id="gf_new_group" class="btn" type="button" title="New group">
              <span class="btn-inner">${icon("plus")}New</span>
            </button>
          </div>

          <div id="gf_group_list" style="margin-top:12px;">
            ${renderGurfahGroupList(data)}
          </div>
        </div>

        <div class="card" style="box-shadow:none;">
          ${
            active
              ? renderGurfahGroupPanel(active, tab, data.profile.displayName)
              : `
                <h3 style="margin:0;">No group yet</h3>
                <p class="muted" style="margin-top:8px; line-height:1.6;">
                  Create your first Gurfah group to start chatting and building question sets.
                </p>
                <button id="gf_make_first" class="primary" type="button" style="margin-top:10px;">
                  <span class="btn-inner">${icon("plus")}Create a group</span>
                </button>
              `
          }
        </div>
      </div>

      <div id="gf_notice" class="muted" style="margin-top:12px;"></div>
    </section>
  `;

  // widen layout on small screens
  if (window.innerWidth <= 900) {
    const grid = app.querySelector(".grid");
    if (grid) grid.style.gridTemplateColumns = "1fr";
  }

  // Profile name save
  const nameEl = app.querySelector("#gf_name");
  if (nameEl) {
    nameEl.addEventListener("change", () => {
      const fresh = loadGurfah();
      fresh.profile.displayName = (nameEl.value || "").trim() || "Guest";
      saveGurfah(fresh);
      showToast("Saved.");
    });
  }

  // Export
  const exportBtn = app.querySelector("#gf_export");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const fresh = loadGurfah();
      exportJsonDownload(fresh, `masalah-gurfah-${todayISODate()}.json`);
      showToast("Exported.");
    });
  }

  // Import (file picker)
  const importBtn = app.querySelector("#gf_import");
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const parsed = JSON.parse(text);

          // Validate minimal structure
          const next = gurfahDefaultState();
          if (parsed && typeof parsed === "object") {
            if (parsed.profile && typeof parsed.profile === "object") {
              next.profile.displayName = String(parsed.profile.displayName || "Guest").trim() || "Guest";
            }
            if (Array.isArray(parsed.groups)) {
              next.groups = parsed.groups;
            }
          }

          saveGurfah(next);
          state.gurfah.activeGroupId = null;
          state.gurfah.activeTab = "chat";
          withTransition(renderGurfah);
          showToast("Imported.");
        } catch {
          showToast("Import failed. Invalid JSON.");
        }
      };
      input.click();
    });
  }

  // Reset
  const resetBtn = app.querySelector("#gf_reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const ok = confirm("Reset Gurfah? This clears groups and chats on this device.");
      if (!ok) return;
      localStorage.removeItem(GURFAH_KEY);
      state.gurfah.activeGroupId = null;
      state.gurfah.activeTab = "chat";
      withTransition(renderGurfah);
      showToast("Reset.");
    });
  }

  // Create group buttons
  const newGroupBtn = app.querySelector("#gf_new_group");
  if (newGroupBtn) newGroupBtn.addEventListener("click", () => gfCreateGroupFlow());

  const makeFirstBtn = app.querySelector("#gf_make_first");
  if (makeFirstBtn) makeFirstBtn.addEventListener("click", () => gfCreateGroupFlow());

  function gfCreateGroupFlow() {
    const name = (prompt("Group name:") || "").trim();
    if (!name) return;

    const about = (prompt("Short description (optional):") || "").trim();

    const fresh = loadGurfah();
    const group = {
      id: uid("grp"),
      name,
      about,
      createdAt: Date.now(),
      messages: [],
      sets: [],
    };
    fresh.groups.unshift(group);
    saveGurfah(fresh);

    state.gurfah.activeGroupId = group.id;
    state.gurfah.activeTab = "chat";
    withTransition(renderGurfah);
    showToast("Group created.");
  }

  // Group list interactions
  app.querySelectorAll("[data-gf-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gid = btn.getAttribute("data-gf-open");
      state.gurfah.activeGroupId = gid;
      state.gurfah.activeTab = "chat";
      withTransition(renderGurfah);
    });
  });

  app.querySelectorAll("[data-gf-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const gid = btn.getAttribute("data-gf-del");
      const ok = confirm("Delete this group? This also deletes its chat and sets on this device.");
      if (!ok) return;

      const fresh = loadGurfah();
      fresh.groups = fresh.groups.filter((g) => g.id !== gid);
      saveGurfah(fresh);

      if (state.gurfah.activeGroupId === gid) state.gurfah.activeGroupId = null;
      withTransition(renderGurfah);
      showToast("Deleted.");
    });
  });

  // Panel interactions if active group exists
  if (active) {
    // Tab switch
    const chatTab = app.querySelector("#gf_tab_chat");
    const setsTab = app.querySelector("#gf_tab_sets");
    if (chatTab) {
      chatTab.addEventListener("click", () => {
        state.gurfah.activeTab = "chat";
        withTransition(renderGurfah);
      });
    }
    if (setsTab) {
      setsTab.addEventListener("click", () => {
        state.gurfah.activeTab = "sets";
        withTransition(renderGurfah);
      });
    }

    // Send chat
    const sendBtn = app.querySelector("#gf_send");
    const msgEl = app.querySelector("#gf_msg");
    if (sendBtn && msgEl) {
      const send = () => {
        const text = (msgEl.value || "").trim();
        if (!text) return;

        const fresh = loadGurfah();
        const g = findGroup(fresh, active.id);
        if (!g) return;

        g.messages = Array.isArray(g.messages) ? g.messages : [];
        g.messages.push({
          id: uid("msg"),
          name: (fresh.profile.displayName || "Guest").trim() || "Guest",
          text,
          ts: Date.now(),
        });

        saveGurfah(fresh);
        msgEl.value = "";
        withTransition(renderGurfah);
      };

      sendBtn.addEventListener("click", send);
      msgEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
    }

    // Clear chat
    const clearChatBtn = app.querySelector("#gf_clear_chat");
    if (clearChatBtn) {
      clearChatBtn.addEventListener("click", () => {
        const ok = confirm("Clear chat messages for this group?");
        if (!ok) return;
        const fresh = loadGurfah();
        const g = findGroup(fresh, active.id);
        if (!g) return;
        g.messages = [];
        saveGurfah(fresh);
        withTransition(renderGurfah);
        showToast("Chat cleared.");
      });
    }

    // Create new set
    const newSetBtn = app.querySelector("#gf_new_set");
    if (newSetBtn) {
      newSetBtn.addEventListener("click", () => {
        state.gurfah.activeTab = "sets";
        withTransition(() => renderGurfahSetBuilder(active.id));
      });
    }

    // Open set
    app.querySelectorAll("[data-gf-open-set]").forEach((b) => {
      b.addEventListener("click", () => {
        const setId = b.getAttribute("data-gf-open-set");
        withTransition(() => renderGurfahSetViewer(active.id, setId));
      });
    });

    // Delete set
    app.querySelectorAll("[data-gf-del-set]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const setId = b.getAttribute("data-gf-del-set");
        const ok = confirm("Delete this set?");
        if (!ok) return;

        const fresh = loadGurfah();
        const g = findGroup(fresh, active.id);
        if (!g) return;
        g.sets = Array.isArray(g.sets) ? g.sets : [];
        g.sets = g.sets.filter((s) => s.id !== setId);
        saveGurfah(fresh);
        withTransition(renderGurfah);
        showToast("Set deleted.");
      });
    });
  }
}

function renderGurfahGroupList(data) {
  if (!data.groups.length) {
    return `<p class="muted" style="margin:0;">No groups yet. Create one.</p>`;
  }

  const activeId = state.gurfah.activeGroupId;

  return `
    <div class="grid" style="gap:10px;">
      ${data.groups
        .map((g) => {
          const isActive = g.id === activeId;
          const about = (g.about || "").trim();
          const lastMsg = Array.isArray(g.messages) && g.messages.length ? g.messages[g.messages.length - 1] : null;

          return `
            <button
              type="button"
              class="card"
              data-gf-open="${g.id}"
              style="text-align:left; padding:12px; box-shadow:none; border-color:${
                isActive ? "rgba(255,187,0,.45)" : "rgba(255,255,255,.10)"
              };"
            >
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                <div>
                  <div style="font-weight:950; letter-spacing:.2px;">${escapeHtml(g.name || "Untitled")}</div>
                  <div class="muted" style="font-size:12px; margin-top:4px;">
                    ${about ? escapeHtml(about) : "No description."}
                  </div>
                  <div class="muted" style="font-size:12px; margin-top:6px;">
                    ${lastMsg ? `Last: ${escapeHtml(lastMsg.name || "")}` : "No chat yet."}
                  </div>
                </div>

                <button class="btn" data-gf-del="${g.id}" type="button" style="padding:8px 10px; border-radius:12px;">
                  ${icon("trash")}
                </button>
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderGurfahGroupPanel(group, tab, displayName) {
  const chatOn = tab === "chat";
  const setsOn = tab === "sets";

  const msgs = Array.isArray(group.messages) ? group.messages : [];
  const sets = Array.isArray(group.sets) ? group.sets : [];

  const chatHtml = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
      <div>
        <h3 style="margin:0;">${escapeHtml(group.name || "Group")}</h3>
        <p class="muted" style="margin:6px 0 0 0; font-size:12px;">
          You: <strong>${escapeHtml(displayName || "Guest")}</strong>
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button id="gf_new_set" class="btn" type="button">
          <span class="btn-inner">${icon("plus")}New set</span>
        </button>
        <button id="gf_clear_chat" class="btn" type="button">
          <span class="btn-inner">${icon("trash")}Clear chat</span>
        </button>
      </div>
    </div>

    <div class="card" style="margin-top:12px; box-shadow:none; padding:12px;">
      <div style="max-height: 360px; overflow:auto; display:grid; gap:10px;">
        ${
          msgs.length
            ? msgs
                .slice(-120)
                .map((m) => {
                  const isMe = (m.name || "") === (displayName || "");
                  return `
                    <div style="border:1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); border-radius:14px; padding:10px 12px;">
                      <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
                        <strong style="font-size:13px; color:${isMe ? "var(--gold)" : "var(--text)"};">
                          ${escapeHtml(m.name || "Guest")}
                        </strong>
                        <span class="muted" style="font-size:11px;">${escapeHtml(formatTime(m.ts || 0))}</span>
                      </div>
                      <div style="margin-top:6px; white-space:pre-wrap; word-break:break-word;">
                        ${escapeHtml(m.text || "")}
                      </div>
                    </div>
                  `;
                })
                .join("")
            : `<p class="muted" style="margin:0;">No messages yet. Start it.</p>`
        }
      </div>

      <div class="hr"></div>

      <div class="grid" style="gap:10px;">
        <label class="field" style="margin:0;">
          <span>Message</span>
          <textarea id="gf_msg" rows="3" placeholder="Write and press Enter. Shift+Enter for new line."></textarea>
        </label>

        <div style="display:flex; justify-content:flex-end;">
          <button id="gf_send" class="primary" type="button">
            <span class="btn-inner">${icon("chat")}Send</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const setsHtml = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
      <div>
        <h3 style="margin:0;">${escapeHtml(group.name || "Group")} Sets</h3>
        <p class="muted" style="margin:6px 0 0 0; line-height:1.6;">
          Build question sets here. Later, you can publish them into Mas’alah quizzes.
        </p>
      </div>

      <button id="gf_new_set" class="primary" type="button">
        <span class="btn-inner">${icon("plus")}Create set</span>
      </button>
    </div>

    <div style="margin-top:12px; display:grid; gap:10px;">
      ${
        sets.length
          ? sets
              .slice()
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
              .map((s) => {
                const qCount = Array.isArray(s.questions) ? s.questions.length : 0;
                return `
                  <button class="card" data-gf-open-set="${s.id}" type="button" style="text-align:left; padding:12px; box-shadow:none;">
                    <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                      <div>
                        <div style="font-weight:950;">${escapeHtml(s.title || "Untitled Set")}</div>
                        <div class="muted" style="font-size:12px; margin-top:4px;">
                          ${escapeHtml(s.category || "Unknown")} • ${escapeHtml(s.level || "Unknown")} • ${qCount} question${qCount === 1 ? "" : "s"}
                        </div>
                        <div class="muted" style="font-size:12px; margin-top:6px;">
                          ${escapeHtml(formatTime(s.createdAt || 0))}
                        </div>
                      </div>

                      <button class="btn" data-gf-del-set="${s.id}" type="button" style="padding:8px 10px; border-radius:12px;">
                        ${icon("trash")}
                      </button>
                    </div>
                  </button>
                `;
              })
              .join("")
          : `<p class="muted" style="margin:0;">No sets yet. Create one.</p>`
      }
    </div>
  `;

  return `
    <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
      <div class="nav" style="padding:6px; border-radius:999px;">
        <button id="gf_tab_chat" class="nav-btn ${chatOn ? "active" : ""}" type="button">Chat</button>
        <button id="gf_tab_sets" class="nav-btn ${setsOn ? "active" : ""}" type="button">Question Sets</button>
      </div>

      <div class="muted" style="font-size:12px;">
        Local-only MVP
      </div>
    </div>

    <div style="margin-top:12px;">
      ${chatOn ? chatHtml : setsHtml}
    </div>
  `;
}

function renderGurfahSetBuilder(groupId) {
  state.currentRoute = "gurfah"; // still inside Gurfah
  state.gurfah.activeGroupId = groupId;
  state.gurfah.activeTab = "sets";

  const data = loadGurfah();
  const group = findGroup(data, groupId);

  if (!group) {
    withTransition(renderGurfah);
    return;
  }

  const categories = ["Qur’an", "Seerah", "Fiqh", "Tawheed", "Arabic", "Adhkaar"];
  const levels = ["Beginner", "Intermediate", "Advanced"];

  const draft = {
    title: "",
    category: "Fiqh",
    level: "Beginner",
    questions: [],
  };

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;">New Question Set</h2>
          <p class="muted" style="margin:8px 0 0 0;">Group: <strong>${escapeHtml(group.name || "")}</strong></p>
        </div>
        <button id="gf_back" class="btn" type="button">Back</button>
      </div>

      <hr class="hr" />

      <div class="grid" style="grid-template-columns: 1fr 1fr; gap:12px;">
        <div class="card" style="box-shadow:none;">
          <h3 style="margin:0;">Set details</h3>

          <div class="grid" style="margin-top:12px;">
            <label class="field">
              <span>Title</span>
              <input id="set_title" type="text" placeholder="e.g. Fiqh of Wudu" maxlength="80" />
            </label>

            <label class="field">
              <span>Category</span>
              <select id="set_category">
                ${categories.map((c) => `<option>${escapeHtml(c)}</option>`).join("")}
              </select>
            </label>

            <label class="field">
              <span>Level</span>
              <select id="set_level">
                ${levels.map((l) => `<option>${escapeHtml(l)}</option>`).join("")}
              </select>
            </label>

            <button id="add_q" class="btn" type="button">
              <span class="btn-inner">${icon("plus")}Add a question</span>
            </button>

            <div id="q_count" class="muted" style="font-size:12px;">0 questions</div>
          </div>
        </div>

        <div class="card" style="box-shadow:none;">
          <h3 style="margin:0;">Questions</h3>
          <div id="q_list" style="margin-top:12px; display:grid; gap:10px;">
            <p class="muted" style="margin:0;">No questions yet.</p>
          </div>
        </div>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
        <button id="save_set" class="primary" type="button">Save set</button>
        <button id="export_draft" class="btn" type="button">Export draft</button>
      </div>

      <div id="gf_builder_notice" class="muted" style="margin-top:10px;"></div>
    </section>
  `;

  const backBtn = app.querySelector("#gf_back");
  backBtn.addEventListener("click", () => withTransition(renderGurfah));

  const elTitle = app.querySelector("#set_title");
  const elCat = app.querySelector("#set_category");
  const elLvl = app.querySelector("#set_level");
  const elList = app.querySelector("#q_list");
  const elCount = app.querySelector("#q_count");
  const noticeEl = app.querySelector("#gf_builder_notice");

  function notice(msg) {
    noticeEl.textContent = msg || "";
  }

  function refreshQuestions() {
    elCount.textContent = `${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"}`;

    if (!draft.questions.length) {
      elList.innerHTML = `<p class="muted" style="margin:0;">No questions yet.</p>`;
      return;
    }

    elList.innerHTML = draft.questions
      .map((q, idx) => {
        const correctLetter = String.fromCharCode(65 + (q.correctIndex || 0));
        return `
          <div class="card" style="box-shadow:none; padding:12px;">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
              <div style="min-width:0;">
                <div style="font-weight:950;">Q${idx + 1}. ${escapeHtml(q.q || "")}</div>
                <div class="muted" style="font-size:12px; margin-top:6px;">
                  Correct: <strong>${correctLetter}</strong>
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn" data-q-edit="${idx}" type="button" style="padding:8px 10px; border-radius:12px;">Edit</button>
                <button class="btn" data-q-del="${idx}" type="button" style="padding:8px 10px; border-radius:12px;">Delete</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    elList.querySelectorAll("[data-q-del]").forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.getAttribute("data-q-del"));
        draft.questions.splice(i, 1);
        refreshQuestions();
      });
    });

    elList.querySelectorAll("[data-q-edit]").forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.getAttribute("data-q-edit"));
        openQuestionEditor(i);
      });
    });
  }

  function openQuestionEditor(editIndex = null) {
    const existing = editIndex !== null ? draft.questions[editIndex] : null;

    const qObj = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          q: "",
          options: ["", "", "", ""],
          correctIndex: 0,
          explanation: "",
        };

    const modal = document.createElement("div");
    modal.className = "diary-modal is-open";
    modal.style.display = "flex";
    modal.innerHTML = `
      <div class="diary-modal-inner" role="dialog" aria-modal="true" aria-label="Question editor">
        <div class="diary-modal-head">
          <div>
            <p class="diary-modal-date muted" style="margin:0;">Question editor</p>
            <h3 class="diary-modal-title" style="margin:4px 0 0;">${editIndex === null ? "Add question" : "Edit question"}</h3>
          </div>
          <button class="btn" type="button" id="qe_close">Close</button>
        </div>

        <div class="diary-modal-body">
          <div class="grid" style="gap:10px;">
            <label class="field">
              <span>Question</span>
              <textarea id="qe_q" rows="3" placeholder="Write the question...">${escapeHtml(qObj.q)}</textarea>
            </label>

            ${[0, 1, 2, 3]
              .map(
                (i) => `
                  <label class="field">
                    <span>Option ${String.fromCharCode(65 + i)}</span>
                    <input id="qe_opt_${i}" type="text" value="${escapeHtml(qObj.options[i] || "")}" placeholder="Option ${String.fromCharCode(
                  65 + i
                )}" />
                  </label>
                `
              )
              .join("")}

            <label class="field">
              <span>Correct option</span>
              <select id="qe_correct">
                <option value="0" ${qObj.correctIndex === 0 ? "selected" : ""}>A</option>
                <option value="1" ${qObj.correctIndex === 1 ? "selected" : ""}>B</option>
                <option value="2" ${qObj.correctIndex === 2 ? "selected" : ""}>C</option>
                <option value="3" ${qObj.correctIndex === 3 ? "selected" : ""}>D</option>
              </select>
            </label>

            <label class="field">
              <span>Explanation</span>
              <textarea id="qe_expl" rows="4" placeholder="Short explanation...">${escapeHtml(qObj.explanation || "")}</textarea>
            </label>
          </div>
        </div>

        <div class="diary-modal-actions" style="justify-content:space-between;">
          <button class="btn" type="button" id="qe_cancel">Cancel</button>
          <button class="primary" type="button" id="qe_save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
      modal.remove();
    };

    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    modal.querySelector("#qe_close").addEventListener("click", close);
    modal.querySelector("#qe_cancel").addEventListener("click", close);

    modal.querySelector("#qe_save").addEventListener("click", () => {
      const qText = (modal.querySelector("#qe_q").value || "").trim();
      const opts = [0, 1, 2, 3].map((i) => (modal.querySelector(`#qe_opt_${i}`).value || "").trim());
      const correctIndex = Number(modal.querySelector("#qe_correct").value || "0");
      const explanation = (modal.querySelector("#qe_expl").value || "").trim();

      if (!qText) {
        showToast("Question text is required.");
        return;
      }
      if (opts.some((x) => !x)) {
        showToast("All 4 options are required.");
        return;
      }

      const payload = { q: qText, options: opts, correctIndex, explanation };
      if (editIndex === null) {
        draft.questions.push(payload);
      } else {
        draft.questions[editIndex] = payload;
      }

      refreshQuestions();
      close();
      showToast("Saved.");
    });
  }

  app.querySelector("#add_q").addEventListener("click", () => openQuestionEditor(null));

  app.querySelector("#export_draft").addEventListener("click", () => {
    draft.title = (elTitle.value || "").trim();
    draft.category = elCat.value;
    draft.level = elLvl.value;

    exportJsonDownload(
      { type: "gurfah_set_draft", createdAt: Date.now(), groupId, draft },
      `masalah-gurfah-set-draft-${todayISODate()}.json`
    );
    showToast("Draft exported.");
  });

  app.querySelector("#save_set").addEventListener("click", () => {
    draft.title = (elTitle.value || "").trim();
    draft.category = elCat.value;
    draft.level = elLvl.value;

    if (!draft.title) {
      notice("Add a title for this set.");
      return;
    }
    if (!draft.questions.length) {
      notice("Add at least one question.");
      return;
    }

    const fresh = loadGurfah();
    const g = findGroup(fresh, groupId);
    if (!g) return;

    g.sets = Array.isArray(g.sets) ? g.sets : [];
    g.sets.push({
      id: uid("set"),
      title: draft.title,
      category: draft.category,
      level: draft.level,
      createdAt: Date.now(),
      questions: draft.questions,
    });

    saveGurfah(fresh);
    showToast("Set saved.");
    withTransition(renderGurfah);
  });

  refreshQuestions();
}

function renderGurfahSetViewer(groupId, setId) {
  state.currentRoute = "gurfah";
  state.gurfah.activeGroupId = groupId;
  state.gurfah.activeTab = "sets";

  const data = loadGurfah();
  const group = findGroup(data, groupId);
  if (!group) return withTransition(renderGurfah);

  const sets = Array.isArray(group.sets) ? group.sets : [];
  const set = sets.find((s) => s.id === setId);
  if (!set) return withTransition(renderGurfah);

  const qList = Array.isArray(set.questions) ? set.questions : [];
  const correctLetter = (i) => String.fromCharCode(65 + i);

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;">${escapeHtml(set.title || "Set")}</h2>
          <p class="muted" style="margin:8px 0 0 0;">
            ${escapeHtml(set.category || "")} • ${escapeHtml(set.level || "")} • ${qList.length} question${qList.length === 1 ? "" : "s"}
          </p>
          <p class="muted" style="margin:6px 0 0 0; font-size:12px;">
            Group: <strong>${escapeHtml(group.name || "")}</strong> • ${escapeHtml(formatTime(set.createdAt || 0))}
          </p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="gv_back" class="btn" type="button">Back</button>
          <button id="gv_export" class="btn" type="button">
            <span class="btn-inner">${icon("download")}Export set</span>
          </button>
        </div>
      </div>

      <hr class="hr" />

      <div style="display:grid; gap:10px;">
        ${
          qList.length
            ? qList
                .map((q, idx) => {
                  return `
                    <div class="card" style="box-shadow:none; padding:12px;">
                      <div style="font-weight:950;">Q${idx + 1}. ${escapeHtml(q.q || "")}</div>
                      <div style="margin-top:10px; display:grid; gap:8px;">
                        ${q.options
                          .map(
                            (opt, i) => `
                              <div class="card" style="box-shadow:none; padding:10px 12px; background: rgba(255,255,255,.02);">
                                <span class="badge">${correctLetter(i)}</span>
                                <span style="font-weight:${i === q.correctIndex ? "950" : "700"};">
                                  ${escapeHtml(opt || "")}
                                </span>
                                ${
                                  i === q.correctIndex
                                    ? `<span class="muted" style="margin-left:8px; font-size:12px;">(Correct)</span>`
                                    : ``
                                }
                              </div>
                            `
                          )
                          .join("")}
                      </div>

                      ${
                        q.explanation
                          ? `<div class="feedback" style="margin-top:10px;">
                               <strong>Explanation</strong>
                               <div class="muted" style="margin-top:6px;">${escapeHtml(q.explanation)}</div>
                             </div>`
                          : ``
                      }
                    </div>
                  `;
                })
                .join("")
            : `<p class="muted" style="margin:0;">No questions inside this set.</p>`
        }
      </div>
    </section>
  `;

  app.querySelector("#gv_back").addEventListener("click", () => withTransition(renderGurfah));
  app.querySelector("#gv_export").addEventListener("click", () => {
    exportJsonDownload(
      { type: "gurfah_set", groupId, set },
      `masalah-gurfah-set-${(set.title || "set").toLowerCase().replace(/\s+/g, "-")}-${todayISODate()}.json`
    );
    showToast("Exported set.");
  });
}

/* =======================
   WELCOME
======================= */
function renderWelcome() {
  state.currentRoute = "welcome";

  const progress = loadProgress();
  const hasAnyActivity =
    (progress.lastAttempt && progress.lastAttempt.total) ||
    progress.streakCount > 0 ||
    Object.keys(progress.bestScores || {}).length > 0;

  app.innerHTML = `
    <section class="welcome">
      <div class="welcome-shell">
        <div class="welcome-hero">
          <div class="welcome-topline">
            ${icon("spark")}
            <span>Mas'alah</span>
          </div>

          <h2>Learn consistently</h2>

          <p>
            Short Islamic quizzes built for calm revision. Clear explanations, daily structure,
            and honest progress you can actually sustain.
          </p>

          <div class="welcome-cta">
            <button class="primary" type="button" data-goto="daily">
              <span class="btn-inner">${icon("bolt")}Start today’s quiz</span>
            </button>

            <button class="btn" type="button" data-goto="${hasAnyActivity ? "home" : "faq"}">
              <span class="btn-inner">${icon("target")}${hasAnyActivity ? "Continue" : "How it works"}</span>
            </button>
          </div>
        </div>

        <div class="welcome-values">
          <div class="welcome-card">
            <div class="icon">${icon("book")}</div>
            <h3>Clarity</h3>
            <p>Short questions with focused explanations, not long lectures.</p>
          </div>

          <div class="welcome-card">
            <div class="icon">${icon("shield")}</div>
            <h3>Consistency</h3>
            <p>Daily quizzes that remove indecision and make starting easy.</p>
          </div>

          <div class="welcome-card">
            <div class="icon">${icon("layers")}</div>
            <h3>Structure</h3>
            <p>Organized by category and level so you always know what to do next.</p>
          </div>
        </div>

        <div class="welcome-how">
          <h3>How it works</h3>
          <p class="sub">Simple on purpose. The product should not compete with the learning.</p>

          <div class="steps">
            <div class="step">
              <div class="num">1</div>
              <div>
                <h4>Pick Daily or Custom</h4>
                <p>Daily is locked for the day. Custom lets you target a topic and level.</p>
              </div>
            </div>

            <div class="step">
              <div class="num">2</div>
              <div>
                <h4>Answer and learn</h4>
                <p>Get instant feedback and short explanations after each question.</p>
              </div>
            </div>

            <div class="step">
              <div class="num">3</div>
              <div>
                <h4>Track quietly</h4>
                <p>Progress is saved on your device. Streaks reward consistency, not perfection.</p>
              </div>
            </div>
          </div>

          <div class="welcome-bottom" style="margin-top:14px;">
            <button class="primary" type="button" data-goto="daily">
              <span class="btn-inner">${icon("bolt")}Begin today’s quiz</span>
            </button>
            <button class="btn" type="button" data-goto="home">Browse topics</button>
          </div>
        </div>
      </div>
    </section>
  `;

  bindGotoButtons();
}

/* =======================
   HOME
======================= */
function renderHome() {
  state.currentRoute = "home";

  const progress = loadProgress();
  const last = progress.lastAttempt;

  const streakLabel = progress.streakCount === 1 ? "1 day" : `${progress.streakCount} days`;

  const bestEntries = Object.entries(progress.bestScores);
  let bestHeadline = "—";
  let bestSub = "No best score yet.";
  if (bestEntries.length) {
    bestEntries.sort((a, b) => b[1] - a[1]);
    const [key, val] = bestEntries[0];
    const [cat, lvl] = key.split("|");
    bestHeadline = `${val}%`;
    bestSub = `${cat} (${lvl})`;
  }

  const lastHeadline = last ? `${last.score}/${last.total}` : "—";
  const lastSub = last ? `${last.category} (${last.level})` : "No attempts yet.";

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2 style="margin:0;">Home</h2>
      <p class="muted" style="margin:8px 0 0 0; line-height:1.6;">
        Short quizzes. Clear feedback. Calm pace.
      </p>

      <div class="grid" style="margin-top:14px;">
        <div class="stats-grid">
          <div class="card" style="box-shadow:none;">
            <p class="muted" style="margin:0;">Streak</p>
            <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
              ${icon("calendar")}
              <strong style="font-size:20px;">${streakLabel}</strong>
            </div>
            <p class="muted" style="margin:8px 0 0 0; font-size:12px;">
              Last active: ${progress.lastActiveDate || "Not yet"}
            </p>
          </div>

          <div class="card" style="box-shadow:none;">
            <p class="muted" style="margin:0;">Last attempt</p>
            <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
              ${icon("target")}
              <strong style="font-size:20px;">${lastHeadline}</strong>
            </div>
            <p class="muted" style="margin:8px 0 0 0; font-size:12px;">${lastSub}</p>
          </div>

          <div class="card" style="box-shadow:none;">
            <p class="muted" style="margin:0;">Best</p>
            <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
              ${icon("trophy")}
              <strong style="font-size:20px;">${bestHeadline}</strong>
            </div>
            <p class="muted" style="margin:8px 0 0 0; font-size:12px;">${bestSub}</p>
          </div>
        </div>

        <div class="home-grid">
          <div class="card" style="box-shadow:none;">
            <h3 style="margin:0;">Today’s Quiz</h3>
            <p class="muted" style="margin:8px 0 0 0; line-height:1.6;">
              Locked for the day. Same questions even after refresh.
            </p>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
              <button class="primary" type="button" data-goto="daily">
                <span class="btn-inner">${icon("bolt")}Open daily</span>
              </button>
              <button class="btn" type="button" data-goto="welcome">Welcome</button>
              <button class="btn" type="button" data-goto="gurfah">Gurfah</button>
            </div>
          </div>

          <div class="card" style="box-shadow:none;">
            <h3 style="margin:0;">Custom Quiz</h3>
            <p class="muted" style="margin:8px 0 0 0; line-height:1.6;">
              Train a specific category and level. Practice or timed.
            </p>

            <div class="grid" style="margin-top:12px;">
              <label class="field">
                <span>Category</span>
                <select id="category">
                  <option>Qur’an</option>
                  <option>Seerah</option>
                  <option>Fiqh</option>
                  <option>Tawheed</option>
                  <option>Arabic</option>
                  <option>Adhkaar</option>
                </select>
              </label>

              <label class="field">
                <span>Level</span>
                <select id="level">
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </label>

              <label class="field inline">
                <input id="timed" type="checkbox" checked />
                <span>Timed mode (20 seconds per question)</span>
              </label>

              <label class="field">
                <span>Questions</span>
                <select id="count">
                  <option value="20" selected>20</option>
                  <option value="10">10</option>
                </select>
              </label>

              <button id="startBtn" class="primary" type="button">
                <span class="btn-inner">${icon("target")}Start custom quiz</span>
              </button>

              <p id="status" class="muted" style="margin:0;"></p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  bindGotoButtons();

  document.getElementById("startBtn").addEventListener("click", async () => {
    const category = document.getElementById("category").value;
    const level = document.getElementById("level").value;
    const timed = document.getElementById("timed").checked;
    const count = Number(document.getElementById("count").value);
    const status = document.getElementById("status");

    state.lastSettings = { category, level, timed, count, mode: "normal" };

    try {
      const all = await loadQuestions();
      const pool = all.filter((q) => q.category === category && q.level === level);

      if (!pool.length) {
        status.textContent = `No questions found for ${category} • ${level}. Add them in data/questions.json.`;
        return;
      }

      state.quizQuestions = pickRandom(pool, Math.min(count, pool.length));
      state.index = 0;
      state.score = 0;
      state.timed = timed;

      withTransition(renderQuiz);
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });
}

/* =======================
   DAILY
======================= */
async function renderDaily() {
  state.currentRoute = "daily";

  const today = todayISO();
  const existing = loadDailyState();
  const defaultCategory = existing?.date === today ? existing.category : "Qur’an";
  const defaultLevel = existing?.date === today ? existing.level : "Beginner";

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2>Today’s Quiz</h2>
      <p class="muted">This quiz is locked for today. Refreshing won’t change the questions.</p>

      <div class="grid" style="margin-top:12px;">
        <label class="field">
          <span>Category</span>
          <select id="dailyCategory">
            <option ${defaultCategory === "Qur’an" ? "selected" : ""}>Qur’an</option>
            <option ${defaultCategory === "Seerah" ? "selected" : ""}>Seerah</option>
            <option ${defaultCategory === "Fiqh" ? "selected" : ""}>Fiqh</option>
            <option ${defaultCategory === "Tawheed" ? "selected" : ""}>Tawheed</option>
            <option ${defaultCategory === "Arabic" ? "selected" : ""}>Arabic</option>
            <option ${defaultCategory === "Adhkaar" ? "selected" : ""}>Adhkaar</option>
          </select>
        </label>

        <label class="field">
          <span>Level</span>
          <select id="dailyLevel">
            <option ${defaultLevel === "Beginner" ? "selected" : ""}>Beginner</option>
            <option ${defaultLevel === "Intermediate" ? "selected" : ""}>Intermediate</option>
            <option ${defaultLevel === "Advanced" ? "selected" : ""}>Advanced</option>
          </select>
        </label>

        <label class="field inline">
          <input id="dailyTimed" type="checkbox" checked />
          <span>Timed mode (20 seconds per question)</span>
        </label>

        <button id="dailyStartBtn" class="primary" type="button">
          <span class="btn-inner">${icon("bolt")}Start today’s quiz</span>
        </button>

        <p id="dailyStatus" class="muted" style="margin:0;"></p>

        ${
          existing && existing.date === today && existing.questionIds?.length
            ? `<p class="muted">Locked for today: ${existing.category} • ${existing.level} (${existing.questionIds.length} questions)</p>`
            : `<p class="muted">No locked quiz yet for today. Start one to lock it.</p>`
        }
      </div>
    </section>
  `;

  document.getElementById("dailyStartBtn").addEventListener("click", async () => {
    const category = document.getElementById("dailyCategory").value;
    const level = document.getElementById("dailyLevel").value;
    const timed = document.getElementById("dailyTimed").checked;
    const status = document.getElementById("dailyStatus");
    const count = 20;

    try {
      const daily = await getOrCreateDailyQuiz(category, level, count);

      if (!daily.questionIds.length) {
        status.textContent = `No questions found for ${category} • ${level}. Add them in data/questions.json.`;
        return;
      }

      const all = await loadQuestions();
      const chosen = buildQuestionsByIds(all, daily.questionIds);

      state.lastSettings = { category, level, timed, count: chosen.length, mode: "daily" };
      state.quizQuestions = chosen;
      state.index = 0;
      state.score = 0;
      state.timed = timed;

      withTransition(renderQuiz);
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });
}

/* =======================
   QUIZ
   - Prev navigation enabled
======================= */
function renderQuiz() {
  state.currentRoute = "quiz";
  state.answered = false;

  const total = state.quizQuestions.length;
  const q = state.quizQuestions[state.index];
  state.correctIdx = q.correctIndex;

  const progressPct = Math.round(((state.index + 1) / total) * 100);

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">

      <div class="quiz-progress">
        <div class="muted" style="display:flex; justify-content:space-between; gap:10px; margin-bottom:8px;">
          <span>Question ${state.index + 1} of ${total}</span>
          <span>${progressPct}%</span>
        </div>
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;">Question ${state.index + 1} / ${total}</h2>
          <p class="muted" style="margin:6px 0 0 0;">Score: ${state.score}</p>
          ${
            state.lastSettings?.mode === "daily"
              ? `<p class="muted" style="margin:6px 0 0 0;">Mode: Today’s Quiz</p>`
              : ``
          }
        </div>

        ${
          state.timed
            ? `<div style="min-width:220px;">
                 <div class="muted">Time left: <strong id="timeLeft">${state.secondsPerQuestion}</strong>s</div>
                 <div class="timeTrack"><div id="timeBar" class="timeBar"></div></div>
               </div>`
            : `<div class="muted">Practice mode</div>`
        }
      </div>

      <hr class="hr" />

      <h3 style="margin-top:0;">${q.question}</h3>

      <div class="grid" id="options">
        ${q.options
          .map(
            (opt, idx) => `
              <button class="optionBtn" data-idx="${idx}" type="button">
                <span class="badge">${String.fromCharCode(65 + idx)}</span>
                <span>${opt}</span>
              </button>
            `
          )
          .join("")}
      </div>

      <div id="feedback" class="feedback" style="display:none;"></div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="quitBtn" class="btn" type="button">Quit</button>
        <button id="prevBtn" class="btn" ${state.index === 0 ? "disabled" : ""} type="button">Prev</button>
        <button id="nextBtn" class="btn" style="display:none;" type="button">Next</button>
      </div>

      <p class="muted" style="margin:10px 0 0 0; font-size:12px;">
        Tip: Use A/B/C/D keys. Enter goes Next after answering.
      </p>
    </section>
  `;

  document.getElementById("quitBtn").addEventListener("click", () => {
    clearTimer();
    go("home");
  });

  const prevBtn = document.getElementById("prevBtn");
  prevBtn.addEventListener("click", () => {
    if (state.index === 0) return;
    clearTimer();
    state.index -= 1;
    withTransition(renderQuiz);
  });
  if (state.index === 0) {
    prevBtn.disabled = true;
    prevBtn.style.opacity = "0.6";
    prevBtn.style.pointerEvents = "none";
  }

  document.querySelectorAll(".optionBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = Number(btn.dataset.idx);
      showFeedback(selected);
    });
  });

  if (state.timed) startTimer();
}

function showFeedback(selectedIdx, meta = {}) {
  if (state.answered) return;
  state.answered = true;

  clearTimer();

  const q = state.quizQuestions[state.index];
  const correct = q.correctIndex;

  document.querySelectorAll(".optionBtn").forEach((btn) => {
    btn.disabled = true;
    const idx = Number(btn.dataset.idx);
    if (idx === correct) btn.classList.add("correct");
    if (selectedIdx !== null && idx === selectedIdx && idx !== correct) btn.classList.add("wrong");
  });

  const isCorrect = selectedIdx === correct;
  if (isCorrect) state.score += 1;

  if (meta.reason === "timeout") {
    vibrate(20);
  } else {
    vibrate(isCorrect ? 15 : [10, 30, 10]);
  }

  // Store per-question attempt info for Results review
  q.__attempt = {
    selectedIndex: selectedIdx,
    correctIndex: correct,
    isCorrect,
    at: Date.now(),
  };

  const feedback = document.getElementById("feedback");
  feedback.style.display = "block";
  feedback.innerHTML = `
    <strong>${meta.reason === "timeout" ? "Time up." : isCorrect ? "Correct." : "Incorrect."}</strong>
    <div class="muted" style="margin-top:6px;">${q.explanation || ""}</div>
  `;

  const nextBtn = document.getElementById("nextBtn");
  nextBtn.style.display = "inline-block";
  nextBtn.textContent = state.index === state.quizQuestions.length - 1 ? "See Results" : "Next";

  nextBtn.onclick = () => {
    feedback.style.display = "none";
    state.index += 1;

    if (state.index >= state.quizQuestions.length) {
      withTransition(renderResults);
      return;
    }
    withTransition(renderQuiz);
  };
}

/* =======================
   RESULTS
   - Wrong questions bolded
   - Review explanations with jump buttons
======================= */
function renderResults() {
  state.currentRoute = "results";
  clearTimer();

  const total = state.quizQuestions.length;
  const percent = Math.round((state.score / total) * 100);

  const progress = loadProgress();
  updateStreak(progress);

  const category = state.lastSettings?.category || "Unknown";
  const level = state.lastSettings?.level || "Unknown";
  const key = `${category}|${level}`;

  const prevBest = progress.bestScores[key] ?? 0;
  progress.bestScores[key] = Math.max(prevBest, percent);

  progress.lastAttempt = { date: todayISO(), category, level, score: state.score, total, percent };
  saveProgress(progress);

  const reviewRows = state.quizQuestions
    .map((q, idx) => {
      const a = q.__attempt;
      const isWrong = a && a.selectedIndex !== null && a.isCorrect === false;
      const timedOut = a && a.selectedIndex === null;
      const label = timedOut ? "Timed out" : isWrong ? "Wrong" : a?.isCorrect ? "Correct" : "Unanswered";
      const weight = isWrong || timedOut ? "950" : "800";

      return `
        <button type="button" class="card" data-review="${idx}" style="box-shadow:none; padding:12px; text-align:left;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
            <div style="font-weight:${weight};">
              Q${idx + 1}. ${escapeHtml(q.question || "")}
            </div>
            <span class="muted" style="font-size:12px;">${label}</span>
          </div>
          ${
            q.explanation
              ? `<div class="muted" style="margin-top:6px; font-size:12px; line-height:1.45;">
                   ${escapeHtml(String(q.explanation).slice(0, 140))}${String(q.explanation).length > 140 ? "…" : ""}
                 </div>`
              : ``
          }
        </button>
      `;
    })
    .join("");

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2>Results</h2>
      <p class="muted">Score</p>

      <div style="font-size:34px; font-weight:950; margin:10px 0;">
        ${state.score} / ${total} (${percent}%)
      </div>

      <div class="card" style="margin-top:12px; box-shadow:none;">
        <p class="muted" style="margin:0 0 8px 0;">Review</p>
        <p class="muted" style="margin:0 0 10px 0; font-size:12px;">
          Wrong (and timed-out) questions are bold. Tap any question to review explanation.
        </p>
        <div style="display:grid; gap:10px;">
          ${reviewRows || `<p class="muted" style="margin:0;">No review data yet.</p>`}
        </div>
      </div>

      <div class="card" style="margin-top:12px; box-shadow:none;">
        <p class="muted" style="margin:0 0 8px 0;">Share</p>
        <textarea id="shareText" rows="3">I scored ${state.score}/${total} in Mas'alah. ${category} (${level}). Can you beat that?</textarea>
        <button id="copyBtn" class="btn" style="margin-top:10px;" type="button">Copy</button>
        <p id="copyStatus" class="muted" style="margin-top:8px;"></p>
      </div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="tryAgainBtn" class="btn" type="button">Try Again</button>
        <button id="progressBtn" class="btn" type="button">Progress</button>
        <button id="homeBtn" class="btn" type="button">Back Home</button>
      </div>
    </section>
  `;

  // review jump
  app.querySelectorAll("[data-review]").forEach((b) => {
    b.addEventListener("click", () => {
      const idx = Number(b.getAttribute("data-review"));
      state.index = Math.max(0, Math.min(idx, state.quizQuestions.length - 1));
      withTransition(renderQuizReview);
    });
  });

  document.getElementById("copyBtn").addEventListener("click", async () => {
    const text = document.getElementById("shareText").value;
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById("copyStatus").textContent = "Copied.";
    } catch {
      document.getElementById("copyStatus").textContent = "Copy manually if needed.";
    }
  });

  document.getElementById("tryAgainBtn").addEventListener("click", async () => {
    const s = state.lastSettings;
    if (!s) return go("home");
    if (s.mode === "daily") return go("daily");

    const all = await loadQuestions();
    const pool = all.filter((q) => q.category === s.category && q.level === s.level);
    const chosen = pickRandom(pool, Math.min(s.count, pool.length));

    state.quizQuestions = chosen;
    state.index = 0;
    state.score = 0;
    state.timed = s.timed;

    withTransition(renderQuiz);
  });

  document.getElementById("progressBtn").addEventListener("click", () => go("progress"));
  document.getElementById("homeBtn").addEventListener("click", () => go("home"));
}

// Review mode: allow prev/next and show explanation without changing score
function renderQuizReview() {
  state.currentRoute = "quiz";

  const total = state.quizQuestions.length;
  const q = state.quizQuestions[state.index];
  const a = q.__attempt || null;

  const correct = q.correctIndex;
  const selected = a ? a.selectedIndex : null;

  const progressPct = Math.round(((state.index + 1) / total) * 100);

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <div class="quiz-progress">
        <div class="muted" style="display:flex; justify-content:space-between; gap:10px; margin-bottom:8px;">
          <span>Review ${state.index + 1} of ${total}</span>
          <span>${progressPct}%</span>
        </div>
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;">Review</h2>
          <p class="muted" style="margin:6px 0 0 0;">Tap Prev/Next to browse explanations.</p>
        </div>
        <div class="muted" style="font-size:12px;">Score saved already</div>
      </div>

      <hr class="hr" />

      <h3 style="margin-top:0;">${escapeHtml(q.question || "")}</h3>

      <div class="grid">
        ${q.options
          .map((opt, idx) => {
            const isCorrect = idx === correct;
            const isChosenWrong = selected !== null && idx === selected && idx !== correct;
            const cls = isCorrect ? "optionBtn correct" : isChosenWrong ? "optionBtn wrong" : "optionBtn";
            return `
              <div class="${cls}" style="cursor:default;">
                <span class="badge">${String.fromCharCode(65 + idx)}</span>
                <span>${escapeHtml(opt)}</span>
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="feedback" style="margin-top:12px;">
        <strong>
          ${
            selected === null
              ? "Timed out."
              : selected === correct
              ? "Correct."
              : "Incorrect."
          }
        </strong>
        <div class="muted" style="margin-top:6px;">${escapeHtml(q.explanation || "")}</div>
      </div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="backResults" class="btn" type="button">Back to Results</button>
        <button id="prevReview" class="btn" type="button" ${state.index === 0 ? "disabled" : ""}>Prev</button>
        <button id="nextReview" class="btn" type="button" ${state.index === total - 1 ? "disabled" : ""}>Next</button>
      </div>
    </section>
  `;

  app.querySelector("#backResults").addEventListener("click", () => withTransition(renderResults));

  const prevBtn = app.querySelector("#prevReview");
  const nextBtn = app.querySelector("#nextReview");

  prevBtn.addEventListener("click", () => {
    if (state.index === 0) return;
    state.index -= 1;
    withTransition(renderQuizReview);
  });

  nextBtn.addEventListener("click", () => {
    if (state.index >= total - 1) return;
    state.index += 1;
    withTransition(renderQuizReview);
  });

  if (state.index === 0) {
    prevBtn.disabled = true;
    prevBtn.style.opacity = "0.6";
    prevBtn.style.pointerEvents = "none";
  }
  if (state.index === total - 1) {
    nextBtn.disabled = true;
    nextBtn.style.opacity = "0.6";
    nextBtn.style.pointerEvents = "none";
  }
}

/* =======================
   PROGRESS
======================= */
function renderProgress() {
  state.currentRoute = "progress";

  const progress = loadProgress();
  const bestEntries = Object.entries(progress.bestScores).sort((a, b) => b[1] - a[1]);
  const last = progress.lastAttempt;

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2>Progress</h2>

      <div class="grid" style="margin-top:12px;">
        <div class="card" style="box-shadow:none;">
          <p class="muted" style="margin:0;">Streak</p>
          <div style="font-size:28px; font-weight:950; margin-top:6px;">
            ${progress.streakCount} day${progress.streakCount === 1 ? "" : "s"}
          </div>
          <p class="muted" style="margin-top:6px;">Last active: ${progress.lastActiveDate || "Not yet"}</p>
        </div>

        <div class="card" style="box-shadow:none;">
          <p class="muted" style="margin:0;">Last attempt</p>
          ${
            last
              ? `<div style="margin-top:8px; font-weight:950;">${last.category} • ${last.level}</div>
                 <div style="font-size:22px; font-weight:950; margin-top:6px;">${last.score}/${last.total} (${last.percent}%)</div>
                 <p class="muted" style="margin-top:6px;">${last.date}</p>`
              : `<p class="muted" style="margin-top:8px;">No attempts yet.</p>`
          }
        </div>

        <div class="card" style="box-shadow:none;">
          <p class="muted" style="margin:0;">Best scores</p>
          ${
            bestEntries.length
              ? `<div style="margin-top:10px; display:grid; gap:8px;">
                   ${bestEntries
                     .map(([key, val]) => {
                       const [cat, lvl] = key.split("|");
                       return `<div style="display:flex; justify-content:space-between; gap:10px;">
                                 <span>${cat} • ${lvl}</span>
                                 <strong>${val}%</strong>
                               </div>`;
                     })
                     .join("")}
                 </div>`
              : `<p class="muted" style="margin-top:8px;">No best scores yet.</p>`
          }
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="resetProgress" class="btn" type="button">Reset progress</button>
          <button class="btn" type="button" data-goto="home">Back Home</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("resetProgress").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    withTransition(renderProgress);
  });

  bindGotoButtons();
}

/* =======================
   FAQ
======================= */
function renderFAQ() {
  state.currentRoute = "faq";

  app.innerHTML = `
    <section class="faq">
      <div class="faq-shell">
        <div class="faq-head">
          <h2 class="faq-title">FAQ</h2>
          <p class="faq-sub">
            Mas'alah is built for calm revision. Short questions, short explanations, steady progress.
          </p>
        </div>

        <div class="faq-grid">
          <div class="faq-panel">
            <div class="faq-acc">

              <details class="faq-item" open>
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("spark")}</span>
                    What is Mas'alah?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  A short Islamic quiz app designed to help you revise consistently. One calm step daily.
                </div>
              </details>

              <details class="faq-item">
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("calendar")}</span>
                    What is “Today’s Quiz”?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  It is locked for the day. Refreshing does not change the questions, so you can focus on learning.
                </div>
              </details>

              <details class="faq-item">
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("target")}</span>
                    What is “Custom Quiz”?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  Custom lets you choose a category and level, then practice in timed mode or calm practice mode.
                </div>
              </details>

              <details class="faq-item">
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("shield")}</span>
                    Where is my progress stored?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  Progress is saved locally on your device. If you clear browser data or switch devices, it resets.
                </div>
              </details>

              <details class="faq-item">
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("layers")}</span>
                    Can I add more questions?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  Yes. Add items in <span class="kbd">data/questions.json</span>. The app will pick them up automatically.
                </div>
              </details>

              <details class="faq-item">
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("book")}</span>
                    Why are explanations short?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  Because the goal is revision, not replacing lessons. Short explanations help you correct quickly and move forward.
                </div>
              </details>

              <details class="faq-item">
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("users")}</span>
                    What is Gurfah?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  Gurfah is the community space. Create groups, chat, and build question sets. It is local-only in this version.
                </div>
              </details>

            </div>
          </div>

          <div class="faq-side">
            <div class="faq-panel">
              <h3 style="margin:0;">Quick start</h3>
              <p class="muted" style="margin:8px 0 0; line-height:1.6;">
                If you want the simplest path, do Today’s Quiz daily. If you want to target a weakness, use Custom.
              </p>
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="primary" type="button" data-goto="daily">
                  <span class="btn-inner">${icon("bolt")}Start today</span>
                </button>
                <button class="btn" type="button" data-goto="home">
                  <span class="btn-inner">${icon("target")}Open home</span>
                </button>
                <button class="btn" type="button" data-goto="gurfah">
                  <span class="btn-inner">${icon("users")}Open Gurfah</span>
                </button>
              </div>
            </div>

            <div class="faq-panel">
              <h3 style="margin:0;">Reminder</h3>
              <p class="muted" style="margin:8px 0 0; line-height:1.6;">
                Consistency beats intensity. The goal is not to win a quiz. The goal is to remember.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  `;

  bindGotoButtons();
}

/* =======================
   Zakat Calculator
======================= */
function formatMoney(n, currency) {
  const num = Number(n || 0);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 2,
  }).format(num);
}

function toNum(v) {
  const x = Number(String(v || "").replace(/,/g, "").trim());
  return Number.isFinite(x) ? x : 0;
}

function calcZakat({ zakatable, nisab }) {
  const meetsNisab = zakatable >= nisab && zakatable > 0;
  const zakatDue = meetsNisab ? zakatable * 0.025 : 0;
  return { meetsNisab, zakatDue };
}

function renderZakat() {
  state.currentRoute = "zakat";

  const currencyDefault = "NGN";
  const methodDefault = "gold";

  app.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2>Zakat Calculator</h2>
        <p class="muted">Estimate zakat on zakatable wealth. Uses 2.5% once you meet nisab and a lunar year has passed.</p>
      </div>

      <div class="zakat-grid">

        <div class="zakat-box">
          <h3 class="zakat-title">1) Nisab</h3>

          <div class="field">
            <label class="label">Currency</label>
            <input id="zk_currency" class="input" value="${currencyDefault}" placeholder="NGN, USD, GBP..." />
            <p class="help muted">Use a valid currency code (NGN, USD, GBP, EUR).</p>
          </div>

          <div class="field">
            <label class="label">Nisab method</label>
            <div class="segmented" role="group" aria-label="Nisab method">
              <button type="button" class="seg-btn is-on" data-zk-method="gold">Gold (85g)</button>
              <button type="button" class="seg-btn" data-zk-method="silver">Silver (595g)</button>
            </div>
          </div>

          <div class="field">
            <label class="label">Price per gram</label>
            <input id="zk_pricePerGram" class="input" inputmode="decimal" placeholder="Enter current price per gram" />
            <p class="help muted">Enter today’s market price per gram for your chosen method.</p>
          </div>

          <div class="field">
            <label class="label">Hawl completed?</label>
            <label class="checkline">
              <input id="zk_hawl" type="checkbox" />
              <span>Yes, I have held this wealth for one lunar year</span>
            </label>
          </div>
        </div>

        <div class="zakat-box">
          <h3 class="zakat-title">2) Assets</h3>

          <div class="field">
            <label class="label">Cash at hand / bank</label>
            <input id="zk_cash" class="input" inputmode="decimal" placeholder="0" />
          </div>

          <div class="field">
            <label class="label">Gold / silver value</label>
            <input id="zk_metals" class="input" inputmode="decimal" placeholder="0" />
          </div>

          <div class="field">
            <label class="label">Investments / shares / crypto</label>
            <input id="zk_invest" class="input" inputmode="decimal" placeholder="0" />
          </div>

          <div class="field">
            <label class="label">Business inventory (resale value)</label>
            <input id="zk_inventory" class="input" inputmode="decimal" placeholder="0" />
          </div>

          <div class="field">
            <label class="label">Money owed to you (likely to be paid)</label>
            <input id="zk_debtsOwed" class="input" inputmode="decimal" placeholder="0" />
          </div>
        </div>

        <div class="zakat-box">
          <h3 class="zakat-title">3) Liabilities</h3>

          <div class="field">
            <label class="label">Short-term debts due now</label>
            <input id="zk_debtsDue" class="input" inputmode="decimal" placeholder="0" />
            <p class="help muted">Only subtract what is due and payable soon, not long-term future installments.</p>
          </div>

          <div class="zakat-actions">
            <button id="zk_calc" class="btn primary" type="button">Calculate</button>
            <button id="zk_reset" class="btn" type="button">Reset</button>
          </div>

          <div id="zk_result" class="zakat-result" aria-live="polite"></div>
        </div>

      </div>
    </section>
  `;

  let method = methodDefault;

  const segBtns = Array.from(app.querySelectorAll("[data-zk-method]"));
  segBtns.forEach((b) => {
    b.addEventListener("click", () => {
      method = b.dataset.zkMethod;
      segBtns.forEach((x) => x.classList.toggle("is-on", x === b));
    });
  });

  const elCurrency = app.querySelector("#zk_currency");
  const elPricePerGram = app.querySelector("#zk_pricePerGram");
  const elHawl = app.querySelector("#zk_hawl");

  const elCash = app.querySelector("#zk_cash");
  const elMetals = app.querySelector("#zk_metals");
  const elInvest = app.querySelector("#zk_invest");
  const elInventory = app.querySelector("#zk_inventory");
  const elDebtsOwed = app.querySelector("#zk_debtsOwed");
  const elDebtsDue = app.querySelector("#zk_debtsDue");

  const elResult = app.querySelector("#zk_result");

  function computeAndRender() {
    const currency = (elCurrency.value || currencyDefault).trim().toUpperCase();
    const pricePerGram = toNum(elPricePerGram.value);

    const nisabGrams = method === "gold" ? 85 : 595;
    const nisab = pricePerGram > 0 ? pricePerGram * nisabGrams : 0;

    const assets =
      toNum(elCash.value) +
      toNum(elMetals.value) +
      toNum(elInvest.value) +
      toNum(elInventory.value) +
      toNum(elDebtsOwed.value);

    const liabilities = toNum(elDebtsDue.value);

    const zakatable = Math.max(0, assets - liabilities);
    const { meetsNisab, zakatDue } = calcZakat({ zakatable, nisab });

    const hawlOk = !!elHawl.checked;

    const nisabText =
      nisab > 0
        ? `${formatMoney(nisab, currency)} (${method} nisab: ${nisabGrams}g)`
        : "Enter price per gram to compute nisab.";

    const statusLine = !hawlOk
      ? `<p class="warn">Reminder: zakat is due after a lunar year (hawl) on zakatable wealth. Turn on “Hawl completed” when ready.</p>`
      : "";

    const dueLine =
      nisab > 0 && meetsNisab && hawlOk
        ? `<p class="good"><strong>Zakat due:</strong> ${formatMoney(zakatDue, currency)}</p>`
        : `<p class="muted"><strong>Zakat due:</strong> ${formatMoney(0, currency)}</p>`;

    const meetsLine =
      nisab > 0
        ? `<p class="${meetsNisab ? "good" : "muted"}"><strong>Nisab:</strong> ${nisabText}</p>`
        : `<p class="muted"><strong>Nisab:</strong> ${nisabText}</p>`;

    elResult.innerHTML = `
      <div class="zakat-summary">
        <p><strong>Total assets:</strong> ${formatMoney(assets, currency)}</p>
        <p><strong>Liabilities deducted:</strong> ${formatMoney(liabilities, currency)}</p>
        <p><strong>Zakatable amount:</strong> ${formatMoney(zakatable, currency)}</p>
        ${meetsLine}
        ${statusLine}
        ${dueLine}
      </div>
    `;
  }

  app.querySelector("#zk_calc").addEventListener("click", computeAndRender);

  app.querySelector("#zk_reset").addEventListener("click", () => {
    elCurrency.value = currencyDefault;
    elPricePerGram.value = "";
    elHawl.checked = false;

    elCash.value = "";
    elMetals.value = "";
    elInvest.value = "";
    elInventory.value = "";
    elDebtsOwed.value = "";
    elDebtsDue.value = "";

    method = methodDefault;
    segBtns.forEach((x) => x.classList.toggle("is-on", x.dataset.zkMethod === methodDefault));

    elResult.innerHTML = "";
  });
}

/* =======================
   Private Diary (Local)
   (Your existing diary code goes here unchanged)
======================= */
function loadDiary() {
  try {
    const raw = localStorage.getItem(DIARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDiary(entries) {
  localStorage.setItem(DIARY_KEY, JSON.stringify(entries));
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* NOTE:
   Your diary, lock, calendar functions can remain as you already have them.
   Keep your existing:
   - renderDiary()
   - renderLock()
   - renderCalendar() + renderHijriMonth()
   - renderFAQ()
   - calendar click listener
   - footer year
*/

/* =======================
   Routing
======================= */
async function renderRoute(route) {
  const r = route || "welcome";
  setActiveNav(r);

  if (r === "welcome") return renderWelcome();
  if (r === "home") return renderHome();
  if (r === "daily") return renderDaily();
  if (r === "progress") return renderProgress();
  if (r === "calendar") return renderCalendar();
  if (r === "zakat") return renderZakat();
  if (r === "diary") return renderDiary();
  if (r === "lock") return renderLock();
  if (r === "faq") return renderFAQ();
  if (r === "gurfah") return renderGurfah();

  return renderWelcome();
}

function render(route) {
  if (state.isNavigating) return;

  const r = route || "welcome";

  if (requireUnlock(r)) {
    state.intendedRoute = r;
    route = "lock";
  }

  state.isNavigating = true;

  withTransition(() => {
    const maybePromise = renderRoute(route);
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.finally(() => {
        state.isNavigating = false;
      });
    } else {
      state.isNavigating = false;
    }
  });
}

/* =======================
   Header mobile menu (optional)
======================= */
document.addEventListener("click", (e) => {
  const toggle = e.target.closest(".nav-toggle");
  const menu = document.getElementById("navMenu");

  if (toggle && menu) {
    const isOpen = menu.dataset.open === "true";
    menu.dataset.open = String(!isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
    return;
  }

  if (menu && menu.dataset.open === "true") {
    const clickedRoute = e.target.closest("[data-route]");
    const clickedInsideMenu = e.target.closest("#navMenu");
    if (clickedRoute || !clickedInsideMenu) {
      menu.dataset.open = "false";
      const btn = document.querySelector(".nav-toggle");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  }
});

/* =======================
   Calendar click reminder
======================= */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".calendar-day[data-hijri-day]");
  if (!btn) return;

  const day = Number(btn.dataset.hijriDay);
  const isWhiteDay = btn.dataset.whiteDay === "1";

  if (!isWhiteDay) {
    showToast(`Hijri day ${day}. Only 13, 14, 15 are highlighted for the white days.`);
    return;
  }

  showToast(
    `White Day reminder: Today is the ${day}th. Sunnah fasting is recommended on the 13th, 14th, and 15th of each Hijri month.`
  );
});

/* =======================
   Footer year
======================= */
function setFooterYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

/* =======================
   Hash routing
======================= */
window.addEventListener("hashchange", () => {
  const route = (window.location.hash || "#welcome").slice(1);
  render(route);
});

/* =======================
   Boot
======================= */
window.addEventListener("DOMContentLoaded", () => {
  bindNavRoutes();
  bindGlobalKeyboard();
  setFooterYear();

  const initial = (window.location.hash || "").slice(1);
  render(initial || "welcome");
});
