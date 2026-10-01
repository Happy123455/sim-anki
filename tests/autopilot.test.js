import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeAnswer, planSession, assessMood, createCoach, coachRecord, chooseNextIndex,
  autoRetention, dailyNewLimit, dailyCapacity, answerTimeBaselines, relearnDelayMs
} from '../src/utils/autopilot.js';

const NOW = new Date('2026-10-01T12:00:00').getTime();
const DAY = 86400000;
const reviewed = (id, dueInDays, stability = 5, lastAgoDays = 5) => ({
  id,
  state: {
    stability,
    difficulty: 5,
    dueDate: new Date(NOW + dueInDays * DAY).toISOString(),
    lastReviewDate: new Date(NOW - lastAgoDays * DAY).toISOString()
  },
  history: [{ date: new Date(NOW - lastAgoDays * DAY).toISOString(), rating: 'good', timeSpent: 20 }]
});
const fresh = (id) => ({ id, state: null, history: [] });

test('grading: easy needs speed and confidence, not just correctness', () => {
  assert.equal(gradeAnswer({ score: 100, seconds: 30, confidence: 3, baseline: 20 }).rating, 'good');
  assert.equal(gradeAnswer({ score: 100, seconds: 10, confidence: 4, baseline: 20 }).rating, 'easy');
  assert.equal(gradeAnswer({ score: 95, seconds: 6, confidence: 3, baseline: 20 }).rating, 'easy');
  assert.equal(gradeAnswer({ score: 90, seconds: 60, confidence: 1, baseline: 20 }).rating, 'hard');
  assert.equal(gradeAnswer({ score: 60, seconds: 10, confidence: 5, baseline: 20 }).rating, 'hard');
  assert.equal(gradeAnswer({ score: 30, seconds: 10, confidence: 3, baseline: 20 }).rating, 'again');
});

test('grading: near misses are softened only when the session is going badly', () => {
  assert.equal(gradeAnswer({ score: 45, seconds: 20, baseline: 20, mood: 'steady' }).rating, 'again');
  assert.equal(gradeAnswer({ score: 45, seconds: 20, baseline: 20, mood: 'struggling' }).rating, 'hard');
  assert.equal(gradeAnswer({ score: 20, seconds: 20, baseline: 20, mood: 'struggling' }).rating, 'again');
});

test('plan: most-at-risk reviews first, new cards woven in and capped', () => {
  const cards = [
    reviewed('safe', 0, 50, 2),       // high recall
    reviewed('risky', -3, 2, 10),     // low recall
    reviewed('mid', 0, 8, 6),
    reviewed('later', 5),             // not due
    reviewed('mid2', 0, 9, 6),
    fresh('n1'), fresh('n2'), fresh('n3')
  ];
  const plan = planSession(cards, { now: NOW, newLimit: 2 });
  assert.equal(plan.queue[0].id, 'risky');
  assert.ok(!plan.queue.some(c => c.id === 'later'));
  assert.equal(plan.newCount, 2);
  assert.equal(plan.newWaiting, 1);
  assert.equal(plan.queue[4].id, 'n1'); // after four reviews
  assert.deepEqual(plan.queue.slice(-1).map(c => c.id), ['n2']);
});

test('mood: struggling after repeated misses, flow when fast and accurate', () => {
  let coach = createCoach(NOW);
  for (const score of [80, 20, 30]) coach = coachRecord(coach, { score, seconds: 20, baseline: 20, at: NOW });
  assert.equal(assessMood(coach, NOW).mood, 'struggling');

  coach = createCoach(NOW);
  for (const score of [20, 30]) coach = coachRecord(coach, { score, seconds: 20, baseline: 20, at: NOW });
  assert.equal(assessMood(coach, NOW).mood, 'struggling', 'two misses straight away');

  coach = createCoach(NOW);
  coach = coachRecord(coach, { score: 20, seconds: 20, baseline: 20, at: NOW });
  assert.equal(assessMood(coach, NOW).mood, 'warming-up', 'one miss is not a pattern');

  coach = createCoach(NOW);
  for (let i = 0; i < 5; i++) coach = coachRecord(coach, { score: 95, seconds: 12, baseline: 20, at: NOW });
  assert.equal(assessMood(coach, NOW).mood, 'flow');
});

test('mood: tired after a long session with slowing answers', () => {
  let coach = createCoach(NOW - 30 * 60000);
  for (let i = 0; i < 4; i++) coach = coachRecord(coach, { score: 90, seconds: 15, baseline: 20 });
  for (let i = 0; i < 4; i++) coach = coachRecord(coach, { score: 75, seconds: 40, baseline: 20 });
  assert.equal(assessMood(coach, NOW).mood, 'tired');
});

test('next card: easy win when struggling, hardest when in flow', () => {
  const upcoming = [reviewed('mid', 0, 8, 6), reviewed('easy', 0, 80, 1), reviewed('hard', -2, 1.5, 8)];
  assert.equal(upcoming[chooseNextIndex(upcoming, 'struggling', NOW)].id, 'easy');
  assert.equal(upcoming[chooseNextIndex(upcoming, 'flow', NOW)].id, 'hard');
  assert.equal(chooseNextIndex(upcoming, 'steady', NOW), 0);
});

test('workload: backlog lowers target recall and pauses new cards', () => {
  const history = Array.from({ length: 10 }, (_, d) =>
    Array.from({ length: 20 }, () => ({ date: new Date(NOW - (d + 1) * DAY).toISOString(), rating: 'good', timeSpent: 15 }))
  ).flat();
  const base = [{ id: 'h', state: null, history }];
  assert.equal(dailyCapacity(base, NOW), 20);
  const backlog = [...base, ...Array.from({ length: 50 }, (_, i) => reviewed('b' + i, -1))];
  assert.equal(autoRetention(backlog, null, NOW), 85);
  assert.equal(dailyNewLimit(backlog, NOW), 0);
  const quiet = [...base, reviewed('q', 0)];
  assert.equal(autoRetention(quiet, null, NOW), 92);
  assert.ok(dailyNewLimit(quiet, NOW) >= 5);
});

test('baselines and relearn delays', () => {
  const b = answerTimeBaselines([{ cardType: 'rote', history: [10, 12, 14, 16, 18].map(t => ({ timeSpent: t, rating: 'good' })) }]);
  assert.equal(b.byType.rote, 14);
  assert.equal(relearnDelayMs('again', 10), 60000);
  assert.equal(relearnDelayMs('good', 90), 0);
});
