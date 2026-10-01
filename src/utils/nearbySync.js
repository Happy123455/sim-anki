/**
 * Nearby Sync: device-to-device sync over WebRTC.
 *
 * One device "hosts" and shows a 6-digit code (and QR); the other joins with
 * that code. A signaling broker (PeerJS cloud by default) is used only to
 * introduce the two browsers — the actual data flows directly between them,
 * over the local network when both are on the same Wi-Fi.
 */
import Peer from 'peerjs';
import { generatePairCode, normalizePairCode, formatPairCode } from './pairLink';

const ID_PREFIX = 'simanki-v1-';
// PeerJS' JSON channel rejects messages ≥16300 bytes. We send ASCII-only JSON
// chunks, and string escaping can at most double a chunk, so 7000 is safe.
const CHUNK_CHARS = 7000;
const CONNECT_TIMEOUT_MS = 20000;
const STALL_TIMEOUT_MS = 30000;

/** Parse an optional self-hosted PeerJS server URL into Peer options. */
export function parseSignalServer(raw) {
  const value = String(raw || '').trim();
  if (!value) return {};
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    const secure = url.protocol === 'https:' || url.protocol === 'wss:';
    return {
      host: url.hostname,
      port: Number(url.port) || (secure ? 443 : 80),
      path: url.pathname || '/',
      secure
    };
  } catch {
    return {};
  }
}

function toAsciiJson(obj) {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function friendlyPeerError(err, role, code) {
  const type = err?.type || '';
  if (type === 'peer-unavailable') {
    return `No device is showing code ${formatPairCode(code)}. Check the code, and keep the Sync screen open on the other device.`;
  }
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
    return "Couldn't reach the pairing service. Check your internet connection, or use “Sync with a file” instead, which works offline.";
  }
  if (type === 'browser-incompatible') {
    return 'This browser does not support direct device connections (WebRTC).';
  }
  if (type === 'webrtc' || type === 'negotiation-failed') {
    return "The devices found each other but couldn't open a direct connection. Putting both on the same Wi-Fi usually fixes this.";
  }
  return err?.message || (role === 'host' ? 'Pairing failed.' : 'Connection failed.');
}

/**
 * Runs one sync exchange. Status updates are delivered through `onStatus`
 * as { phase, code, peerDevice, progress, error, stats, peerStats }.
 *
 * phases: starting → waiting (host) / connecting (join) → approval (host) /
 *         awaiting-approval (join) → transferring → done | error | rejected
 */
export class NearbySession {
  constructor({ role, code, deviceName, signalServer, getLocalPayload, onRemotePayload, onApprovalRequest, onStatus }) {
    this.role = role;
    this.code = role === 'host' ? (code || generatePairCode()) : normalizePairCode(code);
    this.deviceName = deviceName;
    this.peerOptions = { debug: 0, ...parseSignalServer(signalServer) };
    this.getLocalPayload = getLocalPayload;
    this.onRemotePayload = onRemotePayload;
    this.onApprovalRequest = onApprovalRequest;
    this.onStatusCb = onStatus;

    this.peer = null;
    this.conn = null;
    this.stopped = false;
    this.timers = new Set();
    this.status = { phase: 'starting', code: this.code };
    this.incoming = null;
    this.sentPayload = false;
    this.mergedRemote = false;
    this.gotAck = false;
    this.lastActivity = Date.now();
    this.hostRetries = 0;
  }

  setStatus(patch) {
    if (this.stopped && patch.phase !== 'done') return;
    this.status = { ...this.status, ...patch };
    this.onStatusCb?.(this.status);
  }

  fail(message) {
    if (this.stopped) return;
    this.setStatus({ phase: 'error', error: message });
    this.teardown();
  }

  later(fn, ms) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  start() {
    if (this.role === 'join' && this.code.length !== 6) {
      this.fail('Enter the 6-digit code shown on the other device.');
      return;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      this.fail('This browser does not support direct device connections (WebRTC).');
      return;
    }
    this.role === 'host' ? this.startHost() : this.startJoin();
  }

  startHost() {
    this.setStatus({ phase: 'starting', code: this.code });
    const peer = new Peer(ID_PREFIX + this.code, this.peerOptions);
    this.peer = peer;

    peer.on('open', () => this.setStatus({ phase: 'waiting' }));
    peer.on('connection', (conn) => this.handleIncoming(conn));
    peer.on('error', (err) => {
      if (err?.type === 'unavailable-id' && this.hostRetries < 3) {
        // Someone else holds this code right now — pick another one
        this.hostRetries += 1;
        peer.destroy();
        this.code = generatePairCode();
        this.startHost();
        return;
      }
      // Errors from a single bad connection shouldn't kill a waiting host
      if (this.conn && this.status.phase !== 'waiting') {
        this.fail(friendlyPeerError(err, 'host', this.code));
      } else if (!['peer-unavailable', 'webrtc', 'negotiation-failed'].includes(err?.type)) {
        this.fail(friendlyPeerError(err, 'host', this.code));
      }
    });
    peer.on('disconnected', () => {
      // Lost the broker; reconnect while still waiting for a device
      if (!this.stopped && this.status.phase === 'waiting') peer.reconnect();
    });
  }

  handleIncoming(conn) {
    if (this.conn) {
      conn.on('open', () => {
        conn.send({ t: 'reject', reason: 'busy' });
        this.later(() => conn.close(), 300);
      });
      return;
    }
    this.conn = conn;
    this.bindConnection(conn);
  }

  startJoin() {
    this.setStatus({ phase: 'starting' });
    const peer = new Peer(this.peerOptions);
    this.peer = peer;

    peer.on('open', () => {
      this.setStatus({ phase: 'connecting' });
      const conn = peer.connect(ID_PREFIX + this.code, {
        reliable: true,
        serialization: 'json',
        metadata: { device: this.deviceName }
      });
      this.conn = conn;
      this.bindConnection(conn);
      this.later(() => {
        if (!this.stopped && ['starting', 'connecting'].includes(this.status.phase)) {
          this.fail("Couldn't connect to the other device. Make sure both devices are online and the code is still on screen.");
        }
      }, CONNECT_TIMEOUT_MS);
    });
    peer.on('error', (err) => this.fail(friendlyPeerError(err, 'join', this.code)));
  }

  bindConnection(conn) {
    conn.on('open', () => {
      this.lastActivity = Date.now();
      if (this.role === 'join') {
        this.setStatus({ phase: 'awaiting-approval' });
        conn.send({ t: 'hello', app: 'simanki', v: 1, device: this.deviceName });
      }
    });
    conn.on('data', (msg) => {
      this.lastActivity = Date.now();
      this.handleMessage(msg).catch(err => {
        console.error('[NearbySync] message handling failed:', err);
        this.fail(err.message || 'Sync failed.');
      });
    });
    conn.on('close', () => {
      if (!this.stopped && this.status.phase !== 'done') {
        this.fail('The other device disconnected before sync finished.');
      }
    });
    conn.on('error', (err) => this.fail(friendlyPeerError(err, this.role, this.code)));
  }

  async handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hello': {
        if (this.role !== 'host' || msg.app !== 'simanki') return;
        const device = String(msg.device || 'Unknown device').slice(0, 60);
        this.setStatus({ phase: 'approval', peerDevice: device });
        const allowed = await this.onApprovalRequest?.({ device });
        if (this.stopped) return;
        if (!allowed) {
          this.conn.send({ t: 'reject', reason: 'denied' });
          this.later(() => this.conn?.close(), 300);
          this.setStatus({ phase: 'rejected', error: `You declined ${device}.` });
          this.teardown();
          return;
        }
        this.conn.send({ t: 'welcome', device: this.deviceName });
        await this.beginTransfer();
        break;
      }
      case 'welcome': {
        if (this.role !== 'join') return;
        this.setStatus({ peerDevice: String(msg.device || 'Other device').slice(0, 60) });
        await this.beginTransfer();
        break;
      }
      case 'reject': {
        const reason = msg.reason === 'busy'
          ? 'The other device is already syncing with someone else. Try again in a moment.'
          : 'The other device declined the sync request.';
        this.setStatus({ phase: 'rejected', error: reason });
        this.teardown();
        break;
      }
      case 'begin': {
        this.incoming = { total: Number(msg.n) || 0, parts: [], received: 0 };
        this.updateProgress();
        break;
      }
      case 'c': {
        if (!this.incoming) return;
        this.incoming.parts[msg.i] = msg.d;
        this.incoming.received += 1;
        this.updateProgress();
        if (this.incoming.received === this.incoming.total) {
          const text = this.incoming.parts.join('');
          this.incoming = { ...this.incoming, parts: null, done: true };
          const payload = JSON.parse(text);
          this.setStatus({ phase: 'merging' });
          const stats = await this.onRemotePayload(payload);
          this.mergedRemote = true;
          this.setStatus({ stats });
          this.conn.send({ t: 'ack', stats });
          this.maybeFinish();
        }
        break;
      }
      case 'ack': {
        this.gotAck = true;
        this.setStatus({ peerStats: msg.stats || null });
        this.maybeFinish();
        break;
      }
      default:
        break;
    }
  }

  async beginTransfer() {
    this.setStatus({ phase: 'transferring', progress: { sent: 0, total: 1, received: 0, rtotal: 1 } });
    this.watchForStall();
    const payload = await this.getLocalPayload();
    if (this.stopped) return;
    const text = toAsciiJson(payload);
    const n = Math.max(1, Math.ceil(text.length / CHUNK_CHARS));
    this.conn.send({ t: 'begin', n, len: text.length });
    for (let i = 0; i < n; i++) {
      if (this.stopped) return;
      this.conn.send({ t: 'c', i, d: text.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) });
      if (i % 16 === 15) {
        this.status.progress = { ...this.status.progress, sent: i + 1, total: n };
        this.updateProgress();
        // Yield so the UI can paint and the channel can drain
        await new Promise(r => setTimeout(r, 0));
        this.lastActivity = Date.now();
      }
    }
    this.status.progress = { ...this.status.progress, sent: n, total: n };
    this.sentPayload = true;
    this.updateProgress();
  }

  updateProgress() {
    const progress = { ...(this.status.progress || {}) };
    if (this.incoming) {
      progress.received = this.incoming.received;
      progress.rtotal = this.incoming.total || 1;
    }
    this.setStatus({ progress });
  }

  watchForStall() {
    const check = () => {
      if (this.stopped || ['done', 'error', 'rejected'].includes(this.status.phase)) return;
      if (Date.now() - this.lastActivity > STALL_TIMEOUT_MS) {
        this.fail('The transfer stalled. Keep both screens on and try again.');
        return;
      }
      this.later(check, 2000);
    };
    this.later(check, 2000);
  }

  maybeFinish() {
    if (this.mergedRemote && this.gotAck) {
      this.setStatus({ phase: 'done' });
      // Give the final ack time to flush before closing
      this.later(() => this.teardown(), 800);
      this.stopped = true;
    }
  }

  teardown() {
    this.stopped = true;
    this.timers.forEach(id => clearTimeout(id));
    this.timers.clear();
    try { this.conn?.close(); } catch { /* already closed */ }
    try { this.peer?.destroy(); } catch { /* already destroyed */ }
  }

  stop() {
    this.teardown();
  }
}
