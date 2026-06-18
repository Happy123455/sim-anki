import React, { useState, useEffect } from 'react';
import { Sliders, HelpCircle, RefreshCw, ChevronRight, CheckCircle2, AlertCircle, Volume2, Square } from 'lucide-react';
import { playSuccess, playFailure, playClick, playSimWin } from '../utils/sound';


// Safe Math Evaluator
const evaluateFormula = (expression, variables) => {
  if (!expression) return 0;
  let parsed = expression;
  
  // Sort variables by length descending to prevent replacing substrings (e.g. replacing 'd' in 'depth')
  const sortedVarNames = Object.keys(variables).sort((a, b) => b.length - a.length);
  
  sortedVarNames.forEach(key => {
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    parsed = parsed.replace(regex, variables[key]);
  });

  // Strip math functions to validate remaining characters
  const cleanExpression = parsed
    .replace(/Math\.sqrt/g, '')
    .replace(/Math\.pow/g, '')
    .replace(/Math\.max/g, '')
    .replace(/Math\.min/g, '')
    .replace(/Math\.PI/g, '')
    .replace(/Math\.log/g, '')
    .replace(/Math\.exp/g, '');

  // Ensure only numbers, simple operators, brackets, spaces, and commas remain
  if (/^[0-9+\-*/().\s,]*$/.test(cleanExpression)) {
    try {
      const val = new Function(`return (${parsed})`)();
      return isNaN(val) ? 0 : val;
    } catch (e) {
      console.warn("Math eval error:", e, expression);
      return 0;
    }
  }
  console.warn("Unsafe expression blocked:", expression);
  return 0;
};

// Safe Condition Evaluator
const evaluateCondition = (condition, scope) => {
  if (!condition) return false;
  let parsed = condition;
  
  const sortedNames = Object.keys(scope).sort((a, b) => b.length - a.length);
  sortedNames.forEach(key => {
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    parsed = parsed.replace(regex, scope[key]);
  });

  const cleanCondition = parsed
    .replace(/Math\.sqrt/g, '')
    .replace(/Math\.pow/g, '')
    .replace(/Math\.max/g, '')
    .replace(/Math\.min/g, '')
    .replace(/Math\.PI/g, '')
    .replace(/Math\.log/g, '')
    .replace(/Math\.exp/g, '');

  // Allow math operations plus comparison operators (>, <, =, !, &, |)
  if (/^[0-9+\-*/().\s,><=!&|]*$/.test(cleanCondition)) {
    try {
      return new Function(`return (${parsed})`)();
    } catch (e) {
      console.warn("Condition eval error:", e, condition);
      return false;
    }
  }
  return false;
};

export default function SimulationRenderer({ simulation }) {
  if (!simulation) return null;

  const { simulationType, title, description } = simulation;

  // --- TTS VOICE OVER FOR SIMULATION ---
  const [isReadingSim, setIsReadingSim] = useState(false);
  const readSimAloud = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsReadingSim(true);
    
    let textToRead = "";
    if (simulationType === 'calculator') {
      textToRead = `${title}. ${description}. Challenge: ${simulation.challenge}`;
    } else {
      const stage = simulation.stages.find(s => s.id === currentStageId);
      textToRead = `${title}. ${description}. Current stage: ${stage ? stage.description : ''}`;
    }
    
    if (simulation.svgDescription) {
      textToRead += `. Visual Diagram: ${simulation.svgDescription}`;
    }
    
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.onend = () => setIsReadingSim(false);
    utterance.onerror = () => setIsReadingSim(false);
    window.speechSynthesis.speak(utterance);
  };
  
  const stopSimReading = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsReadingSim(false);
  };

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // --- CALCULATOR MODE STATE & LOGIC ---
  const [calcInputs, setCalcInputs] = useState({});
  const [calcOutputs, setCalcOutputs] = useState({});
  const [activeExplanations, setActiveExplanations] = useState([]);

  // Initialize inputs on load
  useEffect(() => {
    if (simulationType === 'calculator' && simulation.variables) {
      const initial = {};
      simulation.variables.forEach(v => {
        initial[v.name] = v.default;
      });
      setCalcInputs(initial);
    }
  }, [simulation]);

  // Recalculate outputs when inputs change
  useEffect(() => {
    if (simulationType === 'calculator' && Object.keys(calcInputs).length > 0) {
      const outputs = {};
      
      // Calculate outputs in order
      if (simulation.formulas) {
        simulation.formulas.forEach(f => {
          // Formulas can reference inputs + previous calculated formulas
          const scope = { ...calcInputs, ...outputs };
          const result = evaluateFormula(f.expression, scope);
          outputs[f.output] = Number(result.toFixed(2));
        });
      }
      setCalcOutputs(outputs);

      // Check explanations
      const scopeForExpl = { ...calcInputs, ...outputs };
      const active = [];
      if (simulation.explanations) {
        simulation.explanations.forEach(e => {
          if (evaluateCondition(e.condition, scopeForExpl)) {
            active.push(e.text);
          }
        });
      }
      setActiveExplanations(active);
    }
  }, [calcInputs, simulation]);

  const handleSliderChange = (name, val) => {
    playClick(); // Play a tactile click sound on slider drag
    setCalcInputs(prev => ({
      ...prev,
      [name]: Number(val)
    }));
  };

  // --- SCENARIO MODE STATE & LOGIC ---
  const [currentStageId, setCurrentStageId] = useState(1);
  const [selectedChoiceIdx, setSelectedChoiceIdx] = useState(null);
  const [scenarioHistory, setScenarioHistory] = useState([]);

  const handleChoiceClick = (idx, isCorrect) => {
    setSelectedChoiceIdx(idx);
    const stage = simulation.stages.find(s => s.id === currentStageId);
    if (stage) {
      const choice = stage.choices[idx];
      if (isCorrect) {
        if (choice && choice.nextStageId === null) {
          playSimWin(); // Play victory fanfare on successful completion
        } else {
          playSuccess(); // Play standard rising chord
        }
      } else {
        playFailure(); // Play buzz
      }
    }
  };

  const handleNextStage = (nextId, choiceText, feedback) => {
    setScenarioHistory(prev => [...prev, { stageId: currentStageId, choiceText, feedback }]);
    setCurrentStageId(nextId);
    setSelectedChoiceIdx(null);
  };

  const handleResetScenario = () => {
    setCurrentStageId(1);
    setSelectedChoiceIdx(null);
    setScenarioHistory([]);
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '1.75rem', background: 'rgba(17, 12, 35, 0.45)', border: '1px solid rgba(139, 92, 246, 0.25)', display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
            Interactive AI Simulation
          </span>
          <h3 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginTop: '0.15rem' }}>{title}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>{description}</p>
        </div>

        <div>
          {isReadingSim ? (
            <button className="btn btn-secondary" onClick={stopSimReading} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <Square size={12} fill="#fca5a5" /> Stop Voice
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={readSimAloud} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', gap: '0.25rem' }}>
              <Volume2 size={12} /> Play Voice
            </button>
          )}
        </div>
      </div>

      <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* --- ANIMATED SVG DIAGRAM --- */}
      {simulation.svgDiagram && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span 
              style={{ 
                display: 'inline-block', 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: 'var(--accent-secondary)', 
                boxShadow: '0 0 8px var(--accent-secondary)'
              }}
            />
            Interactive Visual Diagram
          </span>
          <div 
            style={{
              background: 'rgba(9, 9, 11, 0.4)',
              border: '1px solid rgba(139, 92, 246, 0.15)',
              borderRadius: '12px',
              padding: '1.5rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
              minHeight: '200px',
              width: '100%',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)'
            }}
            dangerouslySetInnerHTML={{ __html: simulation.svgDiagram }}
          />
        </div>
      )}

      {/* --- CALCULATOR DESIGN --- */}
      {simulationType === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.75rem' }}>
          {/* Sliders panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sliders size={16} style={{ color: 'var(--accent-primary)' }} /> Simulator Controls
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {simulation.variables?.map(v => (
                <div key={v.name} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v.label}</span>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                      {calcInputs[v.name]} {v.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={v.min}
                    max={v.max}
                    step={v.step}
                    value={calcInputs[v.name] || v.default}
                    onChange={(e) => handleSliderChange(v.name, e.target.value)}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>{v.min}</span>
                    <span>{v.max}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Target challenge widget */}
            {simulation.challenge && (
              <div style={{ background: 'rgba(6, 182, 212, 0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(6, 182, 212, 0.2)', display: 'flex', gap: '0.75rem' }}>
                <HelpCircle size={20} style={{ color: 'var(--info)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--info)', fontWeight: 700, textTransform: 'uppercase' }}>Target Challenge</span>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.1rem' }}>{simulation.challenge}</p>
                </div>
              </div>
            )}
          </div>

          {/* Outputs Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>Calculated Analysis</h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {simulation.formulas?.map(f => (
                <div key={f.output} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{f.label}</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {calcOutputs[f.output]} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>{f.unit}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Explanations based on current state */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {activeExplanations.map((text, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    padding: '0.85rem 1rem', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem',
                    background: text.toLowerCase().includes('fail') || text.toLowerCase().includes('collapse') || text.toLowerCase().includes('exceed') 
                      ? 'rgba(239, 68, 68, 0.06)' 
                      : 'rgba(16, 185, 129, 0.06)',
                    border: text.toLowerCase().includes('fail') || text.toLowerCase().includes('collapse') || text.toLowerCase().includes('exceed')
                      ? '1px solid rgba(239, 68, 68, 0.2)'
                      : '1px solid rgba(16, 185, 129, 0.2)',
                    color: text.toLowerCase().includes('fail') || text.toLowerCase().includes('collapse') || text.toLowerCase().includes('exceed')
                      ? '#fca5a5'
                      : '#a7f3d0',
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'start'
                  }}
                >
                  {text.toLowerCase().includes('fail') || text.toLowerCase().includes('collapse') || text.toLowerCase().includes('exceed') ? (
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  ) : (
                    <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  )}
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- SCENARIO DESIGN --- */}
      {simulationType === 'scenario' && simulation.stages && (() => {
        const stage = simulation.stages.find(s => s.id === currentStageId);
        
        if (!stage) {
          return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <CheckCircle2 size={36} style={{ color: 'var(--success)', marginBottom: '0.5rem' }} />
              <h4>Scenario Completed!</h4>
              <button className="btn btn-secondary" onClick={handleResetScenario} style={{ marginTop: '1rem', gap: '0.5rem' }}>
                <RefreshCw size={14} /> Play Again
              </button>
            </div>
          );
        }

        const selectedChoice = selectedChoiceIdx !== null ? stage.choices[selectedChoiceIdx] : null;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Scenario Header / Introduction */}
            {currentStageId === 1 && simulation.introduction && (
              <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderLeft: '3px solid var(--accent-secondary)' }}>
                {simulation.introduction}
              </p>
            )}

            {/* Stage Description */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CURRENT STATE</span>
              <p style={{ marginTop: '0.25rem', fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>{stage.description}</p>
            </div>

            {/* Choices Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {stage.choices.map((choice, idx) => {
                const isSelected = selectedChoiceIdx === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => selectedChoiceIdx === null && handleChoiceClick(idx, choice.isCorrect)}
                    disabled={selectedChoiceIdx !== null}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: isSelected 
                        ? (choice.isCorrect ? '1px solid var(--success)' : '1px solid var(--danger)') 
                        : '1px solid var(--border-light)',
                      background: isSelected
                        ? (choice.isCorrect ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)')
                        : 'rgba(9, 9, 11, 0.4)',
                      color: isSelected
                        ? (choice.isCorrect ? '#a7f3d0' : '#fca5a5')
                        : 'var(--text-primary)',
                      cursor: selectedChoiceIdx !== null ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      fontSize: '0.9rem',
                      fontWeight: 500
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: isSelected
                          ? (choice.isCorrect ? 'var(--success)' : 'var(--danger)')
                          : 'rgba(255,255,255,0.1)',
                        color: isSelected ? '#000' : 'var(--text-primary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span>{choice.text}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Immediate Choice Feedback */}
            {selectedChoice && (
              <div 
                className="animate-fade-in"
                style={{ 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  fontSize: '0.85rem',
                  background: selectedChoice.isCorrect ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: selectedChoice.isCorrect ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                  color: selectedChoice.isCorrect ? '#a7f3d0' : '#fca5a5',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'start'
                }}
              >
                {selectedChoice.isCorrect ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />}
                <div>
                  <span style={{ fontWeight: 700 }}>{selectedChoice.isCorrect ? 'Sound Choice!' : 'Warning/Error:'}</span>
                  <p style={{ marginTop: '0.2rem', lineHeight: '1.4' }}>{selectedChoice.feedback}</p>
                </div>
              </div>
            )}

            {/* Next Step / Reset Navigation */}
            {selectedChoice && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                {selectedChoice.nextStageId !== null ? (
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleNextStage(selectedChoice.nextStageId, selectedChoice.text, selectedChoice.feedback)}
                    style={{ gap: '0.25rem' }}
                  >
                    Proceed <ChevronRight size={16} />
                  </button>
                ) : (
                  <button className="btn btn-secondary" onClick={handleResetScenario} style={{ gap: '0.5rem' }}>
                    <RefreshCw size={14} /> Reset Scenario
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
