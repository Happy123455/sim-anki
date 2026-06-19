import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Square, Play, Pause } from 'lucide-react';

// Tokenize text into words and non-words, tracking absolute character positions
const tokenizeText = (text) => {
  if (!text) return [];
  // Split by spaces and punctuation, keeping separators in the result
  const parts = text.split(/(\s+|[.,!?;:()\[\]"'\n]+)/);
  const tokens = [];
  let currentIndex = 0;

  parts.forEach(part => {
    if (part) {
      const isWord = !/^\s+$/.test(part) && !/^[.,!?;:()\[\]"'\n]+$/.test(part);
      tokens.push({
        text: part,
        isWord,
        startIndex: currentIndex,
        endIndex: currentIndex + part.length
      });
      currentIndex += part.length;
    }
  });

  return tokens;
};

export default function HighlightingTTS({ text, voiceURI = "" }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(null);
  
  const tokens = useRef([]);
  const utteranceRef = useRef(null);

  // Re-tokenize when text changes
  useEffect(() => {
    tokens.current = tokenizeText(text);
    return () => {
      stopSpeech();
    };
  }, [text]);

  const stopSpeech = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setActiveWordIndex(null);
  };

  const startSpeech = () => {
    if (!window.speechSynthesis) {
      alert("Text-to-Speech is not supported in this browser.");
      return;
    }

    stopSpeech(); // Cancel any ongoing speech first
    setIsPlaying(true);

    // Create a plain-text version for the Speech API (without custom markdown tags if any)
    const plainText = text.replace(/\*\*|###|##|#/g, '');
    
    // We need to re-tokenize the clean plainText to sync boundary indexes
    tokens.current = tokenizeText(plainText);

    const utterance = new SpeechSynthesisUtterance(plainText);
    utteranceRef.current = utterance;

    // Listen to boundary event to find current word
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const charIndex = event.charIndex;
        // Find the token that contains this character index
        const activeIdx = tokens.current.findIndex(
          t => t.isWord && charIndex >= t.startIndex && charIndex < t.endIndex
        );
        if (activeIdx !== -1) {
          setActiveWordIndex(activeIdx);
        }
      }
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setActiveWordIndex(null);
    };

    utterance.onerror = (e) => {
      console.warn("TTS Error:", e);
      setIsPlaying(false);
      setActiveWordIndex(null);
    };

    // Optionally set standard voice parameters
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;

    if (voiceURI) {
      const selectedVoice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Controls Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {isPlaying ? (
          <button 
            className="btn btn-secondary" 
            onClick={stopSpeech} 
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.25rem', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          >
            <Square size={14} fill="#fca5a5" /> Stop Reading
          </button>
        ) : (
          <button 
            className="btn btn-secondary" 
            onClick={startSpeech} 
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.25rem' }}
          >
            <Volume2 size={14} /> Read Aloud
          </button>
        )}
      </div>

      {/* Spoken Text Display Box */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '1.25rem', 
          fontSize: '0.95rem', 
          lineHeight: '1.7', 
          background: 'rgba(255, 255, 255, 0.02)', 
          textAlign: 'left',
          maxHeight: '220px',
          overflowY: 'auto'
        }}
      >
        {isPlaying ? (
          tokens.current.map((token, idx) => {
            const isActive = activeWordIndex === idx;
            return (
              <span
                key={idx}
                style={{
                  background: isActive ? 'var(--accent-primary-glow)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  borderRadius: isActive ? '4px' : '0',
                  padding: isActive ? '1px 3px' : '0',
                  boxShadow: isActive ? '0 0 8px var(--accent-primary)' : 'none',
                  borderBottom: isActive ? '2px solid var(--accent-secondary)' : 'none',
                  transition: 'all 0.08s ease',
                  whiteSpace: token.text === '\n' ? 'pre' : 'normal'
                }}
              >
                {token.text}
              </span>
            );
          })
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>{text.replace(/\*\*|###|##|#/g, '')}</span>
        )}
      </div>
    </div>
  );
}
