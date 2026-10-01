/**
 * Transport-agnostic sync helpers shared by Nearby (peer-to-peer), sync-file
 * and GitHub Gist sync. A "sync payload" is a plain JSON snapshot of one
 * device; merging two payloads is order-independent so both devices converge.
 */
import { mergeDecksAndCards } from './srs';

export const SYNC_FORMAT = 'simanki-sync';
export const SYNC_VERSION = 1;

const TOMBSTONE_KEY = 'simanki_tombstones';
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

// ─── Tombstones ──────────────────────────────────────────────────────────────
// Deletions are recorded as { id: deletedAtMs } so a merge with a device that
// still has the item doesn't bring it back.

export function emptyTombstones() {
  return { decks: {}, cards: {}, files: {} };
}

function normalizeTombstones(ts) {
  const out = emptyTombstones();
  if (!ts || typeof ts !== 'object') return out;
  for (const kind of Object.keys(out)) {
    if (ts[kind] && typeof ts[kind] === 'object') out[kind] = { ...ts[kind] };
  }
  return out;
}

export function loadTombstones() {
  try {
    return normalizeTombstones(JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || 'null'));
  } catch {
    return emptyTombstones();
  }
}

export function saveTombstones(ts) {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(ts));
  } catch (e) {
    console.warn('[Sync] Failed to save tombstones:', e);
  }
}

export function addTombstones(ts, kind, ids, at = Date.now()) {
  const next = normalizeTombstones(ts);
  ids.forEach(id => { next[kind][id] = at; });
  return next;
}

export function removeTombstones(ts, kind, ids) {
  const next = normalizeTombstones(ts);
  ids.forEach(id => { delete next[kind][id]; });
  return next;
}

export function mergeTombstones(a, b, now = Date.now()) {
  const left = normalizeTombstones(a);
  const right = normalizeTombstones(b);
  const out = emptyTombstones();
  for (const kind of Object.keys(out)) {
    for (const src of [left[kind], right[kind]]) {
      for (const [id, at] of Object.entries(src)) {
        if (now - at > TOMBSTONE_TTL_MS) continue;
        out[kind][id] = Math.max(out[kind][id] || 0, at);
      }
    }
  }
  return out;
}

export function applyTombstones({ decks, cards, files }, ts) {
  const t = normalizeTombstones(ts);
  const deadDecks = t.decks;
  return {
    decks: decks.filter(d => !deadDecks[d.id]),
    // Cards of a deleted deck go with it
    cards: cards.filter(c => !t.cards[c.id] && !deadDecks[c.deckId]),
    files: files
      .filter(f => !t.files[f.id])
      .map(f => ({ ...f, deckIds: (f.deckIds || []).filter(id => !deadDecks[id]) }))
  };
}

// ─── Folders ("files") ──────────────────────────────────────────────────────

export function mergeFiles(localFiles = [], remoteFiles = []) {
  const fileMap = new Map();
  localFiles.forEach(f => fileMap.set(f.id, { ...f }));
  remoteFiles.forEach(f => {
    if (fileMap.has(f.id)) {
      const local = fileMap.get(f.id);
      fileMap.set(f.id, { ...local, ...f, knowledgeGraph: f.knowledgeGraph || local.knowledgeGraph });
    } else {
      fileMap.set(f.id, { ...f });
    }
  });
  return Array.from(fileMap.values());
}

// ─── Payloads ───────────────────────────────────────────────────────────────

export function isSyncPayload(data) {
  return !!data && Array.isArray(data.decks) && Array.isArray(data.cards);
}

export function buildSyncPayload({ decks, cards, files, settings, tombstones, deviceName, includeApiKey = false }) {
  const payload = {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    deviceName: deviceName || 'Unknown device',
    deviceMode: settings?.deviceMode || 'mobile',
    exportedAt: Date.now(),
    decks,
    cards,
    files: files || [],
    tombstones: tombstones || emptyTombstones(),
    progress: {
      xp: settings?.xp || 0,
      streak: settings?.streak || 0,
      lastStudyDate: settings?.lastStudyDate || ''
    }
  };
  if (includeApiKey && settings?.apiKey) {
    payload.apiKey = settings.apiKey;
    payload.model = settings.model;
  }
  return payload;
}

function historyCount(cards) {
  return cards.reduce((n, c) => n + (Array.isArray(c.history) ? c.history.length : 0), 0);
}

/**
 * Merge a remote payload into local state. Pure: returns the merged state plus
 * a summary of what changed locally. Works with old {decks, cards} backups too.
 */
export function mergeSyncData(local, remote, { targetRetention = 90 } = {}) {
  const localMode = local.settings?.deviceMode || 'mobile';
  const remoteMode = remote.deviceMode || remote.settings?.deviceMode || 'mobile';

  const { decks: mergedDecks, cards: mergedCards } = mergeDecksAndCards(
    local.decks,
    local.cards,
    remote.decks,
    remote.cards,
    targetRetention,
    localMode,
    remoteMode
  );
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const merged = applyTombstones(
    { decks: mergedDecks, cards: mergedCards, files: mergeFiles(local.files, remote.files || []) },
    tombstones
  );

  const remoteProgress = remote.progress || remote.settings || {};
  const localSettings = local.settings || {};
  const progress = {
    xp: Math.max(localSettings.xp || 0, remoteProgress.xp || 0),
    streak: Math.max(localSettings.streak || 0, remoteProgress.streak || 0),
    lastStudyDate: [localSettings.lastStudyDate || '', remoteProgress.lastStudyDate || ''].sort().pop()
  };

  // Only adopt the other device's AI key when this device has none
  const adoptApiKey = !localSettings.apiKey && remote.apiKey ? remote.apiKey : null;

  const localDeckIds = new Set(local.decks.map(d => d.id));
  const localCardIds = new Set(local.cards.map(c => c.id));
  const mergedCardIds = new Set(merged.cards.map(c => c.id));
  const mergedDeckIds = new Set(merged.decks.map(d => d.id));
  const stats = {
    newDecks: merged.decks.filter(d => !localDeckIds.has(d.id)).length,
    newCards: merged.cards.filter(c => !localCardIds.has(c.id)).length,
    removedDecks: local.decks.filter(d => !mergedDeckIds.has(d.id)).length,
    removedCards: local.cards.filter(c => !mergedCardIds.has(c.id)).length,
    newReviews: Math.max(0, historyCount(merged.cards) - historyCount(local.cards.filter(c => mergedCardIds.has(c.id)))),
    totalDecks: merged.decks.length,
    totalCards: merged.cards.length,
    adoptedApiKey: !!adoptApiKey,
    remoteDevice: remote.deviceName || null
  };
  stats.changed = JSON.stringify(merged.decks) !== JSON.stringify(local.decks)
    || JSON.stringify(merged.cards) !== JSON.stringify(local.cards)
    || JSON.stringify(merged.files) !== JSON.stringify(local.files || [])
    || stats.adoptedApiKey;

  return { ...merged, tombstones, progress, adoptApiKey, adoptModel: adoptApiKey ? remote.model : null, stats };
}

export function describeSyncStats(stats) {
  if (!stats) return '';
  const parts = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (stats.newDecks) parts.push(`${plural(stats.newDecks, 'new deck')}`);
  if (stats.newCards) parts.push(`${plural(stats.newCards, 'new card')}`);
  if (stats.newReviews) parts.push(`${plural(stats.newReviews, 'review')} merged`);
  if (stats.removedCards || stats.removedDecks) {
    parts.push(`${plural(stats.removedCards + stats.removedDecks, 'deleted item')} removed`);
  }
  if (stats.adoptedApiKey) parts.push('Gemini API key added');
  return parts.length ? parts.join(' · ') : 'Already up to date';
}
