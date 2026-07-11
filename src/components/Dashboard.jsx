import React, { useState, useEffect, useRef } from 'react';
import { Play, Plus, Trash2, Edit3, Settings, BookOpen, Layers, X, Calendar, AlertTriangle, TrendingUp, Upload, Image, Search, Filter, BarChart3, Activity, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Copy, Download, Trophy, Flame, Sparkles, BrainCircuit } from 'lucide-react';
import { isDue } from '../utils/srs';
import CardProgressDetails from './CardProgressDetails';

import ImportModal from './ImportModal';
import KnowledgeGraph from './KnowledgeGraph';
import { generateMindMap, autoCategorizeCards, generateCognitiveProfile, predictCardDifficulties, refactorHardCard, generateKnowledgeGraph } from '../utils/gemini';
import { hasFeatureUnlocked } from '../utils/gamification';

export default function Dashboard({ Decks, Cards, settings = {}, onCreateDeck, onDeleteDeck, onUpdateDeck, onReorderDecks, onAddCard, onDeleteCard, onStartStudy, onOpenSettings, onImportCards, onBulkDeleteCards, onMoveCards, onUpdateDeckMindMap, onUpdateCards, onRefactorCard, Files = [], onCreateFile, onDeleteFile, onUpdateFile, onAddDeckToFile, onRemoveDeckFromFile, onUpdateFileGraph }) {
  const [showCreateDeckModal, setShowCreateDeckModal] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');

  const [activeDeckId, setActiveDeckId] = useState(null); // To manage cards in a specific deck
  const [studyOptionsDeckId, setStudyOptionsDeckId] = useState(null);
  const [studyFilter, setStudyFilter] = useState('due'); // 'due', 'new', 'leech', 'all'
  const [studyType, setStudyType] = useState('all'); // 'all', 'logic', 'rote', 'vocabulary'
  const [isCategorizing, setIsCategorizing] = useState(false);

  // Cognitive Profiling, Predictive Planner, Refactoring States
  const [showCognitiveProfile, setShowCognitiveProfile] = useState(false);
  const [isProfilingLoading, setIsProfilingLoading] = useState(false);
  const [cognitiveProfile, setCognitiveProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('simanki_cognitive_profile');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [isPredicting, setIsPredicting] = useState(false);

  const [refactorCard, setRefactorCard] = useState(null);
  const [refactorMethod, setRefactorMethod] = useState('auto'); // 'auto', 'simplify', 'split'
  const [refactorCustomInstructions, setRefactorCustomInstructions] = useState('');
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [refactorResult, setRefactorResult] = useState(null);

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
  const [typeFilter, setTypeFilter] = useState('');
  const [aiPredictFilter, setAiPredictFilter] = useState('');
  
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
  const [mindMapInstructions, setMindMapInstructions] = useState('');
  const [mindMapModel, setMindMapModel] = useState(settings.model || 'gemini-3.5-flash');
  const [editingDeckId, setEditingDeckId] = useState(null);
  const [editDeckTitle, setEditDeckTitle] = useState('');
  const [editDeckDescription, setEditDeckDescription] = useState('');
  const [draggedDeckId, setDraggedDeckId] = useState(null);
  const [dragOverDeckId, setDragOverDeckId] = useState(null);
  const [showCreateFileModal, setShowCreateFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileColor, setNewFileColor] = useState('#8b5cf6');
  const [editingFileId, setEditingFileId] = useState(null);
  const [editFileName, setEditFileName] = useState('');
  const FILE_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  const [graphFileId, setGraphFileId] = useState(null);
  const [isGeneratingGraph, setIsGeneratingGraph] = useState(false);
  const [graphGenError, setGraphGenError] = useState(null);

  useEffect(() => {
    if (settings.model) {
      setMindMapModel(settings.model);
    }
  }, [settings.model]);

  // Clear selection and reset tab when deck, search, or filters change
  useEffect(() => {
    setSelectedCardIds([]);
  }, [activeDeckId, searchQuery, difficultyFilter, stabilityFilter, repsFilter, failsFilter, searchAllDecks, typeFilter, aiPredictFilter]);

  useEffect(() => {
    setDeckTab('cards');
  }, [activeDeckId]);

  const fileInputRef = useRef(null);
  const cardManagerRef = useRef(null);

  // Auto-scroll to Card Manager section when a deck's card button is clicked
  useEffect(() => {
    if (activeDeckId) {
      setTimeout(() => {
        if (cardManagerRef.current) {
          cardManagerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [activeDeckId]);

  // Lock body scroll when modals are open
  useEffect(() => {
    const isModalOpen = !!(showCreateDeckModal || showAddCardModal || activeCardDetails || showImportModal || studyOptionsDeckId);
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showCreateDeckModal, showAddCardModal, activeCardDetails, showImportModal, studyOptionsDeckId]);

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
    const dueCount = deckCards.filter(c => c.state && c.state.repetitions > 0 && isDue(c)).length;
    const newCount = deckCards.filter(c => !c.state || c.state.repetitions === 0).length;
    return {
      total: deckCards.length,
      due: dueCount,
      new: newCount,
      graduated: deckCards.length - newCount
    };
  };

  const getDeckDifficulty = (deckId) => {
    const deckCards = Cards.filter(c => c.deckId === deckId);
    if (deckCards.length === 0) return null;
    const reviewed = deckCards.filter(c => c.state && c.state.repetitions > 0);
    if (reviewed.length === 0) return { score: 0, label: 'New Deck', color: '#67e8f9' };
    const avgDifficulty = reviewed.reduce((s, c) => s + c.state.difficulty, 0) / reviewed.length;
    const avgStability = reviewed.reduce((s, c) => s + c.state.stability, 0) / reviewed.length;
    const failRate = reviewed.filter(c => (c.state.consecutiveFails || 0) > 0).length / reviewed.length;
    const score = Math.round(
      (avgDifficulty / 10) * 40 +
      Math.max(0, 1 - avgStability / 30) * 30 +
      failRate * 30
    );
    const clampedScore = Math.min(100, Math.max(0, score));
    const hue = ((100 - clampedScore) * 1.2).toFixed(0);
    const color = `hsl(${hue}, 80%, 55%)`;
    const label = clampedScore < 25 ? 'Easy' : clampedScore < 50 ? 'Moderate' : clampedScore < 75 ? 'Hard' : 'Very Hard';
    return { score: clampedScore, label, color };
  };

  const handleDeckDragStart = (e, deckId) => {
    setDraggedDeckId(deckId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', deckId);
  };

  const handleDeckDragOver = (e, deckId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (deckId !== draggedDeckId) setDragOverDeckId(deckId);
  };

  const handleDeckDrop = (e, targetDeckId) => {
    e.preventDefault();
    if (!draggedDeckId || draggedDeckId === targetDeckId) {
      setDraggedDeckId(null);
      setDragOverDeckId(null);
      return;
    }
    const currentIds = Decks.map(d => d.id);
    const fromIdx = currentIds.indexOf(draggedDeckId);
    const toIdx = currentIds.indexOf(targetDeckId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...currentIds];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedDeckId);
    if (onReorderDecks) onReorderDecks(reordered);
    setDraggedDeckId(null);
    setDragOverDeckId(null);
  };

  const handleDeckDragEnd = () => {
    setDraggedDeckId(null);
    setDragOverDeckId(null);
  };

  const handleGenerateGraph = async (fileId) => {
    if (!settings.apiKey) {
      alert('Please configure your Gemini API key in Settings first.');
      return;
    }
    const file = Files.find(f => f.id === fileId);
    if (!file) return;

    const fileDecks = (file.deckIds || []).map(id => Decks.find(d => d.id === id)).filter(Boolean);
    const fileCards = Cards.filter(c => fileDecks.some(d => d.id === c.deckId));

    if (fileCards.length === 0) {
      alert('No cards in this folder to generate a graph from.');
      return;
    }

    setIsGeneratingGraph(true);
    setGraphGenError(null);
    try {
      const graphData = await generateKnowledgeGraph(
        settings.apiKey,
        'gemini-3.5-flash',
        {
          fileName: file.name,
          decks: fileDecks.map(d => ({ id: d.id, title: d.title, description: d.description })),
          cards: fileCards.map(c => ({ id: c.id, deckId: c.deckId, question: c.question, concept: c.concept, cardType: c.cardType }))
        }
      );
      if (onUpdateFileGraph) {
        onUpdateFileGraph(fileId, { ...graphData, lastGenerated: new Date().toISOString() });
      }
      setGraphFileId(fileId);
    } catch (err) {
      console.error('Graph generation error:', err);
      setGraphGenError(err.message);
      alert(`Failed to generate graph: ${err.message}`);
    } finally {
      setIsGeneratingGraph(false);
    }
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
        mindMapModel,
        deck.title,
        deck.description || '',
        deckCards,
        mindMapInstructions
      );
      
      onUpdateDeckMindMap(activeDeckId, mindMap);
    } catch (err) {
      console.error("Failed to generate mind map:", err);
      setMindMapGenError(err.message || "Failed to generate mind map. Please check your API key and try again.");
    } finally {
      setIsGeneratingMindMap(false);
    }
  };

  const handleCategorize = async () => {
    if (!settings.apiKey) {
      alert("Please configure your Gemini API key in Settings first.");
      return;
    }
    const deckCards = Cards.filter(c => c.deckId === activeDeckId);
    if (deckCards.length === 0) return;
    
    setIsCategorizing(true);
    try {
      const results = await autoCategorizeCards(settings.apiKey, settings.model, deckCards);
      onUpdateCards(results);
    } catch (e) {
      alert("Error categorizing cards: " + e.message);
    } finally {
      setIsCategorizing(false);
    }
  };

  const calculateLocalHeuristics = (allCards) => {
    const reviewedCards = allCards.filter(c => c.history && c.history.length > 0);
    
    const categories = {
      longQuestions: { name: 'Long Questions (>80 chars)', cards: [], scores: [] },
      longAnswers: { name: 'Long Answers (>120 chars)', cards: [], scores: [] },
      mathQuantitative: { name: 'Numerical / Formulaic Values', cards: [], scores: [] },
      logicCards: { name: 'Logic / Concept Cards', cards: [], scores: [] },
      roteCards: { name: 'Rote / Fact Cards', cards: [], scores: [] },
      vocabCards: { name: 'Vocabulary / Words', cards: [], scores: [] }
    };
    
    allCards.forEach(c => {
      const isLongQ = c.question && c.question.length > 80;
      const isMath = c.question && (/[0-9]/.test(c.question) || c.question.includes('\\(') || c.question.includes('formula') || c.concept.includes('\\('));
      const isLogic = c.cardType === 'logic';
      const isRote = c.cardType === 'rote';
      const isVocab = c.cardType === 'vocabulary';
      
      const history = c.history || [];
      const isLongA = history.some(h => h.userAnswer && h.userAnswer.length > 120);
      const scores = history.map(h => h.score || 0);
      
      if (isLongQ) { categories.longQuestions.cards.push(c); categories.longQuestions.scores.push(...scores); }
      if (isLongA) { categories.longAnswers.cards.push(c); categories.longAnswers.scores.push(...scores); }
      if (isMath) { categories.mathQuantitative.cards.push(c); categories.mathQuantitative.scores.push(...scores); }
      if (isLogic) { categories.logicCards.cards.push(c); categories.logicCards.scores.push(...scores); }
      if (isRote) { categories.roteCards.cards.push(c); categories.roteCards.scores.push(...scores); }
      if (isVocab) { categories.vocabCards.cards.push(c); categories.vocabCards.scores.push(...scores); }
    });
    
    return Object.keys(categories).map(key => {
      const cat = categories[key];
      const avgScore = cat.scores.length > 0
        ? Math.round(cat.scores.reduce((sum, s) => sum + s, 0) / cat.scores.length)
        : null;
      return {
        key,
        name: cat.name,
        count: cat.cards.length,
        reviewedCount: cat.scores.length,
        successRate: avgScore
      };
    });
  };

  const handlePredictiveGrading = async () => {
    if (!settings.apiKey) {
      alert("Please configure your Gemini API key in Settings first.");
      return;
    }
    const deckCards = Cards.filter(c => c.deckId === activeDeckId);
    const unpredictedCards = deckCards.filter(c => c.predictedDifficultyScore === undefined || c.predictedDifficultyScore === null);
    
    if (unpredictedCards.length === 0) {
      alert("All cards in this deck already have predictive grading!");
      return;
    }
    
    setIsPredicting(true);
    try {
      const updatedDiffs = [];
      const batchSize = 15;
      for (let i = 0; i < unpredictedCards.length; i += batchSize) {
        const batch = unpredictedCards.slice(i, i + batchSize);
        const results = await predictCardDifficulties(settings.apiKey, settings.model, batch);
        updatedDiffs.push(...results);
      }
      
      const resultsToSave = updatedDiffs.map(res => ({
        id: res.id,
        predictedDifficultyScore: res.difficultyScore,
        predictedDifficultyReason: res.reason
      }));
      
      onUpdateCards(resultsToSave);
      alert(`Predictive difficulty grading completed for ${resultsToSave.length} cards!`);
    } catch (e) {
      alert("Error running predictive grading: " + e.message);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleOpenRefactorModal = (card) => {
    setRefactorCard(card);
    setRefactorMethod('auto');
    setRefactorCustomInstructions('');
    setRefactorResult(null);
    setIsRefactoring(false);
  };

  const handleRunRefactor = async () => {
    if (!settings.apiKey) {
      alert("Please configure your Gemini API key in Settings first.");
      return;
    }
    setIsRefactoring(true);
    try {
      const result = await refactorHardCard(settings.apiKey, settings.model, refactorCard, refactorMethod, refactorCustomInstructions);
      setRefactorResult(result);
    } catch (e) {
      alert("Refactoring failed: " + e.message);
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleAcceptRefactor = () => {
    onRefactorCard(refactorCard.id, refactorResult);
    setRefactorCard(null);
    setRefactorResult(null);
    alert("Card refactoring applied successfully!");
  };

  const handleCopySelectedCards = () => {
    const selected = Cards.filter(c => selectedCardIds.includes(c.id));
    let text = "";
    selected.forEach((c, idx) => {
      text += `--- Card #${idx + 1} ---\n`;
      text += `Question: ${c.question}\n`;
      text += `Concept: ${c.concept}\n`;
      if (c.imageUrl) text += `Image URL: ${c.imageUrl}\n`;
      if (c.youtubeUrl) text += `YouTube URL: ${c.youtubeUrl}\n`;
      text += `\n`;
    });
    navigator.clipboard.writeText(text);
    alert(`Copied data of ${selected.length} selected cards to clipboard.`);
  };

  const handleExportSelectedCards = () => {
    const selected = Cards.filter(c => selectedCardIds.includes(c.id));
    let text = "";
    selected.forEach((c, idx) => {
      text += `--- Card #${idx + 1} ---\n`;
      text += `Question: ${c.question}\n`;
      text += `Concept: ${c.concept}\n`;
      if (c.imageUrl) text += `Image URL: ${c.imageUrl}\n`;
      if (c.youtubeUrl) text += `YouTube URL: ${c.youtubeUrl}\n`;
      text += `\n`;
    });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `simanki-selected-cards-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
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

    if (typeFilter) {
      const cType = card.cardType || 'default';
      if (typeFilter === 'default' && cType !== 'default') return false;
      if (typeFilter !== 'default' && cType !== typeFilter) return false;
    }

    if (aiPredictFilter) {
      const score = card.predictedDifficultyScore;
      if (aiPredictFilter === 'unpredicted') {
        if (score !== undefined && score !== null) return false;
      } else if (aiPredictFilter === 'easy') {
        if (score === undefined || score === null || score > 30) return false;
      } else if (aiPredictFilter === 'medium') {
        if (score === undefined || score === null || score <= 30 || score > 70) return false;
      } else if (aiPredictFilter === 'hard') {
        if (score === undefined || score === null || score <= 70) return false;
      }
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
    } else if (sortBy === 'aiComplexity') {
      valA = a.predictedDifficultyScore !== undefined && a.predictedDifficultyScore !== null ? a.predictedDifficultyScore : -1;
      valB = b.predictedDifficultyScore !== undefined && b.predictedDifficultyScore !== null ? b.predictedDifficultyScore : -1;
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
    typeFilter,
    aiPredictFilter,
    Cards
  ]);

  return (
    <>
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Header Section */}
      <div className="dashboard-header">
        <div>
          <h1 style={{ background: 'linear-gradient(135deg, #a78bfa, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '3rem', margin: 0, fontWeight: 800 }}>
            SimAnki
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginTop: '0.25rem' }}>
            Spaced Repetition with AI Grading & Interactive Simulations
          </p>
        </div>
        <div className="dashboard-header-actions">
          <button className="btn btn-secondary" onClick={onOpenSettings} style={{ gap: '0.5rem' }}>
            <Settings size={18} /> Settings
          </button>
          {settings.deviceMode === 'mac' ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              fontWeight: 600
            }}>
              🔒 Read-Only Preview
            </span>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* ──── Player Stats & Leveling Card ──── */}
      {(() => {
        const xp = settings.xp || 0;
        const level = Math.floor(xp / 100) + 1;
        const xpInCurrentLevel = xp % 100;
        const xpPercentage = (xpInCurrentLevel / 100) * 100;
        const streak = settings.streak || 0;

        return (
          <div className="glass-panel animate-fade-in player-profile">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Trophy size={20} style={{ color: '#fbbf24' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Player Profile (Level {level})
                </h3>
                {settings.relaxedMode && (
                  <span className="badge animate-float" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    🧘 Relaxed Mode
                  </span>
                )}
                {settings.stressMode && (
                  <span className="badge animate-float" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    🌸 Gentle AI
                  </span>
                )}
              </div>

              {/* Progress bar and XP details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Progress to Level {level + 1}</span>
                  <span>{xpInCurrentLevel} / 100 XP (Total: {xp} XP)</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${xpPercentage}%`, height: '100%', background: 'linear-gradient(90deg, #c084fc, #f472b6)', borderRadius: '999px', transition: 'width 0.5s ease-out' }} />
                </div>
              </div>
            </div>

            {/* Streak Column */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(249, 115, 22, 0.06)', border: '1px solid rgba(249, 115, 22, 0.15)', padding: '0.75rem 1.5rem', borderRadius: '16px', minWidth: '150px', justifyContent: 'center' }}>
              <Flame size={28} fill={streak > 0 ? '#f97316' : 'none'} color={streak > 0 ? '#f97316' : 'var(--text-muted)'} />
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Study Streak</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: streak > 0 ? '#f97316' : 'var(--text-secondary)' }}>
                  {streak} {streak === 1 ? 'Day' : 'Days'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ──── User Cognitive Profile Panel ──── */}
      {Cards.some(c => c.history && c.history.length > 0) && (
        <div className="glass-panel" style={{ padding: '1.5rem 2rem', border: '1px solid var(--border-light)', marginTop: '0.5rem' }}>
          <div 
            onClick={() => setShowCognitiveProfile(!showCognitiveProfile)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <BrainCircuit size={22} style={{ color: '#c084fc' }} /> User Cognitive Profile & Diagnostics
            </h2>
            {showCognitiveProfile ? <ChevronUp size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} />}
          </div>

          {showCognitiveProfile && (() => {
            const heuristics = calculateLocalHeuristics(Cards);
            
            const handleGenerateProfileInsights = async () => {
              if (!settings.apiKey) {
                alert("Please configure your Gemini API key in Settings first.");
                return;
              }
              setIsProfilingLoading(true);
              try {
                const reviewedCards = Cards.filter(c => c.history && c.history.length > 0);
                const profile = await generateCognitiveProfile(settings.apiKey, settings.model, reviewedCards);
                setCognitiveProfile(profile);
                localStorage.setItem('simanki_cognitive_profile', JSON.stringify(profile));
              } catch (e) {
                alert("Profiling failed: " + e.message);
              } finally {
                setIsProfilingLoading(false);
              }
            };

            return (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem', textAlign: 'left' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  Below is a diagnostic analysis of your learning performance across different card characteristics, parsed locally and refined using AI.
                </p>

                {/* Local Performance progress bars */}
                <div className="cognitive-grid">
                  {heuristics.map(h => {
                    const hasReviews = h.successRate !== null;
                    const successColor = h.successRate >= 80 ? '#34d399' : h.successRate >= 60 ? '#fbbf24' : '#ef4444';
                    return (
                      <div key={h.key} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{h.name}</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Cards: {h.count} ({h.reviewedCount} reviews)</span>
                          <span>{hasReviews ? `${h.successRate}% Success` : 'No reviews'}</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${hasReviews ? h.successRate : 0}%`, height: '100%', background: successColor, borderRadius: '999px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* AI Insights display */}
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700, color: '#c084fc' }}>🧠 Personalized AI Learning Insights</h3>
                    <button 
                      className="btn btn-secondary" 
                      onClick={handleGenerateProfileInsights}
                      disabled={isProfilingLoading}
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem', gap: '0.3rem' }}
                    >
                      {isProfilingLoading ? 'Analyzing...' : cognitiveProfile ? 'Regenerate Insights' : '📊 Analyze Weaknesses'}
                    </button>
                  </div>

                  {isProfilingLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', justifyContent: 'center', padding: '2rem' }}>
                      <Activity size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>AI is analyzing your historical answers and identifying cognitive pitfalls...</span>
                    </div>
                  )}

                  {!isProfilingLoading && cognitiveProfile && (
                    <div className="glass-panel" style={{ background: 'rgba(15, 10, 30, 0.45)', border: '1px solid rgba(139, 92, 246, 0.15)', padding: '1.5rem', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div className="cognitive-insights-grid">
                        <div>
                          <h4 style={{ margin: '0 0 0.5rem 0', color: '#86efac', fontSize: '0.9rem', fontWeight: 700 }}>🌟 Excels At</h4>
                          <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {cognitiveProfile.excelsAt.map((item, idx) => <li key={idx}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <h4 style={{ margin: '0 0 0.5rem 0', color: '#fca5a5', fontSize: '0.9rem', fontWeight: 700 }}>⚠ Struggles With</h4>
                          <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {cognitiveProfile.strugglesWith.map((item, idx) => <li key={idx}>{item}</li>)}
                          </ul>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#c4b5fd', fontSize: '0.9rem', fontWeight: 700 }}>🔍 Detailed Pitfall Analysis</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                          {cognitiveProfile.detailedAnalysis}
                        </p>
                      </div>

                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-primary)', fontSize: '0.9rem', fontWeight: 700 }}>🚀 Recommended Study Tactics</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                          {cognitiveProfile.recommendedFocus}
                        </p>
                      </div>
                    </div>
                  )}

                  {!isProfilingLoading && !cognitiveProfile && (
                    <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--border-light)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No AI insights generated yet. Click "Analyze Weaknesses" above to compile your personalized learning diagnostics.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Decks — Grouped by File */}
      {(() => {
        const allFileDecks = new Set(Files.flatMap(f => f.deckIds || []));
        const ungroupedDecks = Decks.filter(d => !allFileDecks.has(d.id));

        const renderDeckCard = (deck) => {
          const stats = getDeckStats(deck.id);
          const isSelected = activeDeckId === deck.id;
          return (
            <div 
              key={deck.id} 
              className={`glass-panel glass-panel-hover ${isSelected ? 'active-deck' : ''} ${dragOverDeckId === deck.id ? 'deck-drag-over' : ''} ${draggedDeckId === deck.id ? 'deck-dragging' : ''}`}
              style={{ 
                padding: '1.5rem', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                border: isSelected ? '1px solid var(--accent-primary)' : dragOverDeckId === deck.id ? '2px dashed var(--accent-primary)' : '1px solid var(--border-light)',
                boxShadow: isSelected ? '0 0 15px rgba(139, 92, 246, 0.25)' : 'none'
              }}
              draggable={settings.deviceMode !== 'mac'}
              onDragStart={(e) => handleDeckDragStart(e, deck.id)}
              onDragOver={(e) => handleDeckDragOver(e, deck.id)}
              onDrop={(e) => handleDeckDrop(e, deck.id)}
              onDragEnd={handleDeckDragEnd}
            >
              {editingDeckId === deck.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', marginBottom: '1rem', textAlign: 'left' }}>
                  <input
                    type="text"
                    value={editDeckTitle}
                    onChange={(e) => setEditDeckTitle(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.95rem'
                    }}
                    placeholder="Deck Title"
                  />
                  <textarea
                    value={editDeckDescription}
                    onChange={(e) => setEditDeckDescription(e.target.value)}
                    style={{
                      width: '100%',
                      height: '60px',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.85rem',
                      resize: 'none'
                    }}
                    placeholder="Description"
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingDeckId(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editDeckTitle.trim()) {
                          onUpdateDeck(deck.id, editDeckTitle.trim(), editDeckDescription.trim());
                          setEditingDeckId(null);
                        }
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', margin: 0 }}>{deck.title}</h3>
                    {settings.deviceMode !== 'mac' && (
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDeckId(deck.id);
                            setEditDeckTitle(deck.title);
                            setEditDeckDescription(deck.description || '');
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                          title="Edit Deck Info"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button 
                          className="btn-text"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete the deck "${deck.title}" and all its cards?`)) {
                              onDeleteDeck(deck.id);
                              if (activeDeckId === deck.id) setActiveDeckId(null);
                            }
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                        >
                          <Trash2 size={15} hover-target="true" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', height: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {deck.description || "No description provided."}
                  </p>

                  {/* Badges / Stats */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-due">{stats.due} Due</span>
                    <span className="badge badge-new">{stats.new} New</span>
                    <span className="badge badge-learn" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.3)' }}>{stats.total} Total</span>
                  </div>

                  {/* Deck Difficulty Bar */}
                  {(() => {
                    const diff = getDeckDifficulty(deck.id);
                    if (!diff) return null;
                    return (
                      <div className="deck-difficulty-bar" style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Difficulty</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: diff.color }}>{diff.label} ({diff.score}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${diff.score}%`, height: '100%', background: `linear-gradient(90deg, hsl(120, 80%, 45%), ${diff.color})`, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

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

              {/* Action Buttons */}
              <div className="deck-action-buttons">
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    if (hasFeatureUnlocked(settings, 'filters')) {
                      setStudyOptionsDeckId(deck.id);
                    } else {
                      onStartStudy(deck.id, { filter: 'due', type: 'all' });
                    }
                  }}
                  disabled={stats.total === 0 || settings.deviceMode === 'mac'}
                  style={{ 
                    flex: 1.2, 
                    gap: '0.35rem', 
                    opacity: (stats.total === 0 || settings.deviceMode === 'mac') ? 0.5 : 1, 
                    cursor: (stats.total === 0 || settings.deviceMode === 'mac') ? 'not-allowed' : 'pointer', 
                    fontSize: '0.85rem', 
                    padding: '0.5rem',
                    background: settings.deviceMode === 'mac' ? 'rgba(255,255,255,0.02)' : undefined,
                    border: settings.deviceMode === 'mac' ? '1px solid var(--border-light)' : undefined,
                    color: settings.deviceMode === 'mac' ? 'var(--text-muted)' : undefined
                  }}
                >
                  {settings.deviceMode === 'mac' ? '🔒 Review Locked' : <><Play size={14} /> Study</>}
                </button>
                {settings.deviceMode !== 'mac' && (
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
                )}
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
        };

        return (
          <>
            {/* File Sections */}
            {Files.map(file => {
              const fileDecks = (file.deckIds || []).map(id => Decks.find(d => d.id === id)).filter(Boolean);
              const fileTotalCards = fileDecks.reduce((sum, d) => sum + Cards.filter(c => c.deckId === d.id).length, 0);
              const fileDueCards = fileDecks.reduce((sum, d) => sum + Cards.filter(c => c.deckId === d.id && c.state && c.state.repetitions > 0 && isDue(c)).length, 0);

              return (
                <div key={file.id} className="file-section" style={{ marginBottom: '1.5rem' }}>
                  {/* File Header */}
                  <div 
                    className="file-header"
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '0.75rem 1.25rem',
                      background: `${file.color}10`,
                      border: `1px solid ${file.color}40`,
                      borderRadius: file.isCollapsed ? '10px' : '10px 10px 0 0',
                      cursor: 'pointer'
                    }}
                    onClick={() => onUpdateFile && onUpdateFile(file.id, { isCollapsed: !file.isCollapsed })}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const deckId = e.dataTransfer.getData('text/plain');
                      if (deckId && onAddDeckToFile) onAddDeckToFile(deckId, file.id);
                      setDraggedDeckId(null);
                      setDragOverDeckId(null);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {file.isCollapsed ? <ChevronRight size={18} style={{ color: file.color }} /> : <ChevronDown size={18} style={{ color: file.color }} />}
                      <span style={{ fontSize: '0.75rem', color: file.color }}>📁</span>
                      {editingFileId === file.id ? (
                        <input
                          type="text"
                          value={editFileName}
                          onChange={(e) => setEditFileName(e.target.value)}
                          onBlur={() => {
                            if (editFileName.trim() && onUpdateFile) {
                              onUpdateFile(file.id, { name: editFileName.trim() });
                            }
                            setEditingFileId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editFileName.trim() && onUpdateFile) onUpdateFile(file.id, { name: editFileName.trim() });
                              setEditingFileId(null);
                            } else if (e.key === 'Escape') {
                              setEditingFileId(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${file.color}60`, borderRadius: '4px', color: '#fff', padding: '0.2rem 0.5rem', fontSize: '1rem', fontWeight: 700, width: '200px' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>{file.name}</span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {fileDecks.length} deck{fileDecks.length !== 1 ? 's' : ''} · {fileTotalCards} cards · {fileDueCards} due
                      </span>
                    </div>
                    {settings.deviceMode !== 'mac' && (
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditingFileId(file.id); setEditFileName(file.name); }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                          title="Rename File"
                        >
                          <Edit3 size={14} />
                        </button>
                        {/* Color picker */}
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {FILE_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => onUpdateFile && onUpdateFile(file.id, { color: c })}
                              style={{
                                width: '14px', height: '14px', borderRadius: '50%',
                                background: c, border: file.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                cursor: 'pointer', padding: 0
                              }}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => {
                            const file2 = Files.find(f2 => f2.id === file.id);
                            if (file2?.knowledgeGraph) {
                              setGraphFileId(file.id);
                            } else {
                              handleGenerateGraph(file.id);
                            }
                          }}
                          disabled={isGeneratingGraph}
                          style={{ background: 'none', border: 'none', color: isGeneratingGraph ? 'var(--text-muted)' : '#c084fc', cursor: isGeneratingGraph ? 'wait' : 'pointer', padding: '0.25rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                          title={file.knowledgeGraph ? "View Knowledge Graph" : "Generate Knowledge Graph"}
                        >
                          <BrainCircuit size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete the folder "${file.name}"? Decks will be moved to Ungrouped.`)) {
                              if (onDeleteFile) onDeleteFile(file.id);
                            }
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                          title="Delete File"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* File Content (Decks inside) */}
                  {!file.isCollapsed && (
                    <div style={{ 
                      border: `1px solid ${file.color}20`, 
                      borderTop: 'none', 
                      borderRadius: '0 0 10px 10px',
                      padding: '1rem',
                      background: 'rgba(0,0,0,0.15)'
                    }}>
                      {fileDecks.length > 0 ? (
                        <div className="deck-grid">
                          {fileDecks.map(deck => renderDeckCard(deck))}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          Drag decks here or create a new deck to add to this folder.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped Decks */}
            {ungroupedDecks.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                {Files.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingLeft: '0.25rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ungrouped Decks</span>
                  </div>
                )}
                <div className="deck-grid">
                  {ungroupedDecks.map(deck => renderDeckCard(deck))}
                </div>
              </div>
            )}

            {/* Create File Button */}
            {settings.deviceMode !== 'mac' && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowCreateFileModal(true)}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', gap: '0.35rem', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)', color: '#c084fc' }}
                >
                  📁 Create Folder
                </button>
              </div>
            )}

            {Decks.length === 0 && (
              <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Layers size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                <h3>No Decks Found</h3>
                <p style={{ margin: '0.5rem 0 1.5rem' }}>Create your first deck to get started with Spaced Repetition Simulations.</p>
                <button className="btn btn-primary" onClick={() => setShowCreateDeckModal(true)}>
                  <Plus size={18} /> Create Deck
                </button>
              </div>
            )}
          </>
        );
      })()}

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
              <div className="stats-grid">
                
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
        <div ref={cardManagerRef} className="glass-panel animate-fade-in card-manager-panel" style={{ padding: '2rem', border: '1px solid var(--border-light)', marginTop: '1rem' }}>
          <div className="card-manager-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
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
            <div className="deck-tabs" style={{ 
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
                  fontWeight: deckTab === 'mindmap' ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                Mind Map
              </button>
            </div>

            <div className="ai-actions-row">
              <button 
                className="btn btn-secondary" 
                onClick={handleCategorize}
                disabled={isCategorizing || Cards.filter(c => c.deckId === activeDeckId).length === 0}
                style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', background: 'rgba(139, 92, 246, 0.1)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.3)' }}
              >
                {isCategorizing ? '🤖 Categorizing...' : '🤖 Auto-Categorize Cards'}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={handlePredictiveGrading}
                disabled={isPredicting || Cards.filter(c => c.deckId === activeDeckId).length === 0}
                style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', background: 'rgba(236, 72, 153, 0.1)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)', gap: '0.3rem' }}
              >
                {isPredicting ? '🔮 Predicting...' : '🔮 Predict Card Difficulties'}
              </button>
            </div>

            {deckTab === 'cards' && (
              <>
                <div className="card-manager-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div className="glass-panel filter-panel" style={{ 
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

              <div className="filter-grid">
                {/* Difficulty Filter */}
                <div className="filter-item">
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
                <div className="filter-item">
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
                <div className="filter-item">
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
                <div className="filter-item">
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

                {/* Type Filter */}
                <div className="filter-item">
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '0.2rem' }}>Type</span>
                  <select 
                    value={typeFilter} 
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All</option>
                    <option value="logic">Logic Card</option>
                    <option value="rote">Rote Card</option>
                    <option value="vocabulary">Vocabulary Card</option>
                    <option value="formula">Formula Card</option>
                    <option value="default">Default / Other</option>
                  </select>
                </div>

                {/* AI Predict Filter */}
                <div className="filter-item">
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '0.2rem' }}>AI Predict</span>
                  <select 
                    value={aiPredictFilter} 
                    onChange={e => setAiPredictFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All</option>
                    <option value="easy">Easy (&le; 30%)</option>
                    <option value="medium">Medium (31% - 70%)</option>
                    <option value="hard">Hard (&ge; 71%)</option>
                    <option value="unpredicted">Unpredicted / None</option>
                  </select>
                </div>
              </div>

              <div className="sort-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={searchAllDecks} 
                    onChange={e => setSearchAllDecks(e.target.checked)} 
                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                  />
                  Search / Filter All Decks
                </label>

                <div className="sort-controls">
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
                    <option value="aiComplexity">🔮 AI Complexity</option>
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
              <div className="selection-toolbar">
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
                  <div className="selection-actions">
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

                    {/* Copy Selected Button */}
                    <button 
                      className="btn btn-secondary" 
                      onClick={handleCopySelectedCards}
                      style={{ 
                        padding: '0.35rem 0.75rem', 
                        fontSize: '0.75rem', 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <Copy size={12} /> Copy Selected
                    </button>

                    {/* Export Selected Button */}
                    <button 
                      className="btn btn-secondary" 
                      onClick={handleExportSelectedCards}
                      style={{ 
                        padding: '0.35rem 0.75rem', 
                        fontSize: '0.75rem', 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <Download size={12} /> Export Selected (.txt)
                    </button>

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
            <div className="cards-list-container">
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
                      className="glass-panel card-item" 
                    >
                      <div className="card-item-content">
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
                          <div className="card-badges">
                            {searchAllDecks && (
                              <span style={{ fontSize: '0.75rem', color: '#c084fc', background: 'rgba(192, 132, 252, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                Deck: {Decks.find(d => d.id === card.deckId)?.title || "Unknown"}
                              </span>
                            )}
                            {card.cardType && card.cardType !== 'default' && (
                              <span style={{ fontSize: '0.75rem', color: '#f472b6', background: 'rgba(236, 72, 153, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                Type: {card.cardType.toUpperCase()}
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
                            {card.predictedDifficultyScore !== undefined && card.predictedDifficultyScore !== null && (() => {
                              const score = card.predictedDifficultyScore;
                              const hue = ((100 - score) * 1.2).toFixed(0);
                              const scoreColor = `hsl(${hue}, 85%, 60%)`;
                              return (
                                <span 
                                  title={card.predictedDifficultyReason} 
                                  style={{ 
                                    fontSize: '0.65rem', 
                                    color: scoreColor, 
                                    background: `${scoreColor}12`,
                                    border: `1px solid ${scoreColor}30`, 
                                    padding: '0.1rem 0.5rem', 
                                    borderRadius: '4px',
                                    fontWeight: 700,
                                    cursor: 'help'
                                  }}
                                >
                                  🔮 Complexity: {score}%
                                </span>
                              );
                            })()}

                            {(card.paused || card.suspended) && (
                              <span style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'rgba(156, 163, 175, 0.15)', border: '1px solid rgba(156, 163, 175, 0.3)', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                PAUSED (SPLIT)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="card-actions">
                        {!card.paused && !card.suspended && settings.deviceMode !== 'mac' && (
                          <button 
                            className="card-action-btn" 
                            onClick={() => handleOpenRefactorModal(card)}
                            style={{ color: '#f472b6' }}
                            title="Make Easy (AI Simplify / Split)"
                            type="button"
                          >
                            <Sparkles size={16} />
                          </button>
                        )}
                        <button 
                          className="card-action-btn" 
                          onClick={() => setActiveCardDetails(card)}
                          style={{ color: 'var(--accent-primary)' }}
                          title="View Progress Details & History"
                          type="button"
                        >
                          <TrendingUp size={16} />
                        </button>
                        {settings.deviceMode !== 'mac' && (
                          <button 
                            className="card-action-btn" 
                            onClick={() => onDeleteCard(card.id)}
                            style={{ color: 'var(--text-muted)' }}
                            title="Delete Card"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
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

                  {/* Custom Mind Map Instructions */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '12px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        AI Mind Map Instructions (Optional)
                      </label>
                      {mindMapInstructions && (
                        <button
                          onClick={() => setMindMapInstructions('')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      placeholder="e.g. 'Organize cards into main concepts. Label any missing points/gaps in my knowledge as (Missing) or white so they stand out.'"
                      value={mindMapInstructions}
                      onChange={(e) => setMindMapInstructions(e.target.value)}
                      disabled={isGeneratingMindMap}
                      style={{
                        width: '100%',
                        height: '60px',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.85rem',
                        lineHeight: '1.4',
                        resize: 'vertical'
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        AI Model Selection
                      </label>
                      <select
                        value={mindMapModel}
                        onChange={(e) => setMindMapModel(e.target.value)}
                        disabled={isGeneratingMindMap}
                        style={{
                          width: '100%',
                          maxWidth: '300px',
                          background: 'rgba(0,0,0,0.25)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          padding: '0.35rem 0.5rem',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                      </select>
                    </div>
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
      </div>

      {/* Create File (Folder) Modal */}
      {showCreateFileModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000, padding: '1rem'
        }} onClick={() => setShowCreateFileModal(false)}>
          <div className="glass-panel" style={{
            padding: '2rem', maxWidth: '420px', width: '100%',
            border: '1px solid var(--border-light)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1.25rem', color: 'var(--text-primary)' }}>📁 Create Folder</h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Folder name (e.g., Civil Engineering)"
              autoFocus
              style={{
                width: '100%', background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                color: '#fff', padding: '0.6rem 0.8rem', fontSize: '0.95rem',
                marginBottom: '1rem'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFileName.trim()) {
                  onCreateFile(newFileName.trim(), newFileColor);
                  setNewFileName('');
                  setNewFileColor('#8b5cf6');
                  setShowCreateFileModal(false);
                }
              }}
            />
            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Color</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {FILE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewFileColor(c)}
                    style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: c, border: newFileColor === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer', padding: 0, transition: 'transform 0.15s ease',
                      transform: newFileColor === c ? 'scale(1.15)' : 'scale(1)'
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateFileModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!newFileName.trim()}
                onClick={() => {
                  onCreateFile(newFileName.trim(), newFileColor);
                  setNewFileName('');
                  setNewFileColor('#8b5cf6');
                  setShowCreateFileModal(false);
                }}
              >
                Create Folder
              </button>
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
          onUpdateCard={(updated) => {
            if (typeof onUpdateCards === 'function') {
              onUpdateCards([updated]);
            } else if (typeof onUpdateCard === 'function') {
              onUpdateCard(updated);
            }
            setActiveCardDetails(updated);
          }}
          apiKey={settings.apiKey}
          model={settings.model}
          settings={settings}
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

      {/* Study Options Modal */}
      {studyOptionsDeckId && hasFeatureUnlocked(settings, 'filters') && (() => {
        const deck = Decks.find(d => d.id === studyOptionsDeckId);
        const deckCards = Cards.filter(c => c.deckId === studyOptionsDeckId);
        
        let filteredCards = deckCards;
        if (studyFilter === 'due') {
          filteredCards = filteredCards.filter(c => isDue(c));
        } else if (studyFilter === 'new') {
          filteredCards = filteredCards.filter(c => !c.state || !c.state.dueDate);
        } else if (studyFilter === 'leech') {
          filteredCards = filteredCards.filter(c => {
            const fails = (c.history || []).filter(h => h.rating === 'again').length;
            return fails >= 6;
          });
        }
        
        if (studyType !== 'all') {
          filteredCards = filteredCards.filter(c => (c.cardType || 'default') === studyType);
        }

        const getRefinedEstTime = (selectedCards) => {
          const buffer = 5;
          let totalSecs = 0;
          selectedCards.forEach(card => {
            const history = card.history || [];
            const validHistory = history.filter(h => h.timeSpent && h.timeSpent > 0 && h.timeSpent <= 120);
            if (validHistory.length > 0) {
              const avg = validHistory.reduce((sum, h) => sum + h.timeSpent, 0) / validHistory.length;
              totalSecs += avg + buffer;
            } else {
              const diff = card.predictedDifficulty || 'medium';
              const baseline = diff === 'easy' ? 12 : diff === 'hard' ? 45 : 25;
              totalSecs += baseline + buffer;
            }
          });
          return Math.round(totalSecs);
        };

        const generateScientificRoutine = (totalSecs, cardCount) => {
          const totalMins = Math.ceil(totalSecs / 60);
          if (totalMins <= 10) {
            return [
              { type: 'study', duration: totalMins, desc: `Study block: Complete all ${cardCount} cards.` }
            ];
          } else if (totalMins <= 25) {
            const halfMins = Math.round(totalMins / 2);
            const halfCards = Math.round(cardCount / 2);
            return [
              { type: 'study', duration: halfMins, desc: `Study Block 1: Review ~${halfCards} cards.` },
              { type: 'break', duration: 3, desc: `Short Break: Stretch, breathe, and rest your eyes (3m).` },
              { type: 'study', duration: totalMins - halfMins, desc: `Study Block 2: Finish remaining ~${cardCount - halfCards} cards.` }
            ];
          } else {
            const routine = [];
            let remainingSecs = totalSecs;
            let remainingCards = cardCount;
            let blockNum = 1;
            const secsPerCard = totalSecs / cardCount;
            
            while (remainingSecs > 0) {
              const blockSecs = Math.min(remainingSecs, 15 * 60);
              const blockMins = Math.ceil(blockSecs / 60);
              const blockCards = Math.min(remainingCards, Math.round(blockSecs / secsPerCard));
              
              routine.push({
                type: 'study',
                duration: blockMins,
                desc: `Study Block ${blockNum}: Review ~${blockCards} cards.`
              });
              
              remainingSecs -= blockSecs;
              remainingCards -= blockCards;
              blockNum++;
              
              if (remainingSecs > 0) {
                routine.push({
                  type: 'break',
                  duration: 5,
                  desc: `Short Break: Hydrate and walk around (5m).`
                });
              }
            }
            return routine;
          }
        };

        const totalEstSeconds = getRefinedEstTime(filteredCards);
        const estTimeStr = totalEstSeconds >= 60 
          ? `${Math.floor(totalEstSeconds / 60)}m ${totalEstSeconds % 60}s` 
          : `${totalEstSeconds}s`;
          
        const routineBlocks = generateScientificRoutine(totalEstSeconds, filteredCards.length);

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="glass-panel animate-scale-in" style={{ width: '100%', maxWidth: '440px', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Play size={20} style={{ color: 'var(--accent-primary)' }} /> Study Options
                </h2>
                <button className="btn btn-secondary" onClick={() => setStudyOptionsDeckId(null)} style={{ padding: '0.4rem', borderRadius: '50%' }}><X size={16} /></button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Card Status</label>
                  <select 
                    className="input-field" 
                    value={studyFilter} 
                    onChange={e => setStudyFilter(e.target.value)}
                    style={{ appearance: 'none', cursor: 'pointer' }}
                  >
                    <option value="due">Due Cards Only</option>
                    <option value="new">New Cards Only</option>
                    <option value="leech">Leech Cards Only (&gt;6 fails)</option>
                    <option value="all">All Cards (Custom Review)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Card Type</label>
                  <select 
                    className="input-field" 
                    value={studyType} 
                    onChange={e => setStudyType(e.target.value)}
                    style={{ appearance: 'none', cursor: 'pointer' }}
                  >
                    <option value="all">All Types</option>
                    <option value="logic">Logic / Concepts</option>
                    <option value="rote">Rote / Facts</option>
                    <option value="vocabulary">Vocabulary / Translation</option>
                  </select>
                </div>

                <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '0.85rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cards Matching: <strong style={{ color: 'var(--text-primary)' }}>{filteredCards.length}</strong></span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Est. Time: <strong style={{ color: 'var(--accent-primary)' }}>~{estTimeStr}</strong></span>
                </div>

                {filteredCards.length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', padding: '0.85rem 1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={12} /> Daily Study Routine Breakdowns
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '120px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {routineBlocks.map((block, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', fontSize: '0.8rem' }}>
                          <span style={{ color: block.type === 'study' ? '#a78bfa' : '#34d399', fontWeight: 800, minWidth: '40px', flexShrink: 0 }}>
                            [{block.duration}m]
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{block.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.25rem' }}>
                <button className="btn btn-secondary" onClick={() => setStudyOptionsDeckId(null)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    onStartStudy(deck.id, { filter: studyFilter, type: studyType });
                    setStudyOptionsDeckId(null);
                  }}
                  disabled={filteredCards.length === 0}
                  style={{ opacity: filteredCards.length === 0 ? 0.5 : 1, cursor: filteredCards.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  Start Review
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Refactor Card Modal */}
      {refactorCard && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', padding: '1rem' }}>
          <div className="glass-panel animate-scale-in" style={{ width: '100%', maxWidth: '600px', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: '#f472b6' }}>
                <Sparkles size={20} /> AI Refactor Card ("Make Easy")
              </h2>
              <button className="btn btn-secondary" onClick={() => setRefactorCard(null)} style={{ padding: '0.4rem', borderRadius: '50%' }}><X size={16} /></button>
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>ORIGINAL CARD</span>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}><strong>Q:</strong> {refactorCard.question}</p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}><strong>Concept:</strong> {refactorCard.concept}</p>
            </div>

            {!refactorResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Refactoring Strategy</label>
                  <select 
                    value={refactorMethod} 
                    onChange={e => setRefactorMethod(e.target.value)}
                    className="input-field"
                    style={{ appearance: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 0.8rem', borderRadius: '6px', color: 'var(--text-primary)' }}
                  >
                    <option value="auto" style={{ background: '#111' }}>Auto-Detect Method (Recommended)</option>
                    <option value="simplify" style={{ background: '#111' }}>Method A: Text Simplification (Conciseness)</option>
                    <option value="split" style={{ background: '#111' }}>Method B: Atomic Splitting (Break into Child Cards)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Custom Instructions (Optional)</label>
                  <input
                    type="text"
                    value={refactorCustomInstructions}
                    onChange={e => setRefactorCustomInstructions(e.target.value)}
                    placeholder="e.g. Focus on keeping formulas simple"
                    className="input-field"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 0.8rem', borderRadius: '6px', color: 'var(--text-primary)' }}
                  />
                </div>

                <button 
                  className="btn btn-primary" 
                  onClick={handleRunRefactor} 
                  disabled={isRefactoring}
                  style={{ width: '100%', padding: '0.6rem', background: 'linear-gradient(135deg, #a78bfa, #ec4899)', border: 'none', color: '#fff', fontWeight: 700 }}
                >
                  {isRefactoring ? '🧙‍♂️ AI is refactoring...' : '🪄 Run AI Refactoring'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'left' }}>
                <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', padding: '1rem', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#86efac', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                    ✔ AI Refactoring Preview ({refactorResult.methodApplied.toUpperCase()})
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {refactorResult.explanation}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {refactorResult.methodApplied === 'simplify' ? (
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#c084fc', display: 'block', fontWeight: 600 }}>SIMPLIFIED PREVIEW</span>
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', fontWeight: 600 }}><strong>Q:</strong> {refactorResult.simplifiedCard.question}</p>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}><strong>Concept:</strong> {refactorResult.simplifiedCard.concept}</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#f472b6', fontWeight: 600 }}>SPLIT CHILD CARDS PREVIEW</span>
                      {refactorResult.splitCards.map((sc, idx) => (
                        <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Child #{idx + 1}</span>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', fontWeight: 600 }}><strong>Q:</strong> {sc.question}</p>
                          <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}><strong>Concept:</strong> {sc.concept}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button className="btn btn-secondary" onClick={() => setRefactorResult(null)} style={{ flex: 1 }}>Modify Parameters</button>
                  <button className="btn btn-primary" onClick={handleAcceptRefactor} style={{ flex: 1, background: 'var(--accent-primary)', border: 'none', color: '#fff', fontWeight: 700 }}>Accept Refactoring</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Knowledge Graph Modal */}
      {graphFileId && (() => {
        const graphFile = Files.find(f => f.id === graphFileId);
        if (!graphFile || !graphFile.knowledgeGraph) return null;
        const graphDecks = (graphFile.deckIds || []).map(id => Decks.find(d => d.id === id)).filter(Boolean);
        const graphCards = Cards.filter(c => graphDecks.some(d => d.id === c.deckId));
        return (
          <KnowledgeGraph
            graphData={graphFile.knowledgeGraph}
            cards={graphCards}
            decks={graphDecks}
            onClose={() => setGraphFileId(null)}
            onSelectCard={(cardId) => {
              const card = Cards.find(c => c.id === cardId);
              if (card) setActiveCardDetails(card);
            }}
            onSelectDeck={(deckId) => {
              setGraphFileId(null);
              setActiveDeckId(deckId);
            }}
          />
        );
      })()}
    </>
  );
}

function MindMapNode({ node, cards, onOpenCardDetails }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Support both cardIds array and legacy cardId
  let associatedCardIds = [];
  if (Array.isArray(node.cardIds)) {
    associatedCardIds = node.cardIds;
  } else if (node.cardId) {
    associatedCardIds = [node.cardId];
  }

  const associatedCards = (associatedCardIds.length > 0 && cards)
    ? cards.filter(c => associatedCardIds.includes(c.id))
    : [];

  const getCardScore = (c) => {
    if (c.history && c.history.length > 0) {
      return c.history[c.history.length - 1].score;
    } else if (c.state) {
      return (10 - c.state.difficulty) * 10;
    }
    return null;
  };

  let averageScore = null;
  const scores = associatedCards.map(getCardScore).filter(s => s !== null);
  if (scores.length > 0) {
    averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  const hasChildren = node.children && node.children.length > 0;

  const isMissingNode = (!hasChildren && associatedCardIds.length === 0) || 
    (node.label && (
      node.label.toLowerCase().includes('white') || 
      node.label.toLowerCase().includes('missing') || 
      node.label.toLowerCase().includes('empty') || 
      node.label.toLowerCase().includes('(missing)')
    )) || 
    node.isWhite === true;

  // Red at HSL 0 (score=0), Green at HSL 120 (score=100), White for missing nodes
  const nodeColor = isMissingNode
    ? '#ffffff'
    : (averageScore !== null 
        ? `hsl(${averageScore * 1.2}, 85%, 60%)` 
        : (hasChildren ? 'var(--text-primary)' : 'var(--text-secondary)'));

  const handleNodeClick = (e) => {
    if (associatedCards.length === 1 && onOpenCardDetails) {
      e.stopPropagation();
      onOpenCardDetails(associatedCards[0]);
    } else if (hasChildren) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div className="mindmap-node" style={{ textAlign: 'left', borderLeft: '1px dashed var(--border-light)', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.4rem', 
          cursor: (hasChildren || associatedCards.length === 1) ? 'pointer' : 'default',
          userSelect: 'none'
        }}
        onClick={handleNodeClick}
      >
        {hasChildren ? (
          <span onClick={(e) => {
            if (associatedCards.length === 1) {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }
          }}>
            {isCollapsed ? <ChevronRight size={14} style={{ color: 'var(--accent-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--accent-primary)' }} />}
          </span>
        ) : (
          <div style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: isMissingNode ? 'transparent' : (averageScore !== null ? nodeColor : 'var(--text-muted)'),
            border: isMissingNode ? '1px dashed #ffffff' : 'none',
            margin: '0 4px' 
          }} />
        )}
        <span 
          style={{ 
            fontWeight: hasChildren ? 600 : 400, 
            fontSize: hasChildren ? '0.95rem' : '0.9rem',
            color: nodeColor,
            fontStyle: isMissingNode ? 'italic' : 'normal',
            textDecoration: associatedCards.length === 1 ? 'underline' : 'none',
            textDecorationColor: associatedCards.length === 1 ? 'rgba(255,255,255,0.2)' : 'transparent',
            textDecorationStyle: 'dashed',
            opacity: isMissingNode ? 0.9 : 1,
            transition: 'all 0.2s ease'
          }}
          title={associatedCards.length === 1 ? "Click to view flashcard progress & history" : ""}
        >
          {node.label}
          {isMissingNode && (
            <span style={{ fontSize: '0.72rem', opacity: 0.8, marginLeft: '0.4rem', color: '#f87171', fontWeight: 600 }}>
              (Missing Point / Gap)
            </span>
          )}
          {associatedCards.length === 1 && !isMissingNode && (
            <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '0.4rem', color: 'var(--text-muted)' }}>
              ({averageScore !== null ? `${Math.round(averageScore)}%` : 'New'})
            </span>
          )}
          {associatedCards.length > 1 && !isMissingNode && (
            <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '0.4rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              (Avg: {averageScore !== null ? `${Math.round(averageScore)}%` : 'New'})
            </span>
          )}
        </span>

        {/* Render circular reference bubbles for all associated cards */}
        {associatedCards.map((c, idx) => {
          const cScore = getCardScore(c);
          const cColor = cScore !== null ? `hsl(${cScore * 1.2}, 85%, 45%)` : 'var(--text-muted)';
          return (
            <span
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCardDetails) onOpenCardDetails(c);
              }}
              title={c.question}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#fff',
                background: cColor,
                cursor: 'pointer',
                userSelect: 'none',
                marginLeft: '4px',
                verticalAlign: 'middle',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1.0)';
              }}
            >
              {idx + 1}
            </span>
          );
        })}
      </div>
      
      {hasChildren && !isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
          {node.children && node.children.map((child, idx) => (
            <MindMapNode key={idx} node={child} cards={cards} onOpenCardDetails={onOpenCardDetails} />
          ))}
        </div>
      )}
    </div>
  );
}
