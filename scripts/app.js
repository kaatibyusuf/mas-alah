const app = document.getElementById("app");

/* =======================
   LocalStorage (Progress)
======================= */
const STORAGE_KEY = "masalah_progress_v1";

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      streakCount: 0,
      lastActiveDate: null,
      bestScores: {}, // "Category|Level" -> percent
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
  lastSettings: null
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
   Screens
======================= */
function renderHome() {
  app.innerHTML = `
    <section class="card">
      <h2>Start a Quiz</h2>
      <p class="muted">Choose category and level. Timed mode is 20 seconds per question.</p>

      <div class="grid">
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

        <button id="startBtn" class="primary">Start Quiz</button>

        <p id="status" class="muted"></p>
      </div>
    </section>
  `;

  const startBtn = document.getElementById("startBtn");
  startBtn.addEventListener("click", async () => {
    const category = document.getElementById("category").value;
    const level = document.getElementById("level").value;
    const timed = document.getElementById("timed").checked;
    const count = Number(document.getElementById("count").value);
    const status = document.getElementById("status");

    state.lastSettings = { category, level, timed, count };

    try {
      const all = await loadQuestions();
      const pool = all.filter((q) => q.category === category && q.level === level);

      if (pool.length === 0) {
        status.textContent =
          `No questions found for ${category} • ${level}. Add them in data/questions.json.`;
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

function renderQuiz() {
  const total = state.quizQuestions.length;
  const q = state.quizQuestions[state.index];

  app.innerHTML = `
    <section class="card">
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;">Question ${state.index + 1} / ${total}</h2>
          <p class="muted" style="margin:6px 0 0 0;">Score: ${state.score}</p>
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
              <button class="optionBtn" data-idx="${idx}">
                <span class="badge">${String.fromCharCode(65 + idx)}</span>
                <span>${opt}</span>
              </button>
            `
          )
          .join("")}
      </div>

      <div id="feedback" class="feedback" style="display:none;"></div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="quitBtn" class="btn">Quit</button>
        <button id="nextBtn" class="btn" style="display:none;">Next</button>
      </div>

      ${
        state.lastSettings && state.lastSettings.count > total
          ? `<p class="muted" style="margin-top:12px;">
               Note: You selected ${state.lastSettings.count} questions, but only ${total} exist for this category/level right now.
             </p>`
          : ``
      }
    </section>
  `;

  document.getElementById("quitBtn").addEventListener("click", () => {
    clearTimer();
    renderHome();
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
    if (selectedIdx !== null && idx === selectedIdx && idx !== correct)
      btn.classList.add("wrong");
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
  nextBtn.textContent =
    state.index === state.quizQuestions.length - 1 ? "See Results" : "Next";

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

  // Save progress
  const progress = loadProgress();
  updateStreak(progress);

  const category = state.lastSettings?.category || "Unknown";
  const level = state.lastSettings?.level || "Unknown";
  const key = `${category}|${level}`;

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

  saveProgress(progress);

  app.innerHTML = `
    <section class="card">
      <h2>Results</h2>
      <p class="muted">Score</p>
      <div style="font-size:34px; font-weight:800; margin:10px 0;">
        ${state.score} / ${total} (${percent}%)
      </div>

      <div class="card" style="margin-top:12px;">
        <p class="muted" style="margin:0 0 8px 0;">Share to compete</p>
        <textarea id="shareText" rows="3" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;">I scored ${state.score}/${total} in Mas'alah. ${category} (${level}). Can you beat that?</textarea>
        <button id="copyBtn" class="btn" style="margin-top:10px;">Copy</button>
        <p id="copyStatus" class="muted" style="margin-top:8px;"></p>
      </div>

      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="tryAgainBtn" class="btn">Try Again</button>
        <button id="progressBtn" class="btn">Progress</button>
        <button id="homeBtn" class="btn">Back Home</button>
      </div>
    </section>
  `;

  document.getElementById("copyBtn").addEventListener("click", async () => {
    const text = document.getElementById("shareText").value;
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById("copyStatus").textContent =
        "Copied. Send it to your friends.";
    } catch {
      document.getElementById("copyStatus").textContent =
        "Could not copy automatically. Copy it manually.";
    }
  });

  document.getElementById("tryAgainBtn").addEventListener("click", async () => {
    const s = state.lastSettings;
    if (!s) return renderHome();

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
    window.location.hash = "progress";
  });

  document.getElementById("homeBtn").addEventListener("click", () => renderHome());
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
          <div style="font-size:28px; font-weight:800; margin-top:6px;">
            ${progress.streakCount} day${progress.streakCount === 1 ? "" : "s"}
          </div>
          <p class="muted" style="margin-top:6px;">Last active: ${progress.lastActiveDate || "Not yet"}</p>
        </div>

        <div class="card">
          <p class="muted" style="margin:0;">Last attempt</p>
          ${
            last
              ? `<div style="margin-top:8px; font-weight:700;">
                   ${last.category} • ${last.level}
                 </div>
                 <div style="font-size:22px; font-weight:800; margin-top:6px;">
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
          <button id="resetProgress" class="btn">Reset progress</button>
          <button id="backHome" class="btn">Back Home</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("resetProgress").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderProgress();
  });

  document.getElementById("backHome").addEventListener("click", () => {
    window.location.hash = "home";
  });
}

/* =======================
   Routing
======================= */
function render(route) {
  if (route === "progress") return renderProgress();
  return renderHome();
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (!btn) return;
  window.location.hash = btn.dataset.route;
});

window.addEventListener("hashchange", () => {
  const route = (window.location.hash || "#home").slice(1);
  render(route);
});

render((window.location.hash || "#home").slice(1));
