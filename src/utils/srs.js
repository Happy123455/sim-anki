/**
 * FSRS (Free Spaced Repetition Scheduler) 4.5 scheduling algorithm.
 */

// FSRS 4.5 Default Weights
const w = [
  0.4, 0.9, 2.3, 10.9,  // w[0..3]: initial stability for rating 1..4 (Again, Hard, Good, Easy)
  4.93, 0.94,           // w[4..5]: initial difficulty parameters
  0.86, 0.01,           // w[6..7]: difficulty updating parameters
  1.49, 0.14,           // w[8..9]: stability updating multipliers (success)
  0.94, 2.18,           // w[10..11]: stability updating parameters
  0.05, 0.34,           // w[12..13]: stability updating parameters
  1.26, 0.2, 0.09, 0.3  // w[14..17]: stability updating parameters
];

/**
 * Calculates the next FSRS state variables for a card.
 * 
 * @param {Object} card - The current card object.
 * @param {string} ratingStr - Rating string ('again', 'hard', 'good', 'easy').
 * @returns {Object} Updated FSRS state properties for the card.
 */
export function calculateNextState(card, ratingStr, targetRetention = 90) {
  const ratingMap = { again: 1, hard: 2, good: 3, easy: 4 };
  const G = ratingMap[ratingStr] || 3;
  
  const currentState = card.state || {
    difficulty: 4.93, // base difficulty
    stability: 0.0,   // 0 means new card
    repetitions: 0,
    consecutiveFails: 0,
    lastReviewDate: null
  };

  let difficulty = currentState.difficulty;
  let stability = currentState.stability;
  let repetitions = currentState.repetitions;
  let consecutiveFails = currentState.consecutiveFails || 0;
  
  // Calculate elapsed days since last review
  let t = 1;
  if (currentState.lastReviewDate) {
    const elapsedMs = new Date() - new Date(currentState.lastReviewDate);
    t = Math.max(1, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));
  }

  let nextStability = 0;
  let nextDifficulty = 4.93;

  if (stability === 0) {
    // Card is New: initialize stability and difficulty
    nextStability = w[G - 1];
    nextDifficulty = w[4] - w[5] * (G - 3);
    nextDifficulty = Math.max(1.0, Math.min(10.0, nextDifficulty));
    repetitions = G === 1 ? 0 : 1;
    consecutiveFails = G === 1 ? 1 : 0;
  } else {
    // Card is Review: apply FSRS transition formulas
    const R = Math.pow(0.9, t / stability); // Retrievability
    
    // 1. Update difficulty
    nextDifficulty = difficulty - w[6] * (G - 3);
    // Mean reversion to base difficulty (w[4] is base difficulty for good rating)
    nextDifficulty = w[7] * 4.93 + (1 - w[7]) * nextDifficulty;
    nextDifficulty = Math.max(1.0, Math.min(10.0, nextDifficulty));

    if (G === 1) {
      // Again (Failure)
      nextStability = w[11] * Math.pow(nextDifficulty, -w[12]) * (Math.pow(stability + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R));
      nextStability = Math.max(0.1, nextStability); // bound stability above zero
      repetitions = 0;
      consecutiveFails += 1;
    } else {
      // Hard, Good, Easy (Success)
      nextStability = stability * (1 + Math.exp(w[8]) * (11 - nextDifficulty) * Math.pow(stability, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1));
      repetitions += 1;
      consecutiveFails = 0;
    }
  }

  // Calculate interval in days based on custom target retrievability
  // FSRS formula: I = stability * ln(R_target) / ln(0.9)
  const R_target = targetRetention / 100;
  let interval = Math.max(1, Math.round(nextStability * (Math.log(R_target) / Math.log(0.9))));

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + interval);
  dueDate.setHours(0, 0, 0, 0);

  return {
    difficulty: Number(nextDifficulty.toFixed(2)),
    stability: Number(nextStability.toFixed(2)),
    repetitions,
    consecutiveFails,
    lastReviewDate: new Date().toISOString(),
    dueDate: dueDate.toISOString(),
    interval
  };
}

/**
 * Checks if a card is currently due.
 */
export function isDue(card) {
  if (!card.state || !card.state.dueDate) return true;
  
  const due = new Date(card.state.dueDate);
  const now = new Date();
  
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  
  return due <= todayEnd;
}

/**
 * Returns a friendly interval string for scheduling buttons.
 */
export function getFriendlyInterval(card, ratingStr, targetRetention = 90) {
  const nextState = calculateNextState(card, ratingStr, targetRetention);
  const days = nextState.interval;
  
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  
  const months = Math.round(days / 30);
  return `${months}m`;
}
