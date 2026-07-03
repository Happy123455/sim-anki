import React, { useState, useEffect } from 'react';
import { Calendar, Award, Clock, Star, Layers, X, TrendingUp, ChevronDown, ChevronUp, Sparkles, Trash2, RefreshCw } from 'lucide-react';
import SimulationRenderer from './SimulationRenderer';
import { highlightAnswerText, highlightConceptText } from './StudySession';
import { generate3DVisualAnimation, getDetailedAnalysis, chatTutorStep } from '../utils/gemini';
import { getFriendlyInterval } from '../utils/srs';


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

export default function CardProgressDetails({ card, voiceURI = "", onClose, onUpdateCard, apiKey, model, settings }) {
  const [expandedLogIdx, setExpandedLogIdx] = useState(null);
  const [activeSimLogIdx, setActiveSimLogIdx] = useState(null);
  const [copyLogIdx, setCopyLogIdx] = useState(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const [expandedExplanationIndices, setExpandedExplanationIndices] = useState([]);
  const [selectedReportLog, setSelectedReportLog] = useState(null);

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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReportLog(log);
                        }}
                        style={{
                          background: 'rgba(139, 92, 246, 0.12)',
                          border: '1px solid rgba(139, 92, 246, 0.25)',
                          borderRadius: '4px',
                          padding: '0.15rem 0.45rem',
                          fontSize: '0.68rem',
                          color: '#c4b5fd',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          transition: 'all 0.2s ease'
                        }}
                        title="Open full AI grading report for this attempt"
                      >
                        👁️ Full Report
                      </button>

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
      {selectedReportLog && (
        <PastGradingReportModal 
          card={card} 
          log={selectedReportLog} 
          onClose={() => setSelectedReportLog(null)} 
          settings={settings} 
        />
      )}
    </div>
  );
}

function PastGradingReportModal({ card, log, onClose, settings }) {
  const [activeVisualTab, setActiveVisualTab] = useState('question');
  const [activeQuestionSvgIdx, setActiveQuestionSvgIdx] = useState(0);
  const [activeAnswerSvgIdx, setActiveAnswerSvgIdx] = useState(0);
  const [activeSimulationIdx, setActiveSimulationIdx] = useState(0);
  const [isFullscreenSim, setIsFullscreenSim] = useState(false);
  const [showCodeViewer, setShowCodeViewer] = useState(false);

  // Tutor chat states
  const [chatMessages, setChatMessages] = useState(() => {
    if (log.chatMessages && log.chatMessages.length > 0) return log.chatMessages;
    return [
      { 
        sender: 'tutor', 
        text: `🤖 Hello! This is your study archive for the attempt scored ${log.score || 0}%. Let's review what you missed and clarify the concept. Feel free to ask me follow-up questions!`, 
        highlights: [] 
      }
    ];
  });
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Puzzle puzzle states
  const [puzzleScrambled, setPuzzleScrambled] = useState([]);
  const [puzzlePlaced, setPuzzlePlaced] = useState([]);
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [puzzlePieces, setPuzzlePieces] = useState([]);

  // Lazy-loaded detailed analysis states
  const [detailedAnalysis, setDetailedAnalysis] = useState(null);
  const [isDetailedLoading, setIsDetailedLoading] = useState(false);
  const [detailedError, setDetailedError] = useState(null);

  // Fallbacks
  const score = log.score ?? 0;
  const memoryAnchor = log.memoryAnchor || '';
  const questionSvgs = log.questionSvgs && log.questionSvgs.length > 0 ? log.questionSvgs : (card.questionSvgs || []);
  const answerSvgs = log.answerSvgs && log.answerSvgs.length > 0 ? log.answerSvgs : (card.answerSvgs || []);
  const simulationHtmlList = log.simulationHtmlList && log.simulationHtmlList.length > 0 ? log.simulationHtmlList : (card.simulationHtmlList || []);
  const activeSimHtml = log.simulationHtml || (simulationHtmlList[activeSimulationIdx]?.html) || card.simulationHtml || '';

  // SVGs active items
  const activeQSvg = questionSvgs[activeQuestionSvgIdx]?.svg || '';
  const activeASvg = answerSvgs[activeAnswerSvgIdx]?.svg || '';

  // Fallback puzzle generator
  const generateFallbackPuzzlePieces = (conceptText) => {
    if (!conceptText) return [];
    const cleaned = conceptText.replace(/[#*`]/g, '').trim();
    const splits = cleaned.split(/(?<=[\.\?,])\s+|(?<=,)\s+/);
    let pieces = splits.map(s => s.trim()).filter(s => s.length > 0);
    
    if (pieces.length <= 1) {
      const words = cleaned.split(/\s+/);
      pieces = [];
      for (let i = 0; i < words.length; i += 4) {
        pieces.push(words.slice(i, i + 4).join(' '));
      }
    }
    return pieces.filter(p => p.length > 0);
  };

  useEffect(() => {
    const pieces = log.puzzlePieces || generateFallbackPuzzlePieces(card.concept);
    setPuzzlePieces(pieces);
    
    // Shuffle
    const indices = Array.from({ length: pieces.length }, (_, i) => i);
    const scrambledIndices = [...indices].sort(() => Math.random() - 0.5);
    setPuzzleScrambled(scrambledIndices.map(idx => pieces[idx]));
    setPuzzlePlaced([]);
    setPuzzleSolved(false);
  }, [card.concept, log.puzzlePieces]);

  // Puzzle handlers
  const handlePlacePiece = (pieceIdx) => {
    if (puzzleSolved) return;
    const piece = puzzleScrambled[pieceIdx];
    const newPlaced = [...puzzlePlaced, piece];
    setPuzzlePlaced(newPlaced);
    
    const newScrambled = puzzleScrambled.filter((_, idx) => idx !== pieceIdx);
    setPuzzleScrambled(newScrambled);
    
    if (newPlaced.length === puzzlePieces.length) {
      const isCorrect = newPlaced.every((p, idx) => p === puzzlePieces[idx]);
      if (isCorrect) {
        setPuzzleSolved(true);
      } else {
        alert("Incorrect order! Resetting puzzle.");
        handleResetPuzzle();
      }
    }
  };

  const handleResetPuzzle = () => {
    const indices = Array.from({ length: puzzlePieces.length }, (_, i) => i);
    const scrambledIndices = [...indices].sort(() => Math.random() - 0.5);
    setPuzzleScrambled(scrambledIndices.map(idx => puzzlePieces[idx]));
    setPuzzlePlaced([]);
    setPuzzleSolved(false);
  };

  // Detailed Analysis handler
  const handleFetchDetailedAnalysis = async () => {
    if (!settings.apiKey) {
      alert("Please configure your Gemini API key in Settings first.");
      return;
    }
    setIsDetailedLoading(true);
    setDetailedError(null);
    try {
      const data = await getDetailedAnalysis(
        settings.apiKey,
        settings.model || 'gemini-3.5-flash',
        card.question,
        card.concept,
        log.userAnswer
      );
      setDetailedAnalysis(data);
    } catch (e) {
      console.error(e);
      setDetailedError(e.message || "Failed to fetch detailed analysis.");
    } finally {
      setIsDetailedLoading(false);
    }
  };

  // Tutor Chat handler
  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    if (!settings.apiKey) {
      alert("Please configure your Gemini API key in Settings first.");
      return;
    }
    const userText = chatInput;
    setChatInput('');
    setIsChatLoading(true);

    const newMsg = { sender: 'user', text: userText, highlights: [] };
    const updatedHistory = [...chatMessages, newMsg];
    setChatMessages(updatedHistory);

    try {
      const result = await chatTutorStep(
        settings.apiKey,
        settings.model || 'gemini-3.5-flash',
        card.question,
        card.concept,
        log.userAnswer,
        '',
        chatMessages,
        userText
      );
      
      const updatedMessages = [...updatedHistory];
      updatedMessages[updatedMessages.length - 1].highlights = result.highlights || [];
      
      const tutorMsg = { sender: 'tutor', text: result.response, highlights: [] };
      updatedMessages.push(tutorMsg);
      setChatMessages(updatedMessages);
    } catch (e) {
      console.error(e);
      setChatMessages(prev => [
        ...prev,
        { sender: 'tutor', text: `⚠️ Error contacting tutoring assistant: ${e.message || "Failed to get tutor response."}`, highlights: [] }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Text highlighting
  const userHighlightHtml = highlightAnswerText(log.userAnswer || '', log.highlights || []);
  const conceptHighlightHtml = highlightConceptText(card.concept || '', log.conceptHighlights || []);

  const handleVoiceReadAloud = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(memoryAnchor);
      if (settings?.voiceURI) {
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.voiceURI === settings.voiceURI);
        if (selectedVoice) utterance.voice = selectedVoice;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const FSRSRating = log.rating ? log.rating.toUpperCase() : 'GOOD';
  const nextReviewInterval = getFriendlyInterval(card, log.rating || 'good', settings.targetRetention);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100000,
      background: 'rgba(5, 3, 10, 0.85)',
      backdropFilter: 'blur(20px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '850px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'rgba(15, 10, 25, 0.9)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: '20px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              AI Grading Report Archive
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Attempt reviewed on {new Date(log.date).toLocaleString()}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Question Display */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', padding: '1rem', borderRadius: '12px', textAlign: 'left' }}>
            <strong style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question Display:</strong>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {card.question}
            </div>
          </div>

          {/* Answer Compare Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', textAlign: 'left' }}>
            <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Your Answer:</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }} dangerouslySetInnerHTML={{ __html: userHighlightHtml }} />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Reference Answer (Original Concept):</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }} dangerouslySetInnerHTML={{ __html: conceptHighlightHtml }} />
            </div>
          </div>

          {/* Score & Logic Analysis Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1.25rem', alignItems: 'center', textAlign: 'left' }}>
            {/* Score Ring */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: `conic-gradient(${score >= 80 ? 'var(--success)' : (score >= 60 ? 'var(--warning)' : 'var(--danger)')} ${score}%, rgba(255,255,255,0.05) 0%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
              }}>
                <div style={{
                  width: '66px',
                  height: '66px',
                  borderRadius: '50%',
                  background: 'rgba(20, 15, 35, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: score >= 80 ? 'var(--success)' : (score >= 60 ? 'var(--warning)' : 'var(--danger)')
                }}>
                  {score}%
                </div>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>
                Grading Score
              </span>
            </div>

            {/* Strengths & Weaknesses / Logic Gaps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {log.logicAnalysis ? (
                <div style={{ background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.15)', padding: '0.75rem', borderRadius: '8px' }}>
                  <strong style={{ color: '#fbbf24', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Logical Analysis (Feedback Display):</strong>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{log.logicAnalysis}</p>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px' }}>
                  <strong style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Logical Analysis:</strong>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No Logical Analysis recorded.</p>
                </div>
              )}
              {log.correctExplanation && (
                <div style={{ background: 'rgba(139, 92, 246, 0.04)', border: '1px solid rgba(139, 92, 246, 0.15)', padding: '0.75rem', borderRadius: '8px' }}>
                  <strong style={{ color: '#c084fc', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Core Concept Correction:</strong>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4' }} dangerouslySetInnerHTML={{ __html: parseMarkdown(log.correctExplanation) }} />
                </div>
              )}
            </div>
          </div>

          {/* Strengths & Weaknesses Side-By-Side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'left' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '0.85rem', borderRadius: '10px' }}>
              <strong style={{ color: 'var(--success)', fontSize: '0.78rem', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase' }}>🟢 Strengths:</strong>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {log.strengths && log.strengths.length > 0 ? (
                  log.strengths.map((s, i) => <li key={i}>{s}</li>)
                ) : (
                  <li>None identified</li>
                )}
              </ul>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '0.85rem', borderRadius: '10px' }}>
              <strong style={{ color: 'var(--danger)', fontSize: '0.78rem', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase' }}>🔴 Weaknesses:</strong>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {log.weaknesses && log.weaknesses.length > 0 ? (
                  log.weaknesses.map((w, i) => <li key={i}>{w}</li>)
                ) : (
                  <li>None identified</li>
                )}
              </ul>
            </div>
          </div>

          {/* Memory Anchor (Backstory & Quirky Fact) */}
          <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px dashed var(--accent-primary)', padding: '1rem 1.25rem', borderRadius: '12px', position: 'relative', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ color: 'var(--accent-secondary)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ⚓ Memory Anchor (Backstory & Quirky Fact)
              </strong>
              {memoryAnchor && (
                <button
                  type="button"
                  onClick={handleVoiceReadAloud}
                  style={{
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '20px',
                    padding: '0.15rem 0.6rem',
                    color: '#c4b5fd',
                    fontSize: '0.68rem',
                    cursor: 'pointer'
                  }}
                >
                  🔊 Voice Read-Aloud
                </button>
              )}
            </div>
            {memoryAnchor ? (
              <div
                className="markdown-content"
                style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}
                dangerouslySetInnerHTML={{ __html: parseMarkdown(memoryAnchor) }}
              />
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No Memory Anchor generated for this card.
              </div>
            )}
          </div>

          {/* Interactive Concept Tutor (Chat Interface) */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', padding: '1.25rem', borderRadius: '14px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <strong style={{ color: 'var(--accent-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              💬 Interactive Concept Tutor (Chat Archive)
            </strong>
            <div style={{ 
              background: 'rgba(0, 0, 0, 0.15)', 
              border: '1px solid var(--border-light)', 
              borderRadius: '10px', 
              padding: '0.75rem', 
              height: '180px', 
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              {chatMessages.map((msg, idx) => {
                const isTutor = msg.sender === 'tutor';
                return (
                  <div key={idx} style={{ alignSelf: isTutor ? 'flex-start' : 'flex-end', maxWidth: '85%', textAlign: 'left' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.15rem', textAlign: isTutor ? 'left' : 'right' }}>
                      {isTutor ? '🤖 AI Tutor' : '👤 You'}
                    </div>
                    <div style={{ 
                      background: isTutor ? 'rgba(255, 255, 255, 0.03)' : 'rgba(139, 92, 246, 0.12)', 
                      border: isTutor ? '1px solid var(--border-light)' : '1px solid rgba(139, 92, 246, 0.25)', 
                      color: isTutor ? 'var(--text-primary)' : '#e0dbff',
                      padding: '0.5rem 0.75rem',
                      borderRadius: isTutor ? '0 10px 10px 10px' : '10px 0 10px 10px',
                      fontSize: '0.82rem',
                      lineHeight: '1.45'
                    }}>
                      {isTutor ? msg.text : highlightAnswerText(msg.text, msg.highlights)}
                    </div>
                  </div>
                );
              })}
              {isChatLoading && (
                <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                    🤖 AI Tutor
                  </div>
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.03)', 
                    border: '1px solid var(--border-light)', 
                    padding: '0.5rem 0.75rem', 
                    borderRadius: '0 10px 10px 10px',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    color: 'var(--text-muted)'
                  }}>
                    <RefreshCw className="animate-float" size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    Thinking...
                  </div>
                </div>
              )}
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              style={{ display: 'flex', gap: '0.5rem', margin: 0 }}
            >
              <input
                type="text"
                placeholder="Ask the tutor a follow-up question about this attempt..."
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

          {/* Reconstruct the 100% Model Answer (Puzzle Game) */}
          <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '0.95rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                🧩 Reconstruct the 100% Model Answer
              </h4>
              <button
                className="btn btn-secondary"
                onClick={handleResetPuzzle}
                style={{ padding: '0.15rem 0.6rem', fontSize: '0.68rem', minHeight: 'auto' }}
              >
                Reset Button
              </button>
            </div>

            {puzzlePieces.length > 0 ? (
              <>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Click the scrambled blocks below in order to build the perfect target answer.
                </p>

                {/* Placed Area */}
                <div style={{ 
                  background: 'rgba(0,0,0,0.25)', 
                  border: '1px dashed rgba(139,92,246,0.3)', 
                  borderRadius: '10px', 
                  minHeight: '80px', 
                  padding: '0.75rem', 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '0.5rem', 
                  alignContent: 'flex-start',
                  borderColors: puzzleSolved ? 'var(--success)' : 'rgba(139,92,246,0.3)'
                }}>
                  {puzzlePlaced.length === 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 'auto' }}>Reconstruction Area (click blocks below)</span>
                  )}
                  {puzzlePlaced.map((piece, idx) => (
                    <span key={idx} style={{ 
                      background: 'rgba(139, 92, 246, 0.15)', 
                      border: '1px solid rgba(139, 92, 246, 0.3)', 
                      borderRadius: '6px', 
                      padding: '0.35rem 0.65rem', 
                      fontSize: '0.82rem', 
                      color: '#d8b4fe'
                    }}>
                      {piece}
                    </span>
                  ))}
                </div>

                {/* Scrambled Pool */}
                {puzzleScrambled.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {puzzleScrambled.map((piece, idx) => {
                      return (
                        <button
                          key={idx}
                          onClick={() => handlePlacePiece(idx)}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '6px',
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.82rem',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {piece}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  puzzleSolved && (
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#6ee7b7', fontSize: '0.85rem', fontWeight: 600 }}>
                      🎉 Reconstruction Solved! You've perfectly built the concept.
                    </div>
                  )
                )}
              </>
            ) : (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Reconstruction game not available for this card concept.
              </div>
            )}
          </div>

          {/* Detailed AI Analysis Toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-light)', textAlign: 'left' }}>
            {!detailedAnalysis ? (
              <div style={{ textAlign: 'left' }}>
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
                      🔍 Read Detailed AI Analysis (Read Analysis Toggle)
                    </>
                  )}
                </button>
                {detailedError && (
                  <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: '0.5rem' }}>{detailedError}</p>
                )}
              </div>
            ) : (
              <div className="glass-panel animate-fade-in" style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.95rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                    📚 Comprehensive Detailed AI Analysis
                  </h4>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setDetailedAnalysis(null)}
                    style={{ padding: '0.15rem 0.5rem', fontSize: '0.68rem', minHeight: 'auto' }}
                  >
                    Hide
                  </button>
                </div>

                {detailedAnalysis.pros && detailedAnalysis.pros.length > 0 && (
                  <div>
                    <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#34d399' }}>✓ What you did well</h5>
                    <ul style={{ margin: 0, paddingLeft: '1.15rem', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {detailedAnalysis.pros.map((pro, i) => <li key={i}>{pro}</li>)}
                    </ul>
                  </div>
                )}

                {detailedAnalysis.cons && detailedAnalysis.cons.length > 0 && (
                  <div>
                    <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#fca5a5' }}>✗ Misconceptions / Gaps</h5>
                    <ul style={{ margin: 0, paddingLeft: '1.15rem', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {detailedAnalysis.cons.map((con, i) => <li key={i}>{con}</li>)}
                    </ul>
                  </div>
                )}

                <div>
                  <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Concept Explanation</h5>
                  <div 
                    className="markdown-content"
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(detailedAnalysis.detailedExplanation) }}
                    style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* AI Suggested Card Status (Rating Recommendation) & Scheduled Display */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', textAlign: 'left' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', padding: '1rem', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Suggested Card Status</span>
              <h5 style={{ fontSize: '1.1rem', color: '#a78bfa', margin: '0.25rem 0 0 0', fontWeight: 700 }}>
                Rating Recommendation: {FSRSRating}
              </h5>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-light)', padding: '1rem', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FSRS Auto-Scheduled Interval</span>
              <h5 style={{ fontSize: '1.1rem', color: 'var(--accent-primary)', margin: '0.25rem 0 0 0', fontWeight: 700 }}>
                Next Review Display: {nextReviewInterval}
              </h5>
            </div>
          </div>

          {/* Gemini Interactive Simulation Canvas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-light)', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
              <strong style={{ color: '#a78bfa', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                🎮 Gemini Interactive Simulation Canvas (Canvas Builder)
              </strong>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {simulationHtmlList.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.2rem' }}>
                    {simulationHtmlList.map((sim, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => setActiveSimulationIdx(sIdx)}
                        style={{
                          background: sIdx === activeSimulationIdx ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                          border: 'none',
                          borderRadius: '3px',
                          color: 'white',
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.35rem',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                      >
                        v{sIdx + 1}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsFullscreenSim(true)}
                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.68rem', minHeight: 'auto' }}
                >
                  🖥️ Maximize
                </button>
              </div>
            </div>

            {activeSimHtml ? (
              <iframe
                title="Archived Simulation Preview"
                srcDoc={activeSimHtml}
                sandbox="allow-scripts allow-modals allow-downloads"
                style={{
                  width: '100%',
                  height: '350px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  background: '#0d0e15'
                }}
              />
            ) : (
              <div style={{ background: '#090a0f', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No active simulation html generated for this review.
              </div>
            )}

            {/* View Simulation Code (Manual Code Loader & Prompt Viewer) */}
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', background: 'rgba(0,0,0,0.15)' }}>
              <button
                type="button"
                onClick={() => setShowCodeViewer(!showCodeViewer)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.72rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
              >
                <span>📋 Prompt Viewer & Manual Code Loader</span>
                <span>{showCodeViewer ? '▲ Hide' : '▼ Show'}</span>
              </button>
              {showCodeViewer && (
                <div style={{ padding: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {log.simulation?.prompt && (
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>AI Prompt used for generation:</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '0.4rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)', whiteSpace: 'pre-wrap' }}>
                        {log.simulation.prompt}
                      </div>
                    </div>
                  )}
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Simulation Code (Click to select & edit/load manually):</strong>
                    <textarea
                      readOnly={!activeSimHtml}
                      value={activeSimHtml}
                      style={{
                        width: '100%',
                        height: '120px',
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        padding: '0.4rem',
                        background: '#090a0f',
                        border: 'none',
                        color: '#a7f3d0'
                      }}
                      onClick={e => e.target.select()}
                      placeholder="No simulation source code found."
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3D Visualizations block (SVG Diagrams) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-light)', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: 'var(--accent-secondary)', fontSize: '0.85rem' }}>
                📐 3D Visual Explanations / SVG Diagrams (Generate Answer Animation)
              </strong>
              
              {/* Visual tabs selectors */}
              <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0,0,0,0.2)', padding: '0.2rem', borderRadius: '6px' }}>
                <button
                  onClick={() => setActiveVisualTab('question')}
                  style={{
                    border: 'none',
                    borderRadius: '4px',
                    background: activeVisualTab === 'question' ? 'var(--accent-primary)' : 'transparent',
                    color: activeVisualTab === 'question' ? '#ffffff' : 'var(--text-secondary)',
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Question Diagram
                </button>
                <button
                  onClick={() => setActiveVisualTab('answer')}
                  style={{
                    border: 'none',
                    borderRadius: '4px',
                    background: activeVisualTab === 'answer' ? 'var(--accent-primary)' : 'transparent',
                    color: activeVisualTab === 'answer' ? '#ffffff' : 'var(--text-secondary)',
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Answer Diagram
                </button>
              </div>
            </div>

            {/* Diagrams renderer block */}
            {activeVisualTab === 'question' ? (
              questionSvgs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {questionSvgs.length > 1 && (
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {questionSvgs.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveQuestionSvgIdx(idx)}
                          style={{
                            background: idx === activeQuestionSvgIdx ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: 'white',
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          v{idx + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    style={{ background: '#090a0f', borderRadius: '10px', padding: '1rem', display: 'flex', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}
                    dangerouslySetInnerHTML={{ __html: activeQSvg }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>No question diagram recorded.</div>
              )
            ) : (
              answerSvgs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {answerSvgs.length > 1 && (
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {answerSvgs.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveAnswerSvgIdx(idx)}
                          style={{
                            background: idx === activeAnswerSvgIdx ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: 'white',
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          v{idx + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    style={{ background: '#090a0f', borderRadius: '10px', padding: '1rem', display: 'flex', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}
                    dangerouslySetInnerHTML={{ __html: activeASvg }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>No answer diagram recorded.</div>
              )
            )}
          </div>

        </div>

        {/* Fullscreen simulation overlay modal */}
        {isFullscreenSim && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 200000,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.5rem' }}>
              <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 'bold' }}>Simulation Fullscreen View</span>
              <button
                className="btn btn-secondary"
                onClick={() => setIsFullscreenSim(false)}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', minHeight: 'auto' }}
              >
                Close Fullscreen
              </button>
            </div>
            <iframe
              title="Fullscreen simulation preview"
              srcDoc={activeSimHtml}
              sandbox="allow-scripts allow-modals allow-downloads"
              style={{
                width: '100%',
                flex: 1,
                border: 'none',
                background: '#0d0e15',
                borderRadius: '8px'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
