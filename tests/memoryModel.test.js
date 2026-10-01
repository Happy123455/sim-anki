import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WEIGHTS, calculateNextState, setActiveWeights, getActiveWeights } from '../src/utils/srs.js';
import { trainPersonalModel, replayCardState, buildSequences, wasRecalled } from '../src/utils/memoryModel.js';
import { simulateLearner } from './helpers/simulate.js';

const tweak = (f) => { const w = [...DEFAULT_WEIGHTS]; f(w); return w; };
const FORGETS_FASTER = tweak(w => { w[0] *= 0.5; w[1] *= 0.5; w[2] *= 0.5; w[3] *= 0.5; w[8] = 1.4; w[20] = 0.3; });

test('stays on standard FSRS while history is too short', () => {
  const res = trainPersonalModel(simulateLearner(DEFAULT_WEIGHTS, { cards: 8, days: 20, seed: 3 }));
  assert.equal(res.status, 'learning');
  assert.equal(res.weights, null);
});

test('does not switch for a learner who matches the standard model', () => {
  for (const seed of [1, 2, 3]) {
    const res = trainPersonalModel(simulateLearner(DEFAULT_WEIGHTS, { cards: 180, days: 120, seed }));
    assert.equal(res.status, 'standard', `seed ${seed} switched (improvement ${res.improvement})`);
  }
});

test('switches for a learner who forgets faster, and predicts them better', () => {
  const res = trainPersonalModel(simulateLearner(FORGETS_FASTER, { cards: 180, days: 120, seed: 1 }));
  assert.equal(res.status, 'personal');
  assert.ok(res.improvement > 0 && res.personalLoss < res.standardLoss);
  assert.equal(res.weights.length, 21);
  // The fitted model should have learned this person forgets faster
  assert.ok(res.weights[20] > DEFAULT_WEIGHTS[20] || res.weights[2] < DEFAULT_WEIGHTS[2]);
});

test('replaying a card under new weights keeps its due date', () => {
  const [card] = simulateLearner(DEFAULT_WEIGHTS, { cards: 1, days: 60, seed: 5 });
  card.state = { stability: 10, difficulty: 5, dueDate: '2026-05-01T00:00:00.000Z', lastReviewDate: card.history.at(-1).date };
  const replayed = replayCardState(card, FORGETS_FASTER);
  assert.equal(replayed.dueDate, card.state.dueDate);
  assert.notEqual(replayed.stability, 10);
});

test('recall label trusts the AI score over a softened rating', () => {
  assert.equal(wasRecalled({ rating: 'hard', score: 30 }), false); // relaxed-mode miss
  assert.equal(wasRecalled({ rating: 'good', score: 85 }), true);
  assert.equal(wasRecalled({ rating: 'good', score: 0 }), true);   // score missing, logged as 0
  assert.equal(wasRecalled({ rating: 'again' }), false);
});

test('active weights can be swapped and invalid ones are rejected', () => {
  const card = { state: null };
  const base = calculateNextState(card, 'good', 90, '2026-01-01T00:00:00.000Z');
  assert.ok(setActiveWeights(FORGETS_FASTER));
  const personal = calculateNextState(card, 'good', 90, '2026-01-01T00:00:00.000Z');
  assert.ok(personal.stability < base.stability);
  assert.equal(setActiveWeights([1, 2, 3]), false);
  assert.equal(getActiveWeights(), DEFAULT_WEIGHTS);
});

test('only reviews a day or more apart are scored', () => {
  const seqs = buildSequences([{ history: [
    { date: '2026-01-01T10:00:00Z', rating: 'good' },
    { date: '2026-01-01T10:10:00Z', rating: 'good' },
    { date: '2026-01-03T10:00:00Z', rating: 'again' }
  ] }]);
  assert.deepEqual(seqs[0].map(r => r.days), [0, 0, 2]);
});
