
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* =======================
   Supabase
======================= */
const SUPABASE_URL = "https://kjggfschpuqfggyasnux.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wkNt08rBEiLv70BpmMbKiA_GVGMjTO7";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =======================
   App root
======================= */
const app = document.getElementById("app");

/* =======================
   LocalStorage keys
======================= */
const STORAGE_KEY = "masalah_progress_v1";
const DAILY_KEY = "masalah_daily_v1";
const DIARY_KEY = "masalah_diary_v1";
const LOCK_PIN_HASH_KEY = "masalah_pin_hash_v1";
const LOCK_UNLOCKED_UNTIL_KEY = "masalah_unlocked_until_v1";
const BAG_KEY = "masalah_shuffle_bag_v1";

/* Protect what you want */
const PROTECTED_ROUTES = new Set(["diary", "progress"]);

/* =======================
   Global state
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
  intendedRoute: null,
  answerLog: [] // [{ selectedIdx, correctIdx, isCorrect, reason, explanation, question, options }]
};

/* =======================
   Utils
======================= */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function vibrate(pattern) {
  try {
    if (navigator && "vibrate" in navigator) navigator.vibrate(pattern);
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
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
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
    default:
      return wrap(`<circle ${common} cx="12" cy="12" r="9"/>`);
  }
}

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

function fmtLocalLongDate(d = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(d);
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
      lastAttempt: parsed.lastAttempt ?? null
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
   Questions
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
   Daily state (localStorage)
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
   Shuffle bag (no repeats until recycle)
======================= */
function loadBag() {
  try {
    const raw = localStorage.getItem(BAG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveBag(bag) {
  localStorage.setItem(BAG_KEY, JSON.stringify(bag));
}
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pool rules:
 * - Beginner/Intermediate: exact level match
 * - Advanced: include both "_adv_" and "_jaamiah_" IDs while q.level === "Advanced"
 */
function isEligibleQuestion(q, category, level) {
  if (q.category !== category) return false;
  if (q.level !== level) return false;

  if (level === "Advanced") {
    const id = String(q.id || "");
    return id.includes("_adv_") || id.includes("_jaamiah_");
  }
  return true;
}

/**
 * Shuffle-bag draw. No repeats until pool exhausted.
 * bagKey should be stable, e.g. "custom|Fiqh|Advanced" or "daily|Fiqh|Advanced"
 */
function drawFromBag(allEligibleIds, bagKey, count) {
  const bag = loadBag();

  const stored = bag[bagKey];
  const poolSet = new Set(allEligibleIds);

  const needsReset =
    !stored ||
    !Array.isArray(stored.remaining) ||
    !Array.isArray(stored.pool) ||
    stored.remaining.some((id) => !poolSet.has(id)) ||
    allEligibleIds.some((id) => !stored.pool.includes(id));

  if (needsReset) {
    bag[bagKey] = {
      pool: [...allEligibleIds],
      remaining: shuffleArray(allEligibleIds),
      recycledAt: Date.now()
    };
  }

  const entry = bag[bagKey];

  const picked = [];
  while (picked.length < count) {
    if (!entry.remaining.length) {
      entry.remaining = shuffleArray(entry.pool);
      entry.recycledAt = Date.now();
    }
    picked.push(entry.remaining.shift());
  }

  bag[bagKey] = entry;
  saveBag(bag);

  return picked;
}

/**
 * Daily picker:
 * - Locked for the day (same set after refresh)
 * - Random from full eligible pool
 * - No repeats until pool exhausted, then recycle
 * - Advanced includes both adv + jaamiah IDs (via isEligibleQuestion)
 */
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
  const eligible = all.filter((q) => isEligibleQuestion(q, category, level));

  if (!eligible.length) {
    const empty = { date: today, category, level, count, questionIds: [] };
    saveDailyState(empty);
    return empty;
  }

  const ids = eligible.map((q) => q.id);
  const pickCount = Math.min(count, ids.length);

  const bagKey = `daily|${category}|${level}`;
  const pickedIds = drawFromBag(ids, bagKey, pickCount);

  const daily = { date: today, category, level, count, questionIds: pickedIds };
  saveDailyState(daily);
  return daily;
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
   Nav
======================= */
function setActiveNav(route) {
  document.querySelectorAll(".nav-btn[data-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === route);
  });
}

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

/* Mobile menu toggle */
function bindMobileMenu() {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("navMenu");
  if (!nav || !toggle || !menu) return;

  const setOpen = (open) => {
    menu.dataset.open = open ? "true" : "false";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(menu.dataset.open !== "true");
  });

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-route]");
    if (btn) setOpen(false);
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  window.addEventListener("hashchange", () => setOpen(false));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) setOpen(false);
  });

  setOpen(false);
}

/* =======================
   Transitions
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
   Auth helpers
======================= */
async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}
async function requireAuthOrRoute(routeIfNot = "auth") {
  const session = await getSession();
  if (!session) {
    go(routeIfNot);
    return null;
  }
  return session;
}
function displayNameFromSession(session) {
  const u = session?.user;
  return u?.user_metadata?.display_name || u?.email?.split("@")?.[0] || "Anonymous";
}

/* =======================
   Keyboard (quiz)
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

  if (key === "arrowleft") {
    const prevBtn = document.getElementById("prevBtn");
    if (prevBtn && prevBtn.style.display !== "none" && !prevBtn.disabled) {
      e.preventDefault();
      prevBtn.click();
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
   PIN Lock
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
   Views
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

function renderHome() {
  state.currentRoute = "home";

  const progress = loadProgress();
  const last = progress.lastAttempt;

  const streakLabel = progress.streakCount === 1 ? "1 day" : `${progress.streakCount} days`;

  const bestEntries = Object.entries(progress.bestScores);
  let bestHeadline = "-";
  let bestSub = "No best score yet.";
  if (bestEntries.length) {
    bestEntries.sort((a, b) => b[1] - a[1]);
    const [key, val] = bestEntries[0];
    const [cat, lvl] = key.split("|");
    bestHeadline = `${val}%`;
    bestSub = `${cat} (${lvl})`;
  }

  const lastHeadline = last ? `${last.score}/${last.total}` : "-";
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
              <button class="btn" type="button" data-goto="learning">Learning Space</button>
              <button class="btn" type="button" data-goto="auth">Login</button>
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
                  <option>Qu'an</option>
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
                  <option value="30">30</option>
                  <option value="50">50</option>
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
      const eligible = all.filter((q) => isEligibleQuestion(q, category, level));

      if (!eligible.length) {
        status.textContent = `No questions found for ${category} • ${level}. Add them in data/questions.json.`;
        return;
      }

      const ids = eligible.map((q) => q.id);
      const bagKey = `custom|${category}|${level}`;
      const pickCount = Math.min(count, ids.length);

      const pickedIds = drawFromBag(ids, bagKey, pickCount);
      state.quizQuestions = buildQuestionsByIds(all, pickedIds);

      state.index = 0;
      state.score = 0;
      state.timed = timed;
      state.answerLog = [];

      withTransition(renderQuiz);
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });
}

async function renderDaily() {
  state.currentRoute = "daily";

  const today = todayISO();
  const existing = loadDailyState();
  const defaultCategory = existing?.date === today ? existing.category : "Qu'an";
  const defaultLevel = existing?.date === today ? existing.level : "Beginner";

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2>Today’s Quiz</h2>
      <p class="muted">This quiz is locked for today. Refreshing won’t change the questions.</p>

      <div class="grid" style="margin-top:12px;">
        <label class="field">
          <span>Category</span>
          <select id="dailyCategory">
            <option ${defaultCategory === "Qu'an" ? "selected" : ""}>Qu'an</option>
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
      state.answerLog = [];

      withTransition(renderQuiz);
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });
}

/* =======================
   Quiz
======================= */
function renderQuiz() {
  state.currentRoute = "quiz";

  const total = state.quizQuestions.length;
  const q = state.quizQuestions[state.index];
  const correctIdx = q.correctIndex;

  const progressPct = Math.round(((state.index + 1) / total) * 100);
  const prior = state.answerLog[state.index] || null;

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
          ${
            prior
              ? `<p class="muted" style="margin:6px 0 0 0;">Review mode: this question is already answered.</p>`
              : ``
          }
        </div>

        ${
          state.timed && !prior
            ? `<div style="min-width:220px;">
                 <div class="muted">Time left: <strong id="timeLeft">${state.secondsPerQuestion}</strong>s</div>
                 <div class="timeTrack"><div id="timeBar" class="timeBar"></div></div>
               </div>`
            : `<div class="muted">${prior ? "Review" : "Practice mode"}</div>`
        }
      </div>

      <hr class="hr" />

      <h3 style="margin-top:0;">${escapeHtml(q.question)}</h3>

      <div class="grid" id="options">
        ${q.options
          .map(
            (opt, idx) => `
              <button class="optionBtn" data-idx="${idx}" type="button">
                <span class="badge">${String.fromCharCode(65 + idx)}</span>
                <span>${escapeHtml(opt)}</span>
              </button>
            `
          )
          .join("")}
      </div>

      <div id="feedback" class="feedback" style="display:none;"></div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="quitBtn" class="btn" type="button">Quit</button>
        <button id="prevBtn" class="btn" type="button" ${state.index === 0 ? "disabled" : ""}>Prev</button>
        <button id="nextBtn" class="btn" style="display:none;" type="button">Next</button>
      </div>
    </section>
  `;

  document.getElementById("quitBtn").addEventListener("click", () => {
    clearTimer();
    go("home");
  });

  document.getElementById("prevBtn").addEventListener("click", () => {
    clearTimer();
    if (state.index <= 0) return;
    state.index -= 1;
    withTransition(renderQuiz);
  });

  document.querySelectorAll(".optionBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = Number(btn.dataset.idx);
      showFeedback(selected);
    });
  });

  if (prior) {
    applyAnsweredUI(prior.selectedIdx, correctIdx, prior.reason, q.explanation || "");
    return;
  }

  if (state.timed) startTimer();
}

function applyAnsweredUI(selectedIdx, correctIdx, reason, explanation) {
  clearTimer();

  document.querySelectorAll(".optionBtn").forEach((btn) => {
    btn.disabled = true;
    const idx = Number(btn.dataset.idx);
    if (idx === correctIdx) btn.classList.add("correct");
    if (selectedIdx !== null && idx === selectedIdx && idx !== correctIdx) btn.classList.add("wrong");
  });

  const isCorrect = selectedIdx === correctIdx;

  const feedback = document.getElementById("feedback");
  feedback.style.display = "block";
  feedback.innerHTML = `
    <strong>${reason === "timeout" ? "Time up." : isCorrect ? "Correct." : "Incorrect."}</strong>
    <div class="muted" style="margin-top:6px;">${escapeHtml(explanation || "")}</div>
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

function showFeedback(selectedIdx, meta = {}) {
  if (state.answerLog[state.index]) return;

  clearTimer();

  const q = state.quizQuestions[state.index];
  const correct = q.correctIndex;
  const isCorrect = selectedIdx === correct;

  if (isCorrect) state.score += 1;

  if (meta.reason === "timeout") {
    vibrate(20);
  } else {
    vibrate(isCorrect ? 15 : [10, 30, 10]);
  }

  state.answerLog[state.index] = {
    selectedIdx,
    correctIdx: correct,
    isCorrect,
    reason: meta.reason === "timeout" ? "timeout" : "choice",
    explanation: q.explanation || "",
    question: q.question,
    options: q.options
  };

  applyAnsweredUI(selectedIdx, correct, meta.reason === "timeout" ? "timeout" : "choice", q.explanation || "");
}

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

  const reviewHtml = state.quizQuestions
    .map((q, i) => {
      const log = state.answerLog[i];
      const wrong = log ? !log.isCorrect : true;
      const label = `Q${i + 1}`;
      const title = q.question || "";
      const line = wrong ? `<strong>${escapeHtml(`${label}. ${title}`)}</strong>` : escapeHtml(`${label}. ${title}`);
      const metaLine = log
        ? `${log.isCorrect ? "Correct" : "Wrong"} • ${log.reason === "timeout" ? "Timed out" : "Answered"}`
        : `Not answered`;

      return `
        <button class="diary-item" type="button" data-review-q="${i}">
          <div class="diary-item-top">
            <span class="diary-title" style="text-align:left;">${line}</span>
          </div>
          <div class="diary-preview muted" style="text-align:left;">
            <span class="muted" style="font-size:12px;">${escapeHtml(metaLine)}</span>
          </div>
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
        <p class="muted" style="margin:0 0 10px 0;">Tap any question to revisit its explanation. Wrong ones are bolded.</p>
        <div class="diary-list">${reviewHtml}</div>
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

  app.querySelectorAll("[data-review-q]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-review-q"));
      if (!Number.isFinite(i)) return;
      state.index = i;
      withTransition(renderQuiz);
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
    const eligible = all.filter((q) => isEligibleQuestion(q, s.category, s.level));

    if (!eligible.length) return go("home");

    const ids = eligible.map((q) => q.id);
    const pickCount = Math.min(s.count, ids.length);

    const bagKey = `custom|${s.category}|${s.level}`;
    const pickedIds = drawFromBag(ids, bagKey, pickCount);

    state.quizQuestions = buildQuestionsByIds(all, pickedIds);
    state.index = 0;
    state.score = 0;
    state.timed = s.timed;
    state.answerLog = [];

    withTransition(renderQuiz);
  });

  document.getElementById("progressBtn").addEventListener("click", () => go("progress"));
  document.getElementById("homeBtn").addEventListener("click", () => go("home"));
}

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
              ? `<div style="margin-top:8px; font-weight:950;">${escapeHtml(last.category)} • ${escapeHtml(last.level)}</div>
                 <div style="font-size:22px; font-weight:950; margin-top:6px;">${last.score}/${last.total} (${last.percent}%)</div>
                 <p class="muted" style="margin-top:6px;">${escapeHtml(last.date)}</p>`
              : `<p class="muted" style="margin-top:8px;">No attempts yet.</p>`
          }
        </div>

        <div class="card" style="box-shadow:none;">
          <p class="muted" style="margin:0;">Best scores</p>
          ${
            bestEntries.length
              ? `<div style="margin-top:10px; display:grid; gap:8px;">
                   ${bestEntries
                     .map(([k, val]) => {
                       const [cat, lvl] = k.split("|");
                       return `<div style="display:flex; justify-content:space-between; gap:10px;">
                                 <span>${escapeHtml(cat)} • ${escapeHtml(lvl)}</span>
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
                <button class="btn" type="button" data-goto="learning">Learning Space</button>
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
    maximumFractionDigits: 2
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

          <div class="field"><label class="label">Cash at hand / bank</label><input id="zk_cash" class="input" inputmode="decimal" placeholder="0" /></div>
          <div class="field"><label class="label">Gold / silver value</label><input id="zk_metals" class="input" inputmode="decimal" placeholder="0" /></div>
          <div class="field"><label class="label">Investments / shares / crypto</label><input id="zk_invest" class="input" inputmode="decimal" placeholder="0" /></div>
          <div class="field"><label class="label">Business inventory (resale value)</label><input id="zk_inventory" class="input" inputmode="decimal" placeholder="0" /></div>
          <div class="field"><label class="label">Money owed to you (likely to be paid)</label><input id="zk_debtsOwed" class="input" inputmode="decimal" placeholder="0" /></div>
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
      ? `<p class="warn">Reminder: zakat is due after a lunar year (hawl). Turn on “Hawl completed” when ready.</p>`
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
   Diary (local)
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
function renderDiaryList(entries) {
  if (!entries.length) {
    return `<p class="muted">No entries yet. Write something small today.</p>`;
  }
  const sorted = [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return `
    <div class="diary-list">
      ${sorted
        .map((e) => {
          const date = escapeHtml(e.date || "");
          const title = escapeHtml(e.title || "Untitled");
          const preview = escapeHtml((e.text || "").slice(0, 140));
          return `
            <button class="diary-item" type="button" data-diary-open="${escapeHtml(e.id)}">
              <div class="diary-item-top">
                <span class="diary-date">${date}</span>
                <span class="diary-title">${title}</span>
              </div>
              <div class="diary-preview muted">${preview}${(e.text || "").length > 140 ? "…" : ""}</div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}
function renderDiary() {
  state.currentRoute = "diary";

  const entries = loadDiary();

  const DRAFT_KEY = "masalah_diary_draft_v1";

  const fmtHumanDate = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  const fmtTime = (ms) => {
    const d = new Date(ms || Date.now());
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const safe = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const loadDraft = () => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      return null;
    }
  };

  const saveDraft = (draft) => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
  };

  const draft = loadDraft() || {
    title: "",
    text: "",
    updatedAt: 0
  };

  app.innerHTML = `
    <section class="diary-page screen">

      <header class="diary-head">
        <div>
          <h2 class="diary-h">Private Diary</h2>
          <p class="diary-sub muted">Stored only on this device. Write like nobody is watching.</p>
        </div>

        <div class="diary-head-right" style="display:flex; gap:10px; align-items:center;">
          <span id="save_chip" class="pill">${draft.updatedAt ? "Draft saved" : "Not saved yet"}</span>
          <button id="diary_insert_prompt" class="btn" type="button">Prompts</button>
        </div>
      </header>

      <div class="diary-shell">
        <main class="diary-editor">
          <div class="diary-editor-top">
            <div class="diary-date">
              <span class="muted">Today</span>
              <span class="diary-date-strong">${safe(fmtHumanDate(todayISO()))}</span>
            </div>

            <input
              id="diary_title"
              class="diary-title"
              placeholder="A short headline (optional)"
              maxlength="80"
              value="${safe(draft.title)}"
            />
          </div>

          <div class="diary-pad">
            <textarea
              id="diary_text"
              class="diary-text"
              placeholder="Write freely. No perfection required."
              maxlength="8000"
            >${safe(draft.text)}</textarea>
          </div>

          <div class="diary-foot">
            <div class="diary-meta muted">
              <span id="diary_count">0 / 8000</span>
              <span class="diary-dot">•</span>
              <span id="last_saved">${
                draft.updatedAt ? `Draft saved at ${safe(fmtTime(draft.updatedAt))}` : "Draft not saved"
              }</span>
            </div>

            <div class="diary-actions">
              <button id="diary_save" class="primary" type="button">Save entry</button>
              <button id="diary_clear" class="btn" type="button">Clear</button>
            </div>
          </div>

          <div id="diary_notice" class="diary-notice" aria-live="polite"></div>
        </main>

        <aside class="diary-side">
          <div class="diary-side-head">
            <h3 class="diary-side-title">Your entries</h3>
            <p class="muted diary-side-sub">${entries.length} saved</p>
          </div>

          <div id="diary_list" class="diary-list">
            ${renderDiaryList(entries)}
          </div>
        </aside>
      </div>

      <div class="diary-modal" id="diary_modal" aria-hidden="true">
        <div class="diary-modal-inner" role="dialog" aria-modal="true" aria-label="Diary entry">
          <div class="diary-modal-head">
            <div>
              <p class="diary-modal-date muted" id="diary_modal_date"></p>
              <h3 class="diary-modal-title" id="diary_modal_title"></h3>
            </div>
            <button class="btn" id="diary_modal_close" type="button">Close</button>
          </div>

          <div class="diary-modal-body">
            <pre class="diary-modal-text" id="diary_modal_text"></pre>
          </div>

          <div class="diary-modal-actions">
            <button class="btn danger" id="diary_delete" type="button">Delete entry</button>
          </div>
        </div>
      </div>

    </section>
  `;

  const elTitle = app.querySelector("#diary_title");
  const elText = app.querySelector("#diary_text");
  const elCount = app.querySelector("#diary_count");
  const elNotice = app.querySelector("#diary_notice");
  const elList = app.querySelector("#diary_list");

  const elSaveChip = app.querySelector("#save_chip");
  const elLastSaved = app.querySelector("#last_saved");

  const elModal = app.querySelector("#diary_modal");
  const elModalDate = app.querySelector("#diary_modal_date");
  const elModalTitle = app.querySelector("#diary_modal_title");
  const elModalText = app.querySelector("#diary_modal_text");
  const elModalClose = app.querySelector("#diary_modal_close");
  const elDelete = app.querySelector("#diary_delete");

  let openedId = null;
  let autosaveTimer = null;

  function setNotice(msg, kind) {
    elNotice.textContent = msg || "";
    elNotice.classList.remove("is-warn", "is-good");
    if (kind === "warn") elNotice.classList.add("is-warn");
    if (kind === "good") elNotice.classList.add("is-good");
  }

  function setDraftUI(mode, whenMs) {
    if (!elSaveChip || !elLastSaved) return;

    if (mode === "dirty") {
      elSaveChip.textContent = "Saving…";
      elSaveChip.classList.add("is-dirty");
      elSaveChip.classList.remove("is-saved");
      elLastSaved.textContent = "Typing…";
      return;
    }
    if (mode === "saved") {
      elSaveChip.textContent = "Draft saved";
      elSaveChip.classList.add("is-saved");
      elSaveChip.classList.remove("is-dirty");
      elLastSaved.textContent = `Draft saved at ${fmtTime(whenMs || Date.now())}`;
      return;
    }
    elSaveChip.textContent = "Not saved yet";
    elSaveChip.classList.remove("is-saved", "is-dirty");
    elLastSaved.textContent = "Draft not saved";
  }

  function refreshList() {
    const latest = loadDiary();
    elList.innerHTML = renderDiaryList(latest);
  }

  function updateCount() {
    elCount.textContent = `${(elText.value || "").length} / 8000`;
  }

  function scheduleDraftSave() {
    setDraftUI("dirty");
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const d = {
        title: elTitle.value || "",
        text: elText.value || "",
        updatedAt: Date.now()
      };
      saveDraft(d);
      setDraftUI("saved", d.updatedAt);
    }, 600);
  }

  updateCount();
  if (draft.updatedAt) setDraftUI("saved", draft.updatedAt);

  elText.addEventListener("input", () => {
    updateCount();
    scheduleDraftSave();
  });

  elTitle.addEventListener("input", scheduleDraftSave);

  app.querySelector("#diary_insert_prompt").addEventListener("click", () => {
    const prompts =
      `\n\nQuick prompts:\n` +
      `- One thing I’m grateful for today:\n` +
      `- One thing I learned today:\n` +
      `- One mistake I won’t repeat:\n` +
      `- One small win:\n` +
      `- One thing to improve tomorrow:\n`;
    elText.value = (elText.value || "") + prompts;
    updateCount();
    scheduleDraftSave();
    elText.focus();
  });

  app.querySelector("#diary_clear").addEventListener("click", () => {
    elTitle.value = "";
    elText.value = "";
    updateCount();
    clearDraft();
    setDraftUI("idle");
    setNotice("Cleared.", "good");
  });

  app.querySelector("#diary_save").addEventListener("click", () => {
    const title = (elTitle.value || "").trim();
    const text = (elText.value || "").trim();

    if (!text) {
      setNotice("Write something first.", "warn");
      return;
    }

    const entriesNow = loadDiary();
    const entry = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      date: fmtHumanDate(todayISO()),
      title: title || "Untitled",
      text,
      createdAt: Date.now()
    };

    entriesNow.push(entry);
    saveDiary(entriesNow);

    elTitle.value = "";
    elText.value = "";
    updateCount();

    clearDraft();
    setDraftUI("idle");
    setNotice("Saved on this device.", "good");
    refreshList();
  });

  function openModal(entry) {
    openedId = entry.id;
    elModalDate.textContent = entry.date || "";
    elModalTitle.textContent = entry.title || "Untitled";
    elModalText.textContent = entry.text || "";

    elModal.classList.add("is-open");
    elModal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    openedId = null;
    elModal.classList.remove("is-open");
    elModal.setAttribute("aria-hidden", "true");
  }

  elModalClose.addEventListener("click", closeModal);
  elModal.addEventListener("click", (e) => {
    if (e.target === elModal) closeModal();
  });

  app.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-diary-open]");
    if (!btn) return;

    const id = btn.getAttribute("data-diary-open");
    const data = loadDiary();
    const entry = data.find((x) => x.id === id);
    if (!entry) return;
    openModal(entry);
  });

  elDelete.addEventListener("click", () => {
    if (!openedId) return;
    const data = loadDiary();
    const next = data.filter((x) => x.id !== openedId);
    saveDiary(next);
    closeModal();
    refreshList();
    setNotice("Deleted.", "good");
  });
}

/* =======================
   Lock screen
======================= */
function renderLock() {
  state.currentRoute = "lock";

  const pinExists = hasPin();
  const unlocked = isUnlocked();
  const intended = state.intendedRoute || "home";

  app.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2>Lock</h2>
        <p class="muted">Protect Diary and Progress on this device.</p>
      </div>

      <div class="lock-box">
        <div class="lock-status">
          <span class="pill ${unlocked ? "pill-good" : "pill-warn"}">
            ${unlocked ? "Unlocked" : "Locked"}
          </span>
          <span class="muted">
            ${pinExists ? "PIN is set" : "No PIN yet. Set one now."}
          </span>
        </div>

        <div class="field">
          <label class="label">${pinExists ? "Enter PIN" : "Create a PIN (4-8 digits)"}</label>
          <input id="lock_pin" class="input" inputmode="numeric" autocomplete="off" placeholder="••••" maxlength="8" />
          <p class="muted small">Digits only.</p>
        </div>

        ${
          pinExists
            ? `
              <div class="lock-actions">
                <button id="lock_unlock" class="btn primary" type="button">Unlock</button>
                <button id="lock_locknow" class="btn" type="button">Lock now</button>
                <button id="lock_change" class="btn" type="button">Change PIN</button>
              </div>
            `
            : `
              <div class="lock-actions">
                <button id="lock_set" class="btn primary" type="button">Set PIN</button>
              </div>
            `
        }

        <div id="lock_notice" class="lock-notice" aria-live="polite"></div>

        <div class="lock-foot muted">
          <p>Unlocked sessions expire automatically (30 minutes).</p>
          <p class="muted">After unlocking, you will be taken to: <strong>${escapeHtml(intended)}</strong></p>
        </div>
      </div>
    </section>
  `;

  const pinEl = app.querySelector("#lock_pin");
  const noticeEl = app.querySelector("#lock_notice");

  function notice(msg, kind) {
    noticeEl.textContent = msg || "";
    noticeEl.classList.remove("is-warn", "is-good");
    if (kind === "warn") noticeEl.classList.add("is-warn");
    if (kind === "good") noticeEl.classList.add("is-good");
  }
  function digitsOnly(val) {
    return String(val || "").replace(/\D/g, "");
  }

  pinEl.addEventListener("input", () => {
    pinEl.value = digitsOnly(pinEl.value).slice(0, 8);
  });

  const goIntended = () => {
    const target = state.intendedRoute || intended;
    state.intendedRoute = null;
    render(target);
  };

  const setBtn = app.querySelector("#lock_set");
  if (setBtn) {
    setBtn.addEventListener("click", async () => {
      const pin = digitsOnly(pinEl.value);
      if (pin.length < 4 || pin.length > 8) {
        notice("PIN must be 4 to 8 digits.", "warn");
        return;
      }
      await setPin(pin);
      notice("PIN set. Unlocked.", "good");
      goIntended();
    });
  }

  const unlockBtn = app.querySelector("#lock_unlock");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", async () => {
      const pin = digitsOnly(pinEl.value);
      if (!pin) {
        notice("Enter your PIN.", "warn");
        return;
      }

      const ok = await verifyPin(pin);
      if (!ok) {
        notice("Wrong PIN.", "warn");
        return;
      }

      localStorage.setItem(LOCK_UNLOCKED_UNTIL_KEY, String(nowMs() + 30 * 60 * 1000));
      notice("Unlocked.", "good");
      goIntended();
    });
  }

  const lockNowBtn = app.querySelector("#lock_locknow");
  if (lockNowBtn) {
    lockNowBtn.addEventListener("click", () => {
      lockNow();
      notice("Locked.", "good");
      render("lock");
    });
  }

  const changeBtn = app.querySelector("#lock_change");
  if (changeBtn) {
    changeBtn.addEventListener("click", async () => {
      const pin = digitsOnly(pinEl.value);
      if (!pin) {
        notice("Enter current PIN to change it.", "warn");
        return;
      }

      const ok = await verifyPin(pin);
      if (!ok) {
        notice("Wrong current PIN.", "warn");
        return;
      }

      const newPin = prompt("Enter a new PIN (4-8 digits):") || "";
      const clean = digitsOnly(newPin);

      if (clean.length < 4 || clean.length > 8) {
        notice("New PIN must be 4 to 8 digits.", "warn");
        return;
      }

      await setPin(clean);
      notice("PIN changed. Unlocked.", "good");
    });
  }
}

/* =======================
   Hijri Calendar
======================= */
const HIJRI_MONTHS = [
  { en: "Muharram", ar: "مُحَرَّم" },
  { en: "Safar", ar: "صَفَر" },
  { en: "Rabiʿ al-Awwal", ar: "رَبِيع الأَوَّل" },
  { en: "Rabiʿ al-Thani", ar: "رَبِيع الآخِر" },
  { en: "Jumada al-Ula", ar: "جُمَادَى الأُولَى" },
  { en: "Jumada al-Akhirah", ar: "جُمَادَى الآخِرَة" },
  { en: "Rajab", ar: "رَجَب" },
  { en: "Shaʿban", ar: "شَعْبَان" },
  { en: "Ramadan", ar: "رَمَضَان" },
  { en: "Shawwal", ar: "شَوَّال" },
  { en: "Dhu al-Qaʿdah", ar: "ذُو القَعْدَة" },
  { en: "Dhu al-Hijjah", ar: "ذُو الحِجَّة" }
];

function getHijriPartsLocal(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-TN-u-ca-islamic", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  });
  const parts = fmt.formatToParts(date);
  const day = Number(parts.find((p) => p.type === "day")?.value || "1");
  const monthNum = Number(parts.find((p) => p.type === "month")?.value || "1");
  const year = parts.find((p) => p.type === "year")?.value || "";
  return { day, monthNum, year };
}

function renderHijriMonth(todayDay) {
  let html = "";
  for (let d = 1; d <= 30; d++) {
    const isWhiteDay = d === 13 || d === 14 || d === 15;
    const isToday = d === todayDay;

    html += `
      <button
        type="button"
        class="calendar-day ${isWhiteDay ? "white-day" : ""} ${isToday ? "today" : ""}"
        data-hijri-day="${d}"
        ${isWhiteDay ? 'data-white-day="1"' : ""}
        aria-label="Hijri day ${d}"
      >
        ${isToday ? `<strong>${d}</strong>` : d}
      </button>
    `;
  }
  return html;
}

function renderCalendar() {
  state.currentRoute = "calendar";

  const now = new Date();
  const localLong = fmtLocalLongDate(now);
  const { day: hijriDay, monthNum, year: hijriYear } = getHijriPartsLocal(now);
  const m = HIJRI_MONTHS[Math.max(1, Math.min(12, monthNum)) - 1] || { en: "Hijri", ar: "هجري" };

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2>Hijri Calendar</h2>

      <p class="muted" style="margin-top:6px;">
        Today (local): <strong>${escapeHtml(localLong)}</strong>
      </p>

      <p class="muted" style="margin-top:6px;">
        ${escapeHtml(m.en)} <span style="opacity:.85;">(${escapeHtml(m.ar)})</span> • ${escapeHtml(hijriYear)} AH
      </p>

      <div class="calendar-grid">
        ${renderHijriMonth(hijriDay)}
      </div>

      <p class="muted" style="margin-top:12px;">
        The 13th, 14th, and 15th are the white days (Ayyām al-Bīḍ).
      </p>
    </section>
  `;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".calendar-day[data-hijri-day]");
  if (!btn) return;

  const day = Number(btn.dataset.hijriDay);
  const isWhiteDay = btn.dataset.whiteDay === "1";

  if (!isWhiteDay) {
    showToast(`Hijri day ${day}. Only 13, 14, 15 are highlighted for the white days.`);
    return;
  }

  showToast(`White Day reminder: ${day}th. Sunnah fasting is recommended on the 13th, 14th, and 15th.`);
});

/* =======================
   Auth page
======================= */
function renderAuth() {
  state.currentRoute = "auth";

  app.innerHTML = `
    <section class="card" style="margin-top:20px; max-width:720px; margin-inline:auto;">
      <h2>Login / Sign up</h2>
      <p class="muted">Use email + password.</p>

      <div class="grid" style="margin-top:12px;">
        <label class="field">
          <span>Display name (optional)</span>
          <input id="auth_name" type="text" placeholder="e.g., Abdulsamad" />
        </label>

        <label class="field">
          <span>Email</span>
          <input id="auth_email" type="email" placeholder="you@example.com" />
        </label>

        <label class="field">
          <span>Password</span>
          <input id="auth_pass" type="password" placeholder="Min 6 characters" />
        </label>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
          <button id="btn_login" class="btn" type="button">Login</button>
          <button id="btn_signup" class="primary" type="button">Sign up</button>
          <button class="btn" data-goto="home" type="button">Back Home</button>
        </div>

        <p id="auth_status" class="muted" style="margin:0;"></p>
      </div>
    </section>
  `;

  bindGotoButtons();

  const elName = document.getElementById("auth_name");
  const elEmail = document.getElementById("auth_email");
  const elPass = document.getElementById("auth_pass");
  const status = document.getElementById("auth_status");

  document.getElementById("btn_signup").addEventListener("click", async () => {
    status.textContent = "Creating account...";

    const display_name = (elName.value || "").trim();
    const email = (elEmail.value || "").trim();
    const password = (elPass.value || "").trim();

    if (!email || !password) {
      status.textContent = "Email and password required.";
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name },
        emailRedirectTo: `${location.origin}${location.pathname}#auth`
      }
    });

    if (error) {
      status.textContent = error.message;
      return;
    }

    status.innerHTML =
      "Account created. We sent a confirmation email.<br/>" +
      "Check Inbox, then Spam/Promotions if you don’t see it.<br/>" +
      "After confirming, come back here and log in.";
    showToast("Check your email to confirm.");
  });

  document.getElementById("btn_login").addEventListener("click", async () => {
    status.textContent = "Logging in...";

    const email = (elEmail.value || "").trim();
    const password = (elPass.value || "").trim();

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      status.textContent = error.message;
      return;
    }

    status.textContent = "Logged in.";
    go("learning");
  });
}

/* =======================
   Supabase Learning Space
======================= */
let realtimeChannel = null;

async function renderLearning() {
  state.currentRoute = "learning";

  const session = await requireAuthOrRoute("auth");
  if (!session) return;

  const myName = displayNameFromSession(session);

  app.innerHTML = `
    <section class="wa">
      <aside class="wa-rooms" id="waRooms" data-open="false" aria-label="Rooms">
        <div class="wa-rooms-head">
          <div class="wa-title">Rooms</div>
          <button class="wa-iconbtn" id="waRoomsClose" type="button" aria-label="Close rooms">✕</button>
        </div>

        <div class="wa-rooms-body">
          <label class="field">
            <span>New room name</span>
            <input id="room_name" type="text" placeholder="e.g., Fiqh Advanced Drill" />
          </label>
          <button id="room_create" class="primary" type="button">Create</button>

          <div id="rooms_list" class="wa-roomlist" style="margin-top:10px;"></div>
        </div>
      </aside>

      <div class="wa-chat">
        <header class="wa-chat-head">
          <button class="wa-iconbtn" id="waRoomsOpen" type="button" aria-label="Open rooms">☰</button>

          <div class="wa-chat-meta">
            <div class="wa-chat-title" id="room_title">Select a room</div>
            <div class="wa-chat-sub muted" id="room_sub">Join a room to start chatting.</div>
          </div>

          <div class="wa-chat-actions">
            <span class="wa-pill">Signed in</span>
            <button id="logout_btn" class="btn" type="button">Logout</button>
          </div>
        </header>

        <main class="wa-messages" id="chat_box" aria-live="polite"></main>

        <footer class="wa-inputbar">
          <input id="chat_text" class="wa-input" type="text" placeholder="Message" />
          <button id="chat_send" class="wa-send" type="button" aria-label="Send">➤</button>

          <label class="wa-attach btn" style="display:inline-flex; align-items:center; gap:10px;">
            <input id="voice_file" type="file" accept="audio/*" style="display:none;" />
            Voice
          </label>
        </footer>

        <div class="wa-status muted" id="chat_status"></div>
      </div>
    </section>
  `;

  const roomsListEl = document.getElementById("rooms_list");
  const roomTitleEl = document.getElementById("room_title");
  const roomSubEl = document.getElementById("room_sub");
  const chatBoxEl = document.getElementById("chat_box");
  const chatTextEl = document.getElementById("chat_text");
  const chatStatusEl = document.getElementById("chat_status");
  const voiceInput = document.getElementById("voice_file");

  const roomsDrawer = document.getElementById("waRooms");
  const btnRoomsOpen = document.getElementById("waRoomsOpen");
  const btnRoomsClose = document.getElementById("waRoomsClose");

  const setRoomsOpen = (open) => {
    roomsDrawer.dataset.open = open ? "true" : "false";
  };

  btnRoomsOpen.addEventListener("click", () => setRoomsOpen(true));
  btnRoomsClose.addEventListener("click", () => setRoomsOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setRoomsOpen(false);
  });
  document.addEventListener("click", (e) => {
    if (roomsDrawer.dataset.open !== "true") return;
    if (!e.target.closest("#waRooms") && !e.target.closest("#waRoomsOpen")) setRoomsOpen(false);
  });

  let activeRoom = null;

  function stopRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function renderMessage(m) {
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const who = m.user_name || "Anonymous";
    const mine = m.user_id === session.user.id;

    if (m.type === "voice" && m.voice_url) {
      return `
        <div class="wa-row ${mine ? "me" : "them"}">
          <div class="wa-bubble">
            <div class="wa-who">${escapeHtml(who)}</div>
            <audio controls src="${escapeHtml(m.voice_url)}" style="width:220px; max-width:100%; margin-top:6px;"></audio>
            <div class="wa-time">${escapeHtml(time)}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="wa-row ${mine ? "me" : "them"}">
        <div class="wa-bubble">
          <div class="wa-who">${escapeHtml(who)}</div>
          <div class="wa-text">${escapeHtml(m.text || "")}</div>
          <div class="wa-time">${escapeHtml(time)}</div>
        </div>
      </div>
    `;
  }

  async function loadRooms() {
    const { data, error } = await supabase
      .from("rooms")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      roomsListEl.innerHTML = `<p class="muted">Rooms error: ${escapeHtml(error.message)}</p>`;
      return;
    }

    if (!data?.length) {
      roomsListEl.innerHTML = `<p class="muted">No rooms yet. Create one.</p>`;
      return;
    }

    roomsListEl.innerHTML = data
      .map((r) => `<button class="wa-room" type="button" data-room-id="${r.id}">${escapeHtml(r.name)}</button>`)
      .join("");

    roomsListEl.querySelectorAll("[data-room-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-room-id");
        const room = data.find((x) => x.id === id);
        if (room) selectRoom(room);
      });
    });
  }

  async function loadMessages(roomId) {
    const { data, error } = await supabase
      .from("messages")
      .select("id,room_id,user_id,user_name,type,text,voice_url,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) {
      chatBoxEl.innerHTML = `<p class="muted">Messages error: ${escapeHtml(error.message)}</p>`;
      return;
    }

    chatBoxEl.innerHTML = (data || []).map(renderMessage).join("");
    chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
  }

  function startRealtime(roomId) {
    stopRealtime();

    realtimeChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const m = payload.new;
          chatBoxEl.insertAdjacentHTML("beforeend", renderMessage(m));
          chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
        }
      )
      .subscribe();
  }

  async function selectRoom(room) {
    activeRoom = room;
    roomTitleEl.textContent = room.name;
    roomSubEl.textContent = "Group chat";
    chatStatusEl.textContent = "";
    await loadMessages(room.id);
    startRealtime(room.id);
    setRoomsOpen(false);
  }

  document.getElementById("room_create").addEventListener("click", async () => {
    const name = String(document.getElementById("room_name").value || "").trim();
    if (!name) return;

    const { error } = await supabase.from("rooms").insert({
      name,
      created_by: session.user.id
    });

    if (error) {
      chatStatusEl.textContent = error.message;
      return;
    }

    document.getElementById("room_name").value = "";
    await loadRooms();
  });

  document.getElementById("chat_send").addEventListener("click", async () => {
    if (!activeRoom) {
      chatStatusEl.textContent = "Select a room first.";
      return;
    }

    const text = String(chatTextEl.value || "").trim();
    if (!text) return;

    chatStatusEl.textContent = "Sending...";

    const { error } = await supabase.from("messages").insert({
      room_id: activeRoom.id,
      user_id: session.user.id,
      user_name: myName,
      type: "text",
      text
    });

    if (error) {
      chatStatusEl.textContent = error.message;
      return;
    }

    chatTextEl.value = "";
    chatStatusEl.textContent = "";
    chatTextEl.focus();
  });

  chatTextEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("chat_send").click();
    }
  });

  voiceInput.addEventListener("change", async () => {
    if (!activeRoom) {
      chatStatusEl.textContent = "Select a room first.";
      return;
    }

    const file = voiceInput.files?.[0];
    if (!file) return;

    chatStatusEl.textContent = "Uploading voice note...";

    const ext = (file.name.split(".").pop() || "webm").toLowerCase();
    const filePath = `${session.user.id}/${activeRoom.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage.from("voice-notes").upload(filePath, file, { upsert: false });
    if (upErr) {
      chatStatusEl.textContent = upErr.message;
      return;
    }

    const { data: pub } = supabase.storage.from("voice-notes").getPublicUrl(filePath);
    const voice_url = pub?.publicUrl;

    const { error: msgErr } = await supabase.from("messages").insert({
      room_id: activeRoom.id,
      user_id: session.user.id,
      user_name: myName,
      type: "voice",
      voice_url,
      text: null
    });

    if (msgErr) {
      chatStatusEl.textContent = msgErr.message;
      return;
    }

    chatStatusEl.textContent = "";
    voiceInput.value = "";
  });

  document.getElementById("logout_btn").addEventListener("click", async () => {
    stopRealtime();
    await supabase.auth.signOut();
    go("welcome");
  });

  await loadRooms();
}

/* =======================
   Footer year
======================= */
function setFooterYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

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
  if (r === "auth") return renderAuth();
  if (r === "learning") return renderLearning();

  return renderWelcome();
}

function render(route) {
  if (state.isNavigating) return;

  const r = route || "welcome";
  let actual = r;

  if (requireUnlock(r)) {
    state.intendedRoute = r;
    actual = "lock";
  }

  state.isNavigating = true;

  withTransition(() => {
    const maybePromise = renderRoute(actual);
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
  if (!app) {
    alert('Missing <div id="app"></div> (or <main id="app"></main>) in your HTML.');
    return;
  }

  bindNavRoutes();
  bindMobileMenu();
  bindGlobalKeyboard();
  setFooterYear();

  const initial = (window.location.hash || "").slice(1);
  render(initial || "welcome");
});
