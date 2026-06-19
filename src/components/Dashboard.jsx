import React, { useState, useEffect } from 'react';
import { Play, Plus, Trash2, Edit3, Settings, BookOpen, Layers, X, Calendar, AlertTriangle, TrendingUp } from 'lucide-react';
import { isDue } from '../utils/srs';
import CardProgressDetails from './CardProgressDetails';


export default function Dashboard({ Decks, Cards, settings = {}, onCreateDeck, onDeleteDeck, onAddCard, onDeleteCard, onStartStudy, onOpenSettings }) {
  const [showCreateDeckModal, setShowCreateDeckModal] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');

  const [activeDeckId, setActiveDeckId] = useState(null); // To manage cards in a specific deck
  const [newCardQuestion, setNewCardQuestion] = useState('');
  const [newCardConcept, setNewCardConcept] = useState('');
  const [activeCardDetails, setActiveCardDetails] = useState(null); // To open stats/progress details modal
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState('');

  useEffect(() => {
    if (showAddCardModal) {
      setSelectedDeckId(activeDeckId || (Decks.length > 0 ? Decks[0].id : ''));
    }
  }, [showAddCardModal, activeDeckId, Decks]);


  const handleCreateDeckSubmit = (e) => {
    e.preventDefault();
    if (!newDeckTitle.trim()) return;
    onCreateDeck(newDeckTitle, newDeckDesc);
    setNewDeckTitle('');
    setNewDeckDesc('');
    setShowCreateDeckModal(false);
  };

  const handleAddCardSubmit = (e) => {
    e.preventDefault();
    if (!selectedDeckId || !newCardQuestion.trim() || !newCardConcept.trim()) return;
    onAddCard(selectedDeckId, newCardQuestion, newCardConcept);
    setNewCardQuestion('');
    setNewCardConcept('');
  };

  // Helper to compute card counts for a deck
  const getDeckStats = (deckId) => {
    const deckCards = Cards.filter(c => c.deckId === deckId);
    const dueCount = deckCards.filter(isDue).length;
    const newCount = deckCards.filter(c => !c.state || c.state.repetitions === 0).length;
    return {
      total: deckCards.length,
      due: dueCount,
      new: newCount,
      graduated: deckCards.length - newCount
    };
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
        <div>
          <h1 style={{ background: 'linear-gradient(135deg, #a78bfa, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '3rem', margin: 0, fontWeight: 800 }}>
            SimAnki
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginTop: '0.25rem' }}>
            Spaced Repetition with AI Grading & Interactive Simulations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={onOpenSettings} style={{ gap: '0.5rem' }}>
            <Settings size={18} /> Settings
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowAddCardModal(true)}
            disabled={Decks.length === 0}
            style={{ gap: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', opacity: Decks.length === 0 ? 0.5 : 1, cursor: Decks.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <Plus size={18} /> Add Card
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateDeckModal(true)} style={{ gap: '0.5rem' }}>
            <Plus size={18} /> Create Deck
          </button>
        </div>
      </div>

      {/* Decks Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {Decks.map(deck => {
          const stats = getDeckStats(deck.id);
          const isSelected = activeDeckId === deck.id;

          return (
            <div 
              key={deck.id} 
              className={`glass-panel glass-panel-hover ${isSelected ? 'active-deck' : ''}`}
              style={{ 
                padding: '1.5rem', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)',
                boxShadow: isSelected ? '0 0 15px rgba(139, 92, 246, 0.25)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>{deck.title}</h3>
                  <button 
                    className="btn-text"
                    onClick={() => {
                      if (confirm(`Delete the deck "${deck.title}" and all its cards?`)) {
                        onDeleteDeck(deck.id);
                        if (activeDeckId === deck.id) setActiveDeckId(null);
                      }
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                  >
                    <Trash2 size={16} hover-target="true" />
                  </button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem', height: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {deck.description || "No description provided."}
                </p>

                {/* Badges / Stats */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-due">{stats.due} Due</span>
                  <span className="badge badge-new">{stats.new} New</span>
                  <span className="badge badge-learn" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.3)' }}>{stats.total} Total</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => onStartStudy(deck.id)}
                  disabled={stats.total === 0}
                  style={{ flex: 1.2, gap: '0.35rem', opacity: stats.total === 0 ? 0.5 : 1, cursor: stats.total === 0 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', padding: '0.5rem' }}
                >
                  <Play size={14} /> Study
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setActiveDeckId(deck.id);
                    setShowAddCardModal(true);
                  }}
                  style={{ gap: '0.35rem', fontSize: '0.85rem', padding: '0.5rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#34d399' }}
                >
                  <Plus size={14} /> + Card
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setActiveDeckId(isSelected ? null : deck.id)}
                  style={{ gap: '0.35rem', fontSize: '0.85rem', padding: '0.5rem' }}
                >
                  <Layers size={14} /> Cards ({stats.total})
                </button>
              </div>
            </div>
          );
        })}

        {Decks.length === 0 && (
          <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Layers size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
            <h3>No Decks Found</h3>
            <p style={{ margin: '0.5rem 0 1.5rem' }}>Create your first deck to get started with Spaced Repetition Simulations.</p>
            <button className="btn btn-primary" onClick={() => setShowCreateDeckModal(true)}>
              <Plus size={18} /> Create Deck
            </button>
          </div>
        )}
      </div>

      {/* Card Manager Panel (Slide down for selected deck) */}
      {activeDeckId && (
        <div className="glass-panel animate-fade-in" style={{ padding: '2rem', border: '1px solid var(--border-light)', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={22} style={{ color: 'var(--accent-primary)' }} />
              Manage Cards: {Decks.find(d => d.id === activeDeckId)?.title}
            </h2>
            <button 
              className="btn btn-secondary" 
              onClick={() => setActiveDeckId(null)} 
              style={{ padding: '0.5rem', borderRadius: '50%' }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', textAlign: 'left', margin: 0 }}>
                Existing Cards ({Cards.filter(c => c.deckId === activeDeckId).length})
              </h3>
              <button 
                className="btn btn-primary" 
                onClick={() => setShowAddCardModal(true)}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Plus size={16} /> Add New Card
              </button>
            </div>

            {/* Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '550px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {Cards.filter(c => c.deckId === activeDeckId).map((card, idx) => {
                const dueStatus = isDue(card);
                return (
                  <div 
                    key={card.id} 
                    className="glass-panel" 
                    style={{ 
                      padding: '1rem 1.25rem', 
                      background: 'rgba(9, 9, 11, 0.2)',
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: '1.5rem' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                        {idx + 1}. {card.question}
                      </p>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'rgba(139, 92, 246, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>
                          Concept: {card.concept}
                        </span>
                        {card.state ? (
                          <>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Calendar size={12} /> Interval: {card.state.interval}d
                            </span>
                            {card.state.consecutiveFails > 0 && (
                              <span style={{ fontSize: '0.75rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <AlertTriangle size={12} /> Fails: {card.state.consecutiveFails}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--info)' }}>New Card</span>
                        )}
                        <span className={`badge ${dueStatus ? 'badge-due' : 'badge-learn'}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                          {dueStatus ? 'Due' : 'Scheduled'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button 
                        className="btn-text" 
                        onClick={() => setActiveCardDetails(card)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center' }}
                        title="View Progress Details & History"
                        type="button"
                      >
                        <TrendingUp size={16} />
                      </button>
                      <button 
                        className="btn-text" 
                        onClick={() => onDeleteCard(card.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center' }}
                        title="Delete Card"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {Cards.filter(c => c.deckId === activeDeckId).length === 0 && (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No cards in this deck yet. Create one on the left to start!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Deck Modal */}
      {showCreateDeckModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-panel animate-fade-in" style={{ padding: '2rem', width: '100%', maxWidth: '500px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem' }}>Create New Deck</h2>
              <button 
                onClick={() => setShowCreateDeckModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateDeckSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Deck Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. Structural Engineering"
                  value={newDeckTitle}
                  onChange={(e) => setNewDeckTitle(e.target.value)}
                  required 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Description</label>
                <textarea 
                  placeholder="e.g. Cards covering limit states, working stress design, prestressed concrete, and beam mechanics."
                  value={newDeckDesc}
                  onChange={(e) => setNewDeckDesc(e.target.value)}
                  style={{ minHeight: '80px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setShowCreateDeckModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit">
                  Create Deck
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAddCardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }} className="animate-fade-in">
          <div 
            className="glass-panel" 
            style={{ 
              width: '100%', 
              maxWidth: '500px', 
              padding: '2rem', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1.5rem', 
              position: 'relative',
              border: '1px solid var(--border-light)',
              background: 'rgba(15, 15, 20, 0.9)'
            }}
          >
            <button 
              className="btn-text" 
              onClick={() => setShowAddCardModal(false)}
              style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.35rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
              <Plus size={22} style={{ color: 'var(--accent-primary)' }} /> Add New Flashcard
            </h3>

            <form onSubmit={(e) => {
              handleAddCardSubmit(e);
              setShowAddCardModal(false);
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'left' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>Select Target Deck</label>
                <select 
                  value={selectedDeckId} 
                  onChange={(e) => setSelectedDeckId(e.target.value)}
                  style={{ fontSize: '0.9rem' }}
                  required
                >
                  <option value="" disabled>-- Select a Deck --</option>
                  {Decks.map(d => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>Card Question</label>
                <textarea 
                  placeholder="e.g. What is the minimum grade of concrete allowed for RCC per IS 456?"
                  value={newCardQuestion}
                  onChange={(e) => setNewCardQuestion(e.target.value)}
                  style={{ fontSize: '0.9rem', minHeight: '120px', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>Core Concept Keywords</label>
                <input 
                  type="text"
                  placeholder="e.g. minimum grade concrete RCC IS 456, M20"
                  value={newCardConcept}
                  onChange={(e) => setNewCardConcept(e.target.value)}
                  style={{ fontSize: '0.9rem' }}
                  required
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  Keywords help the AI grade your answer and customize the dynamic simulations.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setShowAddCardModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit">
                  Create Flashcard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {activeCardDetails && (
        <CardProgressDetails 
          card={activeCardDetails} 
          voiceURI={settings.voiceURI || ''}
          onClose={() => setActiveCardDetails(null)} 
        />
      )}
    </div>
  );
}
