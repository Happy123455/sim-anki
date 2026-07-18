import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, TrendingUp, BarChart3, Activity, Sparkles, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { generateWeeklyCoachReport } from '../utils/gemini';

/**
 * AnalyticsDashboard — Full analytics view with:
 * - Review Heatmap (GitHub-style contribution graph)
 * - Retention Metrics Panel
 * - Per-Deck Difficulty Breakdown
 * - Review Forecast (next 7 days)
 * - Weekly AI Coach Report
 */
export default function AnalyticsDashboard({ Cards, Decks, settings, apiKey, model, onClose }) {
  const canvasRef = useRef(null);
  const [coachReport, setCoachReport] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState(null);
  const [showCoachDetails, setShowCoachDetails] = useState(false);

  // ─── Compute review data from card histories ───
  const reviewData = React.useMemo(() => {
    const dailyCounts = {};
    const deckScores = {};
    let totalReviews = 0;
    let correctFirst = 0;
    let thisWeekReviews = 0;
    let lastWeekReviews = 0;
    let thisWeekCorrect = 0;
    let lastWeekCorrect = 0;

    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);

    Cards.forEach(card => {
      const deckTitle = Decks.find(d => d.id === card.deckId)?.title || 'Unknown';
      if (!deckScores[deckTitle]) deckScores[deckTitle] = { total: 0, fails: 0, difficulty: 0 };

      (card.history || []).forEach(h => {
        const date = h.date?.split('T')[0];
        if (!date) return;
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        totalReviews++;

        const reviewDate = new Date(h.date);
        const isCorrect = h.rating !== 'again';

        if (isCorrect && h === card.history[0]) correctFirst++;

        if (reviewDate >= thisWeekStart) {
          thisWeekReviews++;
          if (isCorrect) thisWeekCorrect++;
        } else if (reviewDate >= lastWeekStart && reviewDate < thisWeekStart) {
          lastWeekReviews++;
          if (isCorrect) lastWeekCorrect++;
        }

        deckScores[deckTitle].total++;
        if (!isCorrect) deckScores[deckTitle].fails++;
      });

      if (card.state?.difficulty) {
        deckScores[deckTitle].difficulty += card.state.difficulty;
      }
    });

    // Compute average difficulty per deck
    Object.keys(deckScores).forEach(deck => {
      const deckCards = Cards.filter(c => Decks.find(d => d.id === c.deckId)?.title === deck);
      deckScores[deck].avgDifficulty = deckCards.length > 0
        ? (deckScores[deck].difficulty / deckCards.length).toFixed(1)
        : 0;
    });

    // Review forecast (next 7 days)
    const forecast = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dueCount = Cards.filter(c => {
        if (!c.state?.dueDate) return i === 0;
        return c.state.dueDate.split('T')[0] === dateStr;
      }).length;
      forecast.push({ date: dateStr, day: d.toLocaleDateString('en', { weekday: 'short' }), count: dueCount });
    }

    const trueRetention = totalReviews > 0 ? ((correctFirst / Cards.length) * 100).toFixed(1) : 0;
    const thisWeekRetention = thisWeekReviews > 0 ? ((thisWeekCorrect / thisWeekReviews) * 100).toFixed(1) : 0;
    const lastWeekRetention = lastWeekReviews > 0 ? ((lastWeekCorrect / lastWeekReviews) * 100).toFixed(1) : 0;

    return {
      dailyCounts, deckScores, totalReviews, trueRetention,
      thisWeekReviews, lastWeekReviews, thisWeekRetention, lastWeekRetention,
      forecast
    };
  }, [Cards, Decks]);

  // ─── Heatmap Canvas ───
  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const cellSize = 14;
    const gap = 3;
    const weeks = 26; // 6 months
    const days = 7;
    const labelWidth = 30;

    const width = labelWidth + weeks * (cellSize + gap);
    const height = days * (cellSize + gap) + 30;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, width, height);

    // Day labels
    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
    ctx.fillStyle = '#555';
    ctx.font = '10px Inter, sans-serif';
    dayLabels.forEach((label, i) => {
      if (label) ctx.fillText(label, 0, 20 + i * (cellSize + gap) + cellSize - 2);
    });

    // Build date map for last 26 weeks
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (weeks * 7 - 1));

    const maxCount = Math.max(1, ...Object.values(reviewData.dailyCounts));

    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < days; d++) {
        const dayOffset = w * 7 + d;
        const date = new Date(startDate);
        date.setDate(date.getDate() + dayOffset);

        if (date > today) continue;

        const dateStr = date.toISOString().split('T')[0];
        const count = reviewData.dailyCounts[dateStr] || 0;

        const x = labelWidth + w * (cellSize + gap);
        const y = 15 + d * (cellSize + gap);

        if (count === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
        } else {
          const intensity = Math.min(count / maxCount, 1);
          const r = Math.round(139 * intensity);
          const g = Math.round(92 * intensity * 0.3);
          const b = Math.round(246 * intensity);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.7})`;
        }

        ctx.beginPath();
        ctx.roundRect(x, y, cellSize, cellSize, 2);
        ctx.fill();
      }
    }
  }, [reviewData]);

  useEffect(() => {
    drawHeatmap();
  }, [drawHeatmap]);

  // ─── Weekly AI Coach ───
  const handleGenerateCoachReport = async () => {
    if (!apiKey) {
      setCoachError("Configure your Gemini API key in Settings first.");
      return;
    }
    setCoachLoading(true);
    setCoachError(null);

    try {
      const weeklyData = {
        thisWeek: {
          totalReviews: reviewData.thisWeekReviews,
          retention: reviewData.thisWeekRetention + '%',
          cardsStudied: Cards.filter(c => (c.history || []).some(h => {
            const d = new Date(h.date);
            const w = new Date(); w.setDate(w.getDate() - 7);
            return d >= w;
          })).length,
          decksUsed: [...new Set(Cards.filter(c => (c.history || []).some(h => {
            const d = new Date(h.date);
            const w = new Date(); w.setDate(w.getDate() - 7);
            return d >= w;
          })).map(c => Decks.find(d => d.id === c.deckId)?.title || 'Unknown'))],
          deckScores: Object.entries(reviewData.deckScores).map(([name, data]) => ({
            name, reviews: data.total, failRate: data.total > 0 ? ((data.fails / data.total) * 100).toFixed(1) + '%' : '0%',
            avgDifficulty: data.avgDifficulty
          }))
        },
        lastWeek: {
          totalReviews: reviewData.lastWeekReviews,
          retention: reviewData.lastWeekRetention + '%'
        },
        totalCards: Cards.length,
        totalDecks: Decks.length,
        overallRetention: reviewData.trueRetention + '%'
      };

      const report = await generateWeeklyCoachReport(apiKey, model, weeklyData);
      setCoachReport(report);
    } catch (e) {
      console.error(e);
      setCoachError(e.message || "Failed to generate coach report.");
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Activity size={24} style={{ color: '#8b5cf6' }} />
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Analytics
          </h2>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
          <X size={22} />
        </button>
      </div>

      {/* Metrics Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        <MetricCard label="Total Reviews" value={reviewData.totalReviews} icon="📊" color="#8b5cf6" />
        <MetricCard label="True Retention" value={`${reviewData.trueRetention}%`} icon="🎯" color="#10b981" />
        <MetricCard label="This Week" value={reviewData.thisWeekReviews} subtitle={`${reviewData.thisWeekRetention}% correct`} icon="📅" color="#3b82f6" />
        <MetricCard label="Total Cards" value={Cards.length} icon="🃏" color="#f59e0b" />
      </div>

      {/* Review Heatmap */}
      <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 600 }}>
          📈 Review Activity (6 months)
        </h3>
        <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
          <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.7rem', color: '#666' }}>Less</span>
          {[0.1, 0.3, 0.5, 0.7, 1].map((intensity, i) => (
            <div key={i} style={{ width: '12px', height: '12px', borderRadius: '2px', background: `rgba(${Math.round(139*intensity)}, ${Math.round(92*intensity*0.3)}, ${Math.round(246*intensity)}, ${0.3 + intensity * 0.7})` }} />
          ))}
          <span style={{ fontSize: '0.7rem', color: '#666' }}>More</span>
        </div>
      </div>

      {/* Review Forecast */}
      <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 600 }}>
          🔮 Review Forecast (Next 7 Days)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
          {reviewData.forecast.map((f, i) => {
            const maxForecast = Math.max(1, ...reviewData.forecast.map(x => x.count));
            const barHeight = Math.max(4, (f.count / maxForecast) * 80);
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 700 }}>{f.count}</span>
                <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{
                    width: '70%', height: `${barHeight}px`, borderRadius: '4px 4px 0 0',
                    background: i === 0 ? 'linear-gradient(180deg, #f59e0b, #d97706)' : 'linear-gradient(180deg, #8b5cf6, #6d28d9)',
                    transition: 'height 0.3s'
                  }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: i === 0 ? '#f59e0b' : '#888', fontWeight: i === 0 ? 700 : 400 }}>{f.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Deck Difficulty Breakdown */}
      {Object.keys(reviewData.deckScores).length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 600 }}>
            📚 Deck Breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {Object.entries(reviewData.deckScores)
              .sort((a, b) => b[1].avgDifficulty - a[1].avgDifficulty)
              .map(([deck, data]) => {
                const failRate = data.total > 0 ? (data.fails / data.total) * 100 : 0;
                const diffColor = data.avgDifficulty >= 7 ? '#ef4444' : data.avgDifficulty >= 4 ? '#f59e0b' : '#10b981';
                return (
                  <div key={deck} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck}</div>
                      <div style={{ fontSize: '0.72rem', color: '#888' }}>{data.total} reviews · {failRate.toFixed(0)}% fail rate</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: diffColor }}>{data.avgDifficulty}</div>
                      <div style={{ fontSize: '0.65rem', color: '#666' }}>avg diff</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Weekly AI Coach */}
      <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '14px', border: '1px solid rgba(139,92,246,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', color: '#c084fc', fontWeight: 700, margin: 0 }}>
            🤖 Weekly AI Coach
          </h3>
          <button onClick={handleGenerateCoachReport} disabled={coachLoading}
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 600, cursor: coachLoading ? 'wait' : 'pointer', opacity: coachLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {coachLoading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Sparkles size={14} /> Generate Report</>}
          </button>
        </div>

        {coachError && (
          <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem' }}>
            {coachError}
          </div>
        )}

        {coachReport && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Summary */}
            <div style={{ padding: '1rem', background: 'rgba(139,92,246,0.08)', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.2)' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.6', margin: 0 }}>{coachReport.overallSummary}</p>
            </div>

            {/* Metrics Comparison */}
            {coachReport.metricsComparison?.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                {coachReport.metricsComparison.map((m, i) => (
                  <div key={i} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: '0.3rem' }}>{m.metric}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{m.thisWeek}</span>
                      <span style={{ fontSize: '0.7rem', color: m.trend === 'up' ? '#10b981' : m.trend === 'down' ? '#ef4444' : '#888' }}>
                        {m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→'} {m.lastWeek}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Strengths & Weaknesses */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <h4 style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600, marginBottom: '0.5rem' }}>💪 Strengths</h4>
                {(coachReport.strengths || []).map((s, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(16,185,129,0.3)' }}>
                    <strong style={{ color: '#34d399' }}>{s.strength}</strong>: {s.detail}
                  </div>
                ))}
              </div>
              <div>
                <h4 style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.5rem' }}>⚡ Weak Areas</h4>
                {(coachReport.weakAreas || []).map((w, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(245,158,11,0.3)' }}>
                    <strong style={{ color: '#fbbf24' }}>{w.area}</strong>: {w.detail}
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {coachReport.recommendations?.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600, marginBottom: '0.5rem' }}>📋 Recommendations</h4>
                {coachReport.recommendations.map((rec, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', display: 'flex', gap: '0.4rem' }}>
                    <span style={{ color: '#60a5fa' }}>{i + 1}.</span> {rec}
                  </div>
                ))}
              </div>
            )}

            {/* Motivational */}
            {coachReport.motivationalClosing && (
              <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(236,72,153,0.1))', borderRadius: '10px', textAlign: 'center' }}>
                <p style={{ fontSize: '0.9rem', color: '#c084fc', fontWeight: 600, margin: 0, fontStyle: 'italic' }}>
                  ✨ {coachReport.motivationalClosing}
                </p>
              </div>
            )}
          </div>
        )}

        {!coachReport && !coachLoading && !coachError && (
          <p style={{ color: '#666', fontSize: '0.82rem', textAlign: 'center', padding: '1rem 0' }}>
            Click "Generate Report" to get your personalized weekly performance analysis.
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function MetricCard({ label, value, subtitle, icon, color }) {
  return (
    <div className="glass-panel" style={{ padding: '1rem', borderRadius: '12px', border: `1px solid ${color}25`, textAlign: 'center' }}>
      <div style={{ fontSize: '1.3rem', marginBottom: '0.3rem' }}>{icon}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: '#888', fontWeight: 500 }}>{label}</div>
      {subtitle && <div style={{ fontSize: '0.68rem', color: '#666', marginTop: '0.15rem' }}>{subtitle}</div>}
    </div>
  );
}
