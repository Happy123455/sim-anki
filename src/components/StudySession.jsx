import React, { useState, useEffect, useRef } from 'react';
import { Clock, Star, BrainCircuit, CheckCircle, AlertTriangle, ArrowRight, BookOpen, RotateCcw, XCircle, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { evaluateAnswer } from '../utils/gemini';
import { getFriendlyInterval } from '../utils/srs';
import HighlightingTTS from './HighlightingTTS';
import InlineTTSButton from './InlineTTSButton';
import { playSuccess, playFailure } from '../utils/sound';


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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getCleanHint(concept) {
  if (!concept) return "";
  
  const lowerConcept = concept.toLowerCase();
  
  // 1. If it has a Mnemonic, use it! It's the best non-obvious hint.
  const mnemonicMatch = concept.match(/mnemonic:\s*(.+)/i);
  if (mnemonicMatch && mnemonicMatch[1]) {
    return mnemonicMatch[1].trim();
  }
  
  // 2. If it contains "Correct Answer: XXX", let's extract the answer to make sure we don't show it.
  let answerText = "";
  const answerMatch = concept.match(/correct answer:\s*(.+?)(?=\.\s*(?:focus|mnemonic)|$)/i);
  if (answerMatch && answerMatch[1]) {
    answerText = answerMatch[1].trim();
  }
  
  // 3. If there is a Focus, use it but hide the answer
  const focusMatch = concept.match(/focus:\s*(.+?)(?=\.\s*(?:mnemonic)|$)/i);
  if (focusMatch && focusMatch[1]) {
    let focusText = focusMatch[1].trim();
    if (answerText && focusText.toLowerCase().includes(answerText.toLowerCase())) {
      // Redact the answer from the focus text
      const regex = new RegExp(escapeRegExp(answerText), 'gi');
      focusText = focusText.replace(regex, '___');
    }
    return focusText;
  }
  
  // 4. Default fallback: if it contains "Correct Answer:", strip it
  if (lowerConcept.includes("correct answer:")) {
    const parts = concept.split(/[.;]/);
    const cleanParts = parts.filter(p => !p.toLowerCase().includes("correct answer") && p.trim().length > 0);
    if (cleanParts.length > 0) {
      return cleanParts.join(". ").trim();
    }
  }
  
  return concept;
}

const getYouTubeEmbedUrl = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) 
    ? `https://www.youtube.com/embed/${match[2]}` 
    : null;
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

export default function StudySession({ Deck, DueCards, apiKey, model, targetRetention = 90, customInstructions = "", voiceURI = "", onRateCard, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentCard = DueCards[currentIndex];

  const [step, setStep] = useState('question'); // 'question' | 'grading' | 'simulation'
  const [userAnswer, setUserAnswer] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [hoverConfidence, setHoverConfidence] = useState(null);
  
  // Timer State
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);

  // AI Response States
  const [isGradingLoading, setIsGradingLoading] = useState(false);
  const [gradingError, setGradingError] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [gradingStatus, setGradingStatus] = useState('');

  // Copy Prompt State
  const [copySuccess, setCopySuccess] = useState(false);
  const [showPastAnswers, setShowPastAnswers] = useState(false);
  const [showHint, setShowHint] = useState(false);


  // Start timer on question load
  useEffect(() => {
    if (step === 'question' && currentCard) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [step, currentIndex, currentCard]);

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
        customInstructions,
        (status) => setGradingStatus(status)
      );
      
      setEvaluation(result);
      setStep('grading');

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
      setShowHint(false);


      if (currentIndex + 1 < DueCards.length) {
        setCurrentIndex(prev => prev + 1);
        setStep('question');
      } else {
        onClose(); // End session when all due cards reviewed
      }
    } catch (err) {
      console.error('Save & Proceed error:', err);
      alert('Error saving progress: ' + err.message);
    }
  };

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
            Card {currentIndex + 1} of {DueCards.length}
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

      {/* Main Review Card */}
      {step === 'question' && (
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Question Header & Timer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <span className="badge badge-learn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <BrainCircuit size={12} /> Evaluate Concept
            </span>
            <div style={{ display: 'none', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <Clock size={16} />
              <span>{formatTime(elapsedTime)}</span>
            </div>
          </div>

          {/* Question Display */}
          <h2 style={{ fontSize: '1.6rem', textAlign: 'left', lineHeight: '1.4', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>{currentCard.question}</span>
            <InlineTTSButton text={currentCard.question} voiceURI={voiceURI} />
          </h2>

          {renderCardMedia(currentCard)}

          {/* Collapsible Hint Block */}
          <div style={{ textAlign: 'left', marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn-text"
              onClick={() => setShowHint(!showHint)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              {showHint ? 'Hide Hint' : 'Show Hint'}
            </button>
            {showHint && (
              <div 
                className="animate-fade-in" 
                style={{ 
                  marginTop: '0.5rem', 
                  padding: '0.75rem 1rem', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)'
                }}
              >
                <strong>Concept Focus Hint:</strong> {getCleanHint(currentCard.concept)}
              </div>
            )}
          </div>


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
                  {currentCard.concept}
                </div>
              </div>
            </div>

            {/* Strengths & Weaknesses (Split columns) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', textAlign: 'left' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <h4 style={{ color: '#a7f3d0', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle size={16} /> Key Strengths
                  <InlineTTSButton text={(evaluation.strengths || []).join('. ') || 'None noted.'} voiceURI={voiceURI} />
                </h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  {evaluation.strengths.length === 0 && <li>None noted.</li>}
                </ul>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <h4 style={{ color: '#fca5a5', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertTriangle size={16} /> Logical Gaps / Misconceptions
                  <InlineTTSButton text={(evaluation.weaknesses || []).join('. ') || 'Perfect coverage!'} voiceURI={voiceURI} />
                </h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {evaluation.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                  {evaluation.weaknesses.length === 0 && <li>Perfect coverage!</li>}
                </ul>
              </div>
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', padding: '1rem 1.25rem', borderRadius: '12px' }}>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>Logical Analysis</span>
                <InlineTTSButton text={evaluation.logicAnalysis || ''} voiceURI={voiceURI} />
              </h4>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{evaluation.logicAnalysis}</p>
            </div>

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

            {/* AI Explanation Content */}
            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.25rem', marginBottom: 0 }}>
                Concept Correction & Explanation
              </h4>
              <div 
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(evaluation.correctExplanation) }}
                style={{ fontSize: '0.92rem', color: 'var(--text-secondary)' }}
              />
              <HighlightingTTS text={evaluation.correctExplanation} voiceURI={voiceURI} />
            </div>

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
          </div>

          {/* FSRS Auto-Scheduling Summary & Save Button */}
          <div className="glass-panel" style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>FSRS Auto-Scheduled Interval</span>
              <h4 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '0.15rem' }}>
                Next Review: {getFriendlyInterval(currentCard, String(evaluation.suggestedRating || 'good').toLowerCase(), targetRetention)}
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Automatically calculated based on your score of {evaluation.score}% (FSRS status: {String(evaluation.suggestedRating || 'good').toUpperCase()}).
              </p>
            </div>
            
            <button 
              className="btn btn-primary" 
              onClick={() => handleScheduleRating(String(evaluation.suggestedRating || 'good').toLowerCase())}
              style={{ width: '100%', maxWidth: '280px', gap: '0.5rem' }}
            >
              Save & Proceed <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
