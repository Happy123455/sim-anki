import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, ShieldAlert, ArrowLeft, RefreshCw, Download, Upload } from 'lucide-react';
import { checkApiKey } from '../utils/gemini';

export default function Settings({ settings, onSaveSettings, onBack, onExportData, onImportData, onClearData }) {
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

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const updateVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  const handleTestKey = async () => {
    if (!apiKey) return;
    setIsTesting(true);
    setTestResult(null);
    const isValid = await checkApiKey(apiKey, model);
    setIsTesting(false);
    setTestResult(isValid ? 'success' : 'error');
  };

  const handleSave = () => {
    onSaveSettings({ apiKey, model, targetRetention, customInstructions, voiceURI });
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  };

  const handleFileUpload = (e) => {
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
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Very Fast)</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Analysis)</option>
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
