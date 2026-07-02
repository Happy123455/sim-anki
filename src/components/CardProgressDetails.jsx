import React, { useState, useEffect } from 'react';
import { Calendar, Award, Clock, Star, Layers, X, TrendingUp, ChevronDown, ChevronUp, Sparkles, Trash2, RefreshCw } from 'lucide-react';
import SimulationRenderer from './SimulationRenderer';
import { highlightAnswerText, highlightConceptText } from './StudySession';
import { generate3DVisualAnimation } from '../utils/gemini';


function parseMarkdown(text) {
  if (!text) return '';
  let html = text;
  
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin-top: 0.5rem; margin-bottom: 0.25rem; font-weight: 600; color: var(--accent-primary)">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin-top: 0.75rem; margin-bottom: 0.35rem; font-weight: 600; color: var(--accent-primary)">$1</h3>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left: 1rem; margin-top: 0.15rem; list-style-type: disc;">$1</li>');
  
  const lines = html.split('\n');
  let inList = false;
  let finalHtml = '';
  
  lines.forEach(line => {
    if (line.trim().startsWith('<li')) {
      if (!inList) {
        finalHtml += '<ul style="margin-bottom: 0.5rem; padding-left: 0.5rem">';
        inList = true;
      }
      finalHtml += line;
    } else {
      if (inList) {
        finalHtml += '</ul>';
        inList = false;
      }
      if (line.trim()) {
        if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('</ul')) {
          finalHtml += line;
        } else {
          finalHtml += `<p style="margin-bottom: 0.5rem; line-height: 1.4;">${line}</p>`;
        }
      }
    }
  });
  
  if (inList) {
    finalHtml += '</ul>';
  }
  
  return finalHtml;
}

export default function CardProgressDetails({ card, voiceURI = "", onClose, onUpdateCard, apiKey, model }) {
  const [expandedLogIdx, setExpandedLogIdx] = useState(null);
  const [activeSimLogIdx, setActiveSimLogIdx] = useState(null);
  const [copyLogIdx, setCopyLogIdx] = useState(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const [expandedExplanationIndices, setExpandedExplanationIndices] = useState([]);

  // 3D Visual Explanations States
  const [activeVisualTab, setActiveVisualTab] = useState('question'); // 'question' | 'answer'
  const [visualModel, setVisualModel] = useState(model || 'gemini-2.5-flash');
  const [feedbackText, setFeedbackText] = useState('');
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);
  const [visualError, setVisualError] = useState(null);
  const [showVisualPanel, setShowVisualPanel] = useState(true);

  const handleGenerateVisual = async () => {
    if (!apiKey) {
      setVisualError("Gemini API key is missing. Configure it in Settings.");
      return;
    }
    setIsGeneratingVisual(true);
    setVisualError(null);

    try {
      const historyKey = activeVisualTab === 'question' ? 'questionSvgs' : 'answerSvgs';
      const indexKey = activeVisualTab === 'question' ? 'activeQuestionSvgIndex' : 'activeAnswerSvgIndex';

      const currentSvgs = card[historyKey] || [];
      const activeIdx = card[indexKey] !== undefined ? card[indexKey] : (currentSvgs.length - 1);
      const previousSvg = currentSvgs[activeIdx]?.svg || "";

      // Call Gemini utility
      const textToVisualize = activeVisualTab === 'question' ? card.question : card.concept;
      const res = await generate3DVisualAnimation(
        apiKey,
        visualModel,
        textToVisualize,
        activeVisualTab,
        feedbackText,
        previousSvg
      );

      if (!res || !res.svg) {
        throw new Error("Invalid response: SVG markup missing.");
      }

      // Append new version to history
      const newVersion = {
        svg: res.svg,
        timestamp: Date.now(),
        model: visualModel,
        feedback: feedbackText
      };

      const updatedHistory = [...currentSvgs, newVersion];
      const updatedCard = {
        ...card,
        [historyKey]: updatedHistory,
        [indexKey]: updatedHistory.length - 1
      };

      // Call callback to save changes
      if (typeof onUpdateCard === 'function') {
        onUpdateCard(updatedCard);
      }
      setFeedbackText('');
    } catch (err) {
      console.error(err);
      setVisualError(err.message || "Failed to generate visual explanation.");
    } finally {
      setIsGeneratingVisual(false);
    }
  };

  const handleSelectVersion = (idx) => {
    const indexKey = activeVisualTab === 'question' ? 'activeQuestionSvgIndex' : 'activeAnswerSvgIndex';
    if (typeof onUpdateCard === 'function') {
      onUpdateCard({
        ...card,
        [indexKey]: idx
      });
    }
  };

  const handleDeleteVersion = (idxToDelete) => {
    const historyKey = activeVisualTab === 'question' ? 'questionSvgs' : 'answerSvgs';
    const indexKey = activeVisualTab === 'question' ? 'activeQuestionSvgIndex' : 'activeAnswerSvgIndex';

    const currentSvgs = card[historyKey] || [];
    const updatedHistory = currentSvgs.filter((_, i) => i !== idxToDelete);
    
    // Adjust active index
    let activeIdx = card[indexKey] !== undefined ? card[indexKey] : (currentSvgs.length - 1);
    if (activeIdx >= updatedHistory.length) {
      activeIdx = Math.max(0, updatedHistory.length - 1);
    }

    if (typeof onUpdateCard === 'function') {
      onUpdateCard({
        ...card,
        [historyKey]: updatedHistory,
        [indexKey]: activeIdx
      });
    }
  };

  const toggleExplanationExpand = (idx) => {
    if (expandedExplanationIndices.includes(idx)) {
      setExpandedExplanationIndices(prev => prev.filter(i => i !== idx));
    } else {
      setExpandedExplanationIndices(prev => [...prev, idx]);
    }
  };

  const handleCopyFullHistory = () => {
    let md = `# Flashcard: ${card.question}\n`;
    md += `Concept Focus: ${card.concept || 'N/A'}\n\n`;
    
    if (card.state) {
      md += `## Spaced Repetition (FSRS) Metrics:\n`;
      md += `- Stability: ${card.state.stability}d\n`;
      md += `- Difficulty: ${card.state.difficulty}/10\n`;
      md += `- Repetitions: ${card.state.repetitions}\n`;
      md += `- Consecutive Lapses/Fails: ${card.state.consecutiveFails || 0}\n\n`;
    }
    
    md += `## Review Logs (${history.length}):\n\n`;
    
    history.forEach((log, idx) => {
      md += `### Review #${idx + 1} - Date: ${new Date(log.date).toLocaleString()} | Score: ${log.score}% | Rating: ${log.rating || 'good'} | Time: ${log.timeSpent}s\n`;
      md += `- **Your Answer**: "${log.userAnswer || '(Empty answer)'}"\n`;
      if (log.logicAnalysis) {
        md += `- **AI Feedback**: "${log.logicAnalysis}"\n`;
      }
      if (log.strengths && log.strengths.length > 0) {
        md += `- **Strengths**:\n${log.strengths.map(s => `  * ${s}`).join('\n')}\n`;
      }
      if (log.weaknesses && log.weaknesses.length > 0) {
        md += `- **Weaknesses**:\n${log.weaknesses.map(w => `  * ${w}`).join('\n')}\n`;
      }
      if (log.correctExplanation) {
        md += `- **AI Explanation**:\n${log.correctExplanation.split('\n').map(line => `  ${line}`).join('\n')}\n`;
      }
      md += `\n--------------------------------------------------\n\n`;
    });
    
    navigator.clipboard.writeText(md);
    setCopyAllSuccess(true);
    setTimeout(() => setCopyAllSuccess(false), 2000);
  };

  const handleCopyLogEntry = (log, idx) => {
    let md = `### Review #${idx + 1} - Date: ${new Date(log.date).toLocaleString()} | Score: ${log.score}% | Rating: ${log.rating || 'good'} | Time: ${log.timeSpent}s\n`;
    md += `- **Your Answer**: "${log.userAnswer || '(Empty answer)'}"\n`;
    if (log.logicAnalysis) {
      md += `- **AI Feedback**: "${log.logicAnalysis}"\n`;
    }
    if (log.strengths && log.strengths.length > 0) {
      md += `- **Strengths**:\n${log.strengths.map(s => `  * ${s}`).join('\n')}\n`;
    }
    if (log.weaknesses && log.weaknesses.length > 0) {
      md += `- **Weaknesses**:\n${log.weaknesses.map(w => `  * ${w}`).join('\n')}\n`;
    }
    if (log.correctExplanation) {
      md += `- **AI Explanation**:\n${log.correctExplanation.split('\n').map(line => `  ${line}`).join('\n')}\n`;
    }
    
    navigator.clipboard.writeText(md);
    setCopyLogIdx(idx);
    setTimeout(() => setCopyLogIdx(null), 2000);
  };

  const history = card.history || [];
  const hasHistory = history.length > 0;

  // Trigger MathJax typesetting when logs or cards open/expand
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise().catch(err => console.error(err));
    }
  }, [card, expandedLogIdx, activeSimLogIdx]);

  // Render dynamic SVG chart for Score Progress
  const renderChart = () => {
    if (history.length < 2) {
      return (
        <div style={{ height: '150px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed var(--border-light)' }}>
          <TrendingUp size={24} style={{ marginRight: '0.5rem' }} /> Add reviews to plot progress trend chart.
        </div>
      );
    }

    const width = 550;
    const height = 180;
    const paddingX = 40;
    const paddingY = 25;
    const chartW = width - 2 * paddingX;
    const chartH = height - 2 * paddingY;

    // Map scores to points (x, y)
    const points = history.map((h, idx) => {
      const x = paddingX + (idx / (history.length - 1)) * chartW;
      const y = paddingY + chartH - (h.score / 100) * chartH;
      return { x, y, score: h.score, date: new Date(h.date).toLocaleDateString() };
    });

    // Generate SVG path strings
    let linePath = `M ${points[0].x} ${points[0].y}`;
    let areaPath = `M ${points[0].x} ${paddingY + chartH} L ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      linePath += ` L ${points[i].x} ${points[i].y}`;
      areaPath += ` L ${points[i].x} ${points[i].y}`;
    }
    
    areaPath += ` L ${points[points.length - 1].x} ${paddingY + chartH} Z`;

    return (
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={paddingX + chartW} y2={paddingY} stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
          <line x1={paddingX} y1={paddingY + chartH / 2} x2={paddingX + chartW} y2={paddingY + chartH / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
          <line x1={paddingX} y1={paddingY + chartH} x2={paddingX + chartW} y2={paddingY + chartH} stroke="rgba(255,255,255,0.08)" />

          {/* Area under curve */}
          <path d={areaPath} fill="url(#chartGrad)" />

          {/* Score line */}
          <path d={linePath} fill="none" stroke="var(--accent-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Grid Labels (Y Axis) */}
          <text x={paddingX - 10} y={paddingY + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">100</text>
          <text x={paddingX - 10} y={paddingY + chartH / 2 + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">50</text>
          <text x={paddingX - 10} y={paddingY + chartH + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">0</text>

          {/* Point dots and tooltips */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="5" 
                fill="var(--accent-secondary)" 
                stroke="#fff" 
                strokeWidth="1.5" 
                style={{ cursor: 'pointer' }}
              />
              {/* Score text above dot */}
              <text 
                x={p.x} 
                y={p.y - 10} 
                fill="var(--text-primary)" 
                fontSize="9" 
                fontWeight="700" 
                textAnchor="middle"
              >
                {p.score}%
              </text>
              {/* Date text below chart */}
              <text 
                x={p.x} 
                y={paddingY + chartH + 18} 
                fill="var(--text-muted)" 
                fontSize="9" 
                textAnchor="middle"
              >
                {p.date}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  // Render FSRS Memory Retention Forgetting Curve SVG chart
  const renderForgettingCurve = () => {
    if (!card.state || !card.state.stability || !card.state.lastReviewDate) {
      return (
        <div style={{ height: '150px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed var(--border-light)' }}>
          <TrendingUp size={24} style={{ marginRight: '0.5rem' }} /> No review history. Study this card first to activate the forgetting curve.
        </div>
      );
    }

    const S = card.state.stability;
    const elapsedMs = new Date() - new Date(card.state.lastReviewDate);
    const elapsedDays = Math.max(0, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));

    // Define X-axis range: up to 3 * S or at least 7 days (capped at 60 days to look reasonable)
    const maxDays = Math.max(7, Math.min(60, Math.round(S * 3)));
    
    const width = 550;
    const height = 180;
    const paddingX = 40;
    const paddingY = 25;
    const chartW = width - 2 * paddingX;
    const chartH = height - 2 * paddingY;

    // Generate curve points: 30 steps
    const steps = 30;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const d = (i / steps) * maxDays;
      const R = Math.pow(0.9, d / S) * 100;
      const x = paddingX + (i / steps) * chartW;
      const y = paddingY + chartH - (R / 100) * chartH;
      points.push({ x, y });
    }

    // Build SVG path
    let curvePath = `M ${points[0].x} ${points[0].y}`;
    let fillPath = `M ${points[0].x} ${paddingY + chartH} L ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      curvePath += ` L ${points[i].x} ${points[i].y}`;
      fillPath += ` L ${points[i].x} ${points[i].y}`;
    }
    fillPath += ` L ${points[points.length - 1].x} ${paddingY + chartH} Z`;

    // Active marker coordinates
    const currentR = Math.pow(0.9, elapsedDays / S) * 100;
    const markerX = paddingX + Math.min(1, elapsedDays / maxDays) * chartW;
    const markerY = paddingY + chartH - (Math.min(100, Math.max(0, currentR)) / 100) * chartH;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Elapsed Time: <strong>{elapsedDays} days</strong> since last review</span>
          <span>Current Retention: <strong style={{ color: currentR >= 85 ? 'var(--success)' : 'var(--warning)' }}>{Math.round(currentR)}%</strong></span>
        </div>
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
          <svg width={width} height={height} style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="decayGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line x1={paddingX} y1={paddingY} x2={paddingX + chartW} y2={paddingY} stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
            <line x1={paddingX} y1={paddingY + chartH / 2} x2={paddingX + chartW} y2={paddingY + chartH / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
            <line x1={paddingX} y1={paddingY + chartH} x2={paddingX + chartW} y2={paddingY + chartH} stroke="rgba(255,255,255,0.08)" />

            {/* Shaded Area */}
            <path d={fillPath} fill="url(#decayGrad)" />

            {/* Decay Curve Line */}
            <path d={curvePath} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />

            {/* Y Axis labels */}
            <text x={paddingX - 10} y={paddingY + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">100%</text>
            <text x={paddingX - 10} y={paddingY + chartH / 2 + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">50%</text>
            <text x={paddingX - 10} y={paddingY + chartH + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">0%</text>

            {/* X Axis labels */}
            <text x={paddingX} y={paddingY + chartH + 18} fill="var(--text-muted)" fontSize="10" textAnchor="middle">0d (Review)</text>
            <text x={paddingX + chartW / 2} y={paddingY + chartH + 18} fill="var(--text-muted)" fontSize="10" textAnchor="middle">{Math.round(maxDays / 2)}d</text>
            <text x={paddingX + chartW} y={paddingY + chartH + 18} fill="var(--text-muted)" fontSize="10" textAnchor="middle">{maxDays}d</text>

            {/* Active Marker Dot */}
            <g>
              <line x1={markerX} y1={paddingY} x2={markerX} y2={paddingY + chartH} stroke="rgba(139, 92, 246, 0.25)" strokeDasharray="3" />
              <circle cx={markerX} cy={markerY} r="7" fill="var(--accent-secondary)" stroke="#fff" strokeWidth="2" style={{ boxShadow: '0 0 10px var(--accent-secondary)' }} />
              <text x={markerX} y={markerY - 14} fill="var(--text-primary)" fontSize="9" fontWeight="700" textAnchor="middle">
                {Math.round(currentR)}%
              </text>
            </g>
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(6px)'
    }}>
      <div 
        className="glass-panel animate-fade-in" 
        style={{ 
          padding: '2rem', 
          width: '95%', 
          maxWidth: '650px', 
          maxHeight: '90vh',
          overflowY: 'auto',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="badge badge-learn" style={{ gap: '0.25rem', marginBottom: '0.5rem' }}>
              <Layers size={12} /> FSRS Progress Statistics
            </span>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{card.question}</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', marginTop: '0.25rem' }}>Concept: {card.concept}</p>
            {card.simplifiedQuestion && (
              <div 
                style={{
                  background: 'rgba(139, 92, 246, 0.06)',
                  borderLeft: '3px solid var(--accent-primary)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0 6px 6px 0',
                  marginTop: '0.5rem',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)'
                }}
              >
                <strong style={{ color: 'var(--text-primary)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '0.15rem' }}>Simplified Question Breakdown</strong>
                "{card.simplifiedQuestion}"
              </div>
            )}
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={onClose} 
            style={{ padding: '0.5rem', borderRadius: '50%', flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

        {/* FSRS State Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>STABILITY</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {card.state ? `${card.state.stability}d` : 'N/A'}
            </span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>DIFFICULTY</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {card.state ? `${card.state.difficulty}/10` : 'N/A'}
            </span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>REPETITIONS</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {card.state ? card.state.repetitions : 0}
            </span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>TOTAL REVIEWS</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {history.length}
            </span>
          </div>
        </div>

        {/* Score Improvement Chart */}
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <TrendingUp size={16} style={{ color: 'var(--accent-primary)' }} /> Score Improvement Trend
          </h3>
          {renderChart()}
        </div>

        {/* Forgetting Curve Chart */}
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <TrendingUp size={16} style={{ color: '#8b5cf6' }} /> Memory Retention (Forgetting Curve)
          </h3>
          {renderForgettingCurve()}
        </div>

        {/* 🎨 3D Visual Explanations Section */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
          <div 
            onClick={() => setShowVisualPanel(!showVisualPanel)} 
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: showVisualPanel ? '1rem' : 0 }}
          >
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
              <Sparkles size={16} style={{ color: 'var(--accent-secondary)' }} />
              3D Visual Explanations (Animated SVGs)
            </h3>
            {showVisualPanel ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
          </div>

          {showVisualPanel && (
            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.015)' }}>
              
              {/* Tab Switcher */}
              <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                <button
                  className={`btn ${activeVisualTab === 'question' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setActiveVisualTab('question');
                    setVisualError(null);
                  }}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto' }}
                >
                  Question Animation
                </button>
                <button
                  className={`btn ${activeVisualTab === 'answer' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setActiveVisualTab('answer');
                    setVisualError(null);
                  }}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto' }}
                >
                  Answer / Concept Animation
                </button>
              </div>

              {/* Core Content */}
              {(() => {
                const historyKey = activeVisualTab === 'question' ? 'questionSvgs' : 'answerSvgs';
                const indexKey = activeVisualTab === 'question' ? 'activeQuestionSvgIndex' : 'activeAnswerSvgIndex';

                const svgs = card[historyKey] || [];
                const activeIdx = card[indexKey] !== undefined ? card[indexKey] : (svgs.length - 1);
                const hasSvg = svgs.length > 0 && activeIdx >= 0 && activeIdx < svgs.length;
                const activeSvgObj = hasSvg ? svgs[activeIdx] : null;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* SVG Render Box */}
                    {activeSvgObj ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div 
                          className="visual-svg-container"
                          style={{ 
                            width: '100%', 
                            background: 'rgba(0,0,0,0.2)', 
                            border: '1px solid var(--border-light)', 
                            borderRadius: '12px', 
                            padding: '1.5rem', 
                            display: 'flex', 
                            justifyContent: 'center', 
                            alignItems: 'center',
                            overflow: 'hidden'
                          }}
                          dangerouslySetInnerHTML={{ __html: activeSvgObj.svg }}
                        />
                        {activeSvgObj.feedback && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '6px', borderLeft: '3px solid var(--accent-secondary)' }}>
                            <strong>Feedback Applied:</strong> "{activeSvgObj.feedback}"
                          </div>
                        )}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Generated via {activeSvgObj.model || 'AI'} on {new Date(activeSvgObj.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-light)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                        <Sparkles size={28} style={{ color: 'var(--accent-secondary)', opacity: 0.5, marginBottom: '0.5rem' }} />
                        <p style={{ fontSize: '0.85rem', margin: 0 }}>No 3D illustration generated for this {activeVisualTab}.</p>
                        <p style={{ fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>Generate an animated diagram to help visualize the {activeVisualTab === 'question' ? 'question context' : 'concept answers'}.</p>
                      </div>
                    )}

                    {/* Version History Swapper */}
                    {svgs.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Version History ({svgs.length})</span>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {svgs.map((s, idx) => {
                            const isCurrent = idx === activeIdx;
                            return (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: isCurrent ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isCurrent ? 'var(--accent-primary)' : 'var(--border-light)'}`, borderRadius: '6px', padding: '0.2rem 0.5rem' }}>
                                <button
                                  onClick={() => handleSelectVersion(idx)}
                                  style={{ background: 'none', border: 'none', color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: isCurrent ? 700 : 500 }}
                                >
                                  v{idx + 1} {isCurrent && '• Active'}
                                </button>
                                <button
                                  onClick={() => handleDeleteVersion(idx)}
                                  title="Delete this version"
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.15rem' }}
                                >
                                  <Trash2 size={12} style={{ color: 'var(--danger)', opacity: 0.7 }} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Configuration / Action Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        
                        {/* Model Dropdown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2', flex: '1 1 150px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Generation Model</span>
                          <select 
                            value={visualModel} 
                            onChange={(e) => setVisualModel(e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-light)' }}
                          >
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                          </select>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.5rem', flex: '2 1 200px', alignSelf: 'flex-end' }}>
                          {!hasSvg ? (
                            <button
                              className="btn btn-primary"
                              disabled={isGeneratingVisual}
                              onClick={handleGenerateVisual}
                              style={{ width: '100%', padding: '0.45rem', fontSize: '0.82rem', gap: '0.35rem' }}
                            >
                              {isGeneratingVisual ? (
                                <>
                                  <RefreshCw className="animate-spin" size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating Visual...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={12} /> Generate 3D Illustration
                                </>
                              )}
                            </button>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Upgrade / Detail Feedback</span>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                  type="text"
                                  placeholder="e.g. Add key labels, animate the flow, zoom in..."
                                  value={feedbackText}
                                  onChange={(e) => setFeedbackText(e.target.value)}
                                  disabled={isGeneratingVisual}
                                  style={{ flex: 1, fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '6px' }}
                                />
                                <button
                                  className="btn btn-primary"
                                  disabled={isGeneratingVisual}
                                  onClick={handleGenerateVisual}
                                  style={{ padding: '0.35rem 1rem', fontSize: '0.82rem', gap: '0.35rem' }}
                                >
                                  {isGeneratingVisual ? (
                                    <RefreshCw className="animate-spin" size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                  ) : (
                                    <>Upgrade</>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Error reporting */}
                      {visualError && (
                        <div style={{ fontSize: '0.78rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.08)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                          ⚠️ {visualError}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Historical Review Log List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Review Logs</h3>
            {hasHistory && (
              <button
                className="btn btn-secondary"
                onClick={handleCopyFullHistory}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {copyAllSuccess ? 'Copied Full History!' : 'Copy Full History'}
              </button>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {history.map((log, idx) => {
              const isExpanded = expandedLogIdx === idx;
              const isSimActive = activeSimLogIdx === idx;
              return (
                <div 
                  key={idx} 
                  style={{ 
                    background: 'rgba(255,255,255,0.01)', 
                    border: '1px solid var(--border-light)', 
                    borderRadius: '8px',
                    overflow: 'hidden'
                  }}
                >
                  {/* Log Header Row */}
                  <div 
                    onClick={() => {
                      setExpandedLogIdx(isExpanded ? null : idx);
                      setActiveSimLogIdx(null); // Reset sim panel on collapse/expand toggles
                    }}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0.75rem 1rem', 
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.01)'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={12} /> {new Date(log.date).toLocaleDateString()}
                      </span>
                      <span style={{ 
                        fontSize: '0.85rem', 
                        fontWeight: 700, 
                        color: log.score >= 80 ? 'var(--success)' : (log.score >= 60 ? 'var(--warning)' : 'var(--danger)')
                      }}>
                        Score: {log.score}%
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      {/* Confidence badge */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <Star size={12} fill="var(--warning)" color="var(--warning)" /> {log.confidence}/5
                      </span>
                      {/* Time taken */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <Clock size={12} /> {log.timeSpent}s
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {/* Expanded Content Log details */}
                  {isExpanded && (
                    <div style={{ 
                      padding: '1rem', 
                      background: 'rgba(0,0,0,0.2)', 
                      borderTop: '1px solid rgba(255,255,255,0.03)', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.75rem', 
                      fontSize: '0.85rem',
                      maxHeight: '260px',
                      overflowY: 'auto',
                      borderBottom: '1px solid rgba(255,255,255,0.03)'
                    }}>
                       <div>
                        <strong style={{ color: 'var(--text-primary)' }}>Your Answer:</strong>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '6px', whiteSpace: 'pre-line', fontSize: '0.85rem', lineHeight: '1.5' }}>
                          {highlightAnswerText(log.userAnswer, log.highlights)}
                        </div>
                      </div>
                      
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>Reference Answer:</strong>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '0.2rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '6px', whiteSpace: 'pre-line', fontSize: '0.85rem', lineHeight: '1.5' }}>
                          {highlightConceptText(card.concept, log.conceptHighlights)}
                        </div>
                      </div>

                      {log.logicAnalysis && (
                        <div>
                          <strong style={{ color: '#fca5a5' }}>Logical Gaps / Logic Corrections:</strong>
                          <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{log.logicAnalysis}</p>
                        </div>
                      )}

                      {log.correctExplanation && (
                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
                          <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Archived AI Grade Report</strong>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                              <strong style={{ color: 'var(--success)', fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem' }}>Strengths</strong>
                              <ul style={{ paddingLeft: '1rem', margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {log.strengths && log.strengths.length > 0 ? (
                                  log.strengths.map((s, idx) => <li key={idx} style={{ marginTop: '0.15rem' }}>{s}</li>)
                                ) : (
                                  <li>None identified</li>
                                )}
                              </ul>
                            </div>
                            <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                              <strong style={{ color: 'var(--danger)', fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem' }}>Weaknesses</strong>
                              <ul style={{ paddingLeft: '1rem', margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {log.weaknesses && log.weaknesses.length > 0 ? (
                                  log.weaknesses.map((w, idx) => <li key={idx} style={{ marginTop: '0.15rem' }}>{w}</li>)
                                ) : (
                                  <li>None identified</li>
                                )}
                              </ul>
                            </div>
                          </div>

                          <div style={{ background: 'rgba(255, 255, 255, 0.015)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)', fontSize: '0.75rem', display: 'block', marginBottom: '0.35rem' }}>Explanation:</strong>
                            <div style={{ fontSize: '0.8rem' }}>
                              {(() => {
                                const exp = log.correctExplanation || '';
                                const isLong = exp.length > 200;
                                const isExpanded = expandedExplanationIndices.includes(idx);
                                
                                if (isLong && !isExpanded) {
                                  const snippet = exp.slice(0, 180) + '...';
                                  return (
                                    <div>
                                      <div dangerouslySetInnerHTML={{ __html: parseMarkdown(snippet) }} />
                                      <button 
                                        onClick={() => toggleExplanationExpand(idx)}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, marginTop: '0.25rem', fontWeight: 600 }}
                                      >
                                        Read More
                                      </button>
                                    </div>
                                  );
                                }
                                
                                return (
                                  <div>
                                    <div dangerouslySetInnerHTML={{ __html: parseMarkdown(exp) }} />
                                    {isLong && (
                                      <button 
                                        onClick={() => toggleExplanationExpand(idx)}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, marginTop: '0.25rem', fontWeight: 600 }}
                                      >
                                        Show Less
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions Bar inside expanded log */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleCopyLogEntry(log, idx)}
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          {copyLogIdx === idx ? 'Copied Entry!' : 'Copy Entry Log'}
                        </button>
                        
                        {log.simulation && (
                          <button
                            className="btn btn-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSimLogIdx(isSimActive ? null : idx);
                            }}
                            style={{ gap: '0.4rem', fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center' }}
                          >
                            <Layers size={12} /> 
                            {isSimActive ? 'Close Interactive Practice' : 'Replay Practice Simulation'}
                          </button>
                        )}
                      </div>
                      
                      {log.simulation && isSimActive && (
                        <div style={{ marginTop: '1rem', scale: '0.96', transformOrigin: 'top center', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '8px', overflow: 'hidden' }}>
                          <SimulationRenderer simulation={log.simulation} voiceURI={voiceURI} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!hasHistory && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No review history recorded for this card.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
