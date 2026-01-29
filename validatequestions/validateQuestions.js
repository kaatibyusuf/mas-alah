const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "questions.json");

const ALLOWED_CATEGORIES = ["Qur’an", "Seerah", "Fiqh", "Tawheed", "Arabic", "Adhkaar"];
const ALLOWED_LEVELS = ["Beginner", "Intermediate", "Advanced"];

function fail(msg) {
  console.error("❌ " + msg);
  process.exitCode = 1;
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function validate() {
  if (!fs.existsSync(FILE)) {
    fail(`Missing file: ${FILE}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    fail("questions.json is not valid JSON: " + e.message);
    return;
  }

  if (!Array.isArray(data)) {
    fail("questions.json must be an array of question objects.");
    return;
  }

  const ids = new Set();
  const coverage = {}; // { "Category|Level": count }

  data.forEach((q, i) => {
    const at = `Item ${i}`;

    if (!q || typeof q !== "object") return fail(`${at}: must be an object`);

    // required keys
    const required = ["id", "category", "level", "question", "options", "correctIndex", "explanation"];
    for (const k of required) {
      if (!(k in q)) fail(`${at}: missing "${k}"`);
    }

    // id
    if (!isNonEmptyString(q.id)) fail(`${at}: "id" must be a non-empty string`);
    else {
      if (ids.has(q.id)) fail(`${at}: duplicate id "${q.id}"`);
      ids.add(q.id);
    }

    // category / level
    if (!ALLOWED_CATEGORIES.includes(q.category)) {
      fail(`${at}: invalid category "${q.category}"`);
    }
    if (!ALLOWED_LEVELS.includes(q.level)) {
      fail(`${at}: invalid level "${q.level}"`);
    }

    // question
    if (!isNonEmptyString(q.question)) fail(`${at}: "question" must be a non-empty string`);

    // options
    if (!Array.isArray(q.options)) fail(`${at}: "options" must be an array`);
    else {
      if (q.options.length !== 4) fail(`${at}: "options" must have exactly 4 items`);
      q.options.forEach((opt, idx) => {
        if (!isNonEmptyString(opt)) fail(`${at}: option ${idx} must be a non-empty string`);
      });
    }

    // correctIndex
    if (!Number.isInteger(q.correctIndex)) fail(`${at}: "correctIndex" must be an integer`);
    else if (q.correctIndex < 0 || q.correctIndex > 3) fail(`${at}: "correctIndex" must be 0..3`);

    // explanation
    if (!isNonEmptyString(q.explanation)) fail(`${at}: "explanation" must be a non-empty string`);
    else if (q.explanation.trim().length > 180) fail(`${at}: "explanation" too long (max 180 chars)`);

    // coverage
    if (ALLOWED_CATEGORIES.includes(q.category) && ALLOWED_LEVELS.includes(q.level)) {
      const key = `${q.category}|${q.level}`;
      coverage[key] = (coverage[key] || 0) + 1;
    }
  });

  // Coverage report
  console.log("\n📊 Coverage report (Category|Level):");
  for (const c of ALLOWED_CATEGORIES) {
    for (const l of ALLOWED_LEVELS) {
      const key = `${c}|${l}`;
      console.log(`${key}: ${coverage[key] || 0}`);
    }
  }

  // Gaps (recommendations)
  console.log("\n🎯 Gaps (recommend at least 30 per Category|Level):");
  for (const c of ALLOWED_CATEGORIES) {
    for (const l of ALLOWED_LEVELS) {
      const key = `${c}|${l}`;
      const n = coverage[key] || 0;
      if (n < 10) console.log(`CRITICAL: ${key} has ${n}`);
      else if (n < 30) console.log(`LOW: ${key} has ${n}`);
    }
  }

  if (process.exitCode === 1) {
    console.log("\nFix the errors above, then re-run validation.");
  } else {
    console.log("\n✅ All questions passed validation.");
  }
}

validate();
