/**
 * Autopilot: the study decisions SimAnki makes for you.
 *
 *  - Grading: turns the AI's correctness score, your answer speed (against
 *    your own usual speed) and your confidence into the FSRS rating.
 *  - Daily plan: how many new cards to add and which order to review in,
 *    based on how much you usually study and what's due.
 *  - Target recall: eases off when a backlog builds, tightens when it's quiet.
 *  - Session coach: reads how the session is going (accuracy and speed
 *    trends) and picks easier or harder next cards, softens near misses when
 *    you're struggling, and offers to wrap up when you're flagging.
 *
 * Pure functions only, so it's testable and identical on every device.
 */
import { predictRecall, isDueToday } from './srs.js';

const DAY_MS = 86400000;
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA');

export function isAutopilotOn(settings) {
  return settings?.autopilot !== false;
}

// ─── Answer-time baselines ──────────────────────────────────────────────────

/** Your usual seconds per answer, overall and per card type, from past correct answers. */
export function answerTimeBaselines(cards) {
  const byType = {};
  const all = [];
  for (const card of cards || []) {
    const type = card.cardType || 'default';
    for (const h of card.history || []) {
      const t = Number(h.timeSpent);
      if (!(t > 0 && t <= 120) || h.rating === 'again') continue;
      (byType[type] ||= []).push(t);
      all.push(t);
    }
  }
  const overall = median(all.slice(-300)) || 20;
  const result = { overall, byType: {} };
  for (const [type, times] of Object.entries(byType)) {
    if (times.length >= 5) result.byType[type] = median(times.slice(-150));
  }
  return result;
}

export function baselineFor(baselines, card) {
  return baselines?.byType?.[card?.cardType || 'default'] || baselines?.overall || 20;
}

// ─── Grading ────────────────────────────────────────────────────────────────

/**
 * Rating from what happened, not just whether it was right: FSRS's "easy"
 * stretches the next interval a lot, so it's reserved for fast, sure recall;
 * a correct but laboured answer is "hard"; near misses while struggling count
 * as "hard" so one bad patch doesn't reset progress.
 */
export function gradeAnswer({ score, seconds, confidence = 3, baseline = 20, mood = 'steady' }) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return { rating: 'good', reason: 'Recorded as remembered' };
  }
  const ratio = seconds > 0 && baseline > 0 ? seconds / baseline : 1;
  const strained = mood === 'struggling' || mood === 'tired';

  if (score < 50) {
    if (strained && score >= 40) {
      return { rating: 'hard', reason: 'Near miss: counted gently since this session is tough' };
    }
    return { rating: 'again', reason: "Not there yet: you'll see it again shortly" };
  }
  if (score < 70) {
    return { rating: 'hard', reason: 'Partly right' };
  }
  if (score >= 90 && ((ratio <= 0.6 && confidence >= 4) || (ratio <= 0.4 && confidence >= 3))) {
    return { rating: 'easy', reason: 'Fast, sure and correct' };
  }
  if (ratio >= 2.5 && confidence <= 2) {
    return { rating: 'hard', reason: 'Correct, but it took real effort' };
  }
  return { rating: 'good', reason: score >= 90 ? 'Correct' : 'Mostly right' };
}

/** How long before a missed card comes back within the same session. */
export function relearnDelayMs(rating, score) {
  if (rating === 'again') return (typeof score === 'number' && score < 25 ? 1 : 2) * 60000;
  if (rating === 'hard') return 4 * 60000;
  return 0;
}

// ─── Workload: capacity, target recall, new cards ───────────────────────────

/** Reviews you typically do on a study day (median of the last 14 active days). */
export function dailyCapacity(cards, now = Date.now()) {
  const counts = {};
  const since = now - 30 * DAY_MS;
  for (const card of cards || []) {
    for (const h of card.history || []) {
      const t = new Date(h.date).getTime();
      if (t >= since && t <= now) counts[dayKey(t)] = (counts[dayKey(t)] || 0) + 1;
    }
  }
  const active = Object.keys(counts).sort().slice(-14).map(k => counts[k]);
  const typical = median(active);
  return Math.max(10, Math.round(typical || 25));
}

function dueReviewCount(cards, now) {
  return (cards || []).filter(c => !c.paused && !c.suspended && isDueToday(c, new Date(now))).length;
}

/**
 * Target recall (percent). 90% normally; lower when a backlog builds so it
 * clears without a punishing day, a little higher when there's spare room.
 * Cards you keep forgetting are held to 85%: they cost the most reviews.
 */
export function autoRetention(cards, card = null, now = Date.now()) {
  const load = dueReviewCount(cards, now) / dailyCapacity(cards, now);
  let target = 90;
  if (load > 2) target = 85;
  else if (load > 1.4) target = 87;
  else if (load < 0.5) target = 92;
  const lapses = (card?.history || []).filter(h => h.rating === 'again').length;
  if (lapses >= 5) target = Math.min(target, 85);
  return target;
}

/** New cards to introduce today: more when reviews are light, none when swamped. */
export function dailyNewLimit(cards, now = Date.now()) {
  const capacity = dailyCapacity(cards, now);
  const due = dueReviewCount(cards, now);
  let limit = Math.min(20, Math.max(5, Math.round(capacity * 0.4)));
  if (due > capacity * 1.5) limit = 0;
  else if (due > capacity) limit = Math.round(limit / 2);
  const today = dayKey(now);
  const introducedToday = (cards || []).filter(c => {
    const first = (c.history || [])[0];
    return first && dayKey(first.date) === today;
  }).length;
  return Math.max(0, limit - introducedToday);
}

// ─── Session plan ───────────────────────────────────────────────────────────

/**
 * Order a session: due reviews most-at-risk first, with up to `newLimit` new
 * cards woven in (one after every four reviews) so new material never piles
 * up at the end when you're tired.
 */
export function planSession(cards, { now = Date.now(), newLimit = Infinity } = {}) {
  const at = new Date(now);
  const active = (cards || []).filter(c => !c.paused && !c.suspended);
  const due = active
    .filter(c => isDueToday(c, at))
    .map(c => ({ c, r: predictRecall(c, at) ?? 0 }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.c);
  const fresh = active.filter(c => !c.state?.dueDate);
  const newCards = fresh.slice(0, Math.max(0, newLimit));

  const queue = [];
  let n = 0;
  due.forEach((card, i) => {
    queue.push(card);
    if ((i + 1) % 4 === 0 && n < newCards.length) queue.push(newCards[n++]);
  });
  while (n < newCards.length) queue.push(newCards[n++]);

  return { queue, dueCount: due.length, newCount: newCards.length, newWaiting: fresh.length - newCards.length };
}

// ─── Session coach ──────────────────────────────────────────────────────────

export function createCoach(now = Date.now()) {
  return { startedAt: now, answers: [], wrapUpOffered: false };
}

/** Log one answer: correct (score ≥ 50) and speed relative to your usual. */
export function coachRecord(coach, { score, seconds, baseline, at = Date.now() }) {
  const ratio = seconds > 0 && baseline > 0 ? seconds / baseline : 1;
  return { ...coach, answers: [...coach.answers, { correct: (score ?? 0) >= 50, ratio, at }] };
}

const MOOD_LABELS = {
  'warming-up': '',
  steady: '',
  flow: 'On a roll: mixing in tougher cards',
  struggling: 'Easing off: easier cards next',
  tired: 'Energy dipping: good time to wrap up soon'
};

/**
 * Read the session: struggling (misses stacking up), tired (long session
 * with slowing answers or falling accuracy), flow (fast and accurate) or
 * steady.
 */
export function assessMood(coach, now = Date.now()) {
  const a = coach.answers;
  const mood = (() => {
    // Two misses in a row is a clear signal even at the very start
    let trailingMisses = 0;
    for (let i = a.length - 1; i >= 0 && !a[i].correct; i--) trailingMisses++;
    if (trailingMisses >= 2) return 'struggling';
    if (a.length < 3) return 'warming-up';
    const last5 = a.slice(-5);
    const rate = (xs) => xs.filter(x => x.correct).length / xs.length;
    const avgRatio = (xs) => xs.reduce((s, x) => s + Math.min(x.ratio, 4), 0) / xs.length;
    if (rate(last5) <= 0.4) return 'struggling';

    const minutes = (now - coach.startedAt) / 60000;
    if (minutes >= 45) return 'tired';
    if (minutes >= 25 && a.length >= 8) {
      const early = a.slice(0, 4);
      const late = a.slice(-4);
      if (rate(late) < rate(early) - 0.2 || avgRatio(late) > avgRatio(early) * 1.35) return 'tired';
    }
    if (last5.length === 5 && rate(last5) === 1 && avgRatio(last5) <= 1) return 'flow';
    return 'steady';
  })();
  return { mood, label: MOOD_LABELS[mood] };
}

/**
 * Pick which upcoming card to show next (index into `upcoming`). Struggling:
 * the reviewed card you're most likely to get right, as a confidence boost.
 * Flow: the one most at risk of being forgotten. Otherwise keep the plan.
 */
export function chooseNextIndex(upcoming, mood, now = Date.now(), lookahead = 6) {
  const window = upcoming.slice(0, lookahead);
  if (window.length < 2) return 0;
  const at = new Date(now);
  const scored = window.map((card, i) => ({ i, r: predictRecall(card, at) }));
  if (mood === 'struggling' || mood === 'tired') {
    const reviewed = scored.filter(x => x.r !== null);
    if (!reviewed.length) return 0;
    return reviewed.reduce((best, x) => (x.r > best.r ? x : best)).i;
  }
  if (mood === 'flow') {
    return scored.reduce((best, x) => ((x.r ?? 0.5) < (best.r ?? 0.5) ? x : best)).i;
  }
  return 0;
}

/** Extra instructions for the AI grader when the session is going badly. */
export const GENTLE_TONE = `[GENTLE MODE]: The student is having a tough session.
1. Use a warm, encouraging, supportive tone.
2. Keep "correctExplanation" under 40 words with a simple real-world analogy.
3. In logicAnalysis, give one short supportive sentence.
4. Grade accuracy honestly; just phrase feedback kindly.`;
