
/* =========================================================
   Mas'alah — App.js (FULL, paste-ready)

   What this fixes:
   1) Supabase is NOT imported/initialized at the top level.
   2) Fasl + Library never touch Supabase (pure offline).
   3) Supabase is loaded ONLY inside Auth/Learning (lazy import).
   4) Routing is clean. No “route === library” bug.
   5) No global `supabase` variable that leaks into offline pages.

   REQUIREMENT:
   Create this file: /scripts/supabaseClient.js

   // supabaseClient.js
   import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
   export const supabase = createClient("https://kjggfschpuqfggyasnux.supabase.co","sb_publishable_wkNt08rBEiLv70BpmMbKiA_GVGMjTO7");

========================================================= */

import { HAYD_PACK } from "./packs/hayd.js";
import { ISTIHADA_PACK } from "./packs/istihada.js";
import { NIFAS_PACK } from "./packs/nifas.js";
import { FOUNDATIONS_PACK } from "./packs/foundations.js";

/* =======================
   App root
======================= */
const app = document.getElementById("app");

/* =======================
   LocalStorage keys
======================= */
const STORAGE_KEY = "masalah_progress_v2";
const DAILY_KEY = "masalah_daily_v2";
const DIARY_KEY = "masalah_diary_v1";
const LOCK_PIN_HASH_KEY = "masalah_pin_hash_v1";
const LOCK_UNLOCKED_UNTIL_KEY = "masalah_unlocked_until_v1";
const BAG_KEY = "masalah_shuffle_bag_v1";
const QUESTIONS_CACHE_KEY = "masalah_questions_cache_v1";
const QUESTIONS_CACHE_AT_KEY = "masalah_questions_cache_at_v1";
const FASL_KEY = "masalah_fasl_v1";

/* Protect what you want */
const PROTECTED_ROUTES = new Set(["progress"]); // add "diary" if you later protect it

/* Categories must match data/questions.json exactly */
const CATEGORIES = ["Qur’an", "Seerah", "Fiqh", "Tawheed", "Arabic", "Adhkaar"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"];

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
  lastSettings: null,
  isNavigating: false,
  currentRoute: "welcome",
  intendedRoute: null,
  answerLog: [],
  _finalized: false
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
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
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
    case "download":
      return wrap(
        `<path ${common} d="M12 3v12"/>` +
          `<path ${common} d="M7 10l5 5 5-5"/>` +
          `<path ${common} d="M5 21h14"/>`
      );
    case "check":
      return wrap(`<path ${common} d="M20 6L9 17l-5-5"/>`);
    default:
      return wrap(`<circle ${common} cx="12" cy="12" r="9"/>`);
  }
}

/* =======================
   Progress storage
======================= */
function defaultProgress() {
  return {
    streakCount: 0,
    lastActiveDate: null,
    lastAttempt: null,
    mastery: {},
    mistakes: {},
    reviewQueue: [],
    bestScores: {}
  };
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultProgress();
  try {
    return { ...defaultProgress(), ...JSON.parse(raw) };
  } catch {
    return defaultProgress();
  }
}

function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
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

  const diffDays = Math.round((new Date(today) - new Date(last)) / 86400000);
  progress.streakCount = diffDays === 1 ? progress.streakCount + 1 : 1;
  progress.lastActiveDate = today;
}

function masteryKey(category, level) {
  return `${category}|${level}`;
}

function updateMastery(progress, category, level, score, total) {
  const k = masteryKey(category, level);
  const attemptPct = total > 0 ? score / total : 0;
  const prev = typeof progress.mastery[k] === "number" ? progress.mastery[k] : null;

  const alpha = 0.25;
  const next = prev === null ? attemptPct : alpha * attemptPct + (1 - alpha) * prev;
  progress.mastery[k] = +next.toFixed(4);
}

function overallKnowledgeScore(progress) {
  const vals = Object.values(progress.mastery || {});
  if (!vals.length) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(avg * 100);
}

function weakestTopic(progress) {
  const entries = Object.entries(progress.mastery || {});
  if (!entries.length) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [key, val] = entries[0];
  const [cat, lvl] = key.split("|");
  return { cat, lvl, pct: Math.round(val * 100) };
}

function recordAnswer(progress, q, isCorrect) {
  if (!progress.mistakes) progress.mistakes = {};
  if (!progress.reviewQueue) progress.reviewQueue = [];

  const id = q.id;
  const now = new Date().toISOString();

  if (!progress.mistakes[id]) {
    progress.mistakes[id] = { wrong: 0, right: 0, lastWrongAt: null, lastRightAt: null };
  }

  if (isCorrect) {
    progress.mistakes[id].right += 1;
    progress.mistakes[id].lastRightAt = now;
  } else {
    progress.mistakes[id].wrong += 1;
    progress.mistakes[id].lastWrongAt = now;
    if (!progress.reviewQueue.includes(id)) progress.reviewQueue.unshift(id);
  }

  if (progress.reviewQueue.length > 200) progress.reviewQueue = progress.reviewQueue.slice(0, 200);
}

function getQuestionsByIds(ids, allQuestions) {
  const map = new Map(allQuestions.map((q) => [q.id, q]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

function buildMistakeSet(progress, allQuestions, count = 20) {
  const ids = progress.reviewQueue || [];
  const qs = getQuestionsByIds(ids, allQuestions);

  qs.sort((a, b) => {
    const ma = progress.mistakes?.[a.id]?.wrong || 0;
    const mb = progress.mistakes?.[b.id]?.wrong || 0;
    return mb - ma;
  });

  return qs.slice(0, count);
}

/* =======================
   Questions: offline-first
======================= */
function cacheQuestionsLocally(questions) {
  try {
    localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(questions));
    localStorage.setItem(QUESTIONS_CACHE_AT_KEY, String(Date.now()));
  } catch {}
}

function loadCachedQuestions() {
  try {
    const raw = localStorage.getItem(QUESTIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function loadQuestions() {
  if (state.allQuestions.length) return state.allQuestions;

  try {
    const res = await fetch("data/questions.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load data/questions.json");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("questions.json must be an array");
    state.allQuestions = data;
    cacheQuestionsLocally(data);
    return state.allQuestions;
  } catch (err) {
    const cached = loadCachedQuestions();
    if (cached && cached.length) {
      state.allQuestions = cached;
      showToast("Offline mode. Using cached questions.");
      return state.allQuestions;
    }
    throw err;
  }
}

/* =======================
   Daily state
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
   Shuffle bag
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

function isEligibleQuestion(q, category, level) {
  if (q.category !== category) return false;
  if (q.level !== level) return false;

  if (level === "Advanced") {
    const id = String(q.id || "");
    return id.includes("_adv_") || id.includes("_jaamiah_") || id.includes("_advanced_");
  }
  return true;
}

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
   Nav + Routing helpers
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
    if (prevBtn && !prevBtn.disabled) {
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
   PWA (safe no-op)
======================= */
let deferredInstallPrompt = null;
function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById("installBtn");
    if (btn) btn.style.display = "inline-flex";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById("installBtn");
    if (btn) btn.style.display = "none";
    showToast("Installed.");
  });
}
async function triggerInstall() {
  if (!deferredInstallPrompt) {
    showToast("Install not available on this device yet.");
    return;
  }
  deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } catch {}
  deferredInstallPrompt = null;
  const btn = document.getElementById("installBtn");
  if (btn) btn.style.display = "none";
}
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

/* =========================================================
   SUPABASE ISOLATION (LAZY)
========================================================= */
let _supabaseClient = null;

async function getSupabase() {
  if (_supabaseClient) return _supabaseClient;
  const mod = await import("./supabaseClient.js");
  _supabaseClient = mod.supabase;
  return _supabaseClient;
}

async function requireAuthOrRoute(routeIfMissing = "auth") {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    const session = data?.session || null;
    if (!session) {
      go(routeIfMissing);
      return null;
    }
    return session;
  } catch {
    go(routeIfMissing);
    return null;
  }
}

function displayNameFromSession(session) {
  const meta = session?.user?.user_metadata || {};
  const name =
    meta.display_name ||
    meta.name ||
    session?.user?.email?.split("@")?.[0] ||
    "Anonymous";
  return String(name || "Anonymous").trim() || "Anonymous";
}

/* =======================
   Views: Welcome
======================= */
function renderWelcome() {
  state.currentRoute = "welcome";

  const progress = loadProgress();
  const hasAnyActivity =
    (progress.lastAttempt && progress.lastAttempt.total) ||
    progress.streakCount > 0 ||
    Object.keys(progress.bestScores || {}).length > 0;

  app.innerHTML = `
    <section class="welcomev2">
      <div class="welcomev2-shell">

        <header class="welcomev2-hero">
          <div class="welcomev2-mark" aria-hidden="true">م</div>

          <div class="welcomev2-heroText">
            <div class="welcomev2-kicker">
              ${icon("spark")}
              <span>Mas'alah</span>
              <span class="dot">•</span>
              <span class="muted">Quiet revision</span>
            </div>

            <h2 class="welcomev2-title">Build knowledge that stays</h2>

            <p class="welcomev2-sub muted">
              Quizzes and Learning space.
            </p>

            <div class="welcomev2-cta">
              <button class="primary" type="button" data-goto="daily">
                <span class="btn-inner">${icon("bolt")}Start today’s quiz</span>
              </button>

              <button class="btn" type="button" data-goto="${hasAnyActivity ? "home" : "faq"}">
                <span class="btn-inner">${icon("target")}${hasAnyActivity ? "Open dashboard" : "How it works"}</span>
              </button>

              <button id="installBtn" class="btn" type="button" style="display:none;">
                <span class="btn-inner">${icon("download")}Install</span>
              </button>
            </div>
        </header>

        <section class="welcomev2-grid">
          <article class="welcomev2-card">
            <div class="welcomev2-cardTop">
              <div class="k">${icon("bolt")}</div>
              <h3>Daily Discipline</h3>
            </div>
            <p class="muted">
              Locked so you stop negotiating with yourself.
            </p>
            <button class="welcomev2-mini btn" type="button" data-goto="daily">Start Daily</button>
          </article>

          <article class="welcomev2-card">
            <div class="welcomev2-cardTop">
              <div class="k">${icon("book")}</div>
              <h3>Fasl Archive</h3>
            </div>
            <p class="muted">Cases to be read like a fiqh circle.</p>
            <button class="welcomev2-mini btn" type="button" data-goto="fasl">Open Fasl</button>
          </article>

          <article class="welcomev2-card">
            <div class="welcomev2-cardTop">
              <div class="k">${icon("shield")}</div>
              <h3>Private by Design</h3>
            </div>
            <p class="muted">Lock what matters.</p>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="welcomev2-mini btn" type="button" data-goto="diary">Diary</button>
              <button class="welcomev2-mini btn" type="button" data-goto="lock">Lock</button>
            </div>
          </article>

          <article class="welcomev2-card">
            <div class="welcomev2-cardTop">
              <div class="k">${icon("layers")}</div>
              <h3>Learning Space</h3>
            </div>
            <p class="muted">
              Rooms and Community.
            </p>
            <button class="welcomev2-mini btn" type="button" data-goto="learning">Enter</button>
          </article>
        </section>

        <section class="welcomev2-footnote">
          <div class="welcomev2-rule" aria-hidden="true"></div>
          <p class="muted">
            Principle: consistency beats intensity. One steady step daily.
          </p>
        </section>

      </div>
    </section>
  `;

  bindGotoButtons();

  const installBtn = document.getElementById("installBtn");
  if (installBtn) {
    installBtn.addEventListener("click", triggerInstall);
    if (deferredInstallPrompt) installBtn.style.display = "inline-flex";
  }
}

/* =======================
   Dashboard (Home)
======================= */
function renderMasteryTable(progress) {
  const entries = Object.entries(progress.mastery || {});
  if (!entries.length) return "";

  entries.sort((a, b) => b[1] - a[1]);

  const rows = entries
    .slice(0, 10)
    .map(([k, v]) => {
      const [cat, lvl] = k.split("|");
      const pct = Math.round(v * 100);
      return `
        <div class="mrow">
          <div class="mleft">
            <strong>${escapeHtml(cat)}</strong>
            <span class="muted small">${escapeHtml(lvl)}</span>
          </div>
          <div class="mright">
            <span class="muted small">${pct}%</span>
            <div class="mbar"><div class="mfill" style="width:${pct}%"></div></div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card" style="margin-top:16px;">
      <h3 style="margin:0;">Mastery</h3>
      <p class="muted small" style="margin:8px 0 0 0;">Based on your attempts. This is a direction.</p>
      <div class="mtable" style="margin-top:12px;">
        ${rows}
      </div>
    </section>
  `;
}

function renderHome() {
  state.currentRoute = "home";

  const progress = loadProgress();
  const last = progress.lastAttempt;

  const streakLabel = progress.streakCount === 1 ? "1 day" : `${progress.streakCount} days`;
  const knowledge = overallKnowledgeScore(progress);
  const weak = weakestTopic(progress);

  const mistakesTotal = Object.values(progress.mistakes || {}).reduce((acc, m) => acc + (m.wrong || 0), 0);
  const uniqueMistakes = Object.keys(progress.mistakes || {}).filter((id) => (progress.mistakes[id]?.wrong || 0) > 0).length;

  const lastHeadline = last ? `${last.score}/${last.total} (${last.percent}%)` : "No attempts yet";
  const lastSub = last ? `${last.category} • ${last.level} • ${last.date}` : "Start Daily or choose a module.";

  app.innerHTML = `
    <section class="homev2">

      <header class="homev2-head">
        <div class="homev2-title">
          <h2>Mas'alah</h2>
          <p class="muted">A calm learning system.</p>
        </div>

        <div class="homev2-quick">
          <button class="primary" type="button" data-goto="daily">
            <span class="btn-inner">${icon("bolt")}Daily</span>
          </button>
          <button class="btn" type="button" data-goto="review">
            <span class="btn-inner">${icon("layers")}Review</span>
          </button>
          <button class="btn" type="button" data-goto="fasl">
            <span class="btn-inner">${icon("book")}Fasl</span>
          </button>
          <button class="btn" type="button" data-goto="learning">
            <span class="btn-inner">${icon("shield")}Learning Space</span>
          </button>
        </div>
      </header>

      <section class="homev2-status">
        <div class="card">
          <p class="muted">Knowledge score</p>
          <div class="big">${knowledge}%</div>
          <p class="muted small">Average mastery from your attempts.</p>
        </div>

        <div class="card">
          <p class="muted">Streak</p>
          <div class="big">${escapeHtml(streakLabel)}</div>
          <p class="muted small">Last active: ${escapeHtml(progress.lastActiveDate || "Not yet")}</p>
        </div>

        <div class="card">
          <p class="muted">Weakest focus</p>
          <div class="big">${weak ? `${weak.pct}%` : "-"}</div>
          <p class="muted small">${weak ? `${escapeHtml(weak.cat)} • ${escapeHtml(weak.lvl)}` : "Attempt quizzes to generate mastery."}</p>
        </div>

        <div class="card">
          <p class="muted">Mistakes</p>
          <div class="big">${uniqueMistakes}</div>
          <p class="muted small">${mistakesTotal} total wrong answers tracked.</p>
          <div style="margin-top:10px;">
            <button class="btn" type="button" data-goto="review">
              <span class="btn-inner">${icon("layers")}Open review</span>
            </button>
          </div>
        </div>
      </section>

      <section class="card homev2-last">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
          <div>
            <p class="muted" style="margin:0;">Last attempt</p>
            <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
              ${icon("target")}
              <strong style="font-size:18px;">${escapeHtml(lastHeadline)}</strong>
            </div>
            <p class="muted small" style="margin-top:6px;">${escapeHtml(lastSub)}</p>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn" type="button" data-goto="progress">Progress</button>
            <button class="btn" type="button" data-goto="faq">How it works</button>
          </div>
        </div>
      </section>

      <section class="homev2-architecture">
        <div class="homev2-block">
          <div class="homev2-block-head">
            <h3>Offline Core</h3>
            <p class="muted small">Built for consistency.</p>
          </div>

          <div class="homev2-links">
            <button class="homev2-link" type="button" data-goto="daily">
              <div class="k">${icon("bolt")}</div>
              <div>
                <div class="t">Daily Quiz</div>
                <div class="d muted small">Locked set each day.</div>
              </div>
            </button>

            <button class="homev2-link" type="button" data-goto="home">
              <div class="k">${icon("target")}</div>
              <div>
                <div class="t">Custom Quiz</div>
                <div class="d muted small">Pick category and level.</div>
              </div>
            </button>

            <button class="homev2-link" type="button" data-goto="review">
              <div class="k">${icon("layers")}</div>
              <div>
                <div class="t">Mistake Review</div>
                <div class="d muted small">Fix weak points first.</div>
              </div>
            </button>

            <button class="homev2-link" type="button" data-goto="calendar">
              <div class="k">${icon("calendar")}</div>
              <div>
                <div class="t">Hijri Calendar</div>
                <div class="d muted small">White days and rhythm.</div>
              </div>
            </button>
          </div>
        </div>

        <div class="homev2-block">
          <div class="homev2-block-head">
            <h3>Fasl Archive</h3>
            <p class="muted small">Offline library.</p>
          </div>

          <div class="homev2-links">
            <button class="homev2-link" type="button" data-goto="fasl">
              <div class="k">${icon("book")}</div>
              <div>
                <div class="t">Open Fasl</div>
                <div class="d muted small">Learn, Track, Library packs.</div>
              </div>
            </button>

            <button class="homev2-link" type="button" data-goto="library">
              <div class="k">${icon("book")}</div>
              <div>
                <div class="t">Library (Direct)</div>
                <div class="d muted small">Jump straight into cases.</div>
              </div>
            </button>
          </div>
        </div>

        <div class="homev2-block">
          <div class="homev2-block-head">
            <h3>Private</h3>
            <p class="muted small">Yours alone.</p>
          </div>

          <div class="homev2-links">
            <button class="homev2-link" type="button" data-goto="diary">
              <div class="k">${icon("shield")}</div>
              <div>
                <div class="t">Diary</div>
                <div class="d muted small">Offline journal</div>
              </div>
            </button>

            <button class="homev2-link" type="button" data-goto="lock">
              <div class="k">${icon("shield")}</div>
              <div>
                <div class="t">Lock</div>
                <div class="d muted small">Protect Diary and Progress.</div>
              </div>
            </button>
          </div>
        </div>

        <div class="homev2-block">
          <div class="homev2-block-head">
            <h3>Online Layer</h3>
            <p class="muted small">Community learning.</p>
          </div>

          <div class="homev2-links">
            <button class="homev2-link" type="button" data-goto="learning">
              <div class="k">${icon("layers")}</div>
              <div>
                <div class="t">Learning Space</div>
                <div class="d muted small">Rooms, and messages.</div>
              </div>
            </button>

            <button class="homev2-link" type="button" data-goto="auth">
              <div class="k">${icon("shield")}</div>
              <div>
                <div class="t">Login / Signup</div>
                <div class="d muted small">Only needed for Learning Space.</div>
              </div>
            </button>
          </div>
        </div>

        <div class="homev2-block">
          <div class="homev2-block-head">
            <h3>Tools</h3>
            <p class="muted small">Practical utilities.</p>
          </div>

          <div class="homev2-links">
            <button class="homev2-link" type="button" data-goto="zakat">
              <div class="k">${icon("target")}</div>
              <div>
                <div class="t">Zakat Calculator</div>
                <div class="d muted small">Offline tool. Quick estimate.</div>
              </div>
            </button>
          </div>
        </div>

      </section>

      ${renderMasteryTable(progress)}
    </section>
  `;

  bindGotoButtons();
}

/* =======================
   Daily
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
      <p class="muted">Refreshing will not change the questions till tomorrow.</p>

      <div class="grid" style="margin-top:12px;">
        <label class="field">
          <span>Category</span>
          <select id="dailyCategory">
            ${CATEGORIES.map(
              (c) =>
                `<option ${c === defaultCategory ? "selected" : ""} value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
            ).join("")}
          </select>
        </label>

        <label class="field">
          <span>Level</span>
          <select id="dailyLevel">
            ${LEVELS.map(
              (l) =>
                `<option ${l === defaultLevel ? "selected" : ""} value="${escapeHtml(l)}">${escapeHtml(l)}</option>`
            ).join("")}
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
            ? `<p class="muted">Locked for today: ${escapeHtml(existing.category)} • ${escapeHtml(existing.level)} (${existing.questionIds.length} questions)</p>`
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
      state._finalized = false;

      state.quizQuestions = chosen;
      state.index = 0;
      state.score = 0;
      state.timed = timed;
      state.answerLog = [];

      withTransition(renderQuiz);
    } catch (err) {
      status.textContent = String(err?.message || err);
    }
  });

  bindGotoButtons();
}

/* =======================
   Review
======================= */
async function renderReview() {
  state.currentRoute = "review";

  const progress = loadProgress();
  const all = await loadQuestions();
  const mistakeSet = buildMistakeSet(progress, all, 20);

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2 style="margin:0;">Review</h2>
      <p class="muted" style="margin:8px 0 0 0; line-height:1.6;">
        Your most missed questions first. Fix the cracks.
      </p>

      <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="primary" type="button" id="startMistakeReview" ${mistakeSet.length ? "" : "disabled"}>
          <span class="btn-inner">${icon("layers")}Start mistake review (${mistakeSet.length})</span>
        </button>
        <button class="btn" type="button" data-goto="home">Back to dashboard</button>
      </div>

      ${mistakeSet.length ? "" : `<p class="muted" style="margin-top:12px;">No mistakes tracked yet. Do a quiz first.</p>`}
    </section>
  `;

  document.getElementById("startMistakeReview")?.addEventListener("click", () => {
    state.lastSettings = { category: "Mistakes", level: "Review", timed: false, count: mistakeSet.length, mode: "review" };
    state._finalized = false;

    state.quizQuestions = mistakeSet;
    state.index = 0;
    state.score = 0;
    state.timed = false;
    state.answerLog = [];

    withTransition(renderQuiz);
  });

  bindGotoButtons();
}

/* =======================
   Quiz
======================= */
function lockInAnswer({ selectedIdx, reason }) {
  const q = state.quizQuestions[state.index];
  const correctIdx = q.correctIndex;

  if (state.answerLog[state.index]) return;

  const isCorrect = selectedIdx === correctIdx;

  state.answerLog[state.index] = {
    selectedIdx,
    correctIdx,
    isCorrect,
    reason,
    explanation: q.explanation || "",
    questionId: q.id
  };

  if (isCorrect) state.score += 1;

  const progress = loadProgress();
  updateStreak(progress);
  recordAnswer(progress, q, isCorrect);
  saveProgress(progress);
}

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

  if (meta.reason === "timeout") vibrate(20);
  else vibrate(isCorrect ? 15 : [10, 30, 10]);

  lockInAnswer({
    selectedIdx,
    reason: meta.reason === "timeout" ? "timeout" : "choice"
  });

  applyAnsweredUI(selectedIdx, correct, meta.reason === "timeout" ? "timeout" : "choice", q.explanation || "");
}

/* =======================
   Results
======================= */
function finalizeAttemptOnce() {
  if (state._finalized) return;
  state._finalized = true;

  const total = state.quizQuestions.length;
  const percent = total ? Math.round((state.score / total) * 100) : 0;

  const progress = loadProgress();
  updateStreak(progress);

  const category = state.lastSettings?.category || "Unknown";
  const level = state.lastSettings?.level || "Unknown";
  const key = masteryKey(category, level);

  const prevBest = progress.bestScores[key] ?? 0;
  progress.bestScores[key] = Math.max(prevBest, percent);

  progress.lastAttempt = {
    date: todayISO(),
    category,
    level,
    score: state.score,
    total,
    percent
  };

  if (state.lastSettings?.mode === "custom" || state.lastSettings?.mode === "daily") {
    updateMastery(progress, category, level, state.score, total);
  }

  saveProgress(progress);
}

function renderResults() {
  state.currentRoute = "results";
  clearTimer();

  finalizeAttemptOnce();

  const total = state.quizQuestions.length;
  const percent = total ? Math.round((state.score / total) * 100) : 0;

  const category = state.lastSettings?.category || "Unknown";
  const level = state.lastSettings?.level || "Unknown";

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
      <p class="muted">${escapeHtml(category)} • ${escapeHtml(level)}</p>

      <div style="font-size:34px; font-weight:950; margin:10px 0;">
        ${state.score} / ${total} (${percent}%)
      </div>

      <div class="card" style="margin-top:12px; box-shadow:none;">
        <p class="muted" style="margin:0 0 8px 0;">Review</p>
        <p class="muted" style="margin:0 0 10px 0;">Tap any question to revisit its explanation. Wrong ones are bolded.</p>
        <div class="diary-list">${reviewHtml}</div>
      </div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="tryAgainBtn" class="btn" type="button">Try Again</button>
        <button id="reviewBtn" class="btn" type="button">Review mistakes</button>
        <button id="homeBtn" class="btn" type="button">Back to dashboard</button>
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

  document.getElementById("tryAgainBtn").addEventListener("click", async () => {
    const s = state.lastSettings;
    if (!s) return go("home");

    if (s.mode === "daily") return go("daily");
    if (s.mode === "review") return go("review");

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
    state._finalized = false;

    withTransition(renderQuiz);
  });

  document.getElementById("reviewBtn").addEventListener("click", () => go("review"));
  document.getElementById("homeBtn").addEventListener("click", () => go("home"));
}

/* =======================
   Progress page
======================= */
function renderProgress() {
  state.currentRoute = "progress";

  const progress = loadProgress();
  const bestEntries = Object.entries(progress.bestScores || {}).sort((a, b) => b[1] - a[1]);
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
          <p class="muted" style="margin-top:6px;">Last active: ${escapeHtml(progress.lastActiveDate || "Not yet")}</p>
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
                     .slice(0, 20)
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
          <button class="btn" type="button" data-goto="home">Back to dashboard</button>
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
                  A short Islamic quiz app designed to help you revise consistently.
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
                  It is locked for the day. Refreshing does not change the questions.
                </div>
              </details>

              <details class="faq-item">
                <summary>
                  <span class="faq-q">
                    <span class="faq-dot">${icon("layers")}</span>
                    What is mistake review?
                  </span>
                  <span class="faq-chevron">${icon("check")}</span>
                </summary>
                <div class="faq-a">
                  Review pulls your most missed questions first.
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
                  Locally on your device.
                </div>
              </details>
            </div>
          </div>

          <div class="faq-side">
            <div class="faq-panel">
              <h3 style="margin:0;">Quick start</h3>
              <p class="muted" style="margin:8px 0 0; line-height:1.6;">
                If you want the simplest path, do Today’s Quiz daily. If you want to target a weakness, do a Custom quiz.
              </p>
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="primary" type="button" data-goto="daily">
                  <span class="btn-inner">${icon("bolt")}Start today</span>
                </button>
                <button class="btn" type="button" data-goto="home">
                  <span class="btn-inner">${icon("target")}Open dashboard</span>
                </button>
                <button class="btn" type="button" data-goto="review">
                  <span class="btn-inner">${icon("layers")}Review</span>
                </button>
              </div>
            </div>

            <div class="faq-panel">
              <h3 style="margin:0;">Reminder</h3>
              <p class="muted" style="margin:8px 0 0; line-height:1.6;">
                Consistency beats intensity. The goal is to remember.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  `;

  bindGotoButtons();
}

/* =========================================================
   FASL (OFFLINE ONLY)
========================================================= */
function loadFasl() {
  try {
    const raw = localStorage.getItem(FASL_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? parsed
      : {
          lastPeriodStart: "",
          cycleLength: 28,
          periodLength: 5,
          notes: ""
        };
  } catch {
    return { lastPeriodStart: "", cycleLength: 28, periodLength: 5, notes: "" };
  }
}

function saveFasl(data) {
  localStorage.setItem(FASL_KEY, JSON.stringify(data));
}

function clampNum(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function addDays(dateISO, days) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + Number(days || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtISO(iso) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

async function renderFasl() {
  state.currentRoute = "fasl";

  app.innerHTML = `
    <section class="card" style="margin-top:20px; max-width:980px; margin-inline:auto;">
      <div class="card-head">
        <h2 style="margin:0;">Fasl</h2>
        <p class="muted" style="margin:8px 0 0 0; line-height:1.6;">
          Women’s blood rulings with a private cycle tracker.
          This does not replace medical care. If symptoms are severe or unusual, speak to a clinician.
        </p>
      </div>

      <div class="segmented" role="group" aria-label="Fasl tabs" style="margin-top:12px;">
        <button class="seg-btn is-on" type="button" data-fasl-tab="learn">Learn</button>
        <button class="seg-btn" type="button" data-fasl-tab="track">Track</button>
        <button class="seg-btn" type="button" data-fasl-tab="library">Library</button>
      </div>

      <div id="fasl_panel" style="margin-top:12px;"></div>
    </section>
  `;

  const panel = app.querySelector("#fasl_panel");
  const tabBtns = Array.from(app.querySelectorAll("[data-fasl-tab]"));

  function setTab(name) {
    tabBtns.forEach((b) => b.classList.toggle("is-on", b.dataset.faslTab === name));

    if (name === "learn") renderFaslLearn(panel);
    else if (name === "track") renderFaslTrack(panel);
    else if (name === "library") renderFaslLibrary(panel);
    else renderFaslLearn(panel);
  }

  tabBtns.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.faslTab)));
  setTab("learn");
}

function renderFaslLearn(panel) {
  panel.innerHTML = `
    <div class="card" style="box-shadow:none;">
      <h3>Foundations</h3>
      <p class="muted" style="line-height:1.7;">
        Ḥayḍ is natural menstrual blood.<br/>
        Istiḥāḍah is irregular bleeding.<br/>
        Nifās is post-natal bleeding.<br/>
        Each has distinct rulings for prayer, fasting, ghusl, and marital relations.
      </p>
      <p class="muted" style="margin-top:10px;">
        Study principles first. Then review cases in the Library tab.
      </p>
      <div style="margin-top:12px;">
        <button class="btn" type="button" data-goto="library">Open full Fasl Library</button>
      </div>
    </div>
  `;
  bindGotoButtons();
}

function buildCycleModel(fasl) {
  const last = fasl.lastPeriodStart || "";
  const cycleLength = clampNum(fasl.cycleLength, 18, 45, 28);
  const periodLength = clampNum(fasl.periodLength, 2, 10, 5);

  if (!last) {
    return { nextPeriod: null, fertileStart: null, fertileEnd: null };
  }

  const nextPeriod = addDays(last, cycleLength);
  const ovulation = addDays(last, cycleLength - 14);
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);

  return { nextPeriod, fertileStart, fertileEnd, periodLength };
}

function renderFaslTrack(panel) {
  const d = loadFasl();
  const model = buildCycleModel(d);

  panel.innerHTML = `
    <div class="card" style="box-shadow:none;">
      <h3>Your Cycle (Private)</h3>

      <label class="field">
        <span>Last period start</span>
        <input id="fasl_last" type="date" value="${d.lastPeriodStart || ""}" />
      </label>

      <label class="field">
        <span>Cycle length</span>
        <input id="fasl_cycle" value="${d.cycleLength}" />
      </label>

      <label class="field">
        <span>Period length</span>
        <input id="fasl_period" value="${d.periodLength}" />
      </label>

      <div style="margin-top:12px;">
        <button id="fasl_save" class="primary">Save</button>
      </div>

      <div style="margin-top:20px;">
        <p><strong>Next expected period:</strong> ${fmtISO(model.nextPeriod)}</p>
        <p><strong>Fertile window:</strong> ${fmtISO(model.fertileStart)} to ${fmtISO(model.fertileEnd)}</p>
      </div>
    </div>
  `;

  panel.querySelector("#fasl_save").addEventListener("click", () => {
    saveFasl({
      lastPeriodStart: panel.querySelector("#fasl_last").value,
      cycleLength: clampNum(panel.querySelector("#fasl_cycle").value, 18, 45, 28),
      periodLength: clampNum(panel.querySelector("#fasl_period").value, 2, 10, 5),
      notes: ""
    });
    showToast("Saved.");
    renderFaslTrack(panel);
  });
}

function renderFaslLibrary(panel) {
  panel.innerHTML = `
    <div class="card" style="box-shadow:none;">
      <h3 style="margin-top:0;">Library</h3>
      <p class="muted" style="line-height:1.7;">
        Your offline fiqh packs load in the full Library route.
      </p>
      <button class="primary" type="button" data-goto="library">Open Library</button>
    </div>
  `;
  bindGotoButtons();
}

/* =========================================================
   FULL OFFLINE LIBRARY ROUTE
========================================================= */
function flattenPack(pack, packKey) {
  const out = [];
  let n = 0;

  (pack.sections || []).forEach((sec) => {
    (sec.cases || []).forEach((c) => {
      n += 1;
      const title = c[0] || "";
      const answer = c[1] || "";
      out.push({
        id: `${packKey}_${n}`,
        pack: packKey,
        section: sec.heading || "",
        no: n,
        title,
        answer
      });
    });
  });

  return out;
}

function packMeta() {
  const packs = [
    { key: "foundations", name: "Foundations", desc: "Definitions and max/min rules", pack: FOUNDATIONS_PACK },
    { key: "hayd", name: "Ḥayḍ", desc: "Menses rulings and patterns", pack: HAYD_PACK },
    { key: "istihada", name: "Istiḥāḍah", desc: "Non-menstrual bleeding rulings", pack: ISTIHADA_PACK },
    { key: "nifas", name: "Nifās", desc: "Postpartum bleeding rulings", pack: NIFAS_PACK }
  ];

  return packs.map((p) => {
    const items = flattenPack(p.pack, p.key);
    return { ...p, count: items.length, items };
  });
}

function renderFatwaCard(x) {
  const title = escapeHtml(x.title);
  const answer = escapeHtml(x.answer);
  const section = escapeHtml(x.section);

  return `
    <article class="fatwa">
      <div class="fatwa-top">
        <div class="fatwa-no">
          <span class="khutut">⟡</span>
          <span>Case ${escapeHtml(x.no)}</span>
        </div>
        <span class="fatwa-tag">${section || "General"}</span>
      </div>

      <h4 class="fatwa-title">${title}</h4>

      <div class="fatwa-body">
        <div>
          <div class="fatwa-label">Jawāb</div>
          <p class="fatwa-text">${answer}</p>
        </div>

        <details>
          <summary>
            Show “Mas’alah” header
            <span class="muted small">tap</span>
          </summary>
          <div style="margin-top:10px;">
            <div class="fatwa-label">Mas’alah</div>
            <p class="fatwa-text">${title}</p>
          </div>
        </details>
      </div>
    </article>
  `;
}

async function renderLibrary() {
  state.currentRoute = "library";

  const packs = packMeta();
  const total = packs.reduce((a, p) => a + p.count, 0);

  app.innerHTML = `
    <section class="library">
      <div class="library-hero">
        <div class="library-hero-top">
          <div>
            <h2 class="library-title">Fasl Library</h2>
            <p class="library-sub">
              A curated archive of women’s fiqh cases in a calm, classical format.
              Select a shelf, search within it, then read the rulings.
            </p>
          </div>

          <div class="library-badges">
            <span class="lib-badge">Total cases: <strong>${escapeHtml(total)}</strong></span>
            <span class="lib-badge">Mode: <strong>Offline</strong></span>
            <span class="lib-badge">Madhhab: <strong>Maliki</strong></span>
          </div>
        </div>

        <div class="library-controls">
          <div class="library-search">
            <input id="lib_search" type="text" placeholder="Search titles and rulings..." autocomplete="off" />
          </div>

          <div class="library-filters" id="lib_chips">
            ${packs
              .map(
                (p, i) => `
                <button class="lib-chip ${i === 0 ? "is-on" : ""}" type="button" data-pack="${escapeHtml(p.key)}">
                  ${escapeHtml(p.name)} <span class="muted small">(${escapeHtml(p.count)})</span>
                </button>
              `
              )
              .join("")}
          </div>
        </div>
      </div>

      <div class="library-grid">
        <aside class="topic-shelf">
          <div class="topic-shelf-head">
            <div class="topic-shelf-title">Shelves</div>
            <span class="muted small">Choose a pack</span>
          </div>
          <div class="topic-list" id="topic_list">
            ${packs
              .map(
                (p) => `
                <button class="topic-item" type="button" data-pack="${escapeHtml(p.key)}">
                  <div class="topic-item-top">
                    <span class="topic-name">${escapeHtml(p.name)}</span>
                    <span class="topic-meta">${escapeHtml(p.count)} cases</span>
                  </div>
                  <div class="topic-desc">${escapeHtml(p.desc)}</div>
                </button>
              `
              )
              .join("")}
          </div>
        </aside>

        <section class="archive-panel">
          <div class="archive-head">
            <div class="archive-title" id="archive_title">Foundations</div>
            <div class="archive-meta">
              <span class="pill" id="archive_count">0</span>
              <button class="btn mini" type="button" id="archive_top">Top</button>
            </div>
          </div>

          <div class="archive-scroll" id="archive_scroll"></div>
        </section>
      </div>
    </section>
  `;

  const elSearch = app.querySelector("#lib_search");
  const elChips = app.querySelector("#lib_chips");
  const elTopicList = app.querySelector("#topic_list");
  const elScroll = app.querySelector("#archive_scroll");
  const elTitle = app.querySelector("#archive_title");
  const elCount = app.querySelector("#archive_count");
  const btnTop = app.querySelector("#archive_top");

  let currentPackKey = packs[0]?.key || "foundations";
  let query = "";

  function getCurrentPack() {
    return packs.find((p) => p.key === currentPackKey) || packs[0];
  }

  function applyFilter(items) {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((x) => {
      const a = `${x.title}\n${x.answer}\n${x.section}`.toLowerCase();
      return a.includes(q);
    });
  }

  function paint() {
    const p = getCurrentPack();
    const items = applyFilter(p.items);

    elTitle.textContent = p.name;
    elCount.textContent = `${items.length} shown`;

    if (!items.length) {
      elScroll.innerHTML = `<p class="muted">No results. Try a simpler search.</p>`;
      return;
    }

    elScroll.innerHTML = items.map(renderFatwaCard).join("");
  }

  function setPack(key) {
    currentPackKey = key;

    elChips.querySelectorAll("[data-pack]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.pack === key);
    });

    paint();
    elScroll.scrollTop = 0;
  }

  elChips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pack]");
    if (!btn) return;
    setPack(btn.dataset.pack);
  });

  elTopicList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pack]");
    if (!btn) return;
    setPack(btn.dataset.pack);
  });

  elSearch.addEventListener("input", () => {
    query = String(elSearch.value || "");
    paint();
  });

  btnTop.addEventListener("click", () => {
    elScroll.scrollTop = 0;
  });

  setPack(currentPackKey);
}

/* =========================================================
   Calendar (Hijri)
========================================================= */
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
   Auth page (SUPABASE)
======================= */
async function renderAuth() {
  state.currentRoute = "auth";
  const supabase = await getSupabase();

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
   Learning Space (SUPABASE)
======================= */
let realtimeChannel = null;

async function renderLearning() {
  state.currentRoute = "learning";

  const supabase = await getSupabase();
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
        <p class="muted">Protect selected pages.</p>
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
}
/* =======================
   Zakat (offline module)
   - Pure calculation core
   - One renderer
   - One binder
======================= */

/** Zakat defaults kept in one place */
const ZAKAT_DEFAULTS = {
  currency: "NGN",
  method: "gold", // "gold" | "silver"
  nisabGrams: { gold: 85, silver: 595 },
  rate: 0.025,
  storageKey: "masalah_zakat_v1"
};

/** Small utils local to zakat */
function zakat_toNum(v) {
  const x = Number(String(v || "").replace(/,/g, "").trim());
  return Number.isFinite(x) ? x : 0;
}

function zakat_formatMoney(n, currency) {
  const num = Number(n || 0);
  const code = String(currency || "NGN").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2
    }).format(num);
  } catch {
    // fallback if currency code is invalid
    return `${num.toFixed(2)} ${code}`;
  }
}

/** Load/Save (so user doesn't retype every time) */
function zakat_loadState() {
  try {
    const raw = localStorage.getItem(ZAKAT_DEFAULTS.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function zakat_saveState(state) {
  try {
    localStorage.setItem(ZAKAT_DEFAULTS.storageKey, JSON.stringify(state));
  } catch {}
}

/** Pure core calculation */
function zakat_compute({
  method,
  pricePerGram,
  currency,
  hawlCompleted,
  assets,
  liabilities
}) {
  const grams = ZAKAT_DEFAULTS.nisabGrams[method] || 85;
  const nisab = pricePerGram > 0 ? pricePerGram * grams : 0;

  const totalAssets =
    (assets.cash || 0) +
    (assets.metals || 0) +
    (assets.investments || 0) +
    (assets.inventory || 0) +
    (assets.debtsOwed || 0);

  const totalLiabilities = (liabilities.debtsDue || 0);

  const zakatable = Math.max(0, totalAssets - totalLiabilities);

  const meetsNisab = nisab > 0 && zakatable >= nisab;
  const due = meetsNisab && hawlCompleted ? zakatable * ZAKAT_DEFAULTS.rate : 0;

  return {
    currency,
    method,
    grams,
    nisab,
    totalAssets,
    totalLiabilities,
    zakatable,
    meetsNisab,
    hawlCompleted,
    due
  };
}

/** Rendering: only HTML + placeholders */
function renderZakat() {
  state.currentRoute = "zakat";

  const saved = zakat_loadState();
  const d = {
    currency: saved?.currency || ZAKAT_DEFAULTS.currency,
    method: saved?.method || ZAKAT_DEFAULTS.method,
    pricePerGram: saved?.pricePerGram || "",
    hawlCompleted: !!saved?.hawlCompleted,
    cash: saved?.cash || "",
    metals: saved?.metals || "",
    investments: saved?.investments || "",
    inventory: saved?.inventory || "",
    debtsOwed: saved?.debtsOwed || "",
    debtsDue: saved?.debtsDue || ""
  };

  app.innerHTML = `
    <section class="card" style="margin-top:20px; max-width:980px; margin-inline:auto;">
      <div class="card-head">
        <h2>Zakat</h2>
        <p class="muted" style="line-height:1.7;">
          Estimate zakat on zakatable wealth. The rate is <strong>2.5%</strong> once you meet <strong>nisab</strong>
          and a lunar year (ḥawl) has passed.
        </p>
      </div>

      <div class="zakat-grid">

        <div class="zakat-box">
          <h3 class="zakat-title">1) Nisab</h3>

          <label class="field">
            <span>Currency</span>
            <input id="zk_currency" value="${escapeHtml(d.currency)}" placeholder="NGN, USD, GBP..." />
            <p class="help muted">Use a valid currency code.</p>
          </label>

          <div class="field">
            <span>Nisab method</span>
            <div class="segmented" role="group" aria-label="Nisab method">
              <button type="button" class="seg-btn ${d.method === "gold" ? "is-on" : ""}" data-zk-method="gold">
                Gold (85g)
              </button>
              <button type="button" class="seg-btn ${d.method === "silver" ? "is-on" : ""}" data-zk-method="silver">
                Silver (595g)
              </button>
            </div>
          </div>

          <label class="field">
            <span>Price per gram</span>
            <input id="zk_pricePerGram" inputmode="decimal" value="${escapeHtml(d.pricePerGram)}"
              placeholder="Enter current price per gram" />
          </label>

          <label class="checkline" style="margin-top:10px;">
            <input id="zk_hawl" type="checkbox" ${d.hawlCompleted ? "checked" : ""} />
            <span>Ḥawl completed (one lunar year)</span>
          </label>
        </div>

        <div class="zakat-box">
          <h3 class="zakat-title">2) Assets</h3>

          <label class="field"><span>Cash at hand / bank</span>
            <input id="zk_cash" inputmode="decimal" value="${escapeHtml(d.cash)}" placeholder="0" />
          </label>

          <label class="field"><span>Gold / silver value</span>
            <input id="zk_metals" inputmode="decimal" value="${escapeHtml(d.metals)}" placeholder="0" />
          </label>

          <label class="field"><span>Investments / shares / crypto</span>
            <input id="zk_investments" inputmode="decimal" value="${escapeHtml(d.investments)}" placeholder="0" />
          </label>

          <label class="field"><span>Business inventory (resale value)</span>
            <input id="zk_inventory" inputmode="decimal" value="${escapeHtml(d.inventory)}" placeholder="0" />
          </label>

          <label class="field"><span>Money owed to you (likely to be paid)</span>
            <input id="zk_debtsOwed" inputmode="decimal" value="${escapeHtml(d.debtsOwed)}" placeholder="0" />
          </label>
        </div>

        <div class="zakat-box">
          <h3 class="zakat-title">3) Liabilities</h3>

          <label class="field">
            <span>Short-term debts due now</span>
            <input id="zk_debtsDue" inputmode="decimal" value="${escapeHtml(d.debtsDue)}" placeholder="0" />
            <p class="help muted">Subtract only what is due and payable soon.</p>
          </label>

          <div class="zakat-actions">
            <button id="zk_calc" class="primary" type="button">Calculate</button>
            <button id="zk_reset" class="btn" type="button">Reset</button>
          </div>

          <div id="zk_result" class="zakat-result" aria-live="polite"></div>
        </div>

      </div>
    </section>
  `;

  zakat_bind();
  zakat_renderResult({ auto: true });
}

/** Binding: all events for zakat live here */
function zakat_bind() {
  const segBtns = Array.from(app.querySelectorAll("[data-zk-method]"));
  const elCurrency = app.querySelector("#zk_currency");
  const elPricePerGram = app.querySelector("#zk_pricePerGram");
  const elHawl = app.querySelector("#zk_hawl");

  const elCash = app.querySelector("#zk_cash");
  const elMetals = app.querySelector("#zk_metals");
  const elInvestments = app.querySelector("#zk_investments");
  const elInventory = app.querySelector("#zk_inventory");
  const elDebtsOwed = app.querySelector("#zk_debtsOwed");
  const elDebtsDue = app.querySelector("#zk_debtsDue");

  let method = segBtns.find((b) => b.classList.contains("is-on"))?.dataset.zkMethod || "gold";

  const persist = () => {
    zakat_saveState({
      currency: (elCurrency.value || "NGN").trim().toUpperCase(),
      method,
      pricePerGram: elPricePerGram.value || "",
      hawlCompleted: !!elHawl.checked,
      cash: elCash.value || "",
      metals: elMetals.value || "",
      investments: elInvestments.value || "",
      inventory: elInventory.value || "",
      debtsOwed: elDebtsOwed.value || "",
      debtsDue: elDebtsDue.value || ""
    });
  };

  segBtns.forEach((b) => {
    b.addEventListener("click", () => {
      method = b.dataset.zkMethod;
      segBtns.forEach((x) => x.classList.toggle("is-on", x === b));
      persist();
      zakat_renderResult({ auto: true, method });
    });
  });

  const onInput = () => {
    persist();
    zakat_renderResult({ auto: true, method });
  };

  [elCurrency, elPricePerGram, elHawl, elCash, elMetals, elInvestments, elInventory, elDebtsOwed, elDebtsDue]
    .forEach((el) => el.addEventListener("input", onInput));

  app.querySelector("#zk_calc").addEventListener("click", () => {
    persist();
    zakat_renderResult({ auto: false, method });
  });

  app.querySelector("#zk_reset").addEventListener("click", () => {
    localStorage.removeItem(ZAKAT_DEFAULTS.storageKey);
    renderZakat();
  });
}

/** Result renderer: read DOM, compute, print */
function zakat_renderResult({ auto, method }) {
  const elResult = app.querySelector("#zk_result");
  if (!elResult) return;

  const currency = (app.querySelector("#zk_currency")?.value || "NGN").trim().toUpperCase();
  const pricePerGram = zakat_toNum(app.querySelector("#zk_pricePerGram")?.value);
  const hawlCompleted = !!app.querySelector("#zk_hawl")?.checked;

  const assets = {
    cash: zakat_toNum(app.querySelector("#zk_cash")?.value),
    metals: zakat_toNum(app.querySelector("#zk_metals")?.value),
    investments: zakat_toNum(app.querySelector("#zk_investments")?.value),
    inventory: zakat_toNum(app.querySelector("#zk_inventory")?.value),
    debtsOwed: zakat_toNum(app.querySelector("#zk_debtsOwed")?.value)
  };

  const liabilities = {
    debtsDue: zakat_toNum(app.querySelector("#zk_debtsDue")?.value)
  };

  const r = zakat_compute({
    method: method || "gold",
    pricePerGram,
    currency,
    hawlCompleted,
    assets,
    liabilities
  });

  const nisabText =
    r.nisab > 0
      ? `${zakat_formatMoney(r.nisab, currency)} (${r.method} nisab: ${r.grams}g)`
      : `Enter price per gram to compute nisab.`;

  const hawlLine = r.hawlCompleted
    ? `<p class="good"><strong>Ḥawl:</strong> Completed</p>`
    : `<p class="warn"><strong>Ḥawl:</strong> Not completed. Zakat is not due yet.</p>`;

  const dueLine =
    r.meetsNisab && r.hawlCompleted
      ? `<p class="good" style="font-size:18px;"><strong>Zakat due:</strong> ${zakat_formatMoney(r.due, currency)}</p>`
      : `<p class="muted" style="font-size:18px;"><strong>Zakat due:</strong> ${zakat_formatMoney(0, currency)}</p>`;

  elResult.innerHTML = `
    <div class="zakat-summary">
      <p><strong>Total assets:</strong> ${zakat_formatMoney(r.totalAssets, currency)}</p>
      <p><strong>Liabilities deducted:</strong> ${zakat_formatMoney(r.totalLiabilities, currency)}</p>
      <p><strong>Zakatable amount:</strong> ${zakat_formatMoney(r.zakatable, currency)}</p>
      <p class="${r.meetsNisab ? "good" : "muted"}"><strong>Nisab:</strong> ${nisabText}</p>
      ${hawlLine}
      ${dueLine}
      ${
        auto
          ? `<p class="muted small" style="margin-top:10px;">Auto-updated as you type. Click Calculate if you prefer manual.</p>`
          : ""
      }
    </div>
  `;
}
/* =======================
   Diary (offline module)
   - Private, local-only
   - Calendar sync (in-app month view)
   - Theme + style presets
   - PIN lock hooks (uses your existing Lock route)
   - Reminder (works while app is open)
======================= */

const DIARY_DEFAULTS = {
  entriesKey: "masalah_diary_entries_v2",
  settingsKey: "masalah_diary_settings_v2",
  draftKey: "masalah_diary_draft_v2"
};

const DIARY_THEMES = [
  { key: "ink", label: "Ink (default)", card: "#0f0f11", paper: "#121216" },
  { key: "sand", label: "Sand", card: "#14110b", paper: "#18130a" },
  { key: "slate", label: "Slate", card: "#0f131a", paper: "#101622" },
  { key: "forest", label: "Forest", card: "#0f1613", paper: "#0f1a15" },
  { key: "wine", label: "Wine", card: "#1a0f13", paper: "#221018" }
];

const DIARY_STYLES = [
  { key: "classic", label: "Classic" },
  { key: "compact", label: "Compact" },
  { key: "spacious", label: "Spacious" }
];

let diaryReminderTimer = null;

/* ---------- storage ---------- */
function diary_loadEntries() {
  try {
    const raw = localStorage.getItem(DIARY_DEFAULTS.entriesKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function diary_saveEntries(entries) {
  try {
    localStorage.setItem(DIARY_DEFAULTS.entriesKey, JSON.stringify(entries));
  } catch {}
}

function diary_loadSettings() {
  try {
    const raw = localStorage.getItem(DIARY_DEFAULTS.settingsKey);
    const parsed = raw ? JSON.parse(raw) : null;
    const base = {
      theme: "ink",
      style: "classic",
      reminderEnabled: false,
      reminderTime: "20:00" // local time
    };
    return parsed && typeof parsed === "object" ? { ...base, ...parsed } : base;
  } catch {
    return { theme: "ink", style: "classic", reminderEnabled: false, reminderTime: "20:00" };
  }
}

function diary_saveSettings(settings) {
  try {
    localStorage.setItem(DIARY_DEFAULTS.settingsKey, JSON.stringify(settings));
  } catch {}
}

function diary_loadDraft() {
  try {
    const raw = localStorage.getItem(DIARY_DEFAULTS.draftKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : { title: "", text: "", dateISO: todayISO(), updatedAt: 0 };
  } catch {
    return { title: "", text: "", dateISO: todayISO(), updatedAt: 0 };
  }
}

function diary_saveDraft(draft) {
  try {
    localStorage.setItem(DIARY_DEFAULTS.draftKey, JSON.stringify(draft));
  } catch {}
}

function diary_clearDraft() {
  localStorage.removeItem(DIARY_DEFAULTS.draftKey);
}

/* ---------- helpers ---------- */
function diary_fmtHumanDate(iso) {
  const d = iso ? new Date(iso + "T00:00:00") : new Date();
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function diary_fmtTime(ms) {
  const d = new Date(ms || Date.now());
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function diary_uid() {
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}

function diary_themeByKey(k) {
  return DIARY_THEMES.find((t) => t.key === k) || DIARY_THEMES[0];
}

function diary_daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function diary_startWeekday(y, m) {
  return new Date(y, m, 1).getDay(); // 0 Sun .. 6 Sat
}

function diary_entryCountByDate(entries) {
  const map = new Map();
  for (const e of entries) {
    const iso = e.dateISO || "";
    if (!iso) continue;
    map.set(iso, (map.get(iso) || 0) + 1);
  }
  return map;
}

function diary_filterEntries(entries, dateISO, q) {
  let out = [...entries];

  if (dateISO) out = out.filter((e) => e.dateISO === dateISO);

  const s = String(q || "").trim().toLowerCase();
  if (s) {
    out = out.filter((e) => {
      const blob = `${e.title || ""}\n${e.text || ""}`.toLowerCase();
      return blob.includes(s);
    });
  }

  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

/* ---------- reminder (soft, in-app) ---------- */
function diary_stopReminder() {
  if (diaryReminderTimer) clearTimeout(diaryReminderTimer);
  diaryReminderTimer = null;
}

function diary_scheduleReminderIfEnabled() {
  diary_stopReminder();

  const s = diary_loadSettings();
  if (!s.reminderEnabled) return;

  const [hh, mm] = String(s.reminderTime || "20:00").split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;

  const now = new Date();
  const target = new Date();
  target.setHours(hh, mm, 0, 0);

  // if already passed today, schedule for tomorrow
  if (target <= now) target.setDate(target.getDate() + 1);

  const wait = target.getTime() - now.getTime();
  diaryReminderTimer = setTimeout(() => {
    showToast("Diary reminder: write a few lines.");
    // reschedule next day
    diary_scheduleReminderIfEnabled();
  }, wait);
}

/* ---------- view ---------- */
function renderDiary() {
  state.currentRoute = "diary";

  const settings = diary_loadSettings();
  const theme = diary_themeByKey(settings.theme);

  const entries = diary_loadEntries();
  const draft = diary_loadDraft();

  const now = new Date();
  const viewYear = now.getFullYear();
  const viewMonth = now.getMonth();

  app.innerHTML = `
    <section class="diary-page diary-style-${escapeHtml(settings.style)}"
      style="--diary-card:${escapeHtml(theme.card)}; --diary-paper:${escapeHtml(theme.paper)};">

      <header class="diary-head">
        <div>
          <h2 class="diary-h">Private Diary</h2>
        </div>

        <div class="diary-head-right">
          <span id="diary_save_chip" class="pill ${draft.updatedAt ? "is-saved" : ""}">
            ${draft.updatedAt ? "Draft saved" : "Not saved yet"}
          </span>
          <button id="diary_settings_btn" class="btn" type="button">Settings</button>
        </div>
      </header>

      <div class="diary-shell">
        <main class="diary-editor">

          <div class="diary-editor-top">
            <div class="diary-date">
              <span class="muted">Entry date</span>
              <input id="diary_date" type="date" value="${escapeHtml(draft.dateISO || todayISO())}" />
              <div class="muted small" id="diary_date_human">${escapeHtml(diary_fmtHumanDate(draft.dateISO || todayISO()))}</div>
            </div>

            <input
              id="diary_title"
              class="diary-title"
              placeholder="A short headline (optional)"
              maxlength="80"
              value="${escapeHtml(draft.title || "")}"
            />
          </div>

          <div class="diary-pad">
            <textarea
              id="diary_text"
              class="diary-text"
              placeholder="Write plainly."
              maxlength="8000"
            >${escapeHtml(draft.text || "")}</textarea>
          </div>

          <div class="diary-foot">
            <div class="diary-meta muted">
              <span id="diary_count">0 / 8000</span>
              <span class="diary-dot">•</span>
              <span id="diary_last_saved">${draft.updatedAt ? `Draft saved at ${escapeHtml(diary_fmtTime(draft.updatedAt))}` : "Draft not saved"}</span>
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
            <h3 class="diary-side-title">Calendar</h3>
            <p class="muted diary-side-sub">Tap a day to filter entries.</p>
          </div>

          <div id="diary_calendar" class="diary-calendar"></div>

          <div class="diary-side-head" style="margin-top:14px;">
            <h3 class="diary-side-title">Entries</h3>
            <div class="diary-side-tools">
              <input id="diary_search" class="diary-search" placeholder="Search..." />
              <button id="diary_clear_filter" class="btn mini" type="button">All</button>
            </div>
          </div>

          <div class="muted small" id="diary_filter_label" style="margin-top:8px;"></div>

          <div id="diary_list" class="diary-list"></div>
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

      <div class="diary-modal" id="diary_settings" aria-hidden="true">
        <div class="diary-modal-inner" role="dialog" aria-modal="true" aria-label="Diary settings">
          <div class="diary-modal-head">
            <div>
              <p class="muted" style="margin:0;">Diary settings</p>
              <h3 style="margin:6px 0 0;">Appearance, lock, reminders</h3>
            </div>
            <button class="btn" id="diary_settings_close" type="button">Close</button>
          </div>

          <div class="diary-modal-body">

            <div class="grid" style="gap:12px;">
              <label class="field">
                <span>Theme</span>
                <select id="diary_theme">
                  ${DIARY_THEMES.map((t) => `<option ${t.key === settings.theme ? "selected" : ""} value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join("")}
                </select>
              </label>

              <label class="field">
                <span>Reading style</span>
                <select id="diary_style">
                  ${DIARY_STYLES.map((t) => `<option ${t.key === settings.style ? "selected" : ""} value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join("")}
                </select>
              </label>

              <div class="card" style="box-shadow:none;">
                <p class="muted" style="margin:0 0 8px 0;">Lock</p>
                <p class="muted small" style="margin:0 0 10px 0;">Diary is protected by your PIN lock screen.</p>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                  <button id="diary_go_lock" class="btn" type="button">Open Lock</button>
                  <button id="diary_lock_now" class="btn" type="button">Lock now</button>
                </div>
              </div>

              <div class="card" style="box-shadow:none;">
                <p class="muted" style="margin:0 0 8px 0;">Reminder</p>

                <label class="checkline">
                  <input id="diary_reminder_on" type="checkbox" ${settings.reminderEnabled ? "checked" : ""} />
                  <span>Enable daily reminder (works while app is open)</span>
                </label>

                <label class="field" style="margin-top:10px;">
                  <span>Reminder time</span>
                  <input id="diary_reminder_time" type="time" value="${escapeHtml(settings.reminderTime || "20:00")}" />
                </label>
              </div>

            </div>

          </div>

          <div class="diary-modal-actions">
            <button id="diary_settings_save" class="primary" type="button">Save settings</button>
          </div>
        </div>
      </div>

    </section>
  `;

  diary_bind({ viewYear, viewMonth });
  diary_scheduleReminderIfEnabled();
}

/* ---------- binding + UI paint ---------- */
function diary_bind({ viewYear, viewMonth }) {
  const entries = diary_loadEntries();
  const counts = diary_entryCountByDate(entries);

  const elDate = app.querySelector("#diary_date");
  const elDateHuman = app.querySelector("#diary_date_human");
  const elTitle = app.querySelector("#diary_title");
  const elText = app.querySelector("#diary_text");
  const elCount = app.querySelector("#diary_count");
  const elNotice = app.querySelector("#diary_notice");
  const elSaveChip = app.querySelector("#diary_save_chip");
  const elLastSaved = app.querySelector("#diary_last_saved");

  const elCalendar = app.querySelector("#diary_calendar");
  const elList = app.querySelector("#diary_list");
  const elSearch = app.querySelector("#diary_search");
  const elClearFilter = app.querySelector("#diary_clear_filter");
  const elFilterLabel = app.querySelector("#diary_filter_label");

  const elModal = app.querySelector("#diary_modal");
  const elModalDate = app.querySelector("#diary_modal_date");
  const elModalTitle = app.querySelector("#diary_modal_title");
  const elModalText = app.querySelector("#diary_modal_text");
  const elModalClose = app.querySelector("#diary_modal_close");
  const elDelete = app.querySelector("#diary_delete");

  const elSettingsBtn = app.querySelector("#diary_settings_btn");
  const elSettings = app.querySelector("#diary_settings");
  const elSettingsClose = app.querySelector("#diary_settings_close");
  const elSettingsSave = app.querySelector("#diary_settings_save");

  let openedId = null;
  let deleteArmed = false;
  let deleteArmTimer = null;

  let filterDate = ""; // ISO date
  let query = "";

  let autosaveTimer = null;

  function notice(msg, kind) {
    elNotice.textContent = msg || "";
    elNotice.classList.remove("is-warn", "is-good");
    if (kind === "warn") elNotice.classList.add("is-warn");
    if (kind === "good") elNotice.classList.add("is-good");
  }

  function updateCount() {
    elCount.textContent = `${(elText.value || "").length} / 8000`;
  }

  function setDraftUI(mode, whenMs) {
    if (!elSaveChip || !elLastSaved) return;

    if (mode === "dirty") {
      elSaveChip.textContent = "Typing…";
      elSaveChip.classList.add("is-dirty");
      elSaveChip.classList.remove("is-saved");
      elLastSaved.textContent = "Typing…";
      return;
    }
    if (mode === "saved") {
      elSaveChip.textContent = "Draft saved";
      elSaveChip.classList.add("is-saved");
      elSaveChip.classList.remove("is-dirty");
      elLastSaved.textContent = `Draft saved at ${diary_fmtTime(whenMs || Date.now())}`;
      return;
    }
    elSaveChip.textContent = "Not saved yet";
    elSaveChip.classList.remove("is-saved", "is-dirty");
    elLastSaved.textContent = "Draft not saved";
  }

  function scheduleDraftSave() {
    setDraftUI("dirty");
    if (autosaveTimer) clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(() => {
      const draft = {
        dateISO: elDate.value || todayISO(),
        title: elTitle.value || "",
        text: elText.value || "",
        updatedAt: Date.now()
      };
      diary_saveDraft(draft);
      setDraftUI("saved", draft.updatedAt);
    }, 600);
  }

  function renderCalendar() {
    const days = diary_daysInMonth(viewYear, viewMonth);
    const start = diary_startWeekday(viewYear, viewMonth);
    const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

    let html = `
      <div class="diary-cal-head">
        <strong>${escapeHtml(monthName)}</strong>
        <span class="muted small">Dots mean entries</span>
      </div>
      <div class="diary-cal-grid">
        <div class="diary-cal-dow muted">S</div>
        <div class="diary-cal-dow muted">M</div>
        <div class="diary-cal-dow muted">T</div>
        <div class="diary-cal-dow muted">W</div>
        <div class="diary-cal-dow muted">T</div>
        <div class="diary-cal-dow muted">F</div>
        <div class="diary-cal-dow muted">S</div>
    `;

    for (let i = 0; i < start; i++) html += `<div class="diary-cal-cell blank"></div>`;

    for (let d = 1; d <= days; d++) {
      const iso = isoFromDate(new Date(viewYear, viewMonth, d));
      const n = counts.get(iso) || 0;
      const on = filterDate === iso ? "is-on" : "";
      const dot = n ? `<span class="diary-dotcount" aria-hidden="true"></span>` : "";
      html += `
        <button class="diary-cal-cell ${on}" type="button" data-cal-date="${escapeHtml(iso)}" aria-label="Day ${d}">
          <span class="diary-cal-num">${d}</span>
          ${dot}
        </button>
      `;
    }

    html += `</div>`;
    elCalendar.innerHTML = html;
  }

  function renderList() {
    const all = diary_loadEntries();
    const filtered = diary_filterEntries(all, filterDate, query);

    elFilterLabel.textContent = filterDate
      ? `Filtered by: ${diary_fmtHumanDate(filterDate)}`
      : query.trim()
        ? `Search results`
        : "";

    if (!filtered.length) {
      elList.innerHTML = `<p class="muted">No entries found.</p>`;
      return;
    }

    elList.innerHTML = filtered
      .map((e) => {
        const title = escapeHtml(e.title || "Untitled");
        const date = escapeHtml(diary_fmtHumanDate(e.dateISO));
        const preview = escapeHtml(String(e.text || "").slice(0, 120));
        return `
          <button class="diary-item" type="button" data-diary-open="${escapeHtml(e.id)}">
            <div class="diary-item-top">
              <span class="diary-date">${date}</span>
              <span class="diary-title">${title}</span>
            </div>
            <div class="diary-preview muted">${preview}${(e.text || "").length > 120 ? "…" : ""}</div>
          </button>
        `;
      })
      .join("");
  }
// --- FIX: delegated clicks for Settings + All ---
app.addEventListener("click", (e) => {
  const settingsBtn = e.target.closest("#diary_settings_btn");
  if (settingsBtn) {
    e.preventDefault();
    e.stopPropagation();
    elSettings.classList.add("is-open");
    elSettings.setAttribute("aria-hidden", "false");
    return;
  }

  const allBtn = e.target.closest("#diary_clear_filter");
  if (allBtn) {
    e.preventDefault();
    e.stopPropagation();
    filterDate = "";
    query = "";
    if (elSearch) elSearch.value = "";
    renderCalendar();
    renderList();
    return;
  }

  const closeSettingsBtn = e.target.closest("#diary_settings_close");
  if (closeSettingsBtn || e.target === elSettings) {
    e.preventDefault();
    e.stopPropagation();
    elSettings.classList.remove("is-open");
    elSettings.setAttribute("aria-hidden", "true");
    return;
  }
}, true);
  function openModal(entry) {
    openedId = entry.id;

    elModalDate.textContent = diary_fmtHumanDate(entry.dateISO);
    elModalTitle.textContent = entry.title || "Untitled";
    elModalText.textContent = entry.text || "";

    deleteArmed = false;
    elDelete.textContent = "Delete entry";
    clearTimeout(deleteArmTimer);

    elModal.classList.add("is-open");
    elModal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    openedId = null;

    elModal.classList.remove("is-open");
    elModal.setAttribute("aria-hidden", "true");

    deleteArmed = false;
    elDelete.textContent = "Delete entry";
    clearTimeout(deleteArmTimer);
  }

  function openSettings() {
    elSettings.classList.add("is-open");
    elSettings.setAttribute("aria-hidden", "false");
  }

  function closeSettings() {
    elSettings.classList.remove("is-open");
    elSettings.setAttribute("aria-hidden", "true");
  }

  // Initial paint
  updateCount();
  renderCalendar();
  renderList();

  // Draft date human label
  elDateHuman.textContent = diary_fmtHumanDate(elDate.value || todayISO());

  // Draft autosave
  elText.addEventListener("input", () => {
    updateCount();
    scheduleDraftSave();
  });
  elTitle.addEventListener("input", scheduleDraftSave);

  elDate.addEventListener("change", () => {
    elDateHuman.textContent = diary_fmtHumanDate(elDate.value || todayISO());
    scheduleDraftSave();
  });

  // Save entry
  app.querySelector("#diary_save").addEventListener("click", () => {
    const title = String(elTitle.value || "").trim();
    const text = String(elText.value || "").trim();
    const dateISO = elDate.value || todayISO();

    if (!text) {
      notice("Write something first.", "warn");
      return;
    }

    const all = diary_loadEntries();
    all.push({
      id: diary_uid(),
      dateISO,
      title: title || "Untitled",
      text,
      createdAt: Date.now()
    });

    diary_saveEntries(all);

    // clear editor, keep date as chosen
    elTitle.value = "";
    elText.value = "";
    updateCount();

    diary_clearDraft();
    setDraftUI("idle");
    notice("Saved privately on this device.", "good");

    // repaint calendar + list
    const fresh = diary_loadEntries();
    const map = diary_entryCountByDate(fresh);
    counts.clear();
    for (const [k, v] of map.entries()) counts.set(k, v);

    renderCalendar();
    renderList();
  });

  // Clear editor
  app.querySelector("#diary_clear").addEventListener("click", () => {
    elTitle.value = "";
    elText.value = "";
    updateCount();
    diary_clearDraft();
    setDraftUI("idle");
    notice("Cleared.", "good");
  });

  // Calendar filtering
  elCalendar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cal-date]");
    if (!btn) return;
    const iso = btn.getAttribute("data-cal-date");
    filterDate = filterDate === iso ? "" : iso;
    renderCalendar();
    renderList();
  });

  // Search
  elSearch.addEventListener("input", () => {
    query = String(elSearch.value || "");
    renderList();
  });

  elClearFilter.addEventListener("click", () => {
    filterDate = "";
    query = "";
    elSearch.value = "";
    renderCalendar();
    renderList();
  });

  // Open entry modal
  app.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-diary-open]");
    if (!btn) return;

    const id = btn.getAttribute("data-diary-open");
    const data = diary_loadEntries();
    const entry = data.find((x) => x.id === id);
    if (!entry) return;
    openModal(entry);
  });

  elModalClose.addEventListener("click", closeModal);
  elModal.addEventListener("click", (e) => {
    if (e.target === elModal) closeModal();
  });

  // Delete with double-tap safety
  elDelete.addEventListener("click", () => {
    if (!openedId) return;

    if (!deleteArmed) {
      deleteArmed = true;
      elDelete.textContent = "Tap again to delete";
      notice("Tap delete again to confirm.", "warn");

      clearTimeout(deleteArmTimer);
      deleteArmTimer = setTimeout(() => {
        deleteArmed = false;
        elDelete.textContent = "Delete entry";
        notice("", "");
      }, 2500);

      return;
    }

    const data = diary_loadEntries();
    const next = data.filter((x) => x.id !== openedId);
    diary_saveEntries(next);

    closeModal();
    notice("Deleted.", "good");

    // repaint
    const map = diary_entryCountByDate(next);
    counts.clear();
    for (const [k, v] of map.entries()) counts.set(k, v);

    renderCalendar();
    renderList();
  });

  // Settings modal
  elSettingsBtn.addEventListener("click", openSettings);
  elSettingsClose.addEventListener("click", closeSettings);
  elSettings.addEventListener("click", (e) => {
    if (e.target === elSettings) closeSettings();
  });

  // Settings save
  elSettingsSave.addEventListener("click", () => {
    const themeKey = app.querySelector("#diary_theme")?.value || "ink";
    const styleKey = app.querySelector("#diary_style")?.value || "classic";
    const reminderEnabled = !!app.querySelector("#diary_reminder_on")?.checked;
    const reminderTime = app.querySelector("#diary_reminder_time")?.value || "20:00";

    diary_saveSettings({
      theme: themeKey,
      style: styleKey,
      reminderEnabled,
      reminderTime
    });

    closeSettings();
    showToast("Diary settings saved.");
    renderDiary(); // simplest, safest refresh
  });

  // Lock actions
  app.querySelector("#diary_go_lock").addEventListener("click", () => {
    closeSettings();
    go("lock");
  });

  app.querySelector("#diary_lock_now").addEventListener("click", () => {
    closeSettings();
    lockNow(); // uses your existing global function
    showToast("Locked.");
    go("lock");
  });
}
/* =======================
   Footer year
======================= */
function setFooterYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

/* =========================================================
   ROUTING (Supabase isolated properly)
   Offline routes: NEVER load Supabase.
   Supabase routes: only Auth + Learning
========================================================= */
const OFFLINE_ROUTES = new Set([
  "welcome",
  "home",
  "daily",
  "review",
  "progress",
  "calendar",
  "zakat",
  "faq",
  "fasl",
  "library",
  "lock",
  "quiz",
  "results"
]);

const SUPABASE_ROUTES = new Set(["auth", "learning"]);

async function renderRoute(route) {
  const r = route || "welcome";
  setActiveNav(r);

  // OFFLINE (no Supabase)
  if (r === "welcome") return renderWelcome();
  if (r === "home") return renderHome();
  if (r === "daily") return renderDaily();
  if (r === "review") return renderReview();
  if (r === "progress") return renderProgress();
  if (r === "calendar") return renderCalendar();
  if (r === "faq") return renderFAQ();
  if (r === "fasl") return renderFasl();
  if (r === "library") return renderLibrary();
  if (r === "lock") return renderLock();
  if (r === "quiz") return renderQuiz();
  if (r === "results") return renderResults();
  if (r === "zakat") return renderZakat();
  if (r === "diary") return renderDiary();

  // SUPABASE (lazy load)
  if (SUPABASE_ROUTES.has(r)) {
    if (r === "auth") return renderAuth();
    if (r === "learning") return renderLearning();
  }

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
  bindNavRoutes();
  bindMobileMenu();
  bindGlobalKeyboard();
  setFooterYear();

  setupInstallPrompt();
  registerServiceWorker();

  const initial = (window.location.hash || "").slice(1);
  render(initial || "welcome");
});