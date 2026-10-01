import { useState, useEffect } from 'react';
import {
  Eye, EyeOff, ShieldAlert, ArrowLeft, RefreshCw, Download, Upload, Layers,
  Bot, Brain, Cloud, Database, Wifi, ChevronRight, Check
} from 'lucide-react';
import { checkApiKey } from '../utils/gemini';
import { sanitizeToken } from '../utils/githubSync';

const TABS = [
  { id: 'ai', label: 'AI & Voice', icon: Bot },
  { id: 'study', label: 'Study', icon: Brain },
  { id: 'sync', label: 'Sync', icon: Cloud },
  { id: 'data', label: 'Data', icon: Database }
];
const TAB_KEY = 'simanki_settings_tab';

function readInitialTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some(t => t.id === saved) ? saved : 'ai';
  } catch {
    return 'ai';
  }
}

function loadLocalBackups() {
  const loaded = [];
  for (let i = 1; i <= 3; i++) {
    try {
      const data = localStorage.getItem(`simanki_local_backup_${i}`);
      if (data) loaded.push({ index: i, ...JSON.parse(data) });
    } catch {
      // Skip unreadable slot
    }
  }
  return loaded.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// Every field the form edits, with its default
const toForm = (s) => ({
  apiKey: s.apiKey || '',
  model: s.model || 'gemini-3.5-flash',
  targetRetention: s.targetRetention || 90,
  customInstructions: s.customInstructions || '',
  voiceURI: s.voiceURI || '',
  syncCode: s.syncCode || '',
  githubPAT: s.githubPAT || '',
  deviceName: s.deviceName || '',
  relaxedMode: !!s.relaxedMode,
  stressMode: !!s.stressMode,
  unlockAllFeatures: s.unlockAllFeatures ?? true,
  maxHardCardsPer5Min: s.maxHardCardsPer5Min ?? 2,
  againStepMin: s.againStepMin || 10,
  deviceMode: s.deviceMode || 'mobile',
  heartsEnabled: s.heartsEnabled !== false,
  maxHearts: s.maxHearts || 5,
  intradayStepMin: s.intradayStepMin || 1,
  syncSignalServer: s.syncSignalServer || ''
});

function Section({ title, description, icon: Icon, tone, children }) {
  return (
    <section className={`settings-section${tone ? ` tone-${tone}` : ''}`}>
      {title && (
        <header className="section-head">
          <h3>{Icon && <Icon size={18} aria-hidden="true" />}{title}</h3>
          {description && <p>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function Field({ label, htmlFor, hint, aside, children }) {
  return (
    <div className="field">
      {(label || aside) && (
        <div className="field-label-row">
          {label && <label className="field-label" htmlFor={htmlFor}>{label}</label>}
          {aside && <span className="field-aside">{aside}</span>}
        </div>
      )}
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function Toggle({ id, checked, onChange, label, description }) {
  return (
    <label className="toggle-row" htmlFor={id}>
      <input id={id} type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

function SecretInput({ id, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-with-action">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" className="input-action" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide' : 'Show'}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function BackupRow({ title, backup, onRestore }) {
  return (
    <div className="backup-row">
      <div>
        <strong>{title}{backup.deviceName ? ` · ${backup.deviceName}` : ''}</strong>
        <span>
          {new Date(backup.timestamp).toLocaleString()} · {backup.decks?.length || 0} decks · {backup.cards?.length || 0} cards
        </span>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={onRestore}>Restore</button>
    </div>
  );
}

export default function Settings({ settings, onSaveSettings, onBack, onExportData, onImportData, onClearData, onImportAnkiCards, onPushSync, onPullSync, isSyncing, onRestoreBackup, cloudBackups, onOpenSync, appVersion, defaultDeviceName }) {
  const [tab, setTab] = useState(readInitialTab);
  // Only the fields the user touched; everything else tracks live settings
  const [edits, setEdits] = useState({});
  const [voices, setVoices] = useState(() => window.speechSynthesis?.getVoices() || []);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'success' | 'error' | null
  const [justSaved, setJustSaved] = useState(false);
  const [backups] = useState(loadLocalBackups);

  const base = toForm(settings);
  const form = { ...base, ...edits };
  const isDirty = Object.keys(edits).some(k => edits[k] !== base[k]);
  const set = (key) => (value) => setEdits(e => ({ ...e, [key]: value }));

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener?.('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', updateVoices);
  }, []);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 1800);
    return () => clearTimeout(t);
  }, [justSaved]);

  const changeTab = (id) => {
    setTab(id);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* storage unavailable */ }
  };

  const save = () => {
    onSaveSettings(form);
    setEdits({});
    setJustSaved(true);
  };

  const discard = () => setEdits({});

  // Leaving the page keeps your changes rather than silently dropping them
  const handleBack = () => {
    if (isDirty) onSaveSettings(form);
    onBack();
  };

  const handleTestKey = async () => {
    if (!form.apiKey) return;
    setIsTesting(true);
    setTestResult(null);
    const isValid = await checkApiKey(form.apiKey, form.model);
    setIsTesting(false);
    setTestResult(isValid ? 'success' : 'error');
  };

  const handlePush = async () => {
    if (!form.githubPAT) {
      alert("GitHub Personal Access Token (PAT) is required to push/create a Gist sync.");
      return;
    }
    // Save first so App has the latest PAT + Gist ID
    onSaveSettings(form);
    const code = await onPushSync(form.githubPAT, form.syncCode);
    if (code) {
      onSaveSettings({ ...form, syncCode: code });
      setEdits({});
    }
  };

  const handlePull = async () => {
    if (!form.syncCode) {
      alert("Enter a Gist ID (Sync Code) first.");
      return;
    }
    onSaveSettings(form);
    // Pulling merges cloud data with this device's — nothing is overwritten
    await onPullSync(form.syncCode, form.githubPAT);
    setEdits({});
  };

  const handleFileUpload = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileReader = new FileReader();
    fileReader.readAsText(e.target.files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.decks && data.cards) {
          if (!confirm(`Replace everything on this device with this backup (${data.decks.length} decks, ${data.cards.length} cards)?\n\nTo combine it with what you have instead, use Sync → Merge a sync file.`)) return;
          onImportData(data);
          alert("Backup restored.");
        } else {
          alert("Invalid import format. JSON must contain decks and cards.");
        }
      } catch {
        alert("Failed to parse JSON file.");
      }
    };
    e.target.value = '';
  };

  const handleAnkiTxtUpload = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileReader = new FileReader();
    fileReader.readAsText(e.target.files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const text = event.target.result;
        const importedCards = parseAnkiTxt(text);
        if (importedCards && importedCards.length > 0) {
          onImportAnkiCards(importedCards);
          alert(`Successfully imported ${importedCards.length} flashcards from Anki file!`);
        } else {
          alert("No valid cards found in the Anki file. Make sure it is tab-separated.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to parse Anki file. " + err.message);
      }
    };
    e.target.value = '';
  };

  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const otherVoices = voices.filter(v => !v.lang.startsWith('en'));

  return (
    <>
    <div className="settings-page animate-fade-in">
      <header className="settings-header">
        <button className="icon-btn" onClick={handleBack} aria-label="Back to dashboard">
          <ArrowLeft size={18} />
        </button>
        <h2>Settings</h2>
      </header>

      <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`settings-tab${tab === id ? ' active' : ''}`}
            onClick={() => changeTab(id)}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>

      <div className="settings-body" role="tabpanel">
        {tab === 'ai' && (
          <>
            <Section title="Gemini AI" description="Powers grading, explanations and simulations.">
              <Field
                label="API key"
                htmlFor="apiKey"
                hint={<>Free from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a>. Already set up on another device? Use <strong>Sync → Show code</strong> there to copy it over.</>}
              >
                <SecretInput
                  id="apiKey"
                  placeholder="AIzaSy..."
                  value={form.apiKey}
                  onChange={(v) => { set('apiKey')(v); setTestResult(null); }}
                />
                <div className="field-row">
                  <button className="btn btn-secondary btn-sm" onClick={handleTestKey} disabled={!form.apiKey || isTesting}>
                    {isTesting ? <><RefreshCw size={14} className="spin" /> Testing…</> : 'Test connection'}
                  </button>
                  {testResult === 'success' && <span className="text-success">✓ Connected</span>}
                  {testResult === 'error' && <span className="text-danger">✗ Invalid key or model</span>}
                </div>
              </Field>

              <Field label="Model" htmlFor="model">
                <select id="model" value={form.model} onChange={(e) => set('model')(e.target.value)}>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (default, fastest)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (cheapest)</option>
                </select>
              </Field>

              <Field
                label="Tutor instructions"
                htmlFor="customInstructions"
                hint="How the AI should grade and explain: tone, vocabulary, analogies."
              >
                <textarea
                  id="customInstructions"
                  placeholder="e.g. Friendly tone. Explain structural concepts with concrete beam analogies."
                  value={form.customInstructions}
                  onChange={(e) => set('customInstructions')(e.target.value)}
                  rows={3}
                />
              </Field>
            </Section>

            <Section title="Voice" description="Used when explanations are read aloud.">
              <Field label="Tutor voice" htmlFor="voiceURI" hint="Neural or natural voices sound best. Availability depends on your device.">
                <select id="voiceURI" value={form.voiceURI} onChange={(e) => set('voiceURI')(e.target.value)}>
                  <option value="">Automatic (best available)</option>
                  {englishVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}){v.localService ? '' : ' · online'}
                    </option>
                  ))}
                  {otherVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </Field>
            </Section>
          </>
        )}

        {tab === 'study' && (
          <>
            <Section title="Scheduling" description="How often cards come back.">
              <Field
                label="Target retention"
                htmlFor="targetRetention"
                aside={<span className="value-badge">{form.targetRetention}%</span>}
                hint={<>The share of cards you aim to remember. <strong>85–90%</strong> is the sweet spot; higher means more frequent reviews.</>}
              >
                <input
                  id="targetRetention"
                  type="range"
                  min="75"
                  max="95"
                  step="1"
                  value={form.targetRetention}
                  onChange={(e) => set('targetRetention')(Number(e.target.value))}
                />
              </Field>

              <div className="field-grid">
                <Field
                  label="Relearn step"
                  htmlFor="againStepMin"
                  hint="When a failed card is due again. Anki uses 10 min; 1–5 min is snappier."
                >
                  <div className="input-suffix">
                    <input
                      id="againStepMin"
                      type="number"
                      min="1"
                      max="60"
                      value={form.againStepMin}
                      onChange={(e) => set('againStepMin')(Math.max(1, Number(e.target.value)))}
                    />
                    <span>min</span>
                  </div>
                </Field>

                <Field
                  label="In-session repeat"
                  htmlFor="intradayStepMin"
                  aside={<span className="value-badge">{form.intradayStepMin}m</span>}
                  hint="Failed cards reappear this many minutes later in the same session."
                >
                  <input
                    id="intradayStepMin"
                    type="range"
                    min="1"
                    max="10"
                    value={form.intradayStepMin}
                    onChange={(e) => set('intradayStepMin')(Number(e.target.value))}
                  />
                </Field>
              </div>

              <Field
                label="Hard card pacing"
                htmlFor="maxHardCardsSelect"
                hint="Spreads out hard cards. Extra ones are postponed and easier cards pulled forward."
              >
                <select
                  id="maxHardCardsSelect"
                  value={form.maxHardCardsPer5Min}
                  onChange={(e) => set('maxHardCardsPer5Min')(Number(e.target.value))}
                >
                  <option value={1}>1 hard card per 5 min</option>
                  <option value={2}>2 per 5 min (default)</option>
                  <option value={3}>3 per 5 min</option>
                  <option value={4}>4 per 5 min</option>
                  <option value={5}>5 per 5 min</option>
                  <option value={999}>Off (no limit)</option>
                </select>
              </Field>
            </Section>

            <Section title="Comfort" description="Make sessions gentler when you need it.">
              <Toggle
                id="heartsToggle"
                checked={form.heartsEnabled}
                onChange={set('heartsEnabled')}
                label="❤️ Hearts"
                description="Lose a heart per wrong answer; the session pauses at zero and hearts refill over time."
              />
              {form.heartsEnabled && (
                <Field label="Max hearts" htmlFor="maxHearts" aside={<span className="value-badge">{form.maxHearts}</span>}>
                  <input id="maxHearts" type="range" min="3" max="10" value={form.maxHearts} onChange={(e) => set('maxHearts')(Number(e.target.value))} />
                </Field>
              )}
              <Toggle
                id="relaxedModeToggle"
                checked={form.relaxedMode}
                onChange={set('relaxedMode')}
                label="🧘 Relaxed mode"
                description={<>Failed cards count as <strong>Hard</strong> instead of <strong>Again</strong>, so progress never fully resets.</>}
              />
              <Toggle
                id="stressModeToggle"
                checked={form.stressMode}
                onChange={set('stressMode')}
                label="🌸 Gentle AI"
                description="Very short, reassuring explanations with simple number analogies."
              />
              <Toggle
                id="unlockAllFeaturesToggle"
                checked={form.unlockAllFeatures}
                onChange={set('unlockAllFeatures')}
                label="🏅 Unlock all features"
                description="Skip the streak-based unlocks and get every feature now."
              />
            </Section>
          </>
        )}

        {tab === 'sync' && (
          <>
            <Section title="Sync your devices" icon={Wifi} tone="accent">
              <p className="section-lead">
                Copy decks and progress between your phone and computer with a 6-digit code or QR scan, or with a file.
                No account or token needed.
              </p>
              <button className="btn btn-primary" onClick={onOpenSync}>
                <Wifi size={18} /> Open Sync <ChevronRight size={16} />
              </button>
              <Field
                label="This device's name"
                htmlFor="deviceName"
                hint="Shown on your other device when pairing and on backups."
              >
                <input
                  id="deviceName"
                  type="text"
                  placeholder={defaultDeviceName || 'e.g. My iPhone'}
                  value={form.deviceName}
                  onChange={(e) => set('deviceName')(e.target.value)}
                />
              </Field>
            </Section>

            <Section
              title="Cloud auto-sync (GitHub Gist)"
              icon={Cloud}
              description="Optional. Syncs in the background through a secret Gist on your GitHub account."
            >
              <Field
                label="GitHub token (PAT)"
                htmlFor="githubPAT"
                hint={<>Needs the <code>gist</code> scope. Create one under <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">GitHub → Settings → Tokens (classic)</a>.</>}
              >
                <SecretInput id="githubPAT" placeholder="ghp_..." value={form.githubPAT} onChange={(v) => set('githubPAT')(sanitizeToken(v))} />
              </Field>

              <Field
                label="Gist ID (sync code)"
                htmlFor="syncCode"
                hint={form.syncCode ? 'Enter this same Gist ID and token on your other device.' : 'Leave blank and press “Create Gist” to make one.'}
              >
                <input
                  id="syncCode"
                  type="text"
                  placeholder="Leave blank to create one"
                  value={form.syncCode}
                  onChange={(e) => set('syncCode')(e.target.value.trim())}
                  spellCheck={false}
                />
              </Field>

              <div className="field-row">
                <button className="btn btn-secondary btn-sm" onClick={handlePull} disabled={!form.syncCode || isSyncing}>
                  <Download size={14} /> {isSyncing ? 'Syncing…' : 'Pull & merge'}
                </button>
                {form.deviceMode !== 'mac' && (
                  <button className="btn btn-secondary btn-sm" onClick={handlePush} disabled={!form.githubPAT || isSyncing}>
                    <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
                    {isSyncing ? 'Syncing…' : form.syncCode ? 'Push now' : 'Create Gist & push'}
                  </button>
                )}
              </div>

              <Field
                label="Conflict priority"
                htmlFor="deviceMode"
                hint={<>Pick <strong>Mobile</strong> for the device you review on: its changes win conflicts. <strong>Desktop preview</strong> is read-only and yields to Mobile.</>}
              >
                <select id="deviceMode" value={form.deviceMode} onChange={(e) => set('deviceMode')(e.target.value)}>
                  <option value="mobile">Mobile (review device, wins conflicts)</option>
                  <option value="mac">Desktop preview (read-only, yields)</option>
                </select>
              </Field>
            </Section>

            <details className="settings-section advanced">
              <summary>Advanced: custom pairing server</summary>
              <Field
                label="PeerJS server URL"
                htmlFor="syncSignalServer"
                hint="Nearby Sync uses the free PeerJS cloud only to introduce your devices. Your data then travels directly between them. Self-hosting? Enter your server, e.g. https://peer.example.com:443/"
              >
                <input
                  id="syncSignalServer"
                  type="url"
                  placeholder="Default: PeerJS cloud"
                  value={form.syncSignalServer}
                  onChange={(e) => set('syncSignalServer')(e.target.value.trim())}
                  spellCheck={false}
                />
              </Field>
            </details>
          </>
        )}

        {tab === 'data' && (
          <>
            <Section title="Import & export" icon={Upload}>
              <div className="button-stack">
                <button className="btn btn-secondary" onClick={onExportData}>
                  <Download size={16} /> Download full backup (JSON)
                </button>
                <label className="btn btn-secondary">
                  <Upload size={16} /> Restore from backup file…
                  <input type="file" accept=".json" onChange={handleFileUpload} hidden />
                </label>
                <label className="btn btn-secondary">
                  <Upload size={16} /> Import Anki text (TXT/TSV)…
                  <input type="file" accept=".txt,.tsv" onChange={handleAnkiTxtUpload} hidden />
                </label>
              </div>
              <p className="field-hint">Restoring replaces what's on this device. To combine data from another device, use <strong>Sync</strong> instead.</p>
            </Section>

            <Section
              title="Backups & recovery"
              icon={Layers}
              description="Snapshots are saved automatically whenever you review or edit, and before every sync."
            >
              <h4 className="subhead">On this device</h4>
              {backups.length === 0 ? (
                <p className="empty-note">No local backups yet.</p>
              ) : (
                backups.map((b) => (
                  <BackupRow
                    key={`local-${b.index}`}
                    title="Local snapshot"
                    backup={b}
                    onRestore={() => {
                      if (confirm(`Restore the snapshot from ${new Date(b.timestamp).toLocaleString()}? This replaces your current decks and cards.`)) {
                        onRestoreBackup(b);
                      }
                    }}
                  />
                ))
              )}

              <h4 className="subhead">In the cloud</h4>
              {!cloudBackups || cloudBackups.length === 0 ? (
                <p className="empty-note">No cloud backups. They appear once cloud auto-sync is on.</p>
              ) : (
                cloudBackups.map((b, idx) => (
                  <BackupRow
                    key={`cloud-${b.timestamp || idx}`}
                    title={`Cloud #${idx + 1}`}
                    backup={b}
                    onRestore={() => {
                      if (confirm(`Restore cloud backup #${idx + 1}? This replaces your current decks and cards.`)) {
                        onRestoreBackup(b);
                      }
                    }}
                  />
                ))
              )}
            </Section>

            <Section title="Danger zone" icon={ShieldAlert} tone="danger">
              <p className="section-lead">Permanently deletes all decks, review history and keys stored on this device. This can't be undone.</p>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm("Delete all decks, cards and keys on this device?")) onClearData();
                }}
              >
                Reset app data
              </button>
            </Section>

            {appVersion && <p className="version-footnote">SimAnki {appVersion}</p>}
          </>
        )}
      </div>
    </div>

      {/* Outside the animated page: its transform would trap position: fixed */}
      <div className={`save-bar${isDirty || justSaved ? ' visible' : ''}`} aria-live="polite">
        {justSaved && !isDirty ? (
          <span className="save-bar-text saved"><Check size={16} /> Saved</span>
        ) : (
          <>
            <span className="save-bar-text">Unsaved changes</span>
            <button className="btn btn-secondary btn-sm" onClick={discard}>Discard</button>
            <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          </>
        )}
      </div>
    </>
  );
}

// Clean text and decode common HTML entities
function cleanText(str) {
  if (!str) return '';
  let text = str;
  // Decode common HTML entities
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&deg;/g, '°')
    .replace(/&nbsp;/g, ' ');
  
  // Remove actual HTML tags safely (do not strip LaTeX comparison operators like < or >)
  text = text.replace(/<\/?[a-zA-Z0-9:-]+(?:\s+[^>]*)*>/g, "");
  
  // Trim surrounding spaces and quotes if any
  text = text.trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

// Parse tab, CSV, or line-separated text formats
function parseAnkiTxt(text) {
  let cleanRawText = text.trim();
  if (cleanRawText.startsWith('"') && cleanRawText.endsWith('"') && cleanRawText.includes('\n')) {
    cleanRawText = cleanRawText.slice(1, -1).trim();
  }

  const lines = cleanRawText.split(/\r?\n/);
  const cards = [];
  
  // Auto-detect separator
  let sep = '\t';
  const firstLine = lines.find(line => line.trim() && !line.trim().startsWith('#'));
  if (firstLine) {
    const tabs = (firstLine.match(/\t/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    if (tabs > 0) {
      sep = '\t';
    } else if (semicolons > 0 && semicolons >= commas) {
      sep = ';';
    } else if (commas > 0) {
      sep = ',';
    }
  }

  for (let line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    
    let columns = [];
    if (sep === '\t') {
      columns = line.split('\t');
    } else {
      let inQuotes = false;
      let token = '';
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === sep && !inQuotes) {
          columns.push(token);
          token = '';
        } else {
          token += char;
        }
      }
      columns.push(token);
    }

    if (columns.length < 2) continue;
    
    let question = cleanText(columns[0]);
    let answer = cleanText(columns[1]);
    let conceptFocus = columns[2] ? cleanText(columns[2]) : '';
    let mnemonic = columns[3] ? cleanText(columns[3]) : '';
    
    if (!question || !answer) continue;
    
    let concept = `Correct Answer: ${answer}`;
    if (conceptFocus) {
      concept += `. Explanation: ${conceptFocus}`;
    }
    if (mnemonic) {
      concept += `. Mnemonic: ${mnemonic}`;
    }
    
    cards.push({
      question,
      concept
    });
  }
  
  // Line pairing fallback
  if (cards.length === 0 && lines.length > 0) {
    let pendingQuestion = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.toLowerCase().startsWith('q:') || line.toLowerCase().startsWith('question:')) {
        pendingQuestion = cleanText(line.replace(/^(q|question):\s*/i, ''));
      } else if ((line.toLowerCase().startsWith('a:') || line.toLowerCase().startsWith('answer:')) && pendingQuestion) {
        const ans = cleanText(line.replace(/^(a|answer):\s*/i, ''));
        cards.push({ question: pendingQuestion, concept: `Correct Answer: ${ans}` });
        pendingQuestion = '';
      } else {
        if (!pendingQuestion) {
          pendingQuestion = cleanText(line);
        } else {
          const ans = cleanText(line);
          cards.push({ question: pendingQuestion, concept: `Correct Answer: ${ans}` });
          pendingQuestion = '';
        }
      }
    }
    if (pendingQuestion && cards.length === 0) {
      cards.push({ question: pendingQuestion, concept: `Correct Answer: ${pendingQuestion}` });
    }
  }

  return cards;
}
