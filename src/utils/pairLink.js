/**
 * Pairing-code helpers for Nearby Sync. Kept free of the PeerJS import so the
 * main bundle can read pairing links without loading WebRTC code.
 */

export function generatePairCode() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, '0');
}

export function normalizePairCode(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 6);
}

export function formatPairCode(code) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function buildPairLink(code, signalServer) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({ pair: code });
  if (signalServer) params.set('sig', signalServer);
  return `${base}#${params.toString()}`;
}

/** Read `#pair=123456[&sig=...]` from the current URL (no side effects). */
export function readPairLink() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.includes('pair=')) return null;
  const params = new URLSearchParams(hash);
  const code = normalizePairCode(params.get('pair'));
  if (code.length !== 6) return null;
  return { code, signalServer: params.get('sig') || '' };
}

/** Remove the pairing fragment so a reload doesn't reopen the join screen. */
export function clearPairLink() {
  if (window.location.hash.includes('pair=')) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
