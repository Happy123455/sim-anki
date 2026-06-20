import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Plus, Check } from 'lucide-react';

export default function ImportModal({ Decks, onCreateDeck, onImportCards, onClose }) {
  const [importType, setImportType] = useState('file'); // 'file' | 'paste'
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [separator, setSeparator] = useState('auto'); // 'auto' | ',' | ';' | '\t'
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [showCreateDeckInput, setShowCreateDeckInput] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [parsedCards, setParsedCards] = useState([]);
  const [previewError, setPreviewError] = useState('');

  // Set default deck
  useEffect(() => {
    if (Decks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(Decks[0].id);
    }
  }, [Decks, selectedDeckId]);

  // Clean text and decode common HTML entities
  const cleanText = (str) => {
    if (!str) return '';
    let text = str;
    text = text
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&deg;/g, '°')
      .replace(/&nbsp;/g, ' ');
    
    // Remove HTML tags
    text = text.replace(/<\/?[^>]+(>|$)/g, "");
    text = text.trim();
    if (text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1).trim();
    }
    return text;
  };

  // Parsing logic
  const parseData = (textToParse, sep) => {
    if (!textToParse.trim()) {
      setParsedCards([]);
      setPreviewError('');
      return;
    }

    const lines = textToParse.split(/\r?\n/);
    const results = [];
    let detectedSep = sep;

    // Auto-detect separator if 'auto' chosen
    if (sep === 'auto') {
      const firstLine = lines.find(line => line.trim() && !line.trim().startsWith('#'));
      if (firstLine) {
        const tabs = (firstLine.match(/\t/g) || []).length;
        const commas = (firstLine.match(/,/g) || []).length;
        const semicolons = (firstLine.match(/;/g) || []).length;

        if (tabs >= commas && tabs >= semicolons) detectedSep = '\t';
        else if (semicolons >= commas && semicolons >= tabs) detectedSep = ';';
        else detectedSep = ',';
      } else {
        detectedSep = ',';
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      let columns = [];
      if (detectedSep === '\t') {
        columns = line.split('\t');
      } else {
        // Simple CSV parser supporting quotes (basic implementation)
        let inQuotes = false;
        let token = '';
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === detectedSep && !inQuotes) {
            columns.push(token);
            token = '';
          } else {
            token += char;
          }
        }
        columns.push(token);
      }

      if (columns.length < 2) continue;

      const question = cleanText(columns[0]);
      const answer = cleanText(columns[1]);
      
      // Anki optional columns: 3rd is tags, 4th is conceptFocus, etc.
      const conceptFocus = columns[2] ? cleanText(columns[2]) : '';
      const mnemonic = columns[3] ? cleanText(columns[3]) : '';

      if (!question || !answer) continue;

      // Construct a unified concept card text
      let concept = `Correct Answer: ${answer}`;
      if (conceptFocus) {
        concept += `. Concept details: ${conceptFocus}`;
      }
      if (mnemonic) {
        concept += `. Mnemonic: ${mnemonic}`;
      }

      results.push({ question, concept });
    }

    if (results.length === 0) {
      setPreviewError('No valid flashcards found. Check that you selected the correct delimiter and your format has at least 2 columns (Question and Answer/Concept).');
      setParsedCards([]);
    } else {
      setPreviewError('');
      setParsedCards(results);
    }
  };

  // Re-run parser when text or separator changes
  useEffect(() => {
    if (importType === 'paste') {
      parseData(rawText, separator);
    }
  }, [rawText, separator, importType]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileName(file.name);
    const fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = (event) => {
      const text = event.target.result;
      setRawText(text);
      parseData(text, separator);
    };
  };

  const handleCreateDeckSubmit = (e) => {
    e.preventDefault();
    if (!newDeckTitle.trim()) return;
    const newId = `deck-${Date.now()}`;
    onCreateDeck(newDeckTitle.trim(), 'Imported deck');
    setSelectedDeckId(newId);
    setNewDeckTitle('');
    setShowCreateDeckInput(false);
    
    // Quick timeout to let parent state sync the decks list
    setTimeout(() => {
      setSelectedDeckId(newId);
    }, 100);
  };

  const handleExecuteImport = () => {
    if (parsedCards.length === 0) return;
    let deckId = selectedDeckId;
    
    // Fallback deck creation if somehow empty
    if (!deckId) {
      alert('Please select or create a target deck first.');
      return;
    }

    onImportCards(parsedCards, deckId);
    alert(`Successfully imported ${parsedCards.length} cards!`);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '1.5rem'
    }} className="animate-fade-in">
      <div 
        className="glass-panel" 
        style={{ 
          width: '100%', 
          maxWidth: '650px', 
          maxHeight: '90vh',
          padding: '2rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.5rem', 
          position: 'relative',
          border: '1px solid var(--border-light)',
          background: 'rgba(15, 15, 20, 0.95)',
          overflowY: 'auto'
        }}
      >
        <button 
          className="btn-text" 
          onClick={onClose}
          style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <h3 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
          <Upload size={22} style={{ color: 'var(--accent-primary)' }} /> Import Flashcards (CSV / TXT / TSV)
        </h3>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
          <button 
            className="btn" 
            type="button"
            onClick={() => { setImportType('file'); setRawText(''); setFileName(''); setParsedCards([]); }}
            style={{ 
              flex: 1, 
              padding: '0.5rem', 
              fontSize: '0.85rem',
              background: importType === 'file' ? 'var(--bg-glass-hover)' : 'transparent',
              border: importType === 'file' ? '1px solid var(--border-light)' : '1px solid transparent',
              color: importType === 'file' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Upload size={14} /> File Upload
          </button>
          <button 
            className="btn" 
            type="button"
            onClick={() => { setImportType('paste'); setRawText(''); setFileName(''); setParsedCards([]); }}
            style={{ 
              flex: 1, 
              padding: '0.5rem', 
              fontSize: '0.85rem',
              background: importType === 'paste' ? 'var(--bg-glass-hover)' : 'transparent',
              border: importType === 'paste' ? '1px solid var(--border-light)' : '1px solid transparent',
              color: importType === 'paste' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <FileText size={14} /> Paste Text
          </button>
        </div>

        {/* File upload panel */}
        {importType === 'file' && (
          <div style={{
            border: '2px dashed var(--border-light)',
            borderRadius: '12px',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.01)',
            cursor: 'pointer',
            position: 'relative'
          }}>
            <input 
              type="file" 
              accept=".csv,.txt,.tsv" 
              onChange={handleFileUpload} 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer'
              }}
            />
            <Upload size={36} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
            {fileName ? (
              <div>
                <p style={{ fontWeight: 600, color: 'var(--success)' }}>Selected File:</p>
                <code style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{fileName}</code>
              </div>
            ) : (
              <div>
                <p style={{ fontWeight: 500, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Drag & drop your file here, or click to browse
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                  Supports CSV, Tab-separated TXT/TSV files exported from Anki
                </p>
              </div>
            )}
          </div>
        )}

        {/* Paste Raw Text panel */}
        {importType === 'paste' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Paste Delimited Cards (Question & Answer)</label>
            <textarea
              placeholder="Question column 1 , Concept column 2&#10;What is photosyntesis? , Process of converting light into energy&#10;What is FSRS? , Free Spaced Repetition Scheduler"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              style={{ fontSize: '0.85rem', minHeight: '130px', fontFamily: 'monospace' }}
            />
          </div>
        )}

        {/* Delimiter Selection & Target Deck */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Separator Delimiter</label>
            <select value={separator} onChange={(e) => { setSeparator(e.target.value); parseData(rawText, e.target.value); }}>
              <option value="auto">Auto-Detect Separator</option>
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value="&#9;">Tab (\t)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Select Target Deck</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select 
                value={selectedDeckId} 
                onChange={(e) => setSelectedDeckId(e.target.value)}
                style={{ flex: 1 }}
              >
                {Decks.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowCreateDeckInput(true)}
                title="Create New Deck"
                style={{ padding: '0.5rem' }}
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Create Deck Inline Form */}
        {showCreateDeckInput && (
          <form onSubmit={handleCreateDeckSubmit} style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <input 
              type="text" 
              placeholder="New Deck Title..."
              value={newDeckTitle}
              onChange={(e) => setNewDeckTitle(e.target.value)}
              style={{ flex: 1, padding: '0.4rem' }}
              required 
            />
            <button className="btn btn-primary" type="submit" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
              Create
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowCreateDeckInput(false)} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
              Cancel
            </button>
          </form>
        )}

        {/* Parsing Results / Preview */}
        {previewError && (
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.07)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem 1rem', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', alignItems: 'center', textAlign: 'left' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{previewError}</span>
          </div>
        )}

        {parsedCards.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CheckCircle size={16} /> Successfully Parsed {parsedCards.length} Cards! Previewing first 3:
            </span>
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '0.5rem 0.75rem' }}>#</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: '45%' }}>Question</th>
                    <th style={{ padding: '0.5rem 0.75rem', width: '50%' }}>Target Concept</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedCards.slice(0, 3).map((card, idx) => (
                    <tr key={idx} style={{ borderBottom: idx < 2 ? '1px solid var(--border-light)' : 'none' }}>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '0.5rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{card.question}</td>
                      <td style={{ padding: '0.5rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px', color: 'var(--text-secondary)' }}>{card.concept}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            type="button" 
            onClick={handleExecuteImport}
            disabled={parsedCards.length === 0}
            style={{ gap: '0.35rem', opacity: parsedCards.length === 0 ? 0.5 : 1, cursor: parsedCards.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <Check size={16} /> Import {parsedCards.length} Cards
          </button>
        </div>
      </div>
    </div>
  );
}
