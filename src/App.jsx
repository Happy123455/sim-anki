import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import StudySession from './components/StudySession';
import { calculateNextState } from './utils/srs';
import { ShieldAlert, BookOpen, Layers } from 'lucide-react';

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
  }
];

export default function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'settings' | 'study'
  const [settings, setSettings] = useState({ apiKey: '', model: 'gemini-3.5-flash', targetRetention: 90, customInstructions: '' });
  const [decks, setDecks] = useState(initialDecks);
  const [cards, setCards] = useState(initialCards);
  const [activeDeckId, setActiveDeckId] = useState(null);

  // Load state from localStorage on init
  useEffect(() => {
    const savedSettings = localStorage.getItem('simanki_settings');
    const savedDecks = localStorage.getItem('simanki_decks');
    const savedCards = localStorage.getItem('simanki_cards');

    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedDecks) setDecks(JSON.parse(savedDecks));
    if (savedCards) setCards(JSON.parse(savedCards));
  }, []);

  // Save changes to localStorage helper
  const saveDecks = (newDecks) => {
    setDecks(newDecks);
    localStorage.setItem('simanki_decks', JSON.stringify(newDecks));
  };

  const saveCards = (newCards) => {
    setCards(newCards);
    localStorage.setItem('simanki_cards', JSON.stringify(newCards));
  };

  // --- SETTINGS CONTROL HANDLERS ---
  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('simanki_settings', JSON.stringify(newSettings));
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
    setSettings({ apiKey: '', model: 'gemini-3.5-flash', targetRetention: 90, customInstructions: '' });
    setDecks([]);
    setCards([]);
    setView('dashboard');
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
    setView('study');
  };

  const handleRateCard = (cardId, rating, userAnswer, score, logicAnalysis, confidence, timeSpent) => {
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
          rating
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
        />
      )}

      {view === 'study' && activeDeckId && (
        (() => {
          const activeDeck = decks.find(d => d.id === activeDeckId);
          const dueCards = getDueCards();

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
              DueCards={dueCards}
              apiKey={settings.apiKey}
              model={settings.model}
              targetRetention={settings.targetRetention}
              customInstructions={settings.customInstructions || ''}
              onRateCard={handleRateCard}
              onClose={() => setView('dashboard')}
            />
          );
        })()
      )}
    </div>
  );
}
