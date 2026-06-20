import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, ShieldAlert, ArrowLeft, RefreshCw, Download, Upload } from 'lucide-react';
import { checkApiKey } from '../utils/gemini';

const getBestDefaultVoice = (voices) => {
  const preferredSubstrings = ["siri", "google us english", "google uk english", "natural", "neural", "samantha", "aria", "guy"];
  const englishVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  if (englishVoices.length === 0) return null;

  for (const sub of preferredSubstrings) {
    const match = englishVoices.find(v => v.name.toLowerCase().includes(sub));
    if (match) return match;
  }
  return englishVoices[0];
};

export default function Settings({ settings, onSaveSettings, onBack, onExportData, onImportData, onClearData, onImportAnkiCards, onPushSync, onPullSync, isSyncing }) {
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(settings.model || 'gemini-3.5-flash');
  const [targetRetention, setTargetRetention] = useState(settings.targetRetention || 90);
  const [customInstructions, setCustomInstructions] = useState(settings.customInstructions || '');
  const [voiceURI, setVoiceURI] = useState(settings.voiceURI || '');
  const [voices, setVoices] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'success' | 'error' | null
  const [saveStatus, setSaveStatus] = useState(false);
  const [syncCode, setSyncCode] = useState(settings.syncCode || '');
  const [githubPAT, setGithubPAT] = useState(settings.githubPAT || '');
  const [showPat, setShowPat] = useState(false);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      setVoices(allVoices);
      
      // Auto-suggest best natural English voice if none is configured
      if (!voiceURI && allVoices.length > 0) {
        const best = getBestDefaultVoice(allVoices);
        if (best) {
          setVoiceURI(best.voiceURI);
        }
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, [voiceURI]);

  const handleTestKey = async () => {
    if (!apiKey) return;
    setIsTesting(true);
    setTestResult(null);
    const isValid = await checkApiKey(apiKey, model);
    setIsTesting(false);
    setTestResult(isValid ? 'success' : 'error');
  };

  useEffect(() => {
    if (settings) {
      setApiKey(settings.apiKey || '');
      setModel(settings.model || 'gemini-3.5-flash');
      setTargetRetention(settings.targetRetention || 90);
      setCustomInstructions(settings.customInstructions || '');
      setVoiceURI(settings.voiceURI || '');
      setSyncCode(settings.syncCode || '');
      setGithubPAT(settings.githubPAT || '');
    }
  }, [settings]);

  const handleSave = () => {
    onSaveSettings({ apiKey, model, targetRetention, customInstructions, voiceURI, syncCode, githubPAT });
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  };

  const handlePush = async () => {
    if (!githubPAT) {
      alert("GitHub Personal Access Token (PAT) is required to push/create a Gist sync.");
      return;
    }
    const code = await onPushSync();
    if (code) {
      setSyncCode(code);
    }
  };

  const handlePull = async () => {
    if (!syncCode) return;
    if (confirm("This will overwrite all local decks, cards, settings, and progress with cloud data. Are you sure you want to pull?")) {
      await onPullSync(syncCode);
    }
  };

  const handleFileUpload = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileReader = new FileReader();
    fileReader.readAsText(e.target.files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.decks && data.cards) {
          onImportData(data);
          alert("Data imported successfully!");
        } else {
          alert("Invalid import format. JSON must contain decks and cards.");
        }
      } catch (err) {
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

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '600px', margin: '2rem auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ padding: '0.5rem' }}>
          <ArrowLeft size={18} />
        </button>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Application Settings</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Gemini API Key */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
          <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Gemini API Key</label>
          <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
              style={{ paddingRight: '2.5rem' }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Get your API key for free from the{' '}
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
            >
              Google AI Studio
            </a>.
          </p>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={handleTestKey}
              disabled={!apiKey || isTesting}
              style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
              {isTesting ? (
                <>
                  <RefreshCw className="animate-float" size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </button>
            {testResult === 'success' && (
              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                ✓ API Connection Successful!
              </span>
            )}
            {testResult === 'error' && (
              <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                ✗ Invalid API Key or Model selection.
              </span>
            )}
          </div>
        </div>

        {/* Model Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
          <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Gemini Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Default - Latest & Fastest)</option>
            <option value="gemini-3.1-pro">Gemini 3.1 Pro (Deep Reasoning & Analysis)</option>
            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (Cost Efficient)</option>
          </select>
        </div>

        {/* Voice Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
          <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tutor Speech Voice (Neural / Natural)</label>
          <select value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
            <option value="">System Default Voice</option>
            {voices
              .filter(v => v.lang.startsWith('en'))
              .map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}) {v.localService ? '[Local]' : '[Network]'}
                </option>
              ))
            }
            {voices
              .filter(v => !v.lang.startsWith('en'))
              .map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))
            }
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Choose a high-quality or neural voice supported by your browser/OS for more natural narration.
          </p>
        </div>

        {/* FSRS Toughness/Target Retention Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Toughness (FSRS Desired Retention)</label>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{targetRetention}%</span>
          </div>
          <input 
            type="range" 
            min="75" 
            max="95" 
            step="1"
            value={targetRetention} 
            onChange={(e) => setTargetRetention(Number(e.target.value))} 
            style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Sets the percentage of cards you expect to remember. 
            **85% to 90% is the optimal range.** 
            Higher retention targets (e.g. 95%) will schedule reviews much sooner (tougher pacing) to guarantee memory retention.
          </p>
        </div>

        {/* Custom AI Tutor Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
          <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Custom AI Tutor Instructions</label>
          <textarea
            placeholder="e.g. Speak in a friendly, encouraging tone. Explain structural engineering concepts using concrete beam analogies. Focus on limit states."
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            style={{ minHeight: '80px', fontSize: '0.9rem' }}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Provide custom rules on how you want the AI to grade your answers, what vocabulary to use, or how to explain concepts.
          </p>
        </div>

        {/* Action Button */}
        <button className="btn btn-primary" onClick={handleSave} style={{ alignSelf: 'flex-start', gap: '0.5rem' }}>
          <Save size={18} /> {saveStatus ? 'Settings Saved!' : 'Save Configurations'}
        </button>

        <hr style={{ borderColor: 'var(--border-light)', margin: '1rem 0' }} />

        {/* Data Import/Export */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Data Portability</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onExportData} style={{ fontSize: '0.9rem', gap: '0.5rem' }}>
              <Download size={16} /> Export Backup (JSON)
            </button>
            <label className="btn btn-secondary" style={{ fontSize: '0.9rem', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
              <Upload size={16} /> Import Backup (JSON)
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <label className="btn btn-secondary" style={{ fontSize: '0.9rem', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
              <Upload size={16} /> Import Anki Text (TXT/TSV)
              <input type="file" accept=".txt,.tsv" onChange={handleAnkiTxtUpload} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <hr style={{ borderColor: 'var(--border-light)', margin: '1rem 0' }} />

        {/* Cloud Gist Synchronization */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔄 GitHub Gist Cloud Sync
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Sync your decks, cards, settings, and FSRS progress securely across devices (Mac, mobile, tablets) using a secret GitHub Gist.
          </p>

          {/* GitHub PAT Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              GitHub Personal Access Token (PAT)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
              <input
                type={showPat ? 'text' : 'password'}
                placeholder="ghp_..."
                value={githubPAT}
                onChange={(e) => setGithubPAT(e.target.value.trim())}
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPat(!showPat)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                {showPat ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
              Needs a token with <code style={{ color: 'var(--accent-secondary)' }}>gist</code> scope. Create one under{' '}
              <a 
                href="https://github.com/settings/tokens" 
                target="_blank" 
                rel="noreferrer"
                style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
              >
                GitHub Settings (Tokens Classic)
              </a>.
            </p>
          </div>

          {/* Gist ID (Sync Code) Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Gist ID (Sync Code)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Leave blank to generate on Push..."
                value={syncCode}
                onChange={(e) => setSyncCode(e.target.value.trim())}
                style={{ flex: 1, minWidth: '200px' }}
              />
              <button 
                className="btn btn-secondary" 
                onClick={handlePull} 
                disabled={!syncCode || isSyncing}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                {isSyncing ? 'Pulling...' : 'Pull Data'}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={handlePush} 
                disabled={!githubPAT || isSyncing}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RefreshCw size={14} className={isSyncing ? "animate-float" : ""} style={{ animation: isSyncing ? "spin 1s linear infinite" : "none" }} />
                {isSyncing ? 'Syncing...' : syncCode ? 'Push Data' : 'Create Gist & Push'}
              </button>
            </div>
            
            {syncCode && (
               <div style={{ padding: '0.75rem', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.15)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                 <strong>Active Gist ID (Sync Code):</strong> <code style={{ color: 'var(--accent-secondary)', fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>{syncCode}</code>
                 <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                   Copy this Gist ID and your PAT to your other device to seamlessly sync your cards.
                 </p>
               </div>
            )}
          </div>
        </div>

        <hr style={{ borderColor: 'var(--border-light)', margin: '1rem 0' }} />

        {/* Reset / Danger Zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left', background: 'rgba(239, 68, 68, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={20} /> Danger Zone
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            This action will permanently delete all your decks, flashcard review progress, and API key stored locally. This action is irreversible.
          </p>
          <button className="btn btn-danger" onClick={() => {
            if (confirm("Are you absolutely sure you want to delete all decks, cards, and keys?")) {
              onClearData();
            }
          }} style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}>
            Reset App Data
          </button>
        </div>
      </div>
    </div>
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
  
  // Remove basic HTML tags
  text = text.replace(/<\/?[^>]+(>|$)/g, "");
  
  // Trim surrounding spaces and quotes if any
  text = text.trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

// Parse tab-separated Anki text format
function parseAnkiTxt(text) {
  const lines = text.split(/\r?\n/);
  const cards = [];
  
  for (let line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    // Skip comments / settings metadata lines
    if (trimmedLine.startsWith('#')) continue;
    
    const columns = line.split('\t');
    if (columns.length < 2) continue;
    
    let question = cleanText(columns[0]);
    let answer = cleanText(columns[1]);
    let conceptFocus = columns[4] ? cleanText(columns[4]) : '';
    let mnemonic = columns[5] ? cleanText(columns[5]) : '';
    
    if (!question || !answer) continue;
    
    // Construct the concept string.
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
  
  return cards;
}
