<div align="center">
Mas’alah

Quick Islamic quizzes.

Build consistency, strengthen knowledge, and learn with clarity.

</div>

---

## Why Mas’alah?

Mas’alah is designed for learners who want **depth without burnout**.

Instead of endless quizzes and dopamine loops, Mas’alah focuses on:

* Daily consistency
* Learning through explanation
* Retention over speed

> *Small effort, done daily, beats intensity done occasionally.*

---

## Features

### Daily Quiz

* Deterministic quiz locked per day
* Same questions even after refresh
* No rerolling. Integrity first.
* Automatically builds streaks

### Custom Quiz

* Choose **category** and **level**
* Timed or practice mode
* 10 or 20 questions per session

### Categories

* Qur’an
* Seerah
* Fiqh
* Tawheed
* Arabic
* Adhkaar

### Levels

* Beginner ✅ (fully populated)
* Intermediate ⏳ (planned)
* Advanced ⏳ (planned)

### Instant Feedback

* Correct answer highlighted
* Short, focused explanation after every question

### Progress Tracking (LocalStorage)

* 🔥 Daily streak
* ⭐ Best score per category & level
* 🕒 Last attempted quiz

---

## Learning Philosophy

Mas’alah is not a game.
It’s a **training ground for consistency**.

* One quiz a day is enough
* Explanations matter more than scores
* Progress is private and personal

---

## Tech Stack

* **HTML** – semantic structure
* **CSS** – clean, responsive UI
* **Vanilla JavaScript** – state, routing, logic
* **LocalStorage** – progress persistence
* **JSON** – structured question data

No frameworks.
No backend.
Fully client-side.

---

## 📁 Project Structure

```txt
masalah/
│
├── index.html
├── app.js
├── styles/
│   └── main.css
├── data/
│   └── questions.json
└── README.md
```

---

## Question Data Schema

All questions follow a strict, validated schema:

```json
{
  "id": "quran_beg_001",
  "category": "Qur’an",
  "level": "Beginner",
  "question": "Which surah is called the Opening of the Qur’an?",
  "options": [
    "Al-Fātiḥah",
    "Al-Baqarah",
    "Al-Ikhlāṣ",
    "An-Nās"
  ],
  "correctIndex": 0,
  "explanation": "Al-Fātiḥah opens the Qur’an and is recited in every ṣalāh."
}
```

### Validation Rules

* `id` must be **unique**
* Exactly **4 options**
* `correctIndex` must match an option index
* Beginner level must have **minimum 10 questions per category** before expanding levels

---

## Current Content Status

| Category | Beginner | Intermediate | Advanced  |
| -------- | -------- | ------------ | --------- |
| Qur’an   | ✅ 10+    | ⏳ Planned    | ⏳ Planned |
| Seerah   | ✅ 10+    | ⏳ Planned    | ⏳ Planned |
| Fiqh     | ✅ 10+    | ⏳ Planned    | ⏳ Planned |
| Tawheed  | ✅ 10+    | ⏳ Planned    | ⏳ Planned |
| Arabic   | ✅ 10+    | ⏳ Planned    | ⏳ Planned |
| Adhkaar  | ✅ 10+    | ⏳ Planned    | ⏳ Planned |

---

## Contributing

Contributions are welcome, especially in:

* Writing **high-quality questions**
* UI/UX polish
* Accessibility improvements
* Performance and code cleanup

### Before adding questions:

* Complete **Beginner coverage first**
* Follow schema strictly
* Keep explanations short and precise
* Avoid controversial or disputed rulings

A `CONTRIBUTING.md` will be added soon.

---

## Roadmap

* [x] Daily quiz (locked per day)
* [x] Beginner questions for all categories
* [ ] Intermediate level rollout
* [ ] Advanced level rollout
* [ ] Difficulty progression logic
* [ ] Authoring & review guidelines
* [ ] Optional backend (future)

---

## License

Open-source.
Built for learning, teaching, and community benefit.

---

## Closing Note

Mas’alah is about **showing up**.

Even one question a day, done sincerely, compounds into real knowledge.

> *Consistency is a form of worship.*
