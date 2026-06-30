import React, { useState, useEffect, useRef } from 'react';
import { Clock, Star, BrainCircuit, CheckCircle, AlertTriangle, ArrowRight, BookOpen, RotateCcw, XCircle, Activity, ChevronDown, ChevronUp, RefreshCw, Sparkles, Trophy, Flame } from 'lucide-react';
import { evaluateAnswer, chatTutorStep, generateMnemonic, refactorHardCard, getDetailedAnalysis } from '../utils/gemini';
import { getFriendlyInterval } from '../utils/srs';
import { hasFeatureUnlocked } from '../utils/gamification';
import HighlightingTTS from './HighlightingTTS';
import InlineTTSButton from './InlineTTSButton';
import { playSuccess, playFailure, playSimWin } from '../utils/sound';


// Simple markdown parsing helper
const parseMarkdown = (markdown) => {
  if (!markdown) return '';
  const lines = markdown.split('\n');
  let inList = false;
  let html = '';

  lines.forEach(line => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${trimmed.slice(4)}</h3>`;
    } else if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${trimmed.slice(3)}</h2>`;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { html += '<ul class="markdown-list">'; inList = true; }
      const content = trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html += `<li>${content}</li>`;
    } else if (trimmed === '') {
      if (inList) { html += '</ul>'; inList = false; }
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      const content = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html += `<p>${content}</p>`;
    }
  });

  if (inList) { html += '</ul>'; }
  return html;
};

// Word Highlighting segmenter function
export function highlightAnswerText(userAnswer, highlights) {
  if (!userAnswer) return <span style={{ color: 'var(--text-muted)' }}>(Empty response)</span>;
  if (!highlights || highlights.length === 0) return <span>{userAnswer}</span>;

  let segments = [{ text: userAnswer, isMatch: false }];
  const sortedHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length);

  sortedHighlights.forEach(hl => {
    const hlText = hl.text;
    if (!hlText || !hlText.trim()) return;

    let newSegments = [];
    segments.forEach(seg => {
      if (seg.isMatch) {
        newSegments.push(seg);
        return;
      }

      const lowerSegText = seg.text.toLowerCase();
      const lowerHlText = hlText.toLowerCase();
      let startIdx = lowerSegText.indexOf(lowerHlText);

      if (startIdx === -1) {
        newSegments.push(seg);
        return;
      }

      let lastIdx = 0;
      while (startIdx !== -1) {
        if (startIdx > lastIdx) {
          newSegments.push({ text: seg.text.substring(lastIdx, startIdx), isMatch: false });
        }

        newSegments.push({
          text: seg.text.substring(startIdx, startIdx + hlText.length),
          isMatch: true,
          color: hl.color,
          reason: hl.reason
        });

        lastIdx = startIdx + hlText.length;
        startIdx = lowerSegText.indexOf(lowerHlText, lastIdx);
      }

      if (lastIdx < seg.text.length) {
        newSegments.push({ text: seg.text.substring(lastIdx), isMatch: false });
      }
    });

    segments = newSegments;
  });

  return (
    <span>
      {segments.map((seg, idx) => {
        if (!seg.isMatch) return <span key={idx}>{seg.text}</span>;

        let bg = 'rgba(16, 185, 129, 0.18)'; // green
        let border = 'rgba(16, 185, 129, 0.35)';
        let textCol = '#a7f3d0';
        if (seg.color === 'red') {
          bg = 'rgba(239, 68, 68, 0.18)'; // red
          border = 'rgba(239, 68, 68, 0.35)';
          textCol = '#fca5a5';
        } else if (seg.color === 'yellow') {
          bg = 'rgba(245, 158, 11, 0.18)'; // yellow
          border = 'rgba(245, 158, 11, 0.35)';
          textCol = '#fde047';
        }

        return (
          <span 
            key={idx} 
            style={{ 
              background: bg, 
              border: `1px solid ${border}`,
              borderRadius: '4px',
              padding: '0.1rem 0.25rem',
              margin: '0 0.05rem',
              color: textCol,
              cursor: 'help'
            }}
            title={seg.reason}
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}

export function highlightConceptText(concept, conceptHighlights) {
  if (!concept) return <span style={{ color: 'var(--text-muted)' }}>(Empty concept)</span>;
  if (!conceptHighlights || conceptHighlights.length === 0) return <span>{concept}</span>;

  let segments = [{ text: concept, isMatch: false }];
  const sortedHighlights = [...conceptHighlights].sort((a, b) => b.text.length - a.text.length);

  sortedHighlights.forEach(hl => {
    const hlText = hl.text;
    if (!hlText || !hlText.trim()) return;

    let newSegments = [];
    segments.forEach(seg => {
      if (seg.isMatch) {
        newSegments.push(seg);
        return;
      }

      const lowerSegText = seg.text.toLowerCase();
      const lowerHlText = hlText.toLowerCase();
      let startIdx = lowerSegText.indexOf(lowerHlText);

      if (startIdx === -1) {
        newSegments.push(seg);
        return;
      }

      let lastIdx = 0;
      while (startIdx !== -1) {
        if (startIdx > lastIdx) {
          newSegments.push({ text: seg.text.substring(lastIdx, startIdx), isMatch: false });
        }

        newSegments.push({
          text: seg.text.substring(startIdx, startIdx + hlText.length),
          isMatch: true,
          type: hl.type, // 'main' | 'missed'
          reason: hl.reason
        });

        lastIdx = startIdx + hlText.length;
        startIdx = lowerSegText.indexOf(lowerHlText, lastIdx);
      }

      if (lastIdx < seg.text.length) {
        newSegments.push({ text: seg.text.substring(lastIdx), isMatch: false });
      }
    });

    segments = newSegments;
  });

  return (
    <span>
      {segments.map((seg, idx) => {
        if (!seg.isMatch) return <span key={idx}>{seg.text}</span>;

        if (seg.type === 'main') {
          // Bold Italic style
          return (
            <strong 
              key={idx} 
              style={{ 
                fontStyle: 'italic',
                fontWeight: 800,
                color: 'var(--text-primary)' 
              }}
              title={seg.reason || "Main keyword"}
            >
              {seg.text}
            </strong>
          );
        } else if (seg.type === 'missed') {
          // Green highlight style (words the user missed)
          return (
            <span 
              key={idx} 
              style={{ 
                background: 'rgba(16, 185, 129, 0.25)', 
                border: '1px solid rgba(16, 185, 129, 0.45)',
                borderRadius: '4px',
                padding: '0.1rem 0.25rem',
                margin: '0 0.05rem',
                color: '#a7f3d0',
                cursor: 'help'
              }}
              title={seg.reason || "Missed concept"}
            >
              {seg.text}
            </span>
          );
        }

        return <span key={idx}>{seg.text}</span>;
      })}
    </span>
  );
}


const getYouTubeEmbedUrl = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) 
    ? `https://www.youtube.com/embed/${match[2]}` 
    : null;
};

const isHardCard = (card) => {
  if (!card) return false;
  if (card.predictedDifficulty === 'hard') return true;
  if (card.state && card.state.difficulty >= 7.0) return true;
  return false;
};

const renderCardMedia = (card) => {
  if (!card) return null;
  const embedUrl = getYouTubeEmbedUrl(card.youtubeUrl);
  if (!card.imageUrl && !embedUrl) return null;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', marginTop: '1rem', marginBottom: '1rem' }}>
      {card.imageUrl && (
        <img 
          src={card.imageUrl} 
          alt="Card attachment" 
          style={{ 
            maxWidth: '100%', 
            maxHeight: '350px', 
            objectFit: 'contain', 
            borderRadius: '12px', 
            border: '1px solid var(--border-light)',
            alignSelf: 'flex-start'
          }} 
        />
      )}
      {embedUrl && (
        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0, borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
          <iframe 
            src={embedUrl} 
            title="YouTube Video Player" 
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />
        </div>
      )}
    </div>
  );
};

// Lightweight canvas-based confetti animation
function ConfettiCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#a78bfa', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    const confettiCount = 120;
    const confetti = [];

    for (let i = 0; i < confettiCount; i++) {
      confetti.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 5 + 4,
        d: Math.random() * canvas.height,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.07 + 0.02,
        tiltAngle: 0
      });
    }

    function draw() {
      if (!canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let remaining = false;
      confetti.forEach((p, index) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2.5;
        p.x += Math.sin(p.tiltAngle) * 0.5;
        p.tilt = Math.sin(p.tiltAngle - index / 3) * 15;

        if (p.y <= canvas.height) {
          remaining = true;
        }

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });

      if (remaining) {
        animationFrameId = requestAnimationFrame(draw);
      }
    }

    draw();

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  );
}

export default function StudySession({ Deck, DueCards, apiKey, model, targetRetention = 90, customInstructions = "", voiceURI = "", onRateCard, onClose, settings = {}, onRefactorCard }) {
  const [sessionQueue, setSessionQueue] = useState(() => [...(DueCards || [])]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentCard = sessionQueue[currentIndex];

  const [step, setStep] = useState('question'); // 'question' | 'grading' | 'simulation' | 'completed'
  const [userAnswer, setUserAnswer] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [hoverConfidence, setHoverConfidence] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [hardCardTimestamps, setHardCardTimestamps] = useState([]);
  const [pacingNotice, setPacingNotice] = useState('');

  // Refactoring states & handlers
  const [refactorCard, setRefactorCard] = useState(null);
  const [refactorMethod, setRefactorMethod] = useState('auto'); // 'auto', 'simplify', 'split'
  const [refactorCustomInstructions, setRefactorCustomInstructions] = useState('');
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [refactorResult, setRefactorResult] = useState(null);

  const handleOpenRefactorModal = (card) => {
    setRefactorCard(card);
    setRefactorMethod('auto');
    setRefactorCustomInstructions('');
    setRefactorResult(null);
    setIsRefactoring(false);
  };

  const handleRunRefactor = async () => {
    if (!apiKey) {
      alert("Please configure your Gemini API key in Settings first.");
      return;
    }
    setIsRefactoring(true);
    try {
      const result = await refactorHardCard(apiKey, model, refactorCard, refactorMethod, refactorCustomInstructions);
      setRefactorResult(result);
    } catch (e) {
      alert("Refactoring failed: " + e.message);
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleAcceptRefactor = () => {
    onRefactorCard(refactorCard.id, refactorResult);
    
    if (refactorResult.methodApplied === 'simplify') {
      const updatedQueue = sessionQueue.map(c => {
        if (c.id === refactorCard.id) {
          return {
            ...c,
            question: refactorResult.simplifiedCard.question,
            concept: refactorResult.simplifiedCard.concept
          };
        }
        return c;
      });
      setSessionQueue(updatedQueue);
    } else {
      const updatedQueue = sessionQueue.filter(c => c.id !== refactorCard.id);
      const childrenWithIds = refactorResult.splitCards.map((sc, idx) => ({
        ...sc,
        id: `${refactorCard.id}-child-${idx}-${Date.now()}`,
        deckId: refactorCard.deckId,
        history: [],
        state: null
      }));
      updatedQueue.splice(currentIndex, 0, ...childrenWithIds);
      setSessionQueue(updatedQueue);
    }
    
    setRefactorCard(null);
    setRefactorResult(null);
    alert("Card refactoring applied to your active study session!");
  };

  // Sync session queue if DueCards changes
  useEffect(() => {
    if (DueCards) {
      setSessionQueue([...DueCards]);
    }
  }, [DueCards]);

  // Throttling / Pacing Engine logic
  useEffect(() => {
    if (sessionQueue.length === 0 || currentIndex >= sessionQueue.length) return;
    
    const card = sessionQueue[currentIndex];
    const maxLimit = settings.maxHardCardsPer5Min ?? 2;
    
    if (maxLimit >= 999) return;
    
    if (isHardCard(card)) {
      const now = Date.now();
      const last5Min = hardCardTimestamps.filter(t => now - t < 5 * 60 * 1000);
      
      if (last5Min.length >= maxLimit) {
        // Find next non-hard card in remaining queue
        const swapIdx = sessionQueue.findIndex((c, idx) => idx > currentIndex && !isHardCard(c));
        
        if (swapIdx !== -1) {
          const newQueue = [...sessionQueue];
          const temp = newQueue[currentIndex];
          newQueue[currentIndex] = newQueue[swapIdx];
          newQueue[swapIdx] = temp;
          
          setSessionQueue(newQueue);
          setPacingNotice("🧠 Pacing Engine: Swapping in an easier card to prevent cognitive fatigue.");
          setTimeout(() => setPacingNotice(""), 4000);
          return;
        }
      }
      
      setHardCardTimestamps([...last5Min, now]);
    }
  }, [currentIndex, sessionQueue, settings.maxHardCardsPer5Min]);
  
  // Mnemonic assistance states
  const [mnemonicText, setMnemonicText] = useState('');
  const [isMnemonicLoading, setIsMnemonicLoading] = useState(false);
  const [mnemonicError, setMnemonicError] = useState(null);
  
  // Timer State
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);

  // AI Response States
  const [isGradingLoading, setIsGradingLoading] = useState(false);
  const [gradingError, setGradingError] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [gradingStatus, setGradingStatus] = useState('');

  // Interactive Puzzle States
  const [puzzleScrambled, setPuzzleScrambled] = useState([]);
  const [puzzlePlaced, setPuzzlePlaced] = useState([]);
  const [puzzleSolved, setPuzzleSolved] = useState(false);

  // Lazy-loaded Detailed AI Analysis
  const [detailedAnalysis, setDetailedAnalysis] = useState(null);
  const [isDetailedLoading, setIsDetailedLoading] = useState(false);
  const [detailedError, setDetailedError] = useState(null);

  // Copy Prompt State
  const [copySuccess, setCopySuccess] = useState(false);
  const [showPastAnswers, setShowPastAnswers] = useState(false);

  // Chat tutor states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [interactiveOmittedItems, setInteractiveOmittedItems] = useState([]);
  const [currentOmittedIndex, setCurrentOmittedIndex] = useState(0);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const isTutoringComplete = interactiveOmittedItems.length === 0 || interactiveOmittedItems.every(item => item.status === 'resolved');



  const [showBurnoutWarning, setShowBurnoutWarning] = useState(false);

  // Start timer on question load
  useEffect(() => {
    if (step === 'question' && currentCard) {
      setElapsedTime(0);
      setShowHint(settings.relaxedMode && (!currentCard.history || currentCard.history.length === 0));
      setShowBurnoutWarning(false);
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= 45 && userAnswer.length < 5) {
            setShowBurnoutWarning(true);
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [step, currentIndex, currentCard, userAnswer.length, settings.relaxedMode]);

  // Clean timer on unmount
  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  // Trigger MathJax typesetting when card content updates
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise().catch(err => console.error(err));
    }
  }, [step, currentIndex, evaluation, isGradingLoading]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleAnswerSubmit = async () => {
    if (!userAnswer.trim()) return;
    clearInterval(timerRef.current);
    setIsGradingLoading(true);
    setGradingError(null);
    setEvaluation(null);
    setGradingStatus('Initializing grading request...');

    // Custom instructions for Gentle AI / Stress Mode
    let finalCustomInstructions = customInstructions;
    if (settings.stressMode) {
      finalCustomInstructions = `[GENTLE AI MODE ACTIVE]: The student is feeling burnt out or stressed. 
1. Use an extremely comforting, warm, encouraging, and supportive tone.
2. Keep the Concept Correction & Explanation ("correctExplanation") ultra-brief (under 40 words total) with a simple real-world analogy.
3. Be highly forgiving. In logicAnalysis, provide a brief 1-sentence supportive comment.
4. If there are numbers or formulas, explain them using visual shape analogies (e.g. 1 = candle, 2 = swan) or a quick visual association.
` + (customInstructions ? `\n` + customInstructions : '');
    }

    try {
      const result = await evaluateAnswer(
        apiKey,
        model,
        currentCard.question,
        currentCard.concept,
        userAnswer,
        elapsedTime,
        confidence,
        currentCard.state?.consecutiveFails || 0,
        currentCard.history || [],
        finalCustomInstructions,
        (status) => setGradingStatus(status),
        currentCard.cardType || 'default'
      );
      
      setEvaluation(result);
      
      // Initialize Puzzle State
      const pieces = result.puzzlePieces || [];
      if (pieces.length > 0) {
        // Scramble/shuffle pieces
        const indices = Array.from({ length: pieces.length }, (_, i) => i);
        const scrambledIndices = [...indices].sort(() => Math.random() - 0.5);
        setPuzzleScrambled(scrambledIndices.map(idx => pieces[idx]));
        setPuzzlePlaced([]);
        setPuzzleSolved(false);
      } else {
        setPuzzleScrambled([]);
        setPuzzlePlaced([]);
        setPuzzleSolved(false);
      }

      // Reset detailed analysis lazy-load state
      setDetailedAnalysis(null);
      setDetailedError(null);
      setIsDetailedLoading(false);

      setStep('grading');

      // Check if card is a Leech (>= 6 fails) and Tutor is unlocked
      const fails = (currentCard.history || []).filter(h => h.rating === 'again').length;
      const isLeech = fails >= 6;
      const canUseTutor = hasFeatureUnlocked(settings, 'interactiveTutor') && isLeech;

      // Initialize interactive chatbot states
      const oItems = result.omittedItems || [];
      const initItems = canUseTutor ? oItems.map(item => ({ text: item, status: 'unresolved' })) : [];
      setInteractiveOmittedItems(initItems);
      setCurrentOmittedIndex(0);
      
      if (canUseTutor && initItems.length > 0) {
        setChatMessages([
          { 
            sender: 'tutor', 
            text: `Hi there! I notice you missed some key parts in your answer. Let's review them one by one to help you remember. First, what were you thinking about "${initItems[0].text}"?`, 
            highlights: [] 
          }
        ]);
      } else {
        setChatMessages([]);
      }
      setChatInput('');

      // Play audio feedback based on AI score threshold
      if (result.score >= 60) {
        playSuccess();
      } else {
        playFailure();
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.message || 'Failed to grade your answer. Check your connection or API key.';
      setGradingError(errMsg);
      alert(`Grading Error:\n\n${errMsg}`);
    } finally {
      setIsGradingLoading(false);
    }
  };

  const handleGenerateMnemonic = async () => {
    if (!currentCard) return;
    setIsMnemonicLoading(true);
    setMnemonicError(null);
    setMnemonicText('');
    try {
      const text = await generateMnemonic(apiKey, model, currentCard.question, currentCard.concept);
      setMnemonicText(text);
    } catch (err) {
      console.error(err);
      setMnemonicError(err.message || 'Failed to generate mnemonic. Please check API settings.');
    } finally {
      setIsMnemonicLoading(false);
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userText = chatInput;
    setChatInput('');
    setIsChatLoading(true);

    const newMsg = { sender: 'user', text: userText, highlights: [] };
    const updatedHistory = [...chatMessages, newMsg];
    setChatMessages(updatedHistory);

    try {
      const activeItem = interactiveOmittedItems[currentOmittedIndex]?.text || '';
      const result = await chatTutorStep(
        apiKey,
        model,
        currentCard.question,
        currentCard.concept,
        userAnswer,
        activeItem,
        chatMessages,
        userText
      );

      const updatedMessages = [...updatedHistory];
      updatedMessages[updatedMessages.length - 1].highlights = result.highlights || [];
      
      const tutorMsg = { sender: 'tutor', text: result.response, highlights: [] };
      updatedMessages.push(tutorMsg);
      setChatMessages(updatedMessages);

      if (result.resolved && activeItem) {
        const updatedItems = interactiveOmittedItems.map((item, idx) => {
          if (idx === currentOmittedIndex) {
            return { ...item, status: 'resolved' };
          }
          return item;
        });
        setInteractiveOmittedItems(updatedItems);

        const nextIdx = currentOmittedIndex + 1;
        if (nextIdx < updatedItems.length) {
          setCurrentOmittedIndex(nextIdx);
          const nextItemText = updatedItems[nextIdx].text;
          setTimeout(() => {
            setChatMessages(prev => [
              ...prev,
              { sender: 'tutor', text: `Excellent! You've grasped that. Now, let's focus on the next missing concept: "${nextItemText}". What can you tell me about it, or why was it omitted?`, highlights: [] }
            ]);
          }, 1000);
        } else {
          setTimeout(() => {
            setChatMessages(prev => [
              ...prev,
              { sender: 'tutor', text: `Fantastic! You've resolved all the logical gaps and recalled all the missing parts. You are ready to move on!`, highlights: [] }
            ]);
          }, 1000);
        }
      }
    } catch (e) {
      console.error(e);
      setChatMessages(prev => [
        ...prev,
        { sender: 'tutor', text: `Sorry, I encountered an error: ${e.message}`, highlights: [] }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const checkPuzzleSolved = (placedIndices) => {
    if (!evaluation || !evaluation.puzzlePieces) return false;
    const original = evaluation.puzzlePieces.join(' ').trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    const reconstructed = placedIndices.map(idx => puzzleScrambled[idx]).join(' ').trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    return original === reconstructed;
  };

  const handlePlacePiece = (idx) => {
    if (puzzlePlaced.includes(idx)) return;
    const nextPlaced = [...puzzlePlaced, idx];
    setPuzzlePlaced(nextPlaced);
    if (checkPuzzleSolved(nextPlaced)) {
      setPuzzleSolved(true);
      playSuccess();
    }
  };

  const handleRemovePiece = (placedIdx) => {
    const nextPlaced = puzzlePlaced.filter((_, idx) => idx !== placedIdx);
    setPuzzlePlaced(nextPlaced);
    setPuzzleSolved(checkPuzzleSolved(nextPlaced));
  };

  const handleResetPuzzle = () => {
    setPuzzlePlaced([]);
    setPuzzleSolved(false);
  };

  const handleFetchDetailedAnalysis = async () => {
    if (!apiKey) {
      alert("Please configure your Gemini API key in Settings first.");
      return;
    }
    setIsDetailedLoading(true);
    setDetailedError(null);
    try {
      const data = await getDetailedAnalysis(apiKey, model, currentCard.question, currentCard.concept, userAnswer);
      setDetailedAnalysis(data);
    } catch (e) {
      console.error(e);
      setDetailedError(e.message || "Failed to fetch detailed analysis.");
    } finally {
      setIsDetailedLoading(false);
    }
  };

  const handleScheduleRating = (rating) => {
    try {
      if (!evaluation) {
        alert('Error: No evaluation data found. Please re-grade this card.');
        return;
      }
      if (!currentCard) {
        alert('Error: No current card found.');
        return;
      }

      onRateCard(
        currentCard.id,
        rating,
        userAnswer,
        evaluation.score || 0,
        evaluation.logicAnalysis || '',
        confidence,
        elapsedTime,
        evaluation // Pass the full evaluation object to archive the report
      );
      
      // Reset states for next card
      setUserAnswer('');
      setConfidence(3);
      setEvaluation(null);
      setShowPastAnswers(false);
      setMnemonicText('');
      setIsMnemonicLoading(false);
      setMnemonicError(null);

      const isFailed = rating === 'again';
      let nextQueueLength = sessionQueue.length;
      if (isFailed) {
        setSessionQueue(prev => [...prev, currentCard]);
        nextQueueLength += 1;
      }

      if (currentIndex + 1 < nextQueueLength) {
        setCurrentIndex(prev => prev + 1);
        setStep('question');
      } else {
        setStep('completed');
        playSimWin();
      }
    } catch (err) {
      console.error('Save & Proceed error:', err);
      alert('Error saving progress: ' + err.message);
    }
  };

  if (step === 'completed') {
    const xp = settings.xp || 0;
    const level = Math.floor(xp / 100) + 1;
    const xpInCurrentLevel = xp % 100;
    const xpPercentage = (xpInCurrentLevel / 100) * 100;
    const streak = settings.streak || 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', position: 'relative' }}>
        <ConfettiCanvas />
        
        <div className="glass-panel animate-fade-in" style={{ padding: '3.5rem 2.5rem', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '24px', textAlign: 'center', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '2rem', boxShadow: '0 0 50px rgba(139, 92, 246, 0.15)', background: 'rgba(15, 10, 30, 0.65)', backdropFilter: 'blur(20px)' }}>
          <div>
            <div style={{ display: 'inline-flex', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(236, 72, 153, 0.2))', padding: '1.25rem', borderRadius: '50%', border: '1px solid rgba(245, 158, 11, 0.4)', marginBottom: '1rem' }}>
              <Trophy size={48} style={{ color: '#fbbf24' }} />
            </div>
            <h2 style={{ background: 'linear-gradient(135deg, #a78bfa, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '2rem', fontWeight: 800, margin: 0 }}>
              Session Complete!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.5rem' }}>
              Amazing effort! You completed all the due cards in this deck.
            </p>
          </div>

          {/* Stats Box */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cards Studied</span>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.25rem 0 0 0' }}>{sessionQueue.length}</p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>XP Earned</span>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399', margin: '0.25rem 0 0 0' }}>+{sessionQueue.length * 15} XP</p>
            </div>
          </div>

          {/* Level Progress */}
          <div style={{ textAlign: 'left', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Sparkles size={16} /> Level {level}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {xpInCurrentLevel} / 100 XP
              </span>
            </div>
            
            {/* Progress bar container */}
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${xpPercentage}%`, height: '100%', background: 'linear-gradient(90deg, #c084fc, #f472b6)', borderRadius: '999px', transition: 'width 1s ease-out' }} />
            </div>
            
            {streak > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.85rem', fontSize: '0.85rem', color: '#f97316', fontWeight: 600 }}>
                <Flame size={16} fill="#f97316" />
                <span>{streak} Day Streak! Keep it up!</span>
              </div>
            )}
          </div>

          <button 
            className="btn btn-primary" 
            onClick={onClose}
            style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', fontWeight: 700, borderRadius: '12px', gap: '0.5rem' }}
          >
            Awesome! Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '3rem', textAlign: 'center' }}>
        <h3>No Cards Due!</h3>
        <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '1rem' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Calculate rating button intervals
  const againInterval = getFriendlyInterval(currentCard, 'again');
  const hardInterval = getFriendlyInterval(currentCard, 'hard');
  const goodInterval = getFriendlyInterval(currentCard, 'good');
  const easyInterval = getFriendlyInterval(currentCard, 'easy');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
      
      {/* Active Session Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-glass)', border: '1px solid var(--border-light)', padding: '0.75rem 1.25rem', borderRadius: '12px' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Reviewing Deck: </span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{Deck.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
            Card {currentIndex + 1} of {sessionQueue.length}
          </span>
          <button 
            className="btn-text" 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <XCircle size={20} />
          </button>
        </div>
      </div>

      {pacingNotice && (
        <div style={{
          background: 'rgba(139, 92, 246, 0.15)',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          color: '#c4b5fd',
          padding: '0.6rem 1rem',
          borderRadius: '8px',
          fontSize: '0.85rem',
          textAlign: 'center',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.1)',
          animation: 'pulse 2s infinite'
        }}>
          {pacingNotice}
        </div>
      )}

      {/* Main Review Card */}
      {step === 'question' && (
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Question Header & Timer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge-learn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <BrainCircuit size={12} /> Evaluate Concept
              </span>
              {hasFeatureUnlocked(settings, 'categorization') && (
                <button 
                  onClick={() => handleOpenRefactorModal(currentCard)}
                  style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)', borderRadius: '6px', cursor: 'pointer', padding: '0.2rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}
                  title="Make Easy (AI Simplify / Split)"
                >
                  <Sparkles size={12} /> Make Easy
                </button>
              )}
            </div>
            <div style={{ display: 'none', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <Clock size={16} />
              <span>{formatTime(elapsedTime)}</span>
            </div>
          </div>

          {/* Question Display */}
          <h2 style={{ fontSize: '1.6rem', textAlign: 'left', lineHeight: '1.4', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>{currentCard.question}</span>
            {hasFeatureUnlocked(settings, 'tts') && <InlineTTSButton text={currentCard.question} voiceURI={voiceURI} />}
          </h2>

          {renderCardMedia(currentCard)}

          {/* Burnout Warning */}
          {showBurnoutWarning && (
            <div className="animate-fade-in" style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', color: '#60a5fa', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🧘‍♂️ Take a breath
              </h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>You've been looking at this for a while. It's okay if you don't know it! Feel free to {settings.relaxedMode && hasFeatureUnlocked(settings, 'hint') ? "use the hint below or " : ""}submit a blank answer to learn it.</p>
            </div>
          )}

          {/* Hint Feature */}
          {settings.relaxedMode && hasFeatureUnlocked(settings, 'hint') && (
            <div style={{ textAlign: 'left', marginTop: '-0.5rem' }}>
              {!showHint ? (
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowHint(true)}
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem', gap: '0.35rem', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.25)' }}
                >
                  💡 Show Hint (Concept)
                </button>
              ) : (
                <div className="glass-panel animate-fade-in" style={{ padding: '1.25rem', background: 'rgba(245, 158, 11, 0.05)', border: '1px dashed rgba(245, 158, 11, 0.3)', borderRadius: '10px' }}>
                  <h4 style={{ color: '#fbbf24', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    💡 Concept Hint {(!currentCard.history || currentCard.history.length === 0) ? "(Auto-shown for first review)" : ""}
                  </h4>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                    {currentCard.concept}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Text Answer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Type your logical explanation (paragraph):
            </label>
            <textarea
              placeholder="Start typing your explanation here..."
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              disabled={isGradingLoading}
              style={{ minHeight: '180px', fontSize: '1rem', lineHeight: '1.5' }}
            />
          </div>

          {/* User Confidence & Submit */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            {/* Confidence Stars */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Confidence:</span>
              <div style={{ display: 'flex', gap: '0.2rem' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    disabled={isGradingLoading}
                    onClick={() => setConfidence(star)}
                    onMouseEnter={() => setHoverConfidence(star)}
                    onMouseLeave={() => setHoverConfidence(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem' }}
                  >
                    <Star
                      size={20}
                      fill={star <= (hoverConfidence || confidence) ? 'var(--warning)' : 'none'}
                      color={star <= (hoverConfidence || confidence) ? 'var(--warning)' : 'var(--text-muted)'}
                      style={{ transition: 'transform 0.1s ease' }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              className="btn btn-primary"
              onClick={handleAnswerSubmit}
              disabled={!userAnswer.trim() || isGradingLoading}
              style={{ gap: '0.5rem', minWidth: '150px' }}
            >
              {isGradingLoading ? 'Evaluating Answer...' : 'Submit to AI Grader'}
            </button>
          </div>

          {/* Loading status details */}
          {isGradingLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', padding: '1.25rem', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '10px', border: '1px dashed rgba(139, 92, 246, 0.3)', textAlign: 'left' }}>
              {hasFeatureUnlocked(settings, 'mnemonics') && (
                <div style={{ padding: '1rem', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '10px', border: '1px dashed rgba(139, 92, 246, 0.3)', textAlign: 'left' }}>
                  <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                    <RotateCcw className="animate-float" size={18} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-primary)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Grading your answer with <strong>Gemini {model}</strong>... (Usually takes 2–5s. Timeout limit 30s)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--accent-secondary)', paddingLeft: '1.75rem', fontFamily: 'monospace' }}>
                    &gt; {gradingStatus}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {gradingError && (
            <div style={{ color: 'var(--danger)', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem', textAlign: 'left', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <AlertTriangle size={16} />
              <span>{gradingError}</span>
            </div>
          )}
        </div>
      )}

      {/* Step 2 & 3: Grading & Simulation Panels */}
      {step === 'grading' && evaluation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Main Evaluation Glass Block */}
          <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Top Row: Concept & AI Score circle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '2rem', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <span className="badge badge-learn" style={{ marginBottom: '0.5rem' }}>AI Grade Report</span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{currentCard.question}</h2>
                {renderCardMedia(currentCard)}
              </div>
              
              {/* Radial score gauge */}
              <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <svg width="90" height="90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  <circle 
                    cx="18" 
                    cy="18" 
                    r="16" 
                    fill="none" 
                    stroke="var(--accent-primary)" 
                    strokeWidth="3" 
                    strokeDasharray="100, 100" 
                    strokeDashoffset={100 - evaluation.score} 
                    strokeLinecap="round"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{evaluation.score}</span>
                  <span style={{ fontSize: '0.55rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Score</span>
                </div>
              </div>
            </div>

            {/* Answer & Reference Comparison Box */}
            {isTutoringComplete && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', textAlign: 'left' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.01)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  Your Answer
                </h4>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                  {highlightAnswerText(userAnswer, evaluation.highlights)}
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.01)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  Reference Answer (Original Concept)
                </h4>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                  {highlightConceptText(currentCard.concept, evaluation.conceptHighlights)}
                </div>
              </div>
            </div>

            {/* Strengths & Weaknesses (Split columns) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', textAlign: 'left' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <h4 style={{ color: '#a7f3d0', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle size={16} />
                  <span>Strengths</span>
                  {hasFeatureUnlocked(settings, 'tts') && <InlineTTSButton text={(evaluation.strengths || []).join('. ') || 'None noted.'} voiceURI={voiceURI} />}
                </h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  {evaluation.strengths.length === 0 && <li>None noted.</li>}
                </ul>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <h4 style={{ color: '#fca5a5', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertTriangle size={16} />
                  <span>Areas to Improve</span>
                  {hasFeatureUnlocked(settings, 'tts') && <InlineTTSButton text={(evaluation.weaknesses || []).join('. ') || 'Perfect coverage!'} voiceURI={voiceURI} />}
                </h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {evaluation.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                  {evaluation.weaknesses.length === 0 && <li>Perfect coverage!</li>}
                </ul>
              </div>
            </div>

              </>
            )}

            {/* Interactive Concept Tutor */}
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>
              
              {/* Header */}
              <div>
                <span className="badge badge-learn" style={{ marginBottom: '0.5rem' }}>Interactive Study Assistant</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <BrainCircuit size={20} style={{ color: 'var(--accent-primary)' }} />
                  Step-by-Step Concept Recall & Discussion
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem', marginBottom: 0 }}>
                  Discuss what you were thinking while answering. Explain or recall the missing elements to turn the checklist green.
                </p>
              </div>

              {/* Omitted Items Progression Bar */}
              {interactiveOmittedItems.length > 0 && (
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.75rem' }}>
                    Omissions Progression Checklist
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>Memory Hook</h4>
                    {hasFeatureUnlocked(settings, 'tts') && <InlineTTSButton text={mnemonicText} voiceURI={voiceURI} />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {interactiveOmittedItems.map((item, idx) => {
                      const isCurrent = idx === currentOmittedIndex;
                      const isResolved = item.status === 'resolved';
                      
                      let bgCol = 'rgba(239, 68, 68, 0.08)'; // red unresolved
                      let borderCol = 'rgba(239, 68, 68, 0.3)';
                      let textCol = '#fca5a5';
                      let icon = '🔴';

                      if (isResolved) {
                        bgCol = 'rgba(16, 185, 129, 0.08)'; // green resolved
                        borderCol = 'rgba(16, 185, 129, 0.3)';
                        textCol = '#a7f3d0';
                        icon = '🟢';
                      } else if (isCurrent) {
                        bgCol = 'rgba(245, 158, 11, 0.08)'; // yellow current
                        borderCol = 'var(--warning)';
                        textCol = '#fde047';
                        icon = '⚡';
                      }

                      return (
                        <React.Fragment key={idx}>
                          <div 
                            style={{
                              background: bgCol,
                              border: `1px solid ${borderCol}`,
                              borderRadius: '8px',
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.85rem',
                              fontWeight: isCurrent ? 700 : 500,
                              color: textCol,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: isCurrent ? '0 0 10px rgba(245, 158, 11, 0.2)' : 'none'
                            }}
                          >
                            <span>{icon}</span>
                            <span>{item.text}</span>
                          </div>
                          {idx < interactiveOmittedItems.length - 1 && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>➔</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chat Conversation Log */}
              <div 
                style={{ 
                  background: 'rgba(0, 0, 0, 0.15)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '12px', 
                  padding: '1.25rem', 
                  height: '240px', 
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                {chatMessages.map((msg, idx) => {
                  const isTutor = msg.sender === 'tutor';
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        alignSelf: isTutor ? 'flex-start' : 'flex-end',
                        maxWidth: '85%',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem', paddingLeft: isTutor ? '0.25rem' : 0, paddingRight: isTutor ? 0 : '0.25rem', textAlign: isTutor ? 'left' : 'right' }}>
                        {isTutor ? '🤖 AI Tutor' : '👤 You'}
                      </div>
                      <div 
                        style={{ 
                          background: isTutor ? 'rgba(255, 255, 255, 0.03)' : 'rgba(139, 92, 246, 0.12)', 
                          border: isTutor ? '1px solid var(--border-light)' : '1px solid rgba(139, 92, 246, 0.25)', 
                          color: isTutor ? 'var(--text-primary)' : '#e0dbff',
                          padding: '0.65rem 0.95rem',
                          borderRadius: isTutor ? '0 12px 12px 12px' : '12px 0 12px 12px',
                          fontSize: '0.88rem',
                          lineHeight: '1.4'
                        }}
                      >
                        {isTutor ? msg.text : highlightAnswerText(msg.text, msg.highlights)}
                      </div>
                    </div>
                  );
                })}
                {isChatLoading && (
                  <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      🤖 AI Tutor
                    </div>
                    <div 
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.03)', 
                        border: '1px solid var(--border-light)', 
                        padding: '0.65rem 0.95rem', 
                        borderRadius: '0 12px 12px 12px',
                        fontSize: '0.88rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: 'var(--text-muted)'
                      }}
                    >
                      <RefreshCw className="animate-float" size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      Thinking...
                    </div>
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChatMessage();
                }}
                style={{ display: 'flex', gap: '0.5rem', margin: 0 }}
              >
                <input
                  type="text"
                  placeholder={
                    interactiveOmittedItems.length > 0 && currentOmittedIndex < interactiveOmittedItems.length
                      ? `Explain what you were thinking or recall "${interactiveOmittedItems[currentOmittedIndex].text}"...`
                      : "Type your comment or follow-up question..."
                  }
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatLoading}
                  style={{ flex: 1, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
                />
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!chatInput.trim() || isChatLoading}
                  style={{ padding: '0 1.5rem', borderRadius: '8px' }}
                >
                  Send
                </button>
              </form>

            </div>

            {isTutoringComplete && (
              <>
                {evaluation.score === 100 ? (
                  <div style={{ textAlign: 'center', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ fontSize: '2.5rem' }}>🎉</div>
                    <h4 style={{ fontSize: '1.1rem', color: '#86efac', margin: 0, fontWeight: 700 }}>Perfect Recall! 100% Correct</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                      {evaluation.correctExplanation || "Your answer matched the reference concept perfectly."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ textAlign: 'left', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', padding: '1rem 1.25rem', borderRadius: '12px' }}>
                      <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>{currentCard.cardType === 'rote' || currentCard.cardType === 'vocabulary' ? 'Gap Analysis' : 'Logical Analysis'}</span>
                        {hasFeatureUnlocked(settings, 'tts') && <InlineTTSButton text={evaluation.logicAnalysis || ''} voiceURI={voiceURI} />}
                      </h4>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        {formatBracketedErrors(evaluation.logicAnalysis)}
                      </div>
                    </div>

                    {/* Interactive Puzzle Component */}
                    {puzzleScrambled.length > 0 && (
                      <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h4 style={{ fontSize: '0.95rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                          🧩 Reconstruct the 100% Model Answer
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                          Click the scrambled blocks below in order to build the perfect target answer.
                        </p>

                        {/* Placed Pieces */}
                        <div style={{ minHeight: '60px', padding: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-light)', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                          {puzzlePlaced.length === 0 ? (
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Reconstructed answer will appear here...</span>
                          ) : (
                            puzzlePlaced.map((pieceIdx, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleRemovePiece(idx)}
                                className="animate-scale-in"
                                style={{ background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15), rgba(236, 72, 153, 0.15))', border: '1px solid rgba(167, 139, 250, 0.3)', color: '#c084fc', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 500 }}
                              >
                                {puzzleScrambled[pieceIdx]}
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>×</span>
                              </button>
                            ))
                          )}
                        </div>

                        {/* Scrambled Pool */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '8px' }}>
                          {puzzleScrambled.map((piece, idx) => {
                            const isUsed = puzzlePlaced.includes(idx);
                            return (
                              <button
                                key={idx}
                                disabled={isUsed}
                                onClick={() => handlePlacePiece(idx)}
                                style={{
                                  background: isUsed ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                                  border: `1px solid ${isUsed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`,
                                  color: isUsed ? 'var(--text-muted)' : 'var(--text-secondary)',
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '6px',
                                  fontSize: '0.85rem',
                                  cursor: isUsed ? 'not-allowed' : 'pointer',
                                  opacity: isUsed ? 0.4 : 1,
                                  transition: 'all 0.2s ease',
                                  fontWeight: 500
                                }}
                              >
                                {piece}
                              </button>
                            );
                          })}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {puzzleSolved ? (
                            <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              🎉 100% Correct Reconstructed!
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                              Place all chunks in chronological order.
                            </span>
                          )}
                          <button onClick={handleResetPuzzle} className="btn-text" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Reset</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Compare with Past Answers Section */}
                {currentCard.history && currentCard.history.length > 0 && (
                  <div style={{ textAlign: 'left', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <div 
                      onClick={() => setShowPastAnswers(!showPastAnswers)} 
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                        <Activity size={16} style={{ color: 'var(--accent-primary)' }} />
                        Compare with Past Answers ({currentCard.history.length})
                      </h4>
                      {showPastAnswers ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>

                    {showPastAnswers && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                        {/* Current Answer */}
                        <div style={{ background: 'rgba(139, 92, 246, 0.03)', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '8px', padding: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <strong style={{ color: 'var(--accent-primary)', fontSize: '0.8rem' }}>Current Answer (This Attempt)</strong>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Score: {evaluation.score}%</span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, whiteSpace: 'pre-line', lineHeight: '1.5' }}>
                            {highlightAnswerText(userAnswer, evaluation.highlights)}
                          </div>
                        </div>

                        {/* Timeline of Past Answers */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                          {[...currentCard.history].reverse().map((past, idx) => {
                            const scoreColor = past.score >= 80 ? 'var(--success)' : (past.score >= 60 ? 'var(--warning)' : 'var(--danger)');
                            const reviewNum = currentCard.history.length - idx;
                            return (
                              <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>Attempt #{reviewNum}</strong>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(past.date).toLocaleDateString()}</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: scoreColor }}>Score: {past.score}%</span>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Answer: </span>
                                    <span style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                                      {highlightAnswerText(past.userAnswer, past.highlights)}
                                    </span>
                                  </div>
                                  {past.logicAnalysis && (
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Feedback: </span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{past.logicAnalysis}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Lazy-Loaded Deep Analysis section */}
                {!detailedAnalysis ? (
                  <div style={{ textAlign: 'left', marginTop: '0.5rem' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={handleFetchDetailedAnalysis}
                      disabled={isDetailedLoading}
                      style={{ width: '100%', padding: '0.65rem', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
                    >
                      {isDetailedLoading ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          Lazy-Loading Deep AI Analysis...
                        </>
                      ) : (
                        <>
                          <BookOpen size={16} />
                          🔍 Read Detailed AI Analysis (Pros, Cons & Concepts)
                        </>
                      )}
                    </button>
                    {detailedError && (
                      <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: '0.5rem' }}>{detailedError}</p>
                    )}
                  </div>
                ) : (
                  <div className="glass-panel animate-fade-in" style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                      <h4 style={{ fontSize: '0.95rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                        📚 Comprehensive AI Feedback
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lazy-Loaded</span>
                    </div>

                    {/* Pros */}
                    {detailedAnalysis.pros && detailedAnalysis.pros.length > 0 && (
                      <div>
                        <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#34d399' }}>✓ What you did well</h5>
                        <ul style={{ margin: 0, paddingLeft: '1.15rem', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {detailedAnalysis.pros.map((pro, i) => <li key={i}>{pro}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Cons */}
                    {detailedAnalysis.cons && detailedAnalysis.cons.length > 0 && (
                      <div>
                        <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#fca5a5' }}>✗ Misconceptions / Gaps</h5>
                        <ul style={{ margin: 0, paddingLeft: '1.15rem', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {detailedAnalysis.cons.map((con, i) => <li key={i}>{con}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Detailed Explanation */}
                    <div>
                      <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Concept Explanation</h5>
                      <div 
                        className="markdown-content"
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(detailedAnalysis.detailedExplanation) }}
                        style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}
                      />
                    </div>

                    {/* Memory Mnemonic assistance inside lazy block */}
                    {hasFeatureUnlocked(settings, 'mnemonics') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={handleGenerateMnemonic}
                          disabled={isMnemonicLoading}
                          style={{
                            alignSelf: 'flex-start',
                            background: 'rgba(236, 72, 153, 0.1)',
                            border: '1px solid rgba(236, 72, 153, 0.3)',
                            color: '#f472b6',
                            gap: '0.5rem',
                            fontSize: '0.85rem',
                            padding: '0.5rem 1.25rem',
                            borderRadius: '8px',
                            cursor: isMnemonicLoading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <BrainCircuit size={16} /> 
                          {isMnemonicLoading ? 'Generating Memory Hook...' : '🧠 Generate Memory Hook'}
                        </button>

                        {mnemonicError && (
                          <div style={{ color: 'var(--danger)', fontSize: '0.82rem', textAlign: 'left', marginTop: '0.25rem' }}>
                            {mnemonicError}
                          </div>
                        )}

                        {mnemonicText && (
                          <div className="glass-panel animate-fade-in" style={{ padding: '1.25rem', background: 'rgba(236, 72, 153, 0.04)', border: '1px solid rgba(236, 72, 153, 0.15)', borderRadius: '10px', textAlign: 'left', marginTop: '0.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '0.8rem', color: '#f472b6', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Sparkles size={14} /> AI Memory Hook
                              </span>
                              {hasFeatureUnlocked(settings, 'tts') && <InlineTTSButton text={mnemonicText} voiceURI={voiceURI} />}
                            </div>
                            <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                              {mnemonicText}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

            {/* Suggested Rating Badging */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(139, 92, 246, 0.05)', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', textAlign: 'left' }}>
                <BrainCircuit size={20} style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>AI Suggested Card Status</span>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Grade suggested rating is <span style={{ color: 'var(--accent-secondary)', textTransform: 'uppercase' }}>{String(evaluation.suggestedRating || 'good').toUpperCase()}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Custom Simulation Prompt for Copy-Pasting */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(139, 92, 246, 0.04)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
                  Generate Simulation Prompt (Save Tokens)
                </h4>
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    const simulationPrompt = `Please create a dynamic, interactive simulation based on the information below. Choose whatever programming language works best for this project. Make sure to include sound effects, text-to-speech voiceover( Native Speech Synthesis ) , and animated diagrams. Here is the info: \n\nTopic/Concept: ${currentCard?.concept || ''}\nQuestion: ${currentCard?.question || ''}\nMy Answer: ${userAnswer || ''}\nLogical Gap/Feedback: ${evaluation?.logicAnalysis || ''}`;
                    navigator.clipboard.writeText(simulationPrompt);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minWidth: '100px' }}
                >
                  {copySuccess ? 'Copied!' : 'Copy Prompt'}
                </button>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                Copy and paste this prompt into Gemini (or another AI) to build a custom interactive simulation for this concept.
              </p>
              <textarea
                readOnly
                value={`Please create a dynamic, interactive simulation based on the information below. Choose whatever programming language works best for this project. Make sure to include sound effects, text-to-speech voiceover( Native Speech Synthesis ) , and animated diagrams. Here is the info: \n\nTopic/Concept: ${currentCard?.concept || ''}\nQuestion: ${currentCard?.question || ''}\nMy Answer: ${userAnswer || ''}\nLogical Gap/Feedback: ${evaluation?.logicAnalysis || ''}`}
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '0.82rem', 
                  background: 'rgba(0, 0, 0, 0.3)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '6px', 
                  padding: '0.75rem', 
                  minHeight: '120px', 
                  resize: 'none',
                  color: 'var(--text-secondary)',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
                onClick={(e) => e.target.select()}
              />
            </div>
              </>
            )}
          </div>

          {/* FSRS Auto-Scheduling Summary & Save Button */}
          {isTutoringComplete && (() => {
            const suggestedRating = String(evaluation.suggestedRating || 'good').toLowerCase();
            const finalRating = (settings.relaxedMode && suggestedRating === 'again') ? 'hard' : suggestedRating;
            
            return (
              <div className="glass-panel" style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>FSRS Auto-Scheduled Interval</span>
                  <h4 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '0.15rem' }}>
                    Next Review: {getFriendlyInterval(currentCard, finalRating, targetRetention)}
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    {settings.relaxedMode && suggestedRating === 'again' ? (
                      <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                        <Sparkles size={12} /> 🧘 Relaxed Mode Active: Rescheduled as HARD to prevent penalty.
                      </span>
                    ) : (
                      `Automatically calculated based on your score of ${evaluation.score}% (FSRS status: ${finalRating.toUpperCase()}).`
                    )}
                  </p>
                </div>
                
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleScheduleRating(finalRating)}
                  style={{ width: '100%', maxWidth: '280px', gap: '0.5rem' }}
                >
                  Save & Proceed <ArrowRight size={16} />
                </button>
              </div>
            );
          })()}
        </div>
      )}

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
    </div>
  );
}

function formatBracketedErrors(text) {
  if (!text) return '';
  const parts = text.split(/(\([^)]+\))/g);
  return parts.map((part, idx) => {
    if (part.startsWith('(') && part.endsWith(')')) {
      const content = part.substring(1, part.length - 1);
      return (
        <span key={idx} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', margin: '0 0.15rem', fontWeight: 600 }}>
          {content}
        </span>
      );
    }
    return part;
  });
}
