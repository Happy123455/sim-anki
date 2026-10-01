# SimAnki - Project Customizations & Rules

Welcome to the **SimAnki** codebase! This file acts as the project manual and rulebook for all Antigravity AI agents working on this workspace.

---

## 📌 Project Overview
SimAnki is a next-generation, local-first spaced repetition system (SRS) web application built using **React 19**, **Vite**, and **Vanilla CSS**. It integrates a generative AI tutor (via Google Gemini API) to evaluate answers, create interactive quantitative calculators/scenarios, and gamify the learning experience.

* **Live Deployment:** [https://happy123455.github.io/sim-anki/](https://happy123455.github.io/sim-anki/)
* **Repository:** `https://github.com/Happy123455/sim-anki.git`

---

## 🛠 Tech Stack
1. **Frontend:** React 19 (functional components, local storage persistence).
2. **Styling:** Vanilla CSS (no TailwindCSS). Maximize clean, responsive, dark-mode-first aesthetic with rich animations and glassmorphism.
3. **AI Integration:** Google Gemini API (`gemini-2.5-flash` or `gemini-2.5-pro`) for card evaluation, card categorization, and interactive widgets.
4. **Audio Engine:** HTML5 Web Audio API Synthesizer (synthesizes clicks, chimes, and failure buzzer tones procedurally; no external media assets).
5. **TTS Voiceover:** Web Speech Synthesis API with word-boundary listeners.

---

## 🔑 Key Features & Logic

### 1. Gamification & Progressive Unlocks (`src/utils/gamification.js`)
* Features are locked behind user daily study streaks (Level 1-6).
* **Veteran Mode Toggle:** Inside Settings, a toggle allows users to bypass all streak requirements. It is enabled by default (`settings.unlockAllFeatures !== false`) to ensure backward compatibility for power users.
* Always wrap streak-locked UI components or operations in `hasFeatureUnlocked(settings, featureKey)` before displaying/executing.

### 2. Burnout & Staring Detector (`src/components/StudySession.jsx`)
* Automatically triggers a gentle encouragement/burnout warning if the user has been staring at a card for more than **45 seconds** and has typed fewer than **5 characters**.
* It prompts the user to try typing, use a hint, or skip if stuck.

### 3. Interactive Tutor Leech-Gating (`src/components/StudySession.jsx`)
* The Interactive AI Tutor (which offers deep conversational grading, gap analysis, and interactive widgets) is only activated for "Leech" cards that have **6 or more review failures** in their history (`fails >= 6`).
* Standard cards receive default AI evaluation.

### 4. AI Card Categorization (`src/utils/gemini.js` & `src/components/Dashboard.jsx`)
* Cards are classified into three types:
  * `logic`: For concepts requiring logical thinking, reasoning, and system design.
  * `rote`: For factual/exact numbers, dates, or formulas.
  * `vocabulary`: For language learning, definitions, and word meanings.
* An "🤖 Auto-Categorize Decks" action exists in the deck manager dashboard.
* AI evaluations adapt based on the card type (e.g., `rote` cards emphasize factual accuracy and offer mnemonics; `logic` cards perform structured gap analysis).

### 5. Custom Review Filtering & Time Estimation (`src/components/Dashboard.jsx`)
* Study Options Modal lets users review by:
  * **Card Status:** Due, New, Leech, or All.
  * **Card Type:** Logic, Rote, Vocabulary, or All.
* Shows an estimated time to review based on the number of filtered cards selected.

---

## 📂 Codebase File Map

* [`src/App.jsx`](file:///Users/happypipaliya/.gemini/antigravity/scratch/sim-anki/src/App.jsx) - Main entrypoint containing core React state (`decks`, `cards`, `settings`), FSRS scheduler wrapper, cloud sync (GitHub Gist PAT), and main routing screen controls.
* [`src/components/Dashboard.jsx`](file:///Users/happypipaliya/.gemini/antigravity/scratch/sim-anki/src/components/Dashboard.jsx) - Dashboard, Deck management list, Card List table, progressive unlock display, and Study Options filtering modal.
* [`src/components/StudySession.jsx`](file:///Users/happypipaliya/.gemini/antigravity/scratch/sim-anki/src/components/StudySession.jsx) - Core study flow interface, answer inputs, card timers, audio synth, speech synthesis, gap analysis, and Interactive Tutor.
* [`src/components/Settings.jsx`](file:///Users/happypipaliya/.gemini/antigravity/scratch/sim-anki/src/components/Settings.jsx) - API key config, FSRS target retention sliders, Gist cloud sync settings, and Veteran Mode toggles.
* [`src/utils/gemini.js`](file:///Users/happypipaliya/.gemini/antigravity/scratch/sim-anki/src/utils/gemini.js) - AI prompt building, structured output schemas, response validation, and automatic categorization.
* `src/components/SyncCenter.jsx` - Sync sheet (Nearby code/QR pairing, sync-file send/merge, cloud "sync now"). Lazy-loaded so PeerJS stays out of the main bundle.
* `src/utils/syncMerge.js` - Transport-agnostic sync payloads, merge (`mergeSyncData`), and deletion tombstones (`simanki_tombstones`). All sync paths, Gist included, must apply tombstones so deletions don't resurrect.
* `src/utils/nearbySync.js` / `src/utils/pairLink.js` - WebRTC (PeerJS) device-to-device session protocol; pairing-code and `#pair=` link helpers (no PeerJS import).
* [`src/utils/gamification.js`](file:///Users/happypipaliya/.gemini/antigravity/scratch/sim-anki/src/utils/gamification.js) - Progress unlocks and level calculation logic.
* [`deploy.sh`](file:///Users/happypipaliya/.gemini/antigravity/scratch/sim-anki/deploy.sh) - Production deployment automation. Builds the Vite project, pushes source code to `main` branch, and pushes compiled files to `gh-pages` branch.

---

## 🛠 Developer Workflow

### Local Development
To run the local development server:
```bash
npm run dev
```
By default, the server runs on port 5173.

### Deploying Changes
The live site at `https://happy123455.github.io/sim-anki/` is built and deployed by GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`. Pages must be set to **Source: GitHub Actions**; serving a source branch directly shows a blank page because the JSX isn't compiled.

Fallback: if Pages serves a branch directly, the source `index.html` redirects github.io visitors to the committed prebuilt copy in `live/`. **Run `npm run build:live` and commit `live/` with every UI change** while Pages is configured that way, or the live site goes stale.

`./deploy.sh` (manual push of `dist/` to `gh-pages`) only applies if Pages is switched back to the `gh-pages` branch.

---

## ⚠️ Important Rules for AI Agents
1. **Never write raw Tailwind CSS**: Stick strictly to styling in existing CSS files or inline styles where applicable.
2. **Preserve User Settings Defaults**: The gamification system is meant to be fun but non-restrictive; keep Veteran Mode default set to enabled (`settings.unlockAllFeatures !== false`).
3. **Keep Audio Synthetic**: Do not import external audio MP3/WAV assets; utilize the procedural audio engine inside `StudySession.jsx` via Web Audio API.
4. **FSRS State Care**: Ensure any modifications to FSRS parameters (`difficulty`, `stability`, `scheduled_days`, `state`, `reps`, `lapses`) preserve the scheduling model and maintain back-compatibility.
