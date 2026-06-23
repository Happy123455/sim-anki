import React, { useState, useEffect, useRef } from 'react';
import { Play, Plus, Trash2, Edit3, Settings, BookOpen, Layers, X, Calendar, AlertTriangle, TrendingUp, Upload, Image, Search, Filter, BarChart3, Activity, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { isDue } from '../utils/srs';
import CardProgressDetails from './CardProgressDetails';
import ImportModal from './ImportModal';
import { generateMindMap } from '../utils/gemini';

export default function Dashboard({ Decks, Cards, settings = {}, onCreateDeck, onDeleteDeck, onAddCard, onDeleteCard, onStartStudy, onOpenSettings, onImportCards, onBulkDeleteCards, onMoveCards, onUpdateDeckMindMap }) {
  const [showCreateDeckModal, setShowCreateDeckModal] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');

  const [activeDeckId, setActiveDeckId] = useState(null); // To manage cards in a specific deck
  const [newCardQuestion, setNewCardQuestion] = useState('');
  const [newCardConcept, setNewCardConcept] = useState('');
  const [newCardImageUrl, setNewCardImageUrl] = useState('');
  const [newCardYoutubeUrl, setNewCardYoutubeUrl] = useState('');
  
  const [activeCardDetails, setActiveCardDetails] = useState(null); // To open stats/progress details modal
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState('');

  // Filters State for Manage Cards
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [stabilityFilter, setStabilityFilter] = useState('');
  const [repsFilter, setRepsFilter] = useState('');
  const [failsFilter, setFailsFilter] = useState('');
  
  // Sorting & Deck Scope State
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [searchAllDecks, setSearchAllDecks] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [futureDueRange, setFutureDueRange] = useState('1 month');
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [deckTab, setDeckTab] = useState('cards'); // 'cards' | 'mindmap'
  const [isGeneratingMindMap, setIsGeneratingMindMap] = useState(false);
  const [mindMapGenError, setMindMapGenError] = useState(null);

  // Clear selection and reset tab when deck, search, or filters change
  useEffect(() => {
    setSelectedCardIds([]);
  }, [activeDeckId, searchQuery, difficultyFilter, stabilityFilter, repsFilter, failsFilter, searchAllDecks]);

  useEffect(() => {
    setDeckTab('cards');
  }, [activeDeckId]);

  const fileInputRef = useRef(null);

  const compressImage = (base64Str, maxWidth = 800, maxHeight = 600) => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large. Please select an image under 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result);
      setNewCardImageUrl(compressed);
    };
    reader.readAsDataURL(file);
  };

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
    onAddCard(selectedDeckId, newCardQuestion, newCardConcept, newCardImageUrl, newCardYoutubeUrl);
    setNewCardQuestion('');
    setNewCardConcept('');
    setNewCardImageUrl('');
    setNewCardYoutubeUrl('');
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

  const getEstimatedStudyTime = (deckId) => {
    const deckCards = Cards.filter(c => c.deckId === deckId);
    const dueCards = deckCards.filter(isDue);
    if (dueCards.length === 0) return null;

    const buffer = 8; // 8 seconds buffer per card (for grading, voiceovers, etc.)
    let totalEstimatedSeconds = 0;
    let cardsWithHistory = 0;
    let sumHistoricalTimes = 0;

    dueCards.forEach(card => {
      const history = card.history || [];
      // Filter out outliers from history (reviews taking more than 120s)
      const validHistory = history.filter(h => h.timeSpent && h.timeSpent > 0 && h.timeSpent <= 120);
      
      if (validHistory.length > 0) {
        // Average of valid historical times for this card
        const avgTime = validHistory.reduce((sum, h) => sum + h.timeSpent, 0) / validHistory.length;
        totalEstimatedSeconds += avgTime + buffer;
        sumHistoricalTimes += avgTime;
        cardsWithHistory++;
      } else {
        // Default baseline for new or unreviewed cards: 20 seconds + buffer
        totalEstimatedSeconds += 20 + buffer;
      }
    });

    const averageAnswerTime = cardsWithHistory > 0 
      ? Math.round(sumHistoricalTimes / cardsWithHistory) 
      : 20;

    const formattedTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      if (mins === 0) return `${secs}s`;
      return `${mins}m ${secs}s`;
    };

    return {
      total: formattedTime(totalEstimatedSeconds),
      avg: `${averageAnswerTime}s`,
      buffer: `${buffer}s`
    };
  };

  const handleGenerateMindMap = async () => {
    if (!settings.apiKey) {
      setMindMapGenError("Gemini API Key is missing. Please set it in Settings.");
      return;
    }
    const deck = Decks.find(d => d.id === activeDeckId);
    if (!deck) return;

    setIsGeneratingMindMap(true);
    setMindMapGenError(null);

    try {
      const deckCards = Cards.filter(c => c.deckId === activeDeckId);
      const mindMap = await generateMindMap(
        settings.apiKey,
        settings.model || 'gemini-3.5-flash',
        deck.title,
        deck.description || '',
        deckCards
      );
      
      onUpdateDeckMindMap(activeDeckId, mindMap);
    } catch (err) {
      console.error("Failed to generate mind map:", err);
      setMindMapGenError(err.message || "Failed to generate mind map. Please check your API key and try again.");
    } finally {
      setIsGeneratingMindMap(false);
    }
  };

  const filteredCards = Cards.filter(card => {
    if (!searchAllDecks && card.deckId !== activeDeckId) return false;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchQ = (card.question || '').toLowerCase().includes(q);
      const matchC = (card.concept || '').toLowerCase().includes(q);
      if (!matchQ && !matchC) return false;
    }
    
    const state = card.state;
    const d = state ? state.difficulty : 0;
    const s = state ? state.stability : 0;
    const reps = state ? state.repetitions : 0;
    const fails = state ? (state.consecutiveFails || 0) : 0;
    
    if (difficultyFilter) {
      if (difficultyFilter === 'new') {
        if (state) return false;
      } else {
        if (!state) return false;
        if (difficultyFilter === 'easy' && d >= 3) return false;
        if (difficultyFilter === 'medium' && (d < 3 || d > 7)) return false;
        if (difficultyFilter === 'hard' && d <= 7) return false;
      }
    }
    
    if (stabilityFilter) {
      if (stabilityFilter === 'new') {
        if (state) return false;
      } else {
        if (!state) return false;
        if (stabilityFilter === 'low' && s >= 3) return false;
        if (stabilityFilter === 'medium' && (s < 3 || s > 14)) return false;
        if (stabilityFilter === 'high' && s <= 14) return false;
      }
    }
    
    if (repsFilter) {
      if (repsFilter === 'zero' && reps > 0) return false;
      if (repsFilter === 'few' && (reps === 0 || reps > 4)) return false;
      if (repsFilter === 'many' && reps <= 4) return false;
    }
    
    if (failsFilter) {
      if (failsFilter === 'none' && fails > 0) return false;
      if (failsFilter === 'some' && fails === 0) return false;
      if (failsFilter === 'many' && fails < 3) return false;
    }
    
    return true;
  });

  const sortedCards = [...filteredCards].sort((a, b) => {
    if (!sortBy) return 0;
    
    const stateA = a.state;
    const stateB = b.state;
    
    let valA = 0;
    let valB = 0;
    
    if (sortBy === 'difficulty') {
      valA = stateA ? stateA.difficulty : 0;
      valB = stateB ? stateB.difficulty : 0;
    } else if (sortBy === 'stability') {
      valA = stateA ? stateA.stability : 0;
      valB = stateB ? stateB.stability : 0;
    } else if (sortBy === 'reps') {
      valA = stateA ? stateA.repetitions : 0;
      valB = stateB ? stateB.repetitions : 0;
    } else if (sortBy === 'fails') {
      valA = stateA ? (stateA.consecutiveFails || 0) : 0;
      valB = stateB ? (stateB.consecutiveFails || 0) : 0;
    } else if (sortBy === 'recent') {
      valA = a.history && a.history.length > 0 ? new Date(a.history[a.history.length - 1].date).getTime() : 0;
      valB = b.history && b.history.length > 0 ? new Date(b.history[b.history.length - 1].date).getTime() : 0;
    }
    
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Trigger MathJax typesetting when list filters or deck change
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      setTimeout(() => {
        if (window.MathJax && window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise().catch((err) => console.log('MathJax typesetting failed in Dashboard:', err));
        }
      }, 50);
    }
  }, [
    searchQuery,
    difficultyFilter,
    stabilityFilter,
    repsFilter,
    failsFilter,
    sortBy,
    sortOrder,
    searchAllDecks,
    activeDeckId,
    Cards
  ]);

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
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onOpenSettings} style={{ gap: '0.5rem' }}>
            <Settings size={18} /> Settings
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowImportModal(true)}
            style={{ gap: '0.5rem', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c084fc' }}
          >
            <Upload size={18} /> Import Cards
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

                {stats.due > 0 && (() => {
                  const est = getEstimatedStudyTime(deck.id);
                  if (!est) return null;
                  return (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: 'var(--text-secondary)', 
                      background: 'rgba(255, 255, 255, 0.02)', 
                      border: '1px solid var(--border-light)', 
                      borderRadius: '6px', 
                      padding: '0.4rem 0.6rem', 
                      marginTop: '-0.75rem', 
                      marginBottom: '1rem',
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center' 
                    }}>
                      <span>Estimated: <strong style={{ color: 'var(--accent-primary)' }}>{est.total}</strong></span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Avg: {est.avg} (+{est.buffer} buffer)</span>
                    </div>
                  );
                })()}
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

      {/* ──── Statistics Section: Future Due & Calendar Heatmap ──── */}
      {Cards.length > 0 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem 2rem', border: '1px solid var(--border-light)', marginTop: '1.5rem' }}>
          <div 
            onClick={() => setShowStats(!showStats)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <h2 style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <BarChart3 size={22} style={{ color: 'var(--accent-primary)' }} /> Statistics
            </h2>
            {showStats ? <ChevronUp size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} />}
          </div>

          {showStats && (() => {
            // ── 1. Calculate future due limit ──
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let limitDays = 30;
            if (futureDueRange === '3 months') limitDays = 90;
            else if (futureDueRange === '1 year') limitDays = 365;
            else if (futureDueRange === 'all') {
              let maxDiff = 30;
              Cards.forEach(c => {
                if (c.state && c.state.dueDate) {
                  const due = new Date(c.state.dueDate);
                  const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
                  if (diff > maxDiff) maxDiff = diff;
                }
              });
              limitDays = Math.min(365, maxDiff);
            }

            // ── 2. Populate Future Due data ──
            const futureDueData = new Array(limitDays).fill(0);
            let overdueCount = 0;

            Cards.forEach(card => {
              if (!card.state || !card.state.dueDate) {
                futureDueData[0]++; // New cards are due today
                return;
              }
              const due = new Date(card.state.dueDate);
              due.setHours(0, 0, 0, 0);
              const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
              if (diffDays <= 0) {
                futureDueData[0]++;
              } else if (diffDays < limitDays) {
                futureDueData[diffDays]++;
              }
            });

            // Cumulative sum
            let runningSum = 0;
            const cumulativeData = futureDueData.map(v => {
              runningSum += v;
              return runningSum;
            });
            const totalReviews = runningSum;
            const dueTomorrowCount = futureDueData[1] || 0;
            const averageReviews = (totalReviews / limitDays).toFixed(1);
            const dailyLoad = (totalReviews / limitDays).toFixed(1);

            // Future Due SVG values
            const svgWidth = 450;
            const svgHeight = 180;
            const paddingLeft = 35;
            const paddingRight = 35;
            const paddingTop = 15;
            const paddingBottom = 20;
            const chartW = svgWidth - paddingLeft - paddingRight;
            const chartH = svgHeight - paddingTop - paddingBottom;
            const barGap = chartW / limitDays;
            const barWidth = Math.max(0.6, barGap * 0.6);

            const maxDailyCount = Math.max(...futureDueData, 1);
            const safeMaxDaily = Math.max(maxDailyCount, 1);
            const safeTotal = Math.max(totalReviews, 1);

            // Points for cumulative line
            const points = futureDueData.map((val, i) => {
              const x = paddingLeft + i * barGap + barGap / 2;
              const y = paddingTop + chartH - (totalReviews > 0 ? (cumulativeData[i] / safeTotal) * chartH : 0);
              return { x, y };
            });

            // Path for cumulative shaded area & line
            let areaPath = '';
            let linePath = '';
            if (points.length > 0) {
              areaPath = `M ${points[0].x} ${paddingTop + chartH} ` + points.map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${points[points.length - 1].x} ${paddingTop + chartH} Z`;
              linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
            }

            // Left axis labels (unique daily counts)
            const leftLabels = [];
            const steps = maxDailyCount > 5 ? 5 : maxDailyCount;
            for (let i = 0; i <= steps; i++) {
              const pct = i / steps;
              const val = Math.round(maxDailyCount * pct);
              const y = paddingTop + chartH - pct * chartH;
              if (!leftLabels.some(l => l.val === val)) leftLabels.push({ val, y });
            }

            // Right axis labels (unique cumulative counts)
            const rightLabels = [];
            const cSteps = totalReviews > 5 ? 5 : totalReviews;
            for (let i = 0; i <= cSteps; i++) {
              const pct = i / cSteps;
              const val = Math.round(totalReviews * pct);
              const y = paddingTop + chartH - pct * chartH;
              if (!rightLabels.some(r => r.val === val)) rightLabels.push({ val, y });
            }

            // X axis labels
            const xLabels = [];
            if (futureDueRange === '1 month') {
              for (let i = 5; i <= 30; i += 5) {
                if (i < limitDays) xLabels.push({ label: `${i}`, index: i });
              }
            } else if (futureDueRange === '3 months') {
              for (let i = 15; i <= 90; i += 15) {
                if (i < limitDays) xLabels.push({ label: `${i}`, index: i });
              }
            } else {
              const interval = Math.floor(limitDays / 5);
              for (let i = interval; i <= limitDays; i += interval) {
                xLabels.push({ label: `${i}`, index: i - 1 });
              }
            }

            // ── 3. Build Calendar Heatmap grid cells ──
            const jan1 = new Date(calendarYear, 0, 1);
            const startDay = jan1.getDay(); // 0 = Sun
            const cells = [];
            const reviewCounts = {};

            Cards.forEach(card => {
              (card.history || []).forEach(h => {
                const d = new Date(h.date);
                if (d.getFullYear() === calendarYear) {
                  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                  reviewCounts[key] = (reviewCounts[key] || 0) + 1;
                }
              });
            });

            for (let col = 0; col < 53; col++) {
              for (let row = 0; row < 7; row++) {
                const dayOffset = col * 7 + row - startDay;
                const date = new Date(calendarYear, 0, 1 + dayOffset);
                if (date.getFullYear() === calendarYear) {
                  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                  const count = reviewCounts[key] || 0;
                  cells.push({ col, row, date, count });
                }
              }
            }

            const getCellColor = (count) => {
              if (count === 0) return 'rgba(255, 255, 255, 0.04)';
              if (count === 1) return 'rgba(59, 130, 246, 0.3)';
              if (count === 2) return 'rgba(59, 130, 246, 0.55)';
              if (count === 3) return 'rgba(59, 130, 246, 0.8)';
              return 'rgb(59, 130, 246)'; // bright blue
            };

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginTop: '1.25rem' }}>
                
                {/* ── Future Due Card ── */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '12px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>Future Due</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>The number of reviews due in the future.</span>
                  
                  {/* Radio Buttons */}
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    {['1 month', '3 months', '1 year', 'all'].map(option => (
                      <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: futureDueRange === option ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        <input 
                          type="radio" 
                          name="futureDueRange" 
                          value={option} 
                          checked={futureDueRange === option} 
                          onChange={() => setFutureDueRange(option)}
                          style={{ accentColor: '#10b981', cursor: 'pointer' }}
                        />
                        {option}
                      </label>
                    ))}
                  </div>

                  {/* Future Due SVG Chart */}
                  <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="auto" style={{ overflow: 'visible', maxWidth: '450px' }}>
                      {/* Grid lines */}
                      {leftLabels.map((l, i) => (
                        <line key={`grid-${i}`} x1={paddingLeft} y1={l.y} x2={paddingLeft + chartW} y2={l.y} stroke="rgba(255,255,255,0.05)" />
                      ))}

                      {/* Cumulative Area */}
                      {areaPath && <path d={areaPath} fill="rgba(255, 255, 255, 0.08)" />}
                      {linePath && <path d={linePath} fill="none" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.5" />}

                      {/* Bars */}
                      {futureDueData.map((val, idx) => {
                        const barH = (val / safeMaxDaily) * chartH;
                        const x = paddingLeft + idx * barGap + (barGap - barWidth) / 2;
                        const y = paddingTop + chartH - barH;
                        return (
                          <rect 
                            key={`bar-${idx}`}
                            x={x}
                            y={y}
                            width={Math.max(0.5, barWidth)}
                            height={Math.max(barH, 0)}
                            fill="#2ecc71"
                            rx={barWidth > 3 ? 1 : 0}
                            ry={barWidth > 3 ? 1 : 0}
                          >
                            <title>{`Day ${idx}: ${val} due`}</title>
                          </rect>
                        );
                      })}

                      {/* Axis lines */}
                      <line x1={paddingLeft} y1={paddingTop + chartH} x2={paddingLeft + chartW} y2={paddingTop + chartH} stroke="rgba(255,255,255,0.15)" />

                      {/* Left Labels */}
                      {leftLabels.map((l, idx) => (
                        <text key={`l-${idx}`} x={paddingLeft - 8} y={l.y + 3} fill="var(--text-muted)" fontSize="8" textAnchor="end">{l.val}</text>
                      ))}

                      {/* Right Labels */}
                      {rightLabels.map((r, idx) => (
                        <text key={`r-${idx}`} x={paddingLeft + chartW + 8} y={r.y + 3} fill="var(--text-muted)" fontSize="8" textAnchor="start">{r.val}</text>
                      ))}

                      {/* X labels */}
                      {xLabels.map((xl, idx) => {
                        const x = paddingLeft + xl.index * barGap + barGap / 2;
                        return (
                          <text key={`xl-${idx}`} x={x} y={paddingTop + chartH + 12} fill="var(--text-muted)" fontSize="8" textAnchor="middle">{xl.label}</text>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Statistics text block */}
                  <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <span>Total: <strong style={{ color: 'var(--text-primary)' }}>{totalReviews} reviews</strong></span>
                    <span>Average: <strong style={{ color: 'var(--text-primary)' }}>{averageReviews} reviews/day</strong></span>
                    <span>Due tomorrow: <strong style={{ color: 'var(--text-primary)' }}>{dueTomorrowCount} reviews</strong></span>
                    <span>Daily load: <strong style={{ color: 'var(--text-primary)' }}>{dailyLoad} reviews/day</strong></span>
                  </div>
                </div>

                {/* ── Calendar Heatmap Card ── */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '12px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem' }}>Calendar</h3>

                  {/* Year selector */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                    <button 
                      onClick={() => setCalendarYear(prev => prev - 1)}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '0.25rem 0.5rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: '1rem', fontWeight: 600 }}>{calendarYear}</span>
                    <button 
                      onClick={() => setCalendarYear(prev => prev + 1)}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '0.25rem 0.5rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Heatmap Grid SVG */}
                  <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <svg viewBox="0 0 670 115" width="100%" height="auto" style={{ overflow: 'visible', maxWidth: '670px' }}>
                      {/* Left row labels */}
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                        <text 
                          key={`day-${idx}`} 
                          x={10} 
                          y={15 + idx * 12 + 8} 
                          fill="var(--text-muted)" 
                          fontSize="8" 
                          fontWeight="500" 
                          textAnchor="middle"
                        >
                          {day}
                        </text>
                      ))}

                      {/* Cells */}
                      {cells.map((cell, idx) => (
                        <rect 
                          key={`cell-${idx}`}
                          x={25 + cell.col * 12}
                          y={15 + cell.row * 12}
                          width={10}
                          height={10}
                          fill={getCellColor(cell.count)}
                          rx={1.5}
                          ry={1.5}
                          stroke="rgba(0,0,0,0.15)"
                          strokeWidth={0.5}
                        >
                          <title>{`${cell.date.toDateString()}: ${cell.count} reviews`}</title>
                        </rect>
                      ))}
                    </svg>
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.35rem', marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>Less</span>
                    <div style={{ width: '10px', height: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '1.5px' }} />
                    <div style={{ width: '10px', height: '10px', background: 'rgba(59, 130, 246, 0.3)', borderRadius: '1.5px' }} />
                    <div style={{ width: '10px', height: '10px', background: 'rgba(59, 130, 246, 0.55)', borderRadius: '1.5px' }} />
                    <div style={{ width: '10px', height: '10px', background: 'rgba(59, 130, 246, 0.8)', borderRadius: '1.5px' }} />
                    <div style={{ width: '10px', height: '10px', background: 'rgb(59, 130, 246)', borderRadius: '1.5px' }} />
                    <span>More</span>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      )}


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
            {/* Tab Switcher */}
            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              borderBottom: '1px solid var(--border-light)', 
              paddingBottom: '0.5rem' 
            }}>
              <button 
                onClick={() => setDeckTab('cards')} 
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: deckTab === 'cards' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderBottom: deckTab === 'cards' ? '2px solid var(--accent-primary)' : 'none',
                  padding: '0.5rem 1rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <Layers size={16} /> Cards List
              </button>
              <button 
                onClick={() => setDeckTab('mindmap')} 
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: deckTab === 'mindmap' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderBottom: deckTab === 'mindmap' ? '2px solid var(--accent-primary)' : 'none',
                  padding: '0.5rem 1rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <Activity size={16} /> AI Mind Map
              </button>
            </div>

            {deckTab === 'cards' && (
              <>
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

            {/* Filter and Search Bar */}
            <div className="glass-panel" style={{ 
              padding: '1rem', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.75rem', 
              marginBottom: '1rem',
              background: 'rgba(15, 15, 20, 0.4)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                <Search size={16} style={{ color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Search cards by question or concept..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--text-primary)', 
                    fontSize: '0.9rem', 
                    width: '100%', 
                    outline: 'none',
                    padding: 0
                  }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* Difficulty Filter */}
                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '0.2rem' }}>Difficulty</span>
                  <select 
                    value={difficultyFilter} 
                    onChange={e => setDifficultyFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All</option>
                    <option value="easy">Easy (D &lt; 3)</option>
                    <option value="medium">Medium (3 - 7)</option>
                    <option value="hard">Hard (D &gt; 7)</option>
                    <option value="new">New (Unstudied)</option>
                  </select>
                </div>

                {/* Stability Filter */}
                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '0.2rem' }}>Stability</span>
                  <select 
                    value={stabilityFilter} 
                    onChange={e => setStabilityFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All</option>
                    <option value="low">Short (&lt; 3d)</option>
                    <option value="medium">Medium (3d - 14d)</option>
                    <option value="high">Long (&gt; 14d)</option>
                    <option value="new">New (Unstudied)</option>
                  </select>
                </div>

                {/* Repetitions Filter */}
                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '0.2rem' }}>Repetitions</span>
                  <select 
                    value={repsFilter} 
                    onChange={e => setRepsFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All</option>
                    <option value="zero">0 Reps</option>
                    <option value="few">1 - 4 Reps</option>
                    <option value="many">5+ Reps</option>
                  </select>
                </div>

                {/* Consecutive Fails Filter */}
                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '0.2rem' }}>Lapses (Fails)</span>
                  <select 
                    value={failsFilter} 
                    onChange={e => setFailsFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All</option>
                    <option value="none">0 Fails</option>
                    <option value="some">1+ Fails</option>
                    <option value="many">3+ Fails</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={searchAllDecks} 
                    onChange={e => setSearchAllDecks(e.target.checked)} 
                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                  />
                  Search / Filter All Decks
                </label>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort By</span>
                  <select 
                    value={sortBy} 
                    onChange={e => setSortBy(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Default (None)</option>
                    <option value="difficulty">Difficulty</option>
                    <option value="stability">Stability</option>
                    <option value="reps">Repetitions</option>
                    <option value="fails">Lapses (Fails)</option>
                    <option value="recent">Recently Reviewed</option>
                  </select>

                  <select 
                    value={sortOrder} 
                    onChange={e => setSortOrder(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="asc">Ascending (Low to High)</option>
                    <option value="desc">Descending (High to Low)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Selection Toolbar */}
            {sortedCards.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input 
                    type="checkbox"
                    checked={sortedCards.length > 0 && sortedCards.every(c => selectedCardIds.includes(c.id))}
                    ref={el => {
                      if (el) {
                        const someSelected = sortedCards.some(c => selectedCardIds.includes(c.id));
                        const allSelected = sortedCards.every(c => selectedCardIds.includes(c.id));
                        el.indeterminate = someSelected && !allSelected;
                      }
                    }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Select all visible cards
                        const visibleIds = sortedCards.map(c => c.id);
                        setSelectedCardIds(prev => {
                          const union = new Set([...prev, ...visibleIds]);
                          return Array.from(union);
                        });
                      } else {
                        // Deselect all visible cards
                        const visibleIds = sortedCards.map(c => c.id);
                        setSelectedCardIds(prev => prev.filter(id => !visibleIds.includes(id)));
                      }
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {selectedCardIds.length > 0 
                      ? `${selectedCardIds.length} cards selected` 
                      : 'Select All'}
                  </span>
                </div>

                {selectedCardIds.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Move to Deck Dropdown & Action */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '0.1rem 0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '0.25rem' }}>Move to:</span>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const deckId = e.target.value;
                          if (!deckId) return;
                          const targetDeck = Decks.find(d => d.id === deckId);
                          if (window.confirm(`Move ${selectedCardIds.length} cards to "${targetDeck.title}"?`)) {
                            onMoveCards(selectedCardIds, deckId);
                            setSelectedCardIds([]);
                          }
                          e.target.value = ""; // Reset
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.25rem', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', maxWidth: '140px' }}
                      >
                        <option value="" disabled>Choose Deck...</option>
                        {Decks.map(d => (
                          <option key={d.id} value={d.id}>{d.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Delete Selected Button */}
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete ${selectedCardIds.length} selected cards?`)) {
                          onBulkDeleteCards(selectedCardIds);
                          setSelectedCardIds([]);
                        }
                      }}
                      style={{ 
                        padding: '0.35rem 0.75rem', 
                        fontSize: '0.75rem', 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.3)', 
                        color: '#fca5a5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <Trash2 size={12} /> Delete Selected
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '550px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {sortedCards.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {Cards.filter(c => c.deckId === activeDeckId).length === 0 
                    ? "This deck is currently empty. Click the '+ Add New Card' button to create some flashcards!"
                    : "No cards match your search or filter criteria."}
                </div>
              ) : (
                sortedCards.map((card, idx) => {
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, paddingRight: '1.5rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedCardIds.includes(card.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCardIds(prev => [...prev, card.id]);
                            } else {
                              setSelectedCardIds(prev => prev.filter(id => id !== card.id));
                            }
                          }}
                          style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                            {idx + 1}. {card.question}
                          </p>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {searchAllDecks && (
                              <span style={{ fontSize: '0.75rem', color: '#c084fc', background: 'rgba(192, 132, 252, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                Deck: {Decks.find(d => d.id === card.deckId)?.title || "Unknown"}
                              </span>
                            )}
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'rgba(139, 92, 246, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>
                              Concept: {card.concept}
                            </span>
                            {card.imageUrl && (
                              <span style={{ fontSize: '0.75rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Image size={12} /> Image
                              </span>
                            )}
                            {card.youtubeUrl && (
                              <span style={{ fontSize: '0.75rem', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Play size={12} /> Video
                              </span>
                            )}
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
                })
              )}
            </div>
            </>
            )}

            {deckTab === 'mindmap' && (() => {
              const deck = Decks.find(d => d.id === activeDeckId);
              if (!deck) return null;
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Conceptual Mind Map</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        Visual outline of concepts and subtopics in this deck.
                      </p>
                    </div>
                    {deck.mindMap && (
                      <button 
                        className="btn btn-secondary" 
                        onClick={handleGenerateMindMap}
                        disabled={isGeneratingMindMap}
                        style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Activity size={16} /> {isGeneratingMindMap ? 'Generating...' : 'Regenerate Mind Map'}
                      </button>
                    )}
                  </div>

                  {isGeneratingMindMap && (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid var(--border-light)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%' }} />
                      <p style={{ fontSize: '0.95rem' }}>Generating conceptual mind map with Gemini AI...</p>
                    </div>
                  )}

                  {mindMapGenError && (
                    <div style={{ 
                      padding: '1rem', 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      border: '1px solid rgba(239, 68, 68, 0.3)', 
                      borderRadius: '8px', 
                      color: '#f87171', 
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={16} />
                      <span>{mindMapGenError}</span>
                    </div>
                  )}

                  {!isGeneratingMindMap && !deck.mindMap && (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <Activity size={48} style={{ color: 'var(--text-muted)' }} />
                      <p style={{ fontSize: '1rem', maxWidth: '400px' }}>
                        No conceptual mind map has been generated for this deck yet. Generate one to see a hierarchical view of the concepts.
                      </p>
                      {!settings.apiKey ? (
                        <p style={{ color: 'var(--warning)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <AlertTriangle size={14} /> Please add your Gemini API Key in Settings to enable AI Mind Maps.
                        </p>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          onClick={handleGenerateMindMap}
                          style={{ fontSize: '0.9rem', padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <Activity size={16} /> Generate Mind Map
                        </button>
                      )}
                    </div>
                  )}

                  {!isGeneratingMindMap && deck.mindMap && (
                    <div className="glass-panel" style={{ padding: '1.5rem 2rem', background: 'rgba(9, 9, 11, 0.2)' }}>
                      <MindMapNode node={deck.mindMap} cards={Cards} onOpenCardDetails={setActiveCardDetails} />
                    </div>
                  )}
                </div>
              );
            })()}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>Card Image (Optional)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="text"
                    placeholder="Paste Image URL (or upload image)"
                    value={newCardImageUrl}
                    onChange={(e) => setNewCardImageUrl(e.target.value)}
                    style={{ fontSize: '0.9rem', flex: 1 }}
                  />
                  <button 
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    style={{ padding: '0.5rem', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Upload local image"
                  >
                    <Image size={16} />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                    style={{ display: 'none' }} 
                  />
                </div>
                {newCardImageUrl && (
                  <div style={{ position: 'relative', marginTop: '0.5rem', alignSelf: 'flex-start' }}>
                    <img src={newCardImageUrl} alt="Card preview" style={{ maxHeight: '80px', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
                    <button 
                      type="button" 
                      onClick={() => setNewCardImageUrl('')}
                      style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>YouTube Link (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                  value={newCardYoutubeUrl}
                  onChange={(e) => setNewCardYoutubeUrl(e.target.value)}
                  style={{ fontSize: '0.9rem' }}
                />
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
      {showImportModal && (
        <ImportModal
          Decks={Decks}
          onCreateDeck={onCreateDeck}
          onImportCards={onImportCards}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

function MindMapNode({ node, cards, onOpenCardDetails }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  
  const card = (node.cardId && cards) ? cards.find(c => c.id === node.cardId) : null;
  
  let score = null;
  if (card) {
    if (card.history && card.history.length > 0) {
      score = card.history[card.history.length - 1].score;
    } else if (card.state) {
      score = (10 - card.state.difficulty) * 10;
    }
  }

  // Red at HSL 0 (score=0), Green at HSL 120 (score=100)
  const nodeColor = score !== null ? `hsl(${score * 1.2}, 85%, 60%)` : (hasChildren ? 'var(--text-primary)' : 'var(--text-secondary)');
  
  const handleNodeClick = (e) => {
    if (card && onOpenCardDetails) {
      e.stopPropagation();
      onOpenCardDetails(card);
    } else if (hasChildren) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div style={{ paddingLeft: '1.25rem', textAlign: 'left', borderLeft: '1px dashed var(--border-light)', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.4rem', 
          cursor: (hasChildren || card) ? 'pointer' : 'default',
          userSelect: 'none'
        }}
        onClick={handleNodeClick}
      >
        {hasChildren ? (
          <span onClick={(e) => {
            if (card) {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }
          }}>
            {isCollapsed ? <ChevronRight size={14} style={{ color: 'var(--accent-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--accent-primary)' }} />}
          </span>
        ) : (
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: score !== null ? nodeColor : 'var(--text-muted)', margin: '0 4px' }} />
        )}
        <span 
          style={{ 
            fontWeight: hasChildren ? 600 : 400, 
            fontSize: hasChildren ? '0.95rem' : '0.9rem',
            color: nodeColor,
            textDecoration: card ? 'underline' : 'none',
            textDecorationColor: card ? 'rgba(255,255,255,0.2)' : 'transparent',
            textDecorationStyle: 'dashed',
            transition: 'all 0.2s ease'
          }}
          title={card ? "Click to view flashcard progress & history" : ""}
        >
          {node.label}
          {card && (
            <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '0.4rem', color: 'var(--text-muted)' }}>
              ({score !== null ? `${score}%` : 'New'})
            </span>
          )}
        </span>
      </div>
      
      {hasChildren && !isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
          {node.children.map((child, idx) => (
            <MindMapNode key={idx} node={child} cards={cards} onOpenCardDetails={onOpenCardDetails} />
          ))}
        </div>
      )}
    </div>
  );
}
