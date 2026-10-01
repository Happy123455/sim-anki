// Simulated learners whose real memory differs from FSRS's average person.
import { DEFAULT_WEIGHTS, nextMemoryState, forgettingCurve, intervalForRetention } from '../../src/utils/srs.js';
const DAY = 86400000;

export function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

export function simulateLearner(trueW, { cards = 200, days = 150, seed = 1, retention = 0.9 } = {}) {
  const rnd = rng(seed);
  const start = Date.UTC(2026, 0, 1);
  const out = [];
  for (let c = 0; c < cards; c++) {
    const history = [];
    let t = start + Math.floor((c / cards) * days * 0.6) * DAY + Math.floor(rnd() * 12) * 3600000;
    let sched = { s: 0, d: 0 };
    let truth = { s: 0, d: 0 };
    let last = null;
    const review = (G, recalled) => {
      const elapsed = last === null ? 0 : Math.max(0, Math.round((t - last) / DAY));
      const n1 = nextMemoryState(sched.s, sched.d, elapsed, G, DEFAULT_WEIGHTS);
      const n2 = nextMemoryState(truth.s, truth.d, elapsed, G, trueW);
      sched = { s: n1.stability, d: n1.difficulty };
      truth = { s: n2.stability, d: n2.difficulty };
      history.push({ date: new Date(t).toISOString(), rating: ['again', 'hard', 'good', 'easy'][G - 1], score: recalled ? 85 : 20 });
      last = t;
    };
    // First exposure
    const u = rnd();
    review(u < 0.2 ? 1 : u < 0.35 ? 2 : u < 0.9 ? 3 : 4, true);
    while (true) {
      const ivl = intervalForRetention(sched.s, retention, DEFAULT_WEIGHTS);
      const lateness = rnd() < 0.2 ? Math.floor(rnd() * 5) : 0;
      t = last + (ivl + lateness) * DAY + Math.floor(rnd() * 6) * 3600000;
      if (t > start + days * DAY) break;
      const elapsed = Math.round((t - last) / DAY);
      const recalled = rnd() < forgettingCurve(elapsed, truth.s, trueW);
      const v = rnd();
      review(recalled ? (v < 0.15 ? 2 : v < 0.9 ? 3 : 4) : 1, recalled);
      if (!recalled) { t += 10 * 60000; review(3, true); } // relearn later that session
    }
    out.push({ id: 'c' + c, history });
  }
  return out;
}
