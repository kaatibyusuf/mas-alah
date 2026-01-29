const app = document.getElementById("app");

/* =======================
   LocalStorage (Progress)
======================= */
const STORAGE_KEY = "masalah_progress_v1";
const DAILY_KEY = "masalah_daily_v1"; // locked daily quiz for today

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      streakCount: 0,
      lastActiveDate: null,
      bestScores: {},
      lastAttempt: null
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      streakCount: parsed.streakCount ?? 0,
      lastActiveDate: parsed.lastActiveDate ?? null,
      bestScores: parsed.bestScores ?? {},
      lastAttempt: parsed.lastAttempt ?? null
    };
  } catch {
    return {
      streakCount: 0,
      lastActiveDate: null,
      bestScores: {},
      lastAttempt: null
    };
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

  const diffDays = Math.round(
    (new Date(today) - new Date(last)) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 1) progress.streakCount += 1;
  else progress.streakCount = 1;

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
  lastSettings: null // { category, level, timed, count, mode: "normal"|"daily" }
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
      showFeedback(null);
    }
  }, 1000);
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
   Screens
======================= */
function renderHome() {
  const progress = loadProgress();
  const last = progress.lastAttempt;

  const streakLabel = progress.streakCount === 1 ? "1 day" : `${progress.streakCount} days`;

  const bestEntries = Object.entries(progress.bestScores);
  let bestHeadline = "—";
  let bestText = "No best score yet.";
  if (bestEntries.length) {
    bestEntries.sort((a, b) => b[1] - a[1]);
    const [key, val] = bestEntries[0];
    const [cat, lvl] = key.split("|");
    bestHeadline = `${val}%`;
    bestText = `${val}% in ${cat} (${lvl}).`;
  }

  const lastHeadline = last ? `${last.score}/${last.total}` : "—";
  const lastText = last ? `${last.category} (${last.level}), ${last.percent}%` : "No attempts yet.";

  app.innerHTML = `
    <section class="home">
      <div class="hero">
        <div class="hero-card">
          <h2 class="hero-title">Learn steadily, without noise.</h2>
          <p class="hero-copy">
            Mas'alah gives you short Islamic quizzes with clear feedback.
            Build a daily habit, spot weak areas, and improve one session at a time.
          </p>

          <div class="hero-cta">
            <button id="ctaDaily" class="primary" type="button">Start Today’s Quiz</button>
            <button id="ctaCustom" class="btn" type="button">Create a Custom Quiz</button>
          </div>

          <ul class="hero-bullets">
            <li><span class="dot"></span><span>Instant feedback with short explanations.</span></li>
            <li><span class="dot"></span><span>Daily quiz is locked, so you focus instead of refreshing.</span></li>
            <li><span class="dot"></span><span>Progress tracking stays on your device for now.</span></li>
          </ul>
        </div>

        <div class="sidebar">
          <div class="stat">
            <h4>Streak</h4>
            <div class="value">🔥 ${streakLabel}</div>
            <div class="sub">Last active: ${progress.lastActiveDate || "Not yet"}</div>
          </div>

          <div class="stat">
            <h4>Last attempt</h4>
            <div class="value">${lastHeadline}</div>
            <div class="sub">${lastText}</div>
          </div>

          <div class="stat">
            <h4>Best</h4>
            <div class="value">⭐ ${bestHeadline}</div>
            <div class="sub">${bestText}</div>
          </div>

          <button id="ctaProgress" class="btn" type="button">View Progress</button>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <h3 class="section-title">Choose how you want to study</h3>
          <p class="muted" style="margin:0;">Timed mode is 20 seconds per question.</p>
        </div>

        <div class="cards2">
          <div class="mini">
            <p class="mini-title">Today’s Quiz</p>
            <p class="mini-sub">
              Pick a topic and level. Once you start, your questions stay the same until the date changes.
            </p>
            <div class="row">
              <button id="goDaily" class="primary" type="button">Open Daily</button>
              <button id="goDailySetup" class="btn" type="button">Choose topic</button>
            </div>
          </div>

          <div class="mini">
            <p class="mini-title">Custom Quiz</p>
            <p class="mini-sub">
              Practice a specific area. Useful when you want repetition and fast review.
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

              <button id="startBtn" class="primary" type="button">Start Custom Quiz</button>
              <p id="status" class="muted" style="margin:0;"></p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  document.getElementById("ctaDaily").addEventListener("click", () => {
    window.location.hash = "#daily";
  });
  document.getElementById("ctaCustom").addEventListener("click", () => {
    document.getElementById("category")?.focus();
  });
  document.getElementById("ctaProgress").addEventListener("click", () => {
    window.location.hash = "#progress";
  });

  document.getElementById("goDaily").addEventListener("click", () => {
    window.location.hash = "#daily";
  });
  document.getElementById("goDailySetup").addEventListener("click", () => {
    window.location.hash = "#daily";
  });

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

      if (pool.length === 0) {
        status.textContent = `No questions found for ${category} • ${level}. Add them in data/questions.json.`;
        return;
      }

      state.quizQuestions = pickRandom(pool, Math.min(count, pool.length));
      state.index = 0;
      state.score = 0;
      state.timed = timed;

      renderQuiz();
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });
}

async function renderDaily() {
  const today = todayISO();
  const existing = loadDailyState();
  const defaultCategory = existing?.date === today ? existing.category : "Qur’an";
  const defaultLevel = existing?.date === today ? existing.level : "Beginner";

  app.innerHTML = `
    <section class="card">
      <h2>Today’s Quiz</h2>
      <p class="muted">
        This quiz is locked for today. Refreshing won’t change the questions.
      </p>

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

        <button id="dailyStartBtn" class="primary" type="button">Start Today’s Quiz</button>
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

      renderQuiz();
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });
}

function renderQuiz() {
  const total = state.quizQuestions.length;
  const q = state.quizQuestions[state.index];

  app.innerHTML = `
    <section class="card">
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
                 <div class="timeTrack">
                   <div id="timeBar" class="timeBar"></div>
                 </div>
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
    window.location.hash = "#home";
  });

  document.querySelectorAll(".optionBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = Number(btn.dataset.idx);
      showFeedback(selected);
    });
  });

  if (state.timed) startTimer();
}

function showFeedback(selectedIdx) {
  clearTimer();

  const q = state.quizQuestions[state.index];
  const correct = q.correctIndex;

  document.querySelectorAll(".optionBtn").forEach((btn) => {
    btn.disabled = true;
    const idx = Number(btn.dataset.idx);
    if (idx === correct) btn.classList.add("correct");
    if (selectedIdx !== null && idx === selectedIdx && idx !== correct) {
      btn.classList.add("wrong");
    }
  });

  const isCorrect = selectedIdx === correct;
  if (isCorrect) state.score += 1;

  const feedback = document.getElementById("feedback");
  feedback.style.display = "block";
  feedback.innerHTML = `
    <strong>${isCorrect ? "Correct." : "Incorrect."}</strong>
    <div class="muted" style="margin-top:6px;">${q.explanation || ""}</div>
  `;

  const nextBtn = document.getElementById("nextBtn");
  nextBtn.style.display = "inline-block";
  nextBtn.textContent = state.index === state.quizQuestions.length - 1 ? "See Results" : "Next";

  nextBtn.onclick = () => {
    feedback.style.display = "none";
    state.index += 1;

    if (state.index >= state.quizQuestions.length) {
      renderResults();
      return;
    }
    renderQuiz();
  };
}

function renderResults() {
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
    <section class="card">
      <h2>Results</h2>
      <p class="muted">Score</p>
      <div style="font-size:34px; font-weight:900; margin:10px 0;">
        ${state.score} / ${total} (${percent}%)
      </div>

      <div class="card" style="margin-top:12px;">
        <p class="muted" style="margin:0 0 8px 0;">Share to compete</p>
        <textarea id="shareText" rows="3" style="width:100%; padding:10px; border-radius:10px; border:1px solid rgba(20,20,20,.18);">
I scored ${state.score}/${total} in Mas'alah. ${category} (${level}). Can you beat that?
        </textarea>
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
      document.getElementById("copyStatus").textContent = "Copied. Send it to your friends.";
    } catch {
      document.getElementById("copyStatus").textContent = "Could not copy automatically. Copy it manually.";
    }
  });

  document.getElementById("tryAgainBtn").addEventListener("click", async () => {
    const s = state.lastSettings;
    if (!s) {
      window.location.hash = "#home";
      return;
    }

    if (s.mode === "daily") {
      window.location.hash = "#daily";
      return;
    }

    const all = await loadQuestions();
    const pool = all.filter((q) => q.category === s.category && q.level === s.level);
    const chosen = pickRandom(pool, Math.min(s.count, pool.length));

    state.quizQuestions = chosen;
    state.index = 0;
    state.score = 0;
    state.timed = s.timed;

    renderQuiz();
  });

  document.getElementById("progressBtn").addEventListener("click", () => {
    window.location.hash = "#progress";
  });

  document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.hash = "#home";
  });
}

function renderProgress() {
  const progress = loadProgress();
  const bestEntries = Object.entries(progress.bestScores).sort((a, b) => b[1] - a[1]);
  const last = progress.lastAttempt;

  app.innerHTML = `
    <section class="card">
      <h2>Progress</h2>

      <div class="grid" style="margin-top:12px;">
        <div class="card">
          <p class="muted" style="margin:0;">Streak</p>
          <div style="font-size:28px; font-weight:900; margin-top:6px;">
            ${progress.streakCount} day${progress.streakCount === 1 ? "" : "s"}
          </div>
          <p class="muted" style="margin-top:6px;">
            Last active: ${progress.lastActiveDate || "Not yet"}
          </p>
        </div>

        <div class="card">
          <p class="muted" style="margin:0;">Last attempt</p>
          ${
            last
              ? `<div style="margin-top:8px; font-weight:800;">
                   ${last.category} • ${last.level}
                 </div>
                 <div style="font-size:22px; font-weight:900; margin-top:6px;">
                   ${last.score}/${last.total} (${last.percent}%)
                 </div>
                 <p class="muted" style="margin-top:6px;">${last.date}</p>`
              : `<p class="muted" style="margin-top:8px;">No attempts yet.</p>`
          }
        </div>

        <div class="card">
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
          <button id="backHome" class="btn" type="button">Back Home</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("resetProgress").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderProgress();
  });

  document.getElementById("backHome").addEventListener("click", () => {
    window.location.hash = "#home";
  });
}

/* =======================
   Routing
======================= */
function render(route) {
  const r = route || "home";
  setActiveNav(r);

  if (r === "progress") return renderProgress();
  if (r === "daily") return renderDaily();
  return renderHome();
}

function bindNavRoutes() {
  document.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = "#" + btn.dataset.route;
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  bindNavRoutes();
  render((window.location.hash || "#home").slice(1));
});

window.addEventListener("hashchange", () => {
  render((window.location.hash || "#home").slice(1));
});
