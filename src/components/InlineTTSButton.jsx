import React, { useState, useEffect } from 'react';
import { Volume2, Square } from 'lucide-react';
import { cleanTextForTTS } from '../utils/tts';

const getBestDefaultVoice = (voices) => {
  const preferredSubstrings = ["siri", "google us english", "google uk english", "natural", "neural", "samantha", "aria", "guy"];
  const englishVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  if (englishVoices.length === 0) return null;

  for (const sub of preferredSubstrings) {
    const match = englishVoices.find(v => v.name.toLowerCase().includes(sub));
    if (match) return match;
  }
  return englishVoices[0];
};

export default function InlineTTSButton({ text, voiceURI = "" }) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (isPlaying && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying]);

  const speak = (e) => {
    e.stopPropagation(); // prevent card clicks
    if (!window.speechSynthesis) {
      alert("Text-to-Speech is not supported in this browser.");
      return;
    }
    
    window.speechSynthesis.cancel(); // stop anything playing
    
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    
    setIsPlaying(true);
    // Strip markdown and math symbols before reading
    const plainText = cleanTextForTTS(text);
    const utterance = new SpeechSynthesisUtterance(plainText);
    
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    
    utterance.rate = 0.95; // slightly slower for better comprehension
    utterance.pitch = 1.0;
    
    const allVoices = window.speechSynthesis.getVoices();
    if (voiceURI) {
      const selectedVoice = allVoices.find(v => v.voiceURI === voiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      } else {
        const best = getBestDefaultVoice(allVoices);
        if (best) utterance.voice = best;
      }
    } else {
      const best = getBestDefaultVoice(allVoices);
      if (best) utterance.voice = best;
    }
    
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={speak}
      className="btn-text"
      style={{
        background: 'none',
        border: 'none',
        color: isPlaying ? 'var(--accent-secondary)' : 'var(--text-muted)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.2rem',
        borderRadius: '4px',
        transition: 'color 0.2s ease',
        verticalAlign: 'middle',
        marginLeft: '0.5rem'
      }}
      title={isPlaying ? "Stop reading" : "Read aloud"}
    >
      {isPlaying ? <Square size={14} fill="var(--accent-secondary)" /> : <Volume2 size={14} />}
    </button>
  );
}
