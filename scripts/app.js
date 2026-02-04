/* Mas'alah App
   Updated:
   - Warm screen transitions (leave + enter)
   - Route-safe rendering (handles async daily)
   - Full FAQ page (styled with your FAQ CSS)
   - Centralized navigation + CTA bindings
   - Year auto-fill
   - Keyboard support: A/B/C/D, Enter for Next
   - Visual progress bar (top of quiz)
   - Haptics (mobile): light vibration for correct/wrong/timeout (if supported)
*/

const app = document.getElementById("app");

/* =======================
   LocalStorage (Progress)
======================= */
const STORAGE_KEY = "masalah_progress_v1";
const DAILY_KEY = "masalah_daily_v1";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

  // UX touches
  answered: false,
  correctIdx: null
};

/* =======================
   Data + helpers
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
      // timeout: treat as no selection
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

  // Enter -> Next (only when available)
  if (key === "enter") {
    const nextBtn = document.getElementById("nextBtn");
    if (nextBtn && nextBtn.style.display !== "none") {
      e.preventDefault();
      nextBtn.click();
    }
    return;
  }

  // A/B/C/D -> options 0-3
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
        <div class="grid" style="grid-template-columns: repeat(3, 1fr); gap:12px;">
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

        <div class="grid" style="grid-template-columns: 1fr 1fr; gap:12px;">
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

  if (window.matchMedia("(max-width: 900px)").matches) {
    const row = app.querySelector('[style*="repeat(3, 1fr)"]');
    if (row) row.style.gridTemplateColumns = "1fr";
    const two = app.querySelector('[style*="1fr 1fr"]');
    if (two) two.style.gridTemplateColumns = "1fr";
  }

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
        <button id="nextBtn" class="btn" style="display:none;" type="button">Next</button>
      </div>
    </section>
  `;

  document.getElementById("quitBtn").addEventListener("click", () => {
    clearTimer();
    go("home");
  });

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

  // Haptics
  if (meta.reason === "timeout") {
    vibrate(20);
  } else {
    vibrate(isCorrect ? 15 : [10, 30, 10]);
  }

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

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2>Results</h2>
      <p class="muted">Score</p>

      <div style="font-size:34px; font-weight:950; margin:10px 0;">
        ${state.score} / ${total} (${percent}%)
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
      <div class="wrap">
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
                  It is locked for the day. Refreshing does not change the questions, so you can focus on learning, not rerolling.
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
   Hijri Calendar
======================= */
function renderCalendar() {
  const today = new Date();

  // Use Intl API for Hijri date
  const hijriFormatter = new Intl.DateTimeFormat("en-TN-u-ca-islamic", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const parts = hijriFormatter.formatToParts(today);
  const hijriDay = Number(parts.find(p => p.type === "day").value);
  const hijriMonth = parts.find(p => p.type === "month").value;
  const hijriYear = parts.find(p => p.type === "year").value;

  app.innerHTML = `
    <section class="card" style="margin-top:20px;">
      <h2>Hijri Calendar</h2>
      <p class="muted" style="margin-top:6px;">
        ${hijriMonth} ${hijriYear} AH
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
        ${d}
      </button>
    `;
  }

  return html;
}


/* =======================
   Routing
======================= */
async function renderRoute(route) {
  const r = route || "welcome";
  setActiveNav(r);

  if (r === "welcome") return renderWelcome();
  if (r === "faq") return renderFAQ();
  if (r === "progress") return renderProgress();
  if (r === "home") return renderHome();
  if (r === "daily") return renderDaily();
  if (r === "calendar") return renderCalendar();

  return renderWelcome();
}

function render(route) {
  if (state.isNavigating) return;
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

function bindNavRoutes() {
  document.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.route));
  });
}

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
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".calendar-day[data-hijri-day]");
  if (!btn) return;

  const day = Number(btn.dataset.hijriDay);
  const isWhiteDay = btn.dataset.whiteDay === "1";

  if (!isWhiteDay) {
    showToast(`Hijri day ${day}. Only 13, 14, 15 are highlighted for the white days.`);
    return;
  }

  showToast(`White Day reminder: Today is the ${day}th. Sunnah fasting is recommended on the 13th, 14th, and 15th of each Hijri month.`);
});

window.addEventListener("hashchange", () => {
  const route = (window.location.hash || "#welcome").slice(1);
  render(route);
});

function setFooterYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}
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
