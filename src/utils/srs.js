/**
 * FSRS (Free Spaced Repetition Scheduler) 6.0 scheduling algorithm.
 */

// FSRS 6.0 Default Weights (21 parameters)
const w = [
  0.212, 1.2931, 2.3065, 8.2956, // w[0..3]: initial stability for rating 1..4 (Again, Hard, Good, Easy)
  6.4133, 0.8334,                // w[4..5]: initial difficulty parameters
  3.0194, 0.001,                 // w[6..7]: difficulty updating parameters
  1.8722, 0.1666, 0.796,         // w[8..10]: stability updating multipliers (success)
  1.4835, 0.0614, 0.2629, 1.6483, // w[11..14]: stability updating parameters (lapse/failure)
  0.6014, 1.8729,                // w[15..16]: stability updating parameters (hard penalty, easy bound)
  0.5425, 0.0912, 0.0658, 0.1542  // w[17..20]: short term stability parameters & decay
];

/**
 * Computes decay and factor variables for forgetting curve calculations.
 * 
 * decay = -w[20]
 * factor = exp(ln(0.9) / decay) - 1.0
 */
function computeDecayFactor(weights) {
  const decay = -weights[20];
  const factor = Math.exp(Math.log(0.9) / decay) - 1.0;
  return { decay, factor };
}

/**
 * Calculates retrievability (probability of recall) after t days.
 * 
 * R(t, S) = (1 + factor * t / S) ^ decay
 */
function forgettingCurve(t, s, weights) {
  const { decay, factor } = computeDecayFactor(weights);
  const safeS = Math.max(s, 0.001);
  return Math.pow(1.0 + (factor * t) / safeS, decay);
}

/**
 * Calculates the interval modifier based on target retention.
 * 
 * IM = (R_target ^ (1/decay) - 1) / factor
 */
function calculateIntervalModifier(targetRetention, weights) {
  const { decay, factor } = computeDecayFactor(weights);
  return (Math.pow(targetRetention, 1.0 / decay) - 1.0) / factor;
}

/**
 * Initial stability for new cards: max(w[G-1], 0.1)
 */
function initStability(G, weights) {
  return Math.max(weights[G - 1], 0.1);
}

/**
 * Initial difficulty for new cards: w[4] - exp((G-1) * w[5]) + 1
 * Clamped to [1.0, 10.0]
 */
function initDifficulty(G, weights) {
  const d = weights[4] - Math.exp((G - 1) * weights[5]) + 1.0;
  return Math.max(1.0, Math.min(10.0, d));
}

/**
 * New difficulty for review cards:
 * delta_d = -w[6] * (G - 3)
 * next_d = D + (delta_d * (10 - D)) / 9
 * D'' = w[7] * D_0(4) + (1 - w[7]) * next_d
 * Clamped to [1.0, 10.0]
 */
function computeNextDifficulty(d, G, weights) {
  const delta_d = -weights[6] * (G - 3);
  const next_d = d + (delta_d * (10.0 - d)) / 9.0;
  const d_0_easy = initDifficulty(4, weights);
  const d_prime_prime = weights[7] * d_0_easy + (1.0 - weights[7]) * next_d;
  return Math.max(1.0, Math.min(10.0, d_prime_prime));
}

/**
 * Short-term stability update for same-day reviews:
 * sinc = S ^ -w[19] * exp(w[17] * (G - 3 + w[18]))
 * maskedSinc = G >= 2 ? max(sinc, 1.0) : sinc
 * S'_s = S * maskedSinc
 */
function computeNextShortTermStability(s, G, weights) {
  const sinc = Math.pow(s, -weights[19]) * Math.exp(weights[17] * (G - 3.0 + weights[18]));
  const maskedSinc = G >= 2 ? Math.max(sinc, 1.0) : sinc;
  return Math.max(0.001, Math.min(36500.0, s * maskedSinc));
}

/**
 * Next recall stability (success):
 * S'_r = S * (1 + exp(w[8]) * (11 - D) * S ^ -w[9] * (exp((1 - R) * w[10]) - 1) * hard_penalty * easy_bound)
 */
function computeNextRecallStability(d, s, r, G, weights) {
  const hard_penalty = G === 2 ? weights[15] : 1.0;
  const easy_bound = G === 4 ? weights[16] : 1.0;
  const sinc = 1.0 + Math.exp(weights[8]) * (11.0 - d) * Math.pow(s, -weights[9]) * (Math.exp((1.0 - r) * weights[10]) - 1.0) * hard_penalty * easy_bound;
  return Math.max(0.001, Math.min(36500.0, s * sinc));
}

/**
 * Next forget stability (lapse/failure):
 * S'_f = w[11] * D ^ -w[12] * ((S + 1) ^ w[13] - 1) * exp((1 - R) * w[14])
 * clamped below by s / exp(w[17] * w[18])
 */
function computeNextForgetStability(d, s, r, weights) {
  const s_after_fail = weights[11] * Math.pow(d, -weights[12]) * (Math.pow(s + 1.0, weights[13]) - 1.0) * Math.exp((1.0 - r) * weights[14]);
  const next_s_min = s / Math.exp(weights[17] * weights[18]);
  return Math.max(0.001, Math.min(s_after_fail, Math.max(0.001, next_s_min)));
}

/**
 * Calculates the next FSRS state variables for a card.
 * 
 * @param {Object} card - The current card object.
 * @param {string} ratingStr - Rating string ('again', 'hard', 'good', 'easy').
 * @param {number} targetRetention - Requested retention (typically 70-95, default 90).
 * @returns {Object} Updated FSRS state properties for the card.
 */
export function calculateNextState(card, ratingStr, targetRetention = 90, reviewDate = null, againStepMin = 10) {
  const ratingMap = { again: 1, hard: 2, good: 3, easy: 4 };
  const normalizedRating = String(ratingStr || 'good').toLowerCase();
  const G = ratingMap[normalizedRating] || 3;
  
  const retentionVal = Number(targetRetention) || 90;
  const R_target = retentionVal / 100.0;
  
  const currentState = card.state || {
    difficulty: 0.0,
    stability: 0.0,   // 0 means new card
    repetitions: 0,
    consecutiveFails: 0,
    lastReviewDate: null
  };

  let difficulty = currentState.difficulty;
  let stability = currentState.stability;
  let repetitions = currentState.repetitions;
  let consecutiveFails = currentState.consecutiveFails || 0;
  
  const now = reviewDate ? new Date(reviewDate) : new Date();
  
  // Calculate elapsed days since last review
  let t = 0;
  if (currentState.lastReviewDate) {
    const elapsedMs = now - new Date(currentState.lastReviewDate);
    t = Math.max(0, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));
  }

  let nextStability = 0;
  let nextDifficultyValue = 0;

  if (stability === 0) {
    // Card is New: initialize stability and difficulty
    nextStability = initStability(G, w);
    nextDifficultyValue = initDifficulty(G, w);
    repetitions = G === 1 ? 0 : 1;
    consecutiveFails = G === 1 ? 1 : 0;
  } else {
    // Card is Review: apply FSRS transition formulas
    const R = forgettingCurve(t, stability, w); // Retrievability
    
    // 1. Update difficulty
    nextDifficultyValue = computeNextDifficulty(difficulty, G, w);
    
    // 2. Update stability
    if (t === 0) {
      nextStability = computeNextShortTermStability(stability, G, w);
    } else if (G === 1) {
      nextStability = computeNextForgetStability(difficulty, stability, R, w);
      repetitions = 0;
      consecutiveFails += 1;
    } else {
      nextStability = computeNextRecallStability(difficulty, stability, R, G, w);
      repetitions += 1;
      consecutiveFails = 0;
    }
  }

  // Calculate interval in days based on custom target retrievability
  const IM = calculateIntervalModifier(R_target, w);
  let interval = Math.max(1, Math.round(nextStability * IM));
  if (isNaN(interval) || !isFinite(interval)) {
    interval = 1;
  }

  const dueDate = new Date(now);
  if (G === 1) {
    // Drop into a short-term queue (default = 10-minute)
    dueDate.setTime(dueDate.getTime() + (Number(againStepMin) || 10) * 60 * 1000);
    interval = 0;
  } else {
    dueDate.setDate(dueDate.getDate() + interval);
    dueDate.setHours(0, 0, 0, 0);
  }

  return {
    difficulty: Number(nextDifficultyValue.toFixed(2)),
    stability: Number(nextStability.toFixed(2)),
    repetitions,
    consecutiveFails,
    lastReviewDate: now.toISOString(),
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
  
  return due <= now;
}

/**
 * Returns a friendly interval string for scheduling buttons.
 */
export function getFriendlyInterval(card, ratingStr, targetRetention = 90, againStepMin = 10) {
  const nextState = calculateNextState(card, ratingStr, targetRetention, null, againStepMin);
  const days = nextState.interval;
  
  if (days === 0) return `${againStepMin}m`;
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  
  const months = Math.round(days / 30);
  return `${months}m`;
}

/**
 * Returns the intraday re-insertion delay in milliseconds for the priority queue.
 * 'again' cards reappear after againStepMin minutes.
 * 'hard' cards reappear after againStepMin * 2.5 minutes.
 * 'good'/'easy' cards don't get intraday re-insertion (returns 0).
 */
export function getIntradayIntervalMs(rating, againStepMin = 1) {
  switch (rating) {
    case 'again': return againStepMin * 60 * 1000;         // e.g. 1 minute
    case 'hard':  return againStepMin * 2.5 * 60 * 1000;   // e.g. 2.5 minutes
    default:      return 0;                                 // no re-insertion
  }
}

/**
 * Returns a category for the next-review interval visualizer popup.
 * Used to pick the right emoji/animation after rating.
 */
export function getIntervalCategory(card, ratingStr, targetRetention = 90, againStepMin = 10) {
  const nextState = calculateNextState(card, ratingStr, targetRetention, null, againStepMin);
  const days = nextState.interval;
  
  if (days === 0) return { key: 'soon', emoji: '⚡', label: 'Coming right back!', color: '#ef4444' };
  if (days === 1) return { key: 'tomorrow', emoji: '🌅', label: 'Tomorrow', color: '#f59e0b' };
  if (days <= 3) return { key: 'few_days', emoji: '🔄', label: `${days} days`, color: '#3b82f6' };
  if (days <= 7) return { key: 'week', emoji: '📅', label: `${days} days`, color: '#8b5cf6' };
  if (days <= 30) return { key: 'month', emoji: '🚀', label: `${days} days`, color: '#10b981' };
  return { key: 'mastered', emoji: '🏆', label: `${Math.round(days / 30)}+ months`, color: '#fbbf24' };
}

/**
 * Chronologically merges local and cloud reviews to prevent split-brain review losses,
 * and reconstructs the correct final FSRS parameters.
 */
export function mergeDecksAndCards(localDecks, localCards, cloudDecks, cloudCards, targetRetention = 90, localDeviceMode = 'mobile', cloudDeviceMode = 'mobile') {
  // 1. Merge Decks
  const mergedDecks = [...localDecks];
  const localDeckIds = new Set(localDecks.map(d => d.id));
  cloudDecks.forEach(cloudDeck => {
    if (!localDeckIds.has(cloudDeck.id)) {
      mergedDecks.push(cloudDeck);
    } else {
      const localIdx = mergedDecks.findIndex(d => d.id === cloudDeck.id);
      const localDeck = mergedDecks[localIdx];
      // A deck edited (renamed etc.) more recently on the other device wins
      if ((cloudDeck.updatedAt || 0) > (localDeck.updatedAt || 0)) {
        mergedDecks[localIdx] = { ...cloudDeck, mindMap: cloudDeck.mindMap || localDeck.mindMap };
      } else if (cloudDeck.mindMap && !localDeck.mindMap) {
        // Merge mindMap if cloud has it and local doesn't
        mergedDecks[localIdx] = { ...localDeck, mindMap: cloudDeck.mindMap };
      }
    }
  });

  // 2. Merge Cards
  const localCardsMap = new Map(localCards.map(c => [c.id, c]));
  const cloudCardsMap = new Map(cloudCards.map(c => [c.id, c]));

  const mergedCards = [];

  // Add and merge local cards
  localCards.forEach(localCard => {
    const cloudCard = cloudCardsMap.get(localCard.id);
    if (!cloudCard) {
      mergedCards.push(localCard);
    } else {
      // Merge local and cloud histories (removing duplicate timestamp reviews)
      const mergedHistory = [];
      const seenDates = new Set();
      const allLogs = [...(localCard.history || []), ...(cloudCard.history || [])];
      
      // Chronological sort
      allLogs.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      allLogs.forEach(log => {
        if (!seenDates.has(log.date)) {
          seenDates.add(log.date);
          mergedHistory.push(log);
        }
      });

      if (mergedHistory.length === 0) {
        // Neither side has reviews: keep whichever was edited last (content only)
        const newest = (cloudCard.updatedAt || 0) > (localCard.updatedAt || 0) ? cloudCard : localCard;
        mergedCards.push(newest);
      } else {
        // If one side already holds every review the other has, its live-computed
        // state is authoritative. Only replay history when both sides diverged —
        // replaying needlessly would discard per-review settings (e.g. again steps).
        const localDates = new Set((localCard.history || []).map(h => h.date));
        const cloudDates = new Set((cloudCard.history || []).map(h => h.date));
        const localHasAll = mergedHistory.every(h => localDates.has(h.date));
        const cloudHasAll = mergedHistory.every(h => cloudDates.has(h.date));

        let currentState = null;
        if (localHasAll && localCard.state) {
          currentState = localCard.state;
        } else if (cloudHasAll && cloudCard.state) {
          currentState = cloudCard.state;
        } else {
          // Step through chronological history to reconstruct the correct final FSRS parameters
          let tempCard = { ...localCard, state: null };
          mergedHistory.forEach(log => {
            const nextState = calculateNextState(tempCard, log.rating, targetRetention, log.date);
            currentState = nextState;
            tempCard.state = nextState;
          });
        }

        // Decide which card is the base: explicit edit time first, then device
        // priority, then last review timestamp
        let baseCard;
        const localEdited = localCard.updatedAt || 0;
        const cloudEdited = cloudCard.updatedAt || 0;
        if (localEdited !== cloudEdited) {
          baseCard = cloudEdited > localEdited ? cloudCard : localCard;
        } else if (localDeviceMode === 'mobile' && cloudDeviceMode === 'mac') {
          baseCard = localCard;
        } else if (cloudDeviceMode === 'mobile' && localDeviceMode === 'mac') {
          baseCard = cloudCard;
        } else {
          const lastReviewOf = (c) => {
            const d = c.state?.lastReviewDate || c.state?.lastReview;
            return d ? new Date(d).getTime() : 0;
          };
          baseCard = lastReviewOf(cloudCard) > lastReviewOf(localCard) ? cloudCard : localCard;
        }

        // Merge simulation lists without duplicating identical HTML structures
        const localSims = localCard.simulationHtmlList || [];
        const cloudSims = cloudCard.simulationHtmlList || [];
        const mergedSims = [...localSims];
        cloudSims.forEach(cs => {
          if (cs && cs.html && !mergedSims.some(ls => ls && ls.html === cs.html)) {
            mergedSims.push(cs);
          }
        });

        // Merge question SVGs
        const localQS = localCard.questionSvgs || [];
        const cloudQS = cloudCard.questionSvgs || [];
        const mergedQS = [...localQS];
        cloudQS.forEach(cs => {
          if (cs && cs.svg && !mergedQS.some(ls => ls && ls.svg === cs.svg)) {
            mergedQS.push(cs);
          }
        });

        // Merge answer SVGs
        const localAS = localCard.answerSvgs || [];
        const cloudAS = cloudCard.answerSvgs || [];
        const mergedAS = [...localAS];
        cloudAS.forEach(cs => {
          if (cs && cs.svg && !mergedAS.some(ls => ls && ls.svg === cs.svg)) {
            mergedAS.push(cs);
          }
        });

        // Only add media fields that one side actually has, so merging two
        // identical cards yields an identical card (no spurious "changes")
        const mergedCard = { ...baseCard, state: currentState, history: mergedHistory };
        const simHtml = baseCard.simulationHtml || cloudCard.simulationHtml || localCard.simulationHtml;
        if (simHtml) mergedCard.simulationHtml = simHtml;
        if (localCard.simulationHtmlList || cloudCard.simulationHtmlList) mergedCard.simulationHtmlList = mergedSims;
        if (localCard.questionSvgs || cloudCard.questionSvgs) mergedCard.questionSvgs = mergedQS;
        if (localCard.answerSvgs || cloudCard.answerSvgs) mergedCard.answerSvgs = mergedAS;
        mergedCards.push(mergedCard);
      }
    }
  });

  // Add cloud cards that aren't in local storage
  cloudCards.forEach(cloudCard => {
    if (!localCardsMap.has(cloudCard.id)) {
      mergedCards.push(cloudCard);
    }
  });

  return { decks: mergedDecks, cards: mergedCards };
}


/** Pseudo deck id for a study session spanning every deck. */
export const ALL_DECKS = '__all__';

/** End of the current local day; study sessions include anything due by then. */
export function endOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** True when a reviewed card is due by the end of today (matches what Study picks up). */
export function isDueToday(card, now = new Date()) {
  return !!card.state?.dueDate && new Date(card.state.dueDate) <= endOfToday(now);
}

/**
 * Summary for the dashboard "Today" panel: what a "Study all due" session
 * would contain, a time estimate, and when the next review falls otherwise.
 */
export function getTodaySummary(cards, now = new Date()) {
  const active = cards.filter(c => !c.paused && !c.suspended);
  const due = active.filter(c => isDueToday(c, now));
  const fresh = active.filter(c => !c.state?.dueDate);
  const session = [...due, ...fresh];

  // Past answer time per card (ignoring >2 min outliers), else 20s; +8s for grading
  const estSeconds = session.reduce((sum, c) => {
    const times = (c.history || []).map(h => h.timeSpent).filter(t => t > 0 && t <= 120);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 20;
    return sum + avg + 8;
  }, 0);

  const upcoming = active
    .filter(c => c.state?.dueDate && !isDueToday(c, now))
    .map(c => new Date(c.state.dueDate).getTime());
  const nextDueAt = upcoming.length ? Math.min(...upcoming) : null;

  return {
    dueCount: due.length,
    newCount: fresh.length,
    sessionCount: session.length,
    deckCount: new Set(session.map(c => c.deckId)).size,
    estMinutes: Math.max(1, Math.round(estSeconds / 60)),
    nextDueAt
  };
}

/** "tomorrow", "in 3 days", "on 12 Oct" for a future timestamp. */
export function describeNextDue(ts, now = new Date()) {
  if (!ts) return '';
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / 86400000);
  if (days <= 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  return `on ${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}
