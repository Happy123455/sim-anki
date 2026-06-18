import React, { useState } from 'react';
import { Calendar, Award, Clock, Star, Layers, X, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

export default function CardProgressDetails({ card, onClose }) {
  const [expandedLogIdx, setExpandedLogIdx] = useState(null);

  const history = card.history || [];
  const hasHistory = history.length > 0;

  // Render dynamic SVG chart
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

        {/* Historical Review Log List */}
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Review Logs</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {history.map((log, idx) => {
              const isExpanded = expandedLogIdx === idx;
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
                    onClick={() => setExpandedLogIdx(isExpanded ? null : idx)}
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
                    <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>Your Answer:</strong>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '6px', whiteSpace: 'pre-line' }}>
                          {log.userAnswer || "(No text response recorded)"}
                        </p>
                      </div>
                      
                      {log.logicAnalysis && (
                        <div>
                          <strong style={{ color: '#fca5a5' }}>Logical Gaps / Logic Corrections:</strong>
                          <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{log.logicAnalysis}</p>
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
