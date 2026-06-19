import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import StudySession from './components/StudySession';
import { calculateNextState } from './utils/srs';
import { ShieldAlert, BookOpen, Layers } from 'lucide-react';
import { cleanApiKey, cleanModelName } from './utils/gemini';

// Pre-seeded structural engineering deck and cards
const initialDecks = [
  {
    id: 'deck-structural',
    title: 'Structural Engineering',
    description: 'Core design philosophies, limit states, shear reinforcements, and reinforced concrete beam behavior.'
  }
];

const initialCards = [
  {
    id: 'card-1',
    deckId: 'deck-structural',
    question: 'What is the key difference between the Working Stress Method (WSM) and the Limit State Method (LSM) in structural design?',
    concept: 'WSM vs LSM structural design philosophy',
    state: null // new card
  },
  {
    id: 'card-2',
    deckId: 'deck-structural',
    question: 'Explain the concept of flexural failure modes in beams: what is the difference between under-reinforced and over-reinforced sections, and why is one preferred?',
    concept: 'Beam under-reinforced vs over-reinforced flexural behavior',
    state: null // new card
  },
  {
    id: 'card-3',
    deckId: 'deck-structural',
    question: 'Why do we need shear stirrups in concrete beams, and how do they carry the diagonal shear forces?',
    concept: 'Concrete beam shear failure and shear stirrups design',
    state: null // new card
  },
  {
    id: 'card-4',
    deckId: 'deck-structural',
    question: 'Which IS code is used for Plain and Reinforced Concrete?',
    concept: 'Correct Answer: IS 456 : 2000. Focus: IS 456 is for plain and reinforced concrete. Mnemonic: The foundational concrete rulebook.',
    state: null
  },
  {
    id: 'card-5',
    deckId: 'deck-structural',
    question: 'Which IS code (Parts I to V) governs Loading Standards (Dead, Live, Wind, Snow)?',
    concept: 'Correct Answer: IS 875. Focus: IS 875 governs loading standards. Mnemonic: The rulebook for incoming damage types.',
    state: null
  },
  {
    id: 'card-6',
    deckId: 'deck-structural',
    question: 'Which IS code contains the criteria for Earthquake Resistant Design?',
    concept: 'Correct Answer: IS 1893. Focus: IS 1893 is for earthquake resistant design. Mnemonic: The main Geo defense rulebook.',
    state: null
  },
  {
    id: 'card-7',
    deckId: 'deck-structural',
    question: 'Which IS code handles Ductile Detailing of seismic structures?',
    concept: 'Correct Answer: IS 13920. Focus: IS 13920 is for ductile detailing. Mnemonic: The "flexibility" rulebook for surviving tremors.',
    state: null
  },
  {
    id: 'card-8',
    deckId: 'deck-structural',
    question: 'What is the Partial Material Safety Factor for Concrete (\\(\\gamma_{mc}\\))?',
    concept: 'Correct Answer: 1.5. Focus: The material safety factor for concrete is 1.5. Mnemonic: A bigger safety buffer because it\'s crafted in the wild.',
    state: null
  },
  {
    id: 'card-9',
    deckId: 'deck-structural',
    question: 'What is the Partial Material Safety Factor for Steel (\\(\\gamma_{ms}\\))?',
    concept: 'Correct Answer: 1.15. Focus: The material safety factor for steel is 1.15. Mnemonic: A smaller safety buffer because it\'s forged in a controlled factory.',
    state: null
  },
  {
    id: 'card-10',
    deckId: 'deck-structural',
    question: 'Why is the safety factor for concrete (1.5) higher than for steel (1.15)?',
    concept: 'Correct Answer: Concrete is mixed on-site (lower quality control), steel is factory-made (high quality control). Focus: Concrete has less quality control than factory-made steel. Mnemonic: Field-crafting has unpredictable RNG compared to a blacksmith shop.',
    state: null
  },
  {
    id: 'card-11',
    deckId: 'deck-structural',
    question: 'What is the standard Load Safety Factor \\(\\gamma_{f}\\) for Dead + Live loads?',
    concept: 'Correct Answer: 1.5. Focus: The load safety factor is 1.5. Mnemonic: Multiplier applied to enemy attacks to ensure you survive.',
    state: null
  },
  {
    id: 'card-12',
    deckId: 'deck-structural',
    question: 'The Limit State Method combines concepts from which two older design methods?',
    concept: 'Correct Answer: Ultimate Load Method and Working Stress Method. Focus: Limit State Method combines Ultimate Load and Working Stress methods. Mnemonic: A hybrid build of two older metas.',
    state: null
  },
  {
    id: 'card-13',
    deckId: 'deck-structural',
    question: 'Which Limit State deals with the structure failing or being unable to resist external loads?',
    concept: 'Correct Answer: Limit State of Collapse (Strength). Focus: The limit state of collapse deals with structural failure. Mnemonic: Total HP reaches zero.',
    state: null
  },
  {
    id: 'card-14',
    deckId: 'deck-structural',
    question: 'Deflection, cracking, and vibration belong to which Limit State?',
    concept: 'Correct Answer: Limit State of Serviceability. Focus: Deflection and cracking fall under the limit state of serviceability. Mnemonic: HP isn\'t zero, but the structure has a continuous debuff making it uncomfortable.',
    state: null
  },
  {
    id: 'card-15',
    deckId: 'deck-structural',
    question: 'What is the formula to convert Characteristic Strength to Design Strength?',
    concept: 'Correct Answer: Divide by the Material Safety Factor, i.e., \\(\\frac{\\text{Characteristic Strength}}{\\text{Material Safety Factor}}\\). Focus: Design strength is characteristic strength divided by the material safety factor. Mnemonic: Nerf your own base stats on paper for a safety buffer.',
    state: null
  },
  {
    id: 'card-16',
    deckId: 'deck-structural',
    question: 'What is the formula to convert Characteristic Load to Design Load?',
    concept: 'Correct Answer: Multiply by the Load Safety Factor, i.e., \\(\\text{Characteristic Load} \\times \\text{Load Safety Factor}\\). Focus: Design load is characteristic load multiplied by the load safety factor. Mnemonic: Buff the enemy\'s base damage on paper for a safety buffer.',
    state: null
  },
  {
    id: 'card-17',
    deckId: 'deck-structural',
    question: 'What is the "Golden Rule" equation of structural design?',
    concept: 'Correct Answer: Design Strength \\(\\ge\\) Design Load. Focus: Design strength must be greater than or equal to design load. Mnemonic: Your nerfed shield must still block their buffed attack.',
    state: null
  },
  {
    id: 'card-18',
    deckId: 'deck-structural',
    question: 'What is the minimum grade of concrete allowed for RCC per IS 456?',
    concept: 'Correct Answer: M20. Focus: The minimum grade of concrete for RCC is M20. Mnemonic: The minimum level required to equip reinforcements.',
    state: null
  },
  {
    id: 'card-19',
    deckId: 'deck-structural',
    question: 'What is the standard unit weight of RCC (Reinforced Cement Concrete)?',
    concept: 'Correct Answer: 25 kN/m\u00b3. Focus: The unit weight of RCC is 25 kilonewtons per cubic meter. Mnemonic: Heaviest because of the steel inside.',
    state: null
  },
  {
    id: 'card-20',
    deckId: 'deck-structural',
    question: 'What is the standard unit weight of PCC (Plain Cement Concrete)?',
    concept: 'Correct Answer: 24 kN/m\u00b3. Focus: The unit weight of PCC is 24 kilonewtons per cubic meter. Mnemonic: Lighter by 1 point because it lacks metal.',
    state: null
  },
  {
    id: 'card-21',
    deckId: 'deck-structural',
    question: 'What is the standard unit weight of Steel?',
    concept: 'Correct Answer: 78.5 kN/m\u00b3. Focus: The unit weight of steel is 78.5 kilonewtons per cubic meter. Mnemonic: Extremely dense material.',
    state: null
  },
  {
    id: 'card-22',
    deckId: 'deck-structural',
    question: 'What is the standard Modulus of Elasticity of Steel (\\(E_s\\))?',
    concept: 'Correct Answer: 2 \\(\\times\\) 10^5 N/mm\u00b2. Focus: The modulus of elasticity of steel is 2 times 10 to the power 5 newtons per square millimeter. Mnemonic: Memorize the 2 and the 5 zeroes.',
    state: null
  }
];

export default function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'settings' | 'study'
  const [settings, setSettings] = useState({ apiKey: '', model: 'gemini-3.5-flash', targetRetention: 90, customInstructions: '', voiceURI: '' });
  const [decks, setDecks] = useState(initialDecks);
  const [cards, setCards] = useState(initialCards);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [sessionCards, setSessionCards] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastModified, setLastModified] = useState(() => {
    const saved = localStorage.getItem('simanki_last_modified');
    return saved ? Number(saved) : 0;
  });

  // Trigger MathJax typesetting whenever view or cards change
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise().catch((err) => console.log('MathJax typesetting failed:', err));
    }
  }, [view, activeDeckId, cards]);

  // Load state from localStorage on init
  useEffect(() => {
    let activeSyncCode = null;
    try {
      const savedSettings = localStorage.getItem('simanki_settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Automatically migrate deprecated model names to gemini-3.5-flash
        if (parsed.model && (
          parsed.model.includes('1.5') || 
          parsed.model.includes('2.0') || 
          parsed.model.includes('2.5') ||
          parsed.model === 'gemini-pro'
        )) {
          parsed.model = 'gemini-3.5-flash';
          localStorage.setItem('simanki_settings', JSON.stringify(parsed));
        }
        setSettings(parsed);
        if (parsed.syncCode) {
          activeSyncCode = parsed.syncCode;
        }
      }
    } catch (e) {
      console.error("Error loading settings from localStorage:", e);
    }

    try {
      const savedDecks = localStorage.getItem('simanki_decks');
      if (savedDecks) setDecks(JSON.parse(savedDecks));
    } catch (e) {
      console.error("Error loading decks from localStorage:", e);
    }

    try {
      const savedCards = localStorage.getItem('simanki_cards');
      if (savedCards) {
        const cleaned = escapeJsonLaTeX(savedCards);
        setCards(JSON.parse(cleaned));
      }
    } catch (e) {
      console.error("Error loading cards from localStorage:", e);
      setCards(initialCards);
    }

    // Auto-sync pull on startup if syncCode is configured
    if (activeSyncCode) {
      console.log("Auto-sync: Found active sync code, pulling latest cloud data...");
      const silentPull = async () => {
        try {
          const res = await fetch(`https://extendsclass.com/api/json-storage/bin/${activeSyncCode}`);
          if (res.ok) {
            const data = await res.json();
            const cloudLastModified = Number(data.lastModified) || 0;
            const localSaved = localStorage.getItem('simanki_last_modified');
            const localTS = localSaved ? Number(localSaved) : 0;

            if (cloudLastModified > localTS && data.decks && data.cards) {
              setDecks(data.decks);
              localStorage.setItem('simanki_decks', JSON.stringify(data.decks));
              setCards(data.cards);
              localStorage.setItem('simanki_cards', JSON.stringify(data.cards));
              if (data.settings) {
                const savedSettings = localStorage.getItem('simanki_settings');
                const parsed = savedSettings ? JSON.parse(savedSettings) : {};
                const merged = { ...parsed, ...data.settings, syncCode: activeSyncCode };
                setSettings(merged);
                localStorage.setItem('simanki_settings', JSON.stringify(merged));
              }
              setLastModified(cloudLastModified);
              localStorage.setItem('simanki_last_modified', String(cloudLastModified));
              console.log("Auto-sync: Silently updated state from cloud on startup!", cloudLastModified, localTS);
            } else {
              console.log("Auto-sync: Startup check - local state is already newer or up to date.", localTS, cloudLastModified);
            }
          }
        } catch (e) {
          console.error("Auto-sync silent startup pull failed:", e);
        }
      };
      silentPull();
    }
  }, []);

  // Background polling for auto-sync
  useEffect(() => {
    if (!settings.syncCode) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://extendsclass.com/api/json-storage/bin/${settings.syncCode}`);
        if (res.ok) {
          const data = await res.json();
          const cloudLastModified = Number(data.lastModified) || 0;
          
          // Load local lastModified from localStorage directly to avoid stale state closures
          const localSaved = localStorage.getItem('simanki_last_modified');
          const localTS = localSaved ? Number(localSaved) : 0;

          if (cloudLastModified > localTS) {
            console.log("Auto-sync: Cloud data is newer. Pulling automatically...", cloudLastModified, localTS);
            
            if (data.decks) {
              setDecks(data.decks);
              localStorage.setItem('simanki_decks', JSON.stringify(data.decks));
            }
            if (data.cards) {
              setCards(data.cards);
              localStorage.setItem('simanki_cards', JSON.stringify(data.cards));
            }
            if (data.settings) {
              const savedSettings = localStorage.getItem('simanki_settings');
              const parsed = savedSettings ? JSON.parse(savedSettings) : {};
              const merged = { ...parsed, ...data.settings, syncCode: settings.syncCode };
              setSettings(merged);
              localStorage.setItem('simanki_settings', JSON.stringify(merged));
            }
            
            setLastModified(cloudLastModified);
            localStorage.setItem('simanki_last_modified', String(cloudLastModified));
          }
        }
      } catch (e) {
        console.error("Auto-sync background poll failed:", e);
      }
    }, 20000); // Poll every 20 seconds

    return () => clearInterval(interval);
  }, [settings.syncCode]);

  const triggerAutoPush = async (newDecks, newCards, customSettings = null, timestamp = null) => {
    const activeSettings = customSettings || settings;
    if (!activeSettings.syncCode) return;
    const ts = timestamp || Date.now();
    try {
      const payload = {
        decks: newDecks,
        cards: newCards,
        settings: {
          apiKey: activeSettings.apiKey,
          model: activeSettings.model,
          targetRetention: activeSettings.targetRetention,
          customInstructions: activeSettings.customInstructions,
          voiceURI: activeSettings.voiceURI
        },
        lastModified: ts
      };
      await fetch(`https://extendsclass.com/api/json-storage/bin/${activeSettings.syncCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log("Auto-sync background push success:", activeSettings.syncCode, "timestamp:", ts);
    } catch (e) {
      console.error("Auto-sync background push failed:", e);
    }
  };

  // Save changes to localStorage helper
  const saveDecks = (newDecks, skipAutoPush = false) => {
    setDecks(newDecks);
    localStorage.setItem('simanki_decks', JSON.stringify(newDecks));
    const now = Date.now();
    setLastModified(now);
    localStorage.setItem('simanki_last_modified', String(now));
    if (!skipAutoPush) {
      triggerAutoPush(newDecks, cards, null, now);
    }
  };

  const saveCards = (newCards, skipAutoPush = false) => {
    setCards(newCards);
    localStorage.setItem('simanki_cards', JSON.stringify(newCards));
    const now = Date.now();
    setLastModified(now);
    localStorage.setItem('simanki_last_modified', String(now));
    if (!skipAutoPush) {
      triggerAutoPush(decks, newCards, null, now);
    }
  };

  // --- SETTINGS CONTROL HANDLERS ---
  const handleSaveSettings = (newSettings) => {
    const cleaned = {
      ...newSettings,
      apiKey: cleanApiKey(newSettings.apiKey),
      model: cleanModelName(newSettings.model)
    };
    setSettings(cleaned);
    localStorage.setItem('simanki_settings', JSON.stringify(cleaned));
    const now = Date.now();
    setLastModified(now);
    localStorage.setItem('simanki_last_modified', String(now));
    if (cleaned.syncCode) {
      triggerAutoPush(decks, cards, cleaned, now);
    }
  };

  const handleExportData = () => {
    const backup = { decks, cards };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `simanki-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (data) => {
    saveDecks(data.decks);
    saveCards(data.cards);
  };

  const handleClearData = () => {
    localStorage.removeItem('simanki_settings');
    localStorage.removeItem('simanki_decks');
    localStorage.removeItem('simanki_cards');
    setSettings({ apiKey: '', model: 'gemini-3.5-flash', targetRetention: 90, customInstructions: '', voiceURI: '' });
    setDecks(initialDecks);
    setCards(initialCards);
    setView('dashboard');
  };

  const handleImportAnkiCards = (importedCards) => {
    let targetDeckId = activeDeckId;
    let updatedDecks = [...decks];
    
    if (!targetDeckId) {
      const structuralDeckExists = decks.some(d => d.id === 'deck-structural');
      if (structuralDeckExists) {
        targetDeckId = 'deck-structural';
      } else if (decks.length > 0) {
        targetDeckId = decks[0].id;
      } else {
        targetDeckId = `deck-imported-${Date.now()}`;
        const newDeck = {
          id: targetDeckId,
          title: 'Imported Deck',
          description: 'Flashcards imported from Anki tab-separated text file.'
        };
        updatedDecks.push(newDeck);
        saveDecks(updatedDecks);
      }
    }
    
    const newCards = importedCards.map((c, index) => ({
      id: `card-imported-${Date.now()}-${index}`,
      deckId: targetDeckId,
      question: c.question,
      concept: c.concept,
      state: null
    }));
    
    saveCards([...cards, ...newCards]);
  };

  const handlePushSync = async () => {
    setIsSyncing(true);
    const now = Date.now();
    try {
      const payload = {
        decks,
        cards,
        settings: {
          apiKey: settings.apiKey,
          model: settings.model,
          targetRetention: settings.targetRetention,
          customInstructions: settings.customInstructions,
          voiceURI: settings.voiceURI
        },
        lastModified: now
      };

      let code = settings.syncCode;
      if (code) {
        const res = await fetch(`https://extendsclass.com/api/json-storage/bin/${code}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Push failed with status ${res.status}`);
        const data = await res.json();
        if (data.status !== 0) throw new Error(data.message || 'Push update failed');
      } else {
        const res = await fetch(`https://extendsclass.com/api/json-storage/bin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Creation failed with status ${res.status}`);
        const data = await res.json();
        if (data.status !== 0) throw new Error(data.message || 'Creation failed');
        code = data.id;
        
        const updatedSettings = { ...settings, syncCode: code };
        setSettings(updatedSettings);
        localStorage.setItem('simanki_settings', JSON.stringify(updatedSettings));
      }
      setLastModified(now);
      localStorage.setItem('simanki_last_modified', String(now));
      alert(`Sync completed successfully!\n\nYour Sync Code is: ${code}\n\nUse this code on your other devices to pull your cards and progress.`);
      return code;
    } catch (err) {
      console.error(err);
      alert(`Sync failed: ${err.message}`);
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullSync = async (code) => {
    if (!code) return false;
    setIsSyncing(true);
    try {
      const res = await fetch(`https://extendsclass.com/api/json-storage/bin/${code}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Sync code not found. Make sure the code is correct.');
        }
        throw new Error(`Pull failed with status ${res.status}`);
      }
      const data = await res.json();
      
      if (data.decks && data.cards) {
        saveDecks(data.decks, true);
        saveCards(data.cards, true);
        
        if (data.settings) {
          const mergedSettings = {
            ...settings,
            ...data.settings,
            syncCode: code
          };
          setSettings(mergedSettings);
          localStorage.setItem('simanki_settings', JSON.stringify(mergedSettings));
        } else {
          const updatedSettings = { ...settings, syncCode: code };
          setSettings(updatedSettings);
          localStorage.setItem('simanki_settings', JSON.stringify(updatedSettings));
        }
        const cloudLastModified = Number(data.lastModified) || Date.now();
        setLastModified(cloudLastModified);
        localStorage.setItem('simanki_last_modified', String(cloudLastModified));
        alert('Data synchronized successfully from the cloud!');
        return true;
      } else {
        throw new Error('Invalid cloud data format.');
      }
    } catch (err) {
      console.error(err);
      alert(`Sync failed: ${err.message}`);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // --- DECK MANAGEMENT HANDLERS ---
  const handleCreateDeck = (title, description) => {
    const newDeck = {
      id: `deck-${Date.now()}`,
      title,
      description
    };
    saveDecks([...decks, newDeck]);
  };

  const handleDeleteDeck = (deckId) => {
    const updatedDecks = decks.filter(d => d.id !== deckId);
    saveDecks(updatedDecks);
    // Delete all cards associated with that deck
    const updatedCards = cards.filter(c => c.deckId !== deckId);
    saveCards(updatedCards);
  };

  // --- CARD MANAGEMENT HANDLERS ---
  const handleAddCard = (deckId, question, concept) => {
    const newCard = {
      id: `card-${Date.now()}`,
      deckId,
      question,
      concept,
      state: null
    };
    saveCards([...cards, newCard]);
  };

  const handleDeleteCard = (cardId) => {
    const updatedCards = cards.filter(c => c.id !== cardId);
    saveCards(updatedCards);
  };

  // --- STUDY SESSION CONTROL HANDLERS ---
  const handleStartStudy = (deckId) => {
    setActiveDeckId(deckId);
    
    // Get due cards once and freeze them for the session
    const deckCards = cards.filter(c => c.deckId === deckId);
    const due = deckCards.filter(card => {
      if (!card.state || !card.state.dueDate) return true;
      const due = new Date(card.state.dueDate);
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      return due <= now;
    });
    
    setSessionCards(due);
    setView('study');
  };

  const handleRateCard = (cardId, rating, userAnswer, score, logicAnalysis, confidence, timeSpent, simulation = null) => {
    const updatedCards = cards.map(card => {
      if (card.id === cardId) {
        const nextState = calculateNextState(card, rating, settings.targetRetention);
        
        // Log history entry
        const historyEntry = {
          date: new Date().toISOString(),
          userAnswer,
          score,
          logicAnalysis,
          confidence,
          timeSpent,
          rating,
          simulation
        };
        
        return {
          ...card,
          state: nextState,
          history: [...(card.history || []), historyEntry]
        };
      }
      return card;
    });
    saveCards(updatedCards);
    
    // Update local sessionCards to keep stable indices
    setSessionCards(prev => prev.map(c => {
      if (c.id === cardId) {
        const nextState = calculateNextState(c, rating, settings.targetRetention);
        const historyEntry = {
          date: new Date().toISOString(),
          userAnswer,
          score,
          logicAnalysis,
          confidence,
          timeSpent,
          rating,
          simulation
        };
        return {
          ...c,
          state: nextState,
          history: [...(c.history || []), historyEntry]
        };
      }
      return c;
    }));
  };

  // Helper to filter currently due cards in selected deck
  const getDueCards = () => {
    const deckCards = cards.filter(c => c.deckId === activeDeckId);
    // We sort such that failed cards (due immediately) appear first
    return deckCards.filter(card => {
      if (!card.state || !card.state.dueDate) return true;
      const due = new Date(card.state.dueDate);
      const now = new Date();
      now.setHours(23, 59, 59, 999); // Due today includes cards due by midnight
      return due <= now;
    });
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Settings warning header (if no key is saved) */}
      {view === 'dashboard' && !settings.apiKey && (
        <div 
          className="glass-panel" 
          style={{ 
            padding: '0.85rem 1.25rem', 
            background: 'rgba(245, 158, 11, 0.08)', 
            border: '1px solid rgba(245, 158, 11, 0.3)', 
            borderRadius: '10px',
            color: '#fcd34d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            textAlign: 'left',
            fontSize: '0.9rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={18} />
            <span><strong>Gemini API Key missing.</strong> Enter your key in Settings to enable AI grading and custom simulations.</span>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => setView('settings')} 
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fcd34d' }}
          >
            Configure Now
          </button>
        </div>
      )}

      {/* Main Views Routing */}
      {view === 'dashboard' && (
        <Dashboard
          Decks={decks}
          Cards={cards}
          settings={settings}
          onCreateDeck={handleCreateDeck}
          onDeleteDeck={handleDeleteDeck}
          onAddCard={handleAddCard}
          onDeleteCard={handleDeleteCard}
          onStartStudy={handleStartStudy}
          onOpenSettings={() => setView('settings')}
        />
      )}

      {view === 'settings' && (
        <Settings
          settings={settings}
          onSaveSettings={handleSaveSettings}
          onBack={() => setView('dashboard')}
          onExportData={handleExportData}
          onImportData={handleImportData}
          onClearData={handleClearData}
          onImportAnkiCards={handleImportAnkiCards}
          onPushSync={handlePushSync}
          onPullSync={handlePullSync}
          isSyncing={isSyncing}
        />
      )}

      {view === 'study' && activeDeckId && (
        (() => {
          const activeDeck = decks.find(d => d.id === activeDeckId);

          if (!settings.apiKey) {
            return (
              <div className="glass-panel animate-fade-in" style={{ padding: '3rem', maxWidth: '500px', margin: '3rem auto', textAlign: 'center' }}>
                <ShieldAlert size={48} style={{ color: 'var(--warning)', marginBottom: '1rem' }} />
                <h3>API Key Required</h3>
                <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>
                  You must configure a Gemini API key in settings before you can start an AI-enabled study session.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={() => setView('dashboard')}>
                    Back to Dashboard
                  </button>
                  <button className="btn btn-primary" onClick={() => setView('settings')}>
                    Configure Settings
                  </button>
                </div>
              </div>
            );
          }

          return (
            <StudySession
              Deck={activeDeck}
              DueCards={sessionCards}
              apiKey={settings.apiKey}
              model={settings.model}
              targetRetention={settings.targetRetention}
              customInstructions={settings.customInstructions || ''}
              voiceURI={settings.voiceURI || ''}
              onRateCard={handleRateCard}
              onClose={() => setView('dashboard')}
            />
          );
        })()
      )}
    </div>
  );
}

// Clean single backslashes in JSON strings that are not valid JSON escape sequences
function escapeJsonLaTeX(str) {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
      continue;
    }
    
    if (inString && char === '\\') {
      const nextChar = str[i + 1];
      if (nextChar === '"') {
        result += '\\"';
        i += 2;
      } else if (nextChar === '\\') {
        result += '\\\\';
        i += 2;
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}
