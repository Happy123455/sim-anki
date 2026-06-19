import React, { useState, useEffect, useRef } from 'react';
import { Clock, Star, BrainCircuit, CheckCircle, AlertTriangle, ArrowRight, BookOpen, RotateCcw, XCircle } from 'lucide-react';
import { evaluateAnswer, generateSimulation } from '../utils/gemini';
import { getFriendlyInterval } from '../utils/srs';
import SimulationRenderer from './SimulationRenderer';
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

  const handleTriggerSimulation = async (logicAnalysisText) => {
    setIsSimLoading(true);
    setSimError(null);
    try {
      const simData = await generateSimulation(
        apiKey,
        model,
        currentCard.question,
        currentCard.concept,
        userAnswer,
        logicAnalysisText || evaluation?.logicAnalysis || 'Conceptual confusion',
        customInstructions
      );
      setSimulation(simData);
    } catch (err) {
      console.error(err);
      setSimError('Failed to generate simulation. Try again.');
    } finally {
      setIsSimLoading(false);
    }
  };

  const handleScheduleRating = (rating) => {
    onRateCard(
      currentCard.id,
      rating,
      userAnswer,
      evaluation.score,
      evaluation.logicAnalysis,
      confidence,
      elapsedTime,
      simulation
    );
    
    // Reset states for next card
    setUserAnswer('');
    setConfidence(3);
    setEvaluation(null);
    setSimulation(null);

    if (currentIndex + 1 < DueCards.length) {
      setCurrentIndex(prev => prev + 1);
      setStep('question');
    } else {
      onClose(); // End session when all due cards reviewed
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <Clock size={16} />
              <span>{formatTime(elapsedTime)}</span>
            </div>
          </div>

          {/* Question Display */}
          <h2 style={{ fontSize: '1.6rem', textAlign: 'left', lineHeight: '1.4', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>{currentCard.question}</span>
            <InlineTTSButton text={currentCard.question} voiceURI={voiceURI} />
          </h2>

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

            {/* Strengths & Weaknesses (Split columns) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', textAlign: 'left' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <h4 style={{ color: '#a7f3d0', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle size={16} /> Key Strengths
                  <InlineTTSButton text={"Key Strengths: " + (evaluation.strengths || []).join('. ')} voiceURI={voiceURI} />
                </h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  {evaluation.strengths.length === 0 && <li>None noted.</li>}
                </ul>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <h4 style={{ color: '#fca5a5', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertTriangle size={16} /> Logical Gaps / Misconceptions
                  <InlineTTSButton text={"Logical Gaps or Misconceptions: " + (evaluation.weaknesses || []).join('. ')} voiceURI={voiceURI} />
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
                <InlineTTSButton text={"Logical Analysis: " + (evaluation.logicAnalysis || '')} voiceURI={voiceURI} />
              </h4>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{evaluation.logicAnalysis}</p>
            </div>

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
