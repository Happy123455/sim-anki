/**
 * Gamified Hearts/Lives Replenishment System
 * Handles automatic, time-based recovery of hearts (1 heart every 10 minutes).
 */

const RECOVER_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Calculates current replenished hearts and the millisecond duration until the next heart.
 * 
 * @param {Object} settings - Global settings object.
 * @returns {Object} { hearts: number, nextHeartInMs: number, lastHeartReplenishedTime: number, wasUpdated: boolean }
 */
export function getReplenishedHearts(settings) {
  if (settings.heartsEnabled === false) {
    const max = settings.maxHearts || 5;
    return { hearts: max, nextHeartInMs: 0, lastHeartReplenishedTime: Date.now(), wasUpdated: false };
  }

  const maxHearts = settings.maxHearts || 5;
  const currentHearts = settings.hearts !== undefined ? settings.hearts : maxHearts;
  const lastTime = settings.lastHeartReplenishedTime || Date.now();

  // If already at full capacity, no recovery timer needed
  if (currentHearts >= maxHearts) {
    return {
      hearts: maxHearts,
      nextHeartInMs: 0,
      lastHeartReplenishedTime: Date.now(),
      wasUpdated: currentHearts > maxHearts // true if we need to clamp it back down
    };
  }

  const now = Date.now();
  const elapsed = now - lastTime;

  if (elapsed >= RECOVER_INTERVAL_MS) {
    const recovered = Math.floor(elapsed / RECOVER_INTERVAL_MS);
    const newHearts = Math.min(maxHearts, currentHearts + recovered);
    const leftoverTime = elapsed % RECOVER_INTERVAL_MS;
    const newLastTime = now - leftoverTime;

    return {
      hearts: newHearts,
      nextHeartInMs: newHearts >= maxHearts ? 0 : RECOVER_INTERVAL_MS - leftoverTime,
      lastHeartReplenishedTime: newHearts >= maxHearts ? now : newLastTime,
      wasUpdated: true
    };
  }

  return {
    hearts: currentHearts,
    nextHeartInMs: RECOVER_INTERVAL_MS - elapsed,
    lastHeartReplenishedTime: lastTime,
    wasUpdated: false
  };
}
