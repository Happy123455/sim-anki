/**
 * Personal memory model.
 *
 * Standard FSRS-6 ships one set of 21 weights fitted to millions of reviews
 * from many people. This module re-fits those weights to ONE learner's own
 * history, then checks on reviews the fit never saw whether the personal
 * weights predict that learner's recall better than the standard ones. It
 * only recommends switching when they do.
 *
 * Pure functions, no DOM: runs in a Web Worker and in Node tests.
 */
import { DEFAULT_WEIGHTS, nextMemoryState, forgettingCurve } from './srs.js';

const DAY_MS = 86400000;
const GRADE = { again: 1, hard: 2, good: 3, easy: 4 };

/** Allowed range for each weight (FSRS-6 optimizer clamps). */
export const WEIGHT_BOUNDS = [
  [0.001, 100], [0.001, 100], [0.001, 100], [0.001, 100], // initial stability per grade
  [1, 10], [0.001, 4],                                     // initial difficulty
  [0.001, 4], [0.001, 0.75],                               // difficulty update
  [0, 4.5], [0, 0.8], [0.001, 3.5],                        // stability after success
  [0.001, 5], [0.001, 0.25], [0.001, 0.9], [0, 4],         // stability after a lapse
  [0, 1], [1, 6],                                          // hard penalty, easy bonus
  [0, 2], [0, 2], [0, 0.8],                                // same-day reviews
  [0.1, 0.8]                                               // forgetting-curve decay
];

// Typical size of a meaningful change for each weight; used for step sizes
// and for the pull back toward the standard weights.
const SCALE = DEFAULT_WEIGHTS.map((v, i) => Math.max(Math.abs(v), (WEIGHT_BOUNDS[i][1] - WEIGHT_BOUNDS[i][0]) * 0.02, 0.02));

const clampWeight = (v, i) => Math.min(WEIGHT_BOUNDS[i][1], Math.max(WEIGHT_BOUNDS[i][0], v));

// Which weights may move depends on how much history there is. Simulations
// showed fitting all 21 from a few hundred reviews overfits, while these
// tiers capture most of the achievable gain at each size.
const CORE_WEIGHTS = [0, 1, 2, 3, 8, 20];           // initial strength per grade, growth, forgetting speed
const LAPSE_WEIGHTS = [...CORE_WEIGHTS, 11, 13, 14]; // + how memory recovers after forgetting
const ALL_WEIGHTS = DEFAULT_WEIGHTS.map((_, i) => i);

export function freeWeightsFor(samples) {
  if (samples < 800) return CORE_WEIGHTS;
  if (samples < 2500) return LAPSE_WEIGHTS;
  return ALL_WEIGHTS;
}

/** Did the learner actually recall it? Prefer the AI score over the logged button. */
export function wasRecalled(entry) {
  if (typeof entry.score === 'number' && !(entry.score === 0 && entry.rating && entry.rating !== 'again')) {
    return entry.score >= 50;
  }
  return entry.rating !== 'again';
}

/**
 * Each card's reviews as a chronological sequence of
 * { at: ms, days: whole days since previous review, g: grade 1-4, y: recalled 0/1 }.
 */
export function buildSequences(cards, minLength = 2) {
  const sequences = [];
  for (const card of cards || []) {
    const reviews = (card.history || [])
      .map(h => ({ at: new Date(h.date).getTime(), g: GRADE[String(h.rating || '').toLowerCase()], y: wasRecalled(h) ? 1 : 0 }))
      .filter(r => Number.isFinite(r.at) && r.g)
      .sort((a, b) => a.at - b.at);
    if (reviews.length < minLength) continue;
    for (let i = 0; i < reviews.length; i++) {
      reviews[i].days = i === 0 ? 0 : Math.max(0, Math.round((reviews[i].at - reviews[i - 1].at) / DAY_MS));
    }
    sequences.push(reviews);
  }
  return sequences;
}

/** Timestamps of every review the model is scored on (≥1 day after the previous one). */
export function sampleTimes(sequences) {
  const times = [];
  for (const seq of sequences) {
    for (let i = 1; i < seq.length; i++) if (seq[i].days >= 1) times.push(seq[i].at);
  }
  return times.sort((a, b) => a - b);
}

/**
 * Mean log-loss of the recall predictions `w` makes for reviews whose time
 * falls in [from, to). Every review still updates memory state, so a
 * prediction only ever uses what happened before it.
 */
export function predictionLoss(sequences, w, from = -Infinity, to = Infinity, perSample = null) {
  let total = 0;
  let n = 0;
  for (const seq of sequences) {
    let s = 0;
    let d = 0;
    for (let i = 0; i < seq.length; i++) {
      const r = seq[i];
      if (i > 0 && r.days >= 1 && r.at >= from && r.at < to) {
        const p = Math.min(1 - 1e-4, Math.max(1e-4, forgettingCurve(r.days, s, w)));
        const loss = r.y ? -Math.log(p) : -Math.log(1 - p);
        total += loss;
        n++;
        if (perSample) perSample.push(loss);
      }
      const next = nextMemoryState(s, d, i === 0 ? 0 : r.days, r.g, w);
      s = next.stability;
      d = next.difficulty;
    }
  }
  return { loss: n ? total / n : 0, n };
}

/**
 * Fit weights by minimising log-loss on reviews in [from, to), with a pull
 * toward the standard weights that fades as more reviews are available, so a
 * small history can't drag the model somewhere silly.
 */
export function fitWeights(sequences, { from = -Infinity, to = Infinity, start = DEFAULT_WEIGHTS, iterations = 140, free, onProgress } = {}) {
  const n = Math.max(1, predictionLoss(sequences, DEFAULT_WEIGHTS, from, to).n);
  const priorStrength = 6 / n;
  // With little data only the weights that differ most between people move
  const freeSet = new Set(free || freeWeightsFor(n));

  const objective = (w) => {
    let penalty = 0;
    for (let i = 0; i < w.length; i++) {
      const z = (w[i] - DEFAULT_WEIGHTS[i]) / SCALE[i];
      penalty += z * z;
    }
    return predictionLoss(sequences, w, from, to).loss + priorStrength * penalty;
  };

  // Adam on numerical gradients, steps scaled per weight
  let w = start.map(clampWeight);
  const m = new Array(w.length).fill(0);
  const v = new Array(w.length).fill(0);
  const lr = 0.04;
  const b1 = 0.9;
  const b2 = 0.999;
  let best = { w: [...w], f: objective(w) };
  let stale = 0;

  for (let it = 1; it <= iterations; it++) {
    const grad = w.map((wi, i) => {
      if (!freeSet.has(i)) return 0;
      const h = SCALE[i] * 1e-3;
      const up = [...w];
      const down = [...w];
      up[i] = clampWeight(wi + h, i);
      down[i] = clampWeight(wi - h, i);
      const span = up[i] - down[i];
      return span > 0 ? (objective(up) - objective(down)) / span : 0;
    });
    w = w.map((wi, i) => {
      const g = grad[i] * SCALE[i];
      m[i] = b1 * m[i] + (1 - b1) * g;
      v[i] = b2 * v[i] + (1 - b2) * g * g;
      const mHat = m[i] / (1 - Math.pow(b1, it));
      const vHat = v[i] / (1 - Math.pow(b2, it));
      return clampWeight(wi - lr * SCALE[i] * mHat / (Math.sqrt(vHat) + 1e-8), i);
    });
    const f = objective(w);
    if (f < best.f - 1e-7) {
      best = { w: [...w], f };
      stale = 0;
    } else if (++stale >= 15) {
      break;
    }
    if (onProgress && it % 10 === 0) onProgress(it / iterations);
  }
  return best.w;
}

/**
 * Train and validate with forward chaining: for three cut points (55%, 70%,
 * 85% of the review timeline) fit on everything before the cut and score the
 * next 15% of reviews. The personal model is adopted only if, review by
 * review, it beats the standard weights consistently enough (paired z ≥ 1)
 * and by at least `minImprovement` overall. It's then refitted on the full
 * history.
 */
export function trainPersonalModel(cards, { minSamples = 60, minImprovement = 0.002, minZ = 1, now = Date.now(), onProgress } = {}) {
  const sequences = buildSequences(cards);
  const times = sampleTimes(sequences);
  const base = { trainedAt: now, samples: times.length, needed: minSamples };

  if (times.length < minSamples) {
    return { ...base, status: 'learning', weights: null };
  }

  const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
  const windows = [[0.55, 0.7], [0.7, 0.85], [0.85, 1.01]];
  const stdLosses = [];
  const perLosses = [];
  windows.forEach(([a, b], k) => {
    const cut = at(a);
    const end = b > 1 ? Infinity : at(b);
    const fit = fitWeights(sequences, { to: cut, onProgress: p => onProgress?.((k + p) / (windows.length + 1)) });
    predictionLoss(sequences, DEFAULT_WEIGHTS, cut, end, stdLosses);
    predictionLoss(sequences, fit, cut, end, perLosses);
  });

  const n = stdLosses.length;
  const mean = (arr) => arr.reduce((x, y) => x + y, 0) / Math.max(1, arr.length);
  const standardLoss = mean(stdLosses);
  const personalLoss = mean(perLosses);
  const diffs = stdLosses.map((v, i) => v - perLosses[i]);
  const meanDiff = mean(diffs);
  const sd = Math.sqrt(diffs.reduce((acc, x) => acc + (x - meanDiff) ** 2, 0) / Math.max(1, n - 1));
  const z = sd > 0 ? meanDiff / (sd / Math.sqrt(n)) : 0;
  const improvement = standardLoss > 0 ? 1 - personalLoss / standardLoss : 0;
  const result = { ...base, testSamples: n, standardLoss, personalLoss, improvement, confidence: z };

  if (n < 20 || improvement < minImprovement || z < minZ) {
    return { ...result, status: 'standard', weights: null };
  }

  const weights = fitWeights(sequences, { onProgress: p => onProgress?.((windows.length + p) / (windows.length + 1)) });
  return { ...result, status: 'personal', weights };
}

/**
 * Recompute a card's memory state by replaying its history under `weights`,
 * keeping its current due date so switching models never causes a pile-up.
 */
export function replayCardState(card, weights) {
  const seq = buildSequences([card], 1)[0];
  if (!seq || !card.state) return card.state;
  let s = 0;
  let d = 0;
  seq.forEach((r, i) => {
    const next = nextMemoryState(s, d, i === 0 ? 0 : r.days, r.g, weights);
    s = next.stability;
    d = next.difficulty;
  });
  return { ...card.state, stability: Number(s.toFixed(2)), difficulty: Number(d.toFixed(2)) };
}
