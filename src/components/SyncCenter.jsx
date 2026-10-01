import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ArrowLeft, Wifi, QrCode as QrIcon, Hash, FileUp, FileDown, Cloud, CloudOff,
  RefreshCw, CircleCheck, CircleAlert, ShieldCheck, Smartphone, ChevronRight, KeyRound
} from 'lucide-react';
import QrCode from './QrCode';
import { NearbySession } from '../utils/nearbySync';
import { buildPairLink, formatPairCode, normalizePairCode } from '../utils/pairLink';
import { isSyncPayload, describeSyncStats } from '../utils/syncMerge';

const PHASE_TEXT = {
  starting: 'Getting ready…',
  waiting: 'Waiting for your other device…',
  connecting: 'Looking for the other device…',
  approval: 'Someone wants to sync',
  'awaiting-approval': 'Tap “Allow” on the other device…',
  transferring: 'Syncing…',
  merging: 'Merging…'
};

function timeAgo(ts) {
  if (!ts) return '';
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(ts).toLocaleDateString();
}

function Spinner({ size = 16 }) {
  return <RefreshCw size={size} className="spin" aria-hidden="true" />;
}

export default function SyncCenter({
  onClose,
  initialView = 'home',
  initialCode = '',
  initialSignalServer = '',
  deviceName,
  hasApiKey,
  signalServer,
  getSnapshot,
  onMergeRemote,
  cloud,
  onCloudSyncNow,
  onOpenCloudSettings,
  lastSync
}) {
  const [view, setView] = useState(initialView);
  const [status, setStatus] = useState(null);
  const [joinCode, setJoinCode] = useState(normalizePairCode(initialCode));
  const [includeKey, setIncludeKey] = useState(false);
  const [approval, setApproval] = useState(null);
  const [result, setResult] = useState(null); // { title, stats, peerStats }
  const [fileError, setFileError] = useState(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudResult, setCloudResult] = useState(null);

  const sessionRef = useRef(null);
  const approvalResolveRef = useRef(null);
  const includeKeyRef = useRef(includeKey);
  const fileInputRef = useRef(null);
  const activeSignal = initialSignalServer || signalServer || '';
  // Latest props for the long-lived session callbacks, so App re-renders
  // never restart an in-progress pairing
  const latestRef = useRef({ getSnapshot, onMergeRemote, deviceName, activeSignal });

  useEffect(() => { includeKeyRef.current = includeKey; }, [includeKey]);
  useEffect(() => {
    latestRef.current = { getSnapshot, onMergeRemote, deviceName, activeSignal };
  }, [getSnapshot, onMergeRemote, deviceName, activeSignal]);

  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    if (approvalResolveRef.current) {
      approvalResolveRef.current(false);
      approvalResolveRef.current = null;
    }
    setApproval(null);
  }, []);

  useEffect(() => stopSession, [stopSession]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startSession = useCallback((role, code) => {
    stopSession();
    setResult(null);
    const latest = latestRef.current;
    const session = new NearbySession({
      role,
      code,
      deviceName: latest.deviceName,
      signalServer: latest.activeSignal,
      getLocalPayload: () => latestRef.current.getSnapshot(includeKeyRef.current),
      onRemotePayload: (payload) => latestRef.current.onMergeRemote(payload, { method: 'nearby', device: payload?.deviceName }),
      onApprovalRequest: ({ device }) => new Promise((resolve) => {
        approvalResolveRef.current = resolve;
        setApproval({ device });
      }),
      onStatus: (s) => {
        setStatus({ ...s });
        if (s.phase === 'done') {
          setResult({ title: `Synced with ${s.peerDevice || 'your other device'}`, stats: s.stats, peerStats: s.peerStats });
        }
      }
    });
    sessionRef.current = session;
    session.start();
  }, [stopSession]);

  const openHost = () => {
    setIncludeKey(hasApiKey);
    setView('host');
    startSession('host');
  };

  const openJoin = () => {
    setIncludeKey(false);
    setView('join');
  };

  // A scanned pairing link arrives with the code filled in — but always wait
  // for an explicit "Connect" tap so a link alone can never send your data.

  const answerApproval = (allowed) => {
    approvalResolveRef.current?.(allowed);
    approvalResolveRef.current = null;
    setApproval(null);
  };

  const goHome = () => {
    stopSession();
    setStatus(null);
    setResult(null);
    setFileError(null);
    setView('home');
  };

  const handleSendFile = async () => {
    setFileError(null);
    try {
      const payload = await getSnapshot(false);
      const safeName = (deviceName || 'device').replace(/[^\w-]+/g, '-').toLowerCase();
      const filename = `simanki-sync-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      const json = JSON.stringify(payload);
      const file = new File([json], filename, { type: 'application/json' });
      const preferShare = window.matchMedia?.('(pointer: coarse)').matches;
      if (preferShare && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'SimAnki sync file' });
          return;
        } catch (e) {
          if (e.name === 'AbortError') return;
          // Fall through to a regular download
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setFileError(`Couldn't create the sync file: ${e.message}`);
    }
  };

  const handleMergeFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!isSyncPayload(data)) {
          setFileError("That file isn't a SimAnki sync file or backup.");
          return;
        }
        const stats = await onMergeRemote(data, { method: 'file', device: data.deviceName });
        setResult({ title: data.deviceName ? `Merged data from ${data.deviceName}` : 'Sync file merged', stats });
        setView('result');
      } catch (err) {
        setFileError(`Couldn't read that file: ${err.message}`);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCloudSync = async () => {
    setCloudBusy(true);
    setCloudResult(null);
    const ok = await onCloudSyncNow();
    setCloudBusy(false);
    setCloudResult(ok ? 'ok' : 'error');
  };

  const phase = status?.phase;
  const isActive = phase && !['done', 'error', 'rejected'].includes(phase);
  const progress = status?.progress;
  const progressPct = progress
    ? Math.round(((progress.sent / (progress.total || 1)) + (progress.received / (progress.rtotal || 1))) * 50)
    : 0;

  const titles = {
    home: 'Sync',
    host: 'Show code',
    join: 'Enter code',
    file: 'Sync file',
    result: 'Sync complete'
  };
  const shownView = result && view !== 'home' ? 'result' : view;

  const renderKeyToggle = () => hasApiKey && (
    <label className="toggle-row compact">
      <input type="checkbox" className="switch" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} disabled={isActive && phase !== 'waiting'} />
      <span>
        <strong className="toggle-title"><KeyRound size={14} aria-hidden="true" /> Also send my Gemini API key</strong>
        <small>Handy when setting up a new device. Only used if that device has no key yet.</small>
      </span>
    </label>
  );

  const renderStatus = () => {
    if (!status) return null;
    if (phase === 'error' || phase === 'rejected') {
      return (
        <div className="notice notice-danger" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <div>
            <strong>{phase === 'rejected' ? 'Sync declined' : 'Sync failed'}</strong>
            <p>{status.error}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="sync-status" aria-live="polite">
        <div className="sync-status-line">
          {isActive && <Spinner />}
          <span>{PHASE_TEXT[phase] || ''}</span>
        </div>
        {(phase === 'transferring' || phase === 'merging') && (
          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${phase === 'merging' ? 100 : progressPct}%` }} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet glass-panel animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="sync-center-title">
        <div className="sheet-header">
          {shownView !== 'home' && (
            <button className="icon-btn" onClick={goHome} aria-label="Back to sync options">
              <ArrowLeft size={18} />
            </button>
          )}
          <h2 id="sync-center-title">{titles[shownView]}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {shownView === 'home' && (
          <div className="sheet-body">
            <section className="sync-option sync-option-primary">
              <div className="sync-option-head">
                <span className="icon-tile tile-violet"><Wifi size={20} /></span>
                <div>
                  <h3>Sync with a nearby device <span className="pill">Recommended</span></h3>
                  <p>Phone ↔ laptop in seconds. Data goes directly between your devices, with no account or token needed. Works best on the same Wi-Fi.</p>
                </div>
              </div>
              <div className="sync-option-actions">
                <button className="btn btn-primary" onClick={openHost}>
                  <QrIcon size={18} /> Show code
                </button>
                <button className="btn btn-secondary" onClick={openJoin}>
                  <Hash size={18} /> Enter code
                </button>
              </div>
            </section>

            <section className="sync-option">
              <div className="sync-option-head">
                <span className="icon-tile tile-blue"><FileUp size={20} /></span>
                <div>
                  <h3>Sync with a file</h3>
                  <p>Works offline. Send the file with AirDrop, Nearby Share, email or a USB stick, then merge it on the other device. Merging never overwrites anything.</p>
                </div>
              </div>
              <div className="sync-option-actions">
                <button className="btn btn-secondary" onClick={handleSendFile}>
                  <FileDown size={18} /> Send file
                </button>
                <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <FileUp size={18} /> Merge file
                </button>
                <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleMergeFile} hidden />
              </div>
              {fileError && <p className="field-error" role="alert">{fileError}</p>}
            </section>

            <section className="sync-option sync-option-row">
              <span className={`icon-tile ${cloud.configured ? (cloud.error ? 'tile-red' : 'tile-green') : 'tile-muted'}`}>
                {cloud.configured && cloud.error ? <CloudOff size={20} /> : <Cloud size={20} />}
              </span>
              <div className="sync-option-text">
                <h3>Cloud auto-sync <small>(GitHub Gist)</small></h3>
                <p>
                  {!cloud.configured && 'Optional. Keeps devices in sync automatically in the background.'}
                  {cloud.configured && cloud.error && `Problem: ${cloud.error}`}
                  {cloud.configured && !cloud.error && (cloudResult === 'ok' ? 'Synced just now.' : `On · ${cloud.lastSyncLabel || 'waiting for first sync'}`)}
                  {cloudResult === 'error' && ' Sync failed. Check Settings → Sync.'}
                </p>
              </div>
              {cloud.configured ? (
                <button className="btn btn-secondary btn-sm" onClick={handleCloudSync} disabled={cloudBusy || cloud.isSyncing}>
                  {cloudBusy || cloud.isSyncing ? <Spinner size={14} /> : <RefreshCw size={14} />} Sync now
                </button>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={onOpenCloudSettings}>
                  Set up <ChevronRight size={14} />
                </button>
              )}
            </section>

            <p className="sheet-footnote">
              This device: <strong>{deviceName}</strong>
              {lastSync?.at && <> · Last synced {timeAgo(lastSync.at)}{lastSync.device ? ` with ${lastSync.device}` : ''}</>}
            </p>
          </div>
        )}

        {shownView === 'host' && (
          <div className="sheet-body">
            {approval ? (
              <div className="approval-card" role="alertdialog" aria-labelledby="approval-title">
                <span className="icon-tile tile-violet"><Smartphone size={22} /></span>
                <h3 id="approval-title">“{approval.device}” wants to sync</h3>
                <p>Only allow devices that belong to you. Both devices will end up with the same decks and progress.</p>
                <div className="sync-option-actions">
                  <button className="btn btn-secondary" onClick={() => answerApproval(false)}>Deny</button>
                  <button className="btn btn-primary" onClick={() => answerApproval(true)} autoFocus>
                    <ShieldCheck size={18} /> Allow
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="pair-panel">
                  <div className="pair-code-block">
                    <span className="eyebrow">Your code</span>
                    <div className="pair-code" aria-label={`Pairing code ${status?.code || ''}`}>
                      {status?.code && phase !== 'starting' ? formatPairCode(status.code) : '··· ···'}
                    </div>
                    <ol className="steps">
                      <li>On your other device, open SimAnki and tap <strong>Sync → Enter code</strong>.</li>
                      <li>Or scan the QR code with its camera.</li>
                      <li>Tap <strong>Allow</strong> here when it asks.</li>
                    </ol>
                  </div>
                  {status?.code && phase !== 'starting' && phase !== 'error' && (
                    <div className="pair-qr">
                      <QrCode text={buildPairLink(status.code, activeSignal)} size={168} label="Scan to sync" />
                    </div>
                  )}
                </div>
                {renderStatus()}
                {renderKeyToggle()}
                {(phase === 'error' || phase === 'rejected') && (
                  <button className="btn btn-primary" onClick={() => startSession('host')}>
                    <RefreshCw size={18} /> Get a new code
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {shownView === 'join' && (
          <div className="sheet-body">
            <form
              className="join-form"
              onSubmit={(e) => { e.preventDefault(); startSession('join', joinCode); }}
            >
              <label htmlFor="pair-code-input" className="field-label">Code shown on your other device</label>
              <input
                id="pair-code-input"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123 456"
                value={formatPairCode(joinCode)}
                onChange={(e) => setJoinCode(normalizePairCode(e.target.value))}
                disabled={isActive}
                autoFocus={!initialCode}
              />
              <p className="field-hint">
                On the other device, open <strong>Sync → Show code</strong>.
                {initialCode && ' This code came from a scanned QR code. Check it matches the other screen.'}
              </p>
              {renderKeyToggle()}
              {renderStatus()}
              <button className="btn btn-primary btn-block" type="submit" disabled={joinCode.length !== 6 || isActive}>
                {isActive ? <><Spinner /> Connecting…</> : <><Wifi size={18} /> {phase === 'error' || phase === 'rejected' ? 'Try again' : 'Connect & sync'}</>}
              </button>
            </form>
          </div>
        )}

        {shownView === 'result' && result && (
          <div className="sheet-body result-body">
            <CircleCheck size={56} className="result-icon" aria-hidden="true" />
            <h3>{result.title}</h3>
            <p className="result-summary">{describeSyncStats(result.stats)}</p>
            {result.peerStats && (
              <p className="result-peer">Other device: {describeSyncStats(result.peerStats)}</p>
            )}
            {result.stats && (
              <p className="result-totals">{result.stats.totalDecks} decks · {result.stats.totalCards} cards on this device</p>
            )}
            <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
