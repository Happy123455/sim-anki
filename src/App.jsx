import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import StudySession from './components/StudySession';
import { calculateNextState, mergeDecksAndCards } from './utils/srs';
import { ShieldAlert, BookOpen, Layers, CloudOff, Cloud, RefreshCw } from 'lucide-react';
import { cleanApiKey, cleanModelName } from './utils/gemini';
import { pushToGist, pullFromGist, sanitizeToken, sanitizeGistId } from './utils/githubSync';
import { getVal, setVal } from './utils/db';

// Pre-seeded structural engineering deck and cards
const initialDecks = [
  {
    id: 'deck-structural',
    title: 'Structural Engineering',
    description: 'Core design philosophies, limit states, shear reinforcements, and reinforced concrete beam behavior.'
  }
];

const initialCards = [
  {
    id: 'card-1',
    deckId: 'deck-structural',
    question: 'What is the key difference between the Working Stress Method (WSM) and the Limit State Method (LSM) in structural design?',
    concept: 'WSM vs LSM structural design philosophy',
    state: null // new card
  },
  {
    id: 'card-2',
    deckId: 'deck-structural',
    question: 'Explain the concept of flexural failure modes in beams: what is the difference between under-reinforced and over-reinforced sections, and why is one preferred?',
    concept: 'Beam under-reinforced vs over-reinforced flexural behavior',
    state: null // new card
  },
  {
    id: 'card-3',
    deckId: 'deck-structural',
    question: 'Why do we need shear stirrups in concrete beams, and how do they carry the diagonal shear forces?',
    concept: 'Concrete beam shear failure and shear stirrups design',
    state: null // new card
  },
  {
    id: 'card-4',
    deckId: 'deck-structural',
    question: 'Which IS code is used for Plain and Reinforced Concrete?',
    concept: 'Correct Answer: IS 456 : 2000. Focus: IS 456 is for plain and reinforced concrete. Mnemonic: The foundational concrete rulebook.',
    state: null
  },
  {
    id: 'card-5',
    deckId: 'deck-structural',
    question: 'Which IS code (Parts I to V) governs Loading Standards (Dead, Live, Wind, Snow)?',
    concept: 'Correct Answer: IS 875. Focus: IS 875 governs loading standards. Mnemonic: The rulebook for incoming damage types.',
    state: null
  },
  {
    id: 'card-6',
    deckId: 'deck-structural',
    question: 'Which IS code contains the criteria for Earthquake Resistant Design?',
    concept: 'Correct Answer: IS 1893. Focus: IS 1893 is for earthquake resistant design. Mnemonic: The main Geo defense rulebook.',
    state: null
  },
  {
    id: 'card-7',
    deckId: 'deck-structural',
    question: 'Which IS code handles Ductile Detailing of seismic structures?',
    concept: 'Correct Answer: IS 13920. Focus: IS 13920 is for ductile detailing. Mnemonic: The "flexibility" rulebook for surviving tremors.',
    state: null
  },
  {
    id: 'card-8',
    deckId: 'deck-structural',
    question: 'What is the Partial Material Safety Factor for Concrete (\\(\\gamma_{mc}\\))?',
    concept: 'Correct Answer: 1.5. Focus: The material safety factor for concrete is 1.5. Mnemonic: A bigger safety buffer because it\'s crafted in the wild.',
    state: null
  },
  {
    id: 'card-9',
    deckId: 'deck-structural',
    question: 'What is the Partial Material Safety Factor for Steel (\\(\\gamma_{ms}\\))?',
    concept: 'Correct Answer: 1.15. Focus: The material safety factor for steel is 1.15. Mnemonic: A smaller safety buffer because it\'s forged in a controlled factory.',
    state: null
  },
  {
    id: 'card-10',
    deckId: 'deck-structural',
    question: 'Why is the safety factor for concrete (1.5) higher than for steel (1.15)?',
    concept: 'Correct Answer: Concrete is mixed on-site (lower quality control), steel is factory-made (high quality control). Focus: Concrete has less quality control than factory-made steel. Mnemonic: Field-crafting has unpredictable RNG compared to a blacksmith shop.',
    state: null
  },
  {
    id: 'card-11',
    deckId: 'deck-structural',
    question: 'What is the standard Load Safety Factor \\(\\gamma_{f}\\) for Dead + Live loads?',
    concept: 'Correct Answer: 1.5. Focus: The load safety factor is 1.5. Mnemonic: Multiplier applied to enemy attacks to ensure you survive.',
    state: null
  },
  {
    id: 'card-12',
    deckId: 'deck-structural',
    question: 'The Limit State Method combines concepts from which two older design methods?',
    concept: 'Correct Answer: Ultimate Load Method and Working Stress Method. Focus: Limit State Method combines Ultimate Load and Working Stress methods. Mnemonic: A hybrid build of two older metas.',
    state: null
  },
  {
    id: 'card-13',
    deckId: 'deck-structural',
    question: 'Which Limit State deals with the structure failing or being unable to resist external loads?',
    concept: 'Correct Answer: Limit State of Collapse (Strength). Focus: The limit state of collapse deals with structural failure. Mnemonic: Total HP reaches zero.',
    state: null
  },
  {
    id: 'card-14',
    deckId: 'deck-structural',
    question: 'Deflection, cracking, and vibration belong to which Limit State?',
    concept: 'Correct Answer: Limit State of Serviceability. Focus: Deflection and cracking fall under the limit state of serviceability. Mnemonic: HP isn\'t zero, but the structure has a continuous debuff making it uncomfortable.',
    state: null
  },
  {
    id: 'card-15',
    deckId: 'deck-structural',
    question: 'What is the formula to convert Characteristic Strength to Design Strength?',
    concept: 'Correct Answer: Divide by the Material Safety Factor, i.e., \\(\\frac{\\text{Characteristic Strength}}{\\text{Material Safety Factor}}\\). Focus: Design strength is characteristic strength divided by the material safety factor. Mnemonic: Nerf your own base stats on paper for a safety buffer.',
    state: null
  },
  {
    id: 'card-16',
    deckId: 'deck-structural',
    question: 'What is the formula to convert Characteristic Load to Design Load?',
    concept: 'Correct Answer: Multiply by the Load Safety Factor, i.e., \\(\\text{Characteristic Load} \\times \\text{Load Safety Factor}\\). Focus: Design load is characteristic load multiplied by the load safety factor. Mnemonic: Buff the enemy\'s base damage on paper for a safety buffer.',
    state: null
  },
  {
    id: 'card-17',
    deckId: 'deck-structural',
    question: 'What is the "Golden Rule" equation of structural design?',
    concept: 'Correct Answer: Design Strength \\(\\ge\\) Design Load. Focus: Design strength must be greater than or equal to design load. Mnemonic: Your nerfed shield must still block their buffed attack.',
    state: null
  },
  {
    id: 'card-18',
    deckId: 'deck-structural',
    question: 'What is the minimum grade of concrete allowed for RCC per IS 456?',
    concept: 'Correct Answer: M20. Focus: The minimum grade of concrete for RCC is M20. Mnemonic: The minimum level required to equip reinforcements.',
    state: null
  },
  {
    id: 'card-19',
    deckId: 'deck-structural',
    question: 'What is the standard unit weight of RCC (Reinforced Cement Concrete)?',
    concept: 'Correct Answer: 25 kN/m\u00b3. Focus: The unit weight of RCC is 25 kilonewtons per cubic meter. Mnemonic: Heaviest because of the steel inside.',
    state: null
  },
  {
    id: 'card-20',
    deckId: 'deck-structural',
    question: 'What is the standard unit weight of PCC (Plain Cement Concrete)?',
    concept: 'Correct Answer: 24 kN/m\u00b3. Focus: The unit weight of PCC is 24 kilonewtons per cubic meter. Mnemonic: Lighter by 1 point because it lacks metal.',
    state: null
  },
  {
    id: 'card-21',
    deckId: 'deck-structural',
    question: 'What is the standard unit weight of Steel?',
    concept: 'Correct Answer: 78.5 kN/m\u00b3. Focus: The unit weight of steel is 78.5 kilonewtons per cubic meter. Mnemonic: Extremely dense material.',
    state: null
  },
  {
    id: 'card-22',
    deckId: 'deck-structural',
    question: 'What is the standard Modulus of Elasticity of Steel (\\(E_s\\))?',
    concept: 'Correct Answer: 2 \\(\\times\\) 10^5 N/mm\u00b2. Focus: The modulus of elasticity of steel is 2 times 10 to the power 5 newtons per square millimeter. Mnemonic: Memorize the 2 and the 5 zeroes.',
    state: null
  }
];

const getDefaultDeviceName = () => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('ipad') || ua.includes('iphone')) return 'iOS Device';
  if (ua.includes('android')) return 'Android Device';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
  if (ua.includes('windows')) return 'Windows PC';
  return 'Browser Client';
};

const getSettingsPayload = (s) => {
  if (!s) return {};
  return {
    model: s.model,
    targetRetention: s.targetRetention,
    customInstructions: s.customInstructions,
    voiceURI: s.voiceURI,
    syncCode: s.syncCode,
    relaxedMode: s.relaxedMode || false,
    stressMode: s.stressMode || false,
    xp: s.xp || 0,
    streak: s.streak || 0,
    lastStudyDate: s.lastStudyDate || '',
    unlockAllFeatures: s.unlockAllFeatures ?? true,
    maxHardCardsPer5Min: s.maxHardCardsPer5Min ?? 2
  };
};

export default function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'settings' | 'study'
  const [settings, setSettings] = useState({ 
    apiKey: '', 
    model: 'gemini-3.5-flash', 
    targetRetention: 90, 
    customInstructions: '', 
    voiceURI: '', 
    deviceName: '',
    relaxedMode: false,
    stressMode: false,
    unlockAllFeatures: true,
    xp: 0,
    streak: 0,
    lastStudyDate: '',
    maxHardCardsPer5Min: 2
  });
  const [decks, setDecks] = useState(initialDecks);
  const [cards, setCards] = useState(initialCards);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [sessionCards, setSessionCards] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [lastModified, setLastModified] = useState(() => {
    const saved = localStorage.getItem('simanki_last_modified');
    return saved ? Number(saved) : 0;
  });
  const [cloudBackups, setCloudBackups] = useState(() => {
    try {
      const saved = localStorage.getItem('simanki_cloud_backups');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const autoPushTimeoutRef = useRef(null);

  // Clean timeout on unmount
  useEffect(() => {
    return () => {
      if (autoPushTimeoutRef.current) {
        clearTimeout(autoPushTimeoutRef.current);
      }
    };
  }, []);

  const sanitizeCardsForBackup = (cardsList) => {
    if (!Array.isArray(cardsList)) return [];
    return cardsList.map(card => {
      const { simulationHtml, simulationHtmlList, answerSvgs, questionSvgs, ...rest } = card;
      if (Array.isArray(rest.history)) {
        rest.history = rest.history.map(log => {
          const { simulationHtml: logSim, simulationHtmlList: logSimList, questionSvgs: logQS, answerSvgs: logAS, ...logRest } = log;
          return logRest;
        });
      }
      return rest;
    });
  };

  const sanitizeCardsForLocalStorage = (cardsList) => {
    if (!Array.isArray(cardsList)) return [];
    return cardsList.map(card => {
      const { simulationHtml, simulationHtmlList, answerSvgs, questionSvgs, ...rest } = card;
      if (Array.isArray(rest.history)) {
        rest.history = rest.history.map(log => {
          const { simulationHtml: logSim, simulationHtmlList: logSimList, questionSvgs: logQS, answerSvgs: logAS, ...logRest } = log;
          return logRest;
        });
      }
      return rest;
    });
  };

  const safeLocalStorageSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[LocalStorage] Failed to set ${key}:`, e);
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        if (key === 'simanki_cloud_backups') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) && parsed.length > 1) {
              const minimal = [parsed[0]];
              localStorage.setItem(key, JSON.stringify(minimal));
              console.log("[LocalStorage] Successfully saved minimal cloud backup to fit quota.");
              return;
            }
          } catch (innerEx) {
            console.error("[LocalStorage] Failed to save minimal cloud backup:", innerEx);
          }
        }
      }
    }
  };

  const saveLocalBackup = (currentDecks, currentCards) => {
    try {
      let nextIdx = Number(localStorage.getItem('simanki_backup_index') || 0) + 1;
      if (nextIdx > 3) nextIdx = 1;
      safeLocalStorageSetItem('simanki_backup_index', String(nextIdx));

      const localSettings = JSON.parse(localStorage.getItem('simanki_settings') || '{}');
      const deviceName = localSettings.deviceName || getDefaultDeviceName();

      const sanitizedCards = sanitizeCardsForBackup(currentCards);

      const backupData = {
        timestamp: Date.now(),
        deviceName,
        decks: currentDecks,
        cards: sanitizedCards
      };
      safeLocalStorageSetItem(`simanki_local_backup_${nextIdx}`, JSON.stringify(backupData));
    } catch (e) {
      console.error("Failed to save local backup:", e);
    }
  };

  const createNewCloudBackup = (currentDecks, currentCards, currentCloudBackups) => {
    const localSettings = JSON.parse(localStorage.getItem('simanki_settings') || '{}');
    const deviceName = localSettings.deviceName || getDefaultDeviceName();

    const sanitizedCards = sanitizeCardsForBackup(currentCards);

    const newBackup = {
      timestamp: Date.now(),
      deviceName,
      decks: currentDecks,
      cards: sanitizedCards
    };
    const cleaned = (currentCloudBackups || []).filter(b => b.timestamp !== newBackup.timestamp);
    const updated = [newBackup, ...cleaned].slice(0, 3);
    safeLocalStorageSetItem('simanki_cloud_backups', JSON.stringify(updated));
    return updated;
  };

  const handleRestoreBackup = (backup) => {
    if (backup && backup.decks && backup.cards) {
      saveDecks(backup.decks);
      saveCards(backup.cards);
      alert("Backup restored successfully!");
    } else {
      alert("Failed to restore backup: invalid data.");
    }
  };

  const performMergeSync = async (cloudData, patToUse, codeToUse, cloudLastModified) => {
    try {
      if (!cloudData || !cloudData.decks || !cloudData.cards) {
        console.error("Invalid cloud data format received in performMergeSync");
        return false;
      }

      const localDecks = JSON.parse(localStorage.getItem('simanki_decks') || '[]');
      const localCards = (await getVal('simanki_cards')) || JSON.parse(localStorage.getItem('simanki_cards') || '[]');
      const localSettings = JSON.parse(localStorage.getItem('simanki_settings') || '{}');
      const localTS = Number(localStorage.getItem('simanki_last_modified')) || 0;
      const localCloudBackups = JSON.parse(localStorage.getItem('simanki_cloud_backups') || '[]');

      const targetRetention = localSettings.targetRetention || 90;
      const { decks: mergedDecks, cards: mergedCards } = mergeDecksAndCards(
        localDecks,
        localCards,
        cloudData.decks,
        cloudData.cards,
        targetRetention
      );

      const allCloudBackups = [...(cloudData.backups || []), ...localCloudBackups];
      const seenBackupTS = new Set();
      const mergedCloudBackups = [];
      allCloudBackups.forEach(b => {
        if (b && b.timestamp && !seenBackupTS.has(b.timestamp)) {
          seenBackupTS.add(b.timestamp);
          mergedCloudBackups.push({
            ...b,
            cards: sanitizeCardsForBackup(b.cards)
          });
        }
      });
      mergedCloudBackups.sort((a, b) => b.timestamp - a.timestamp);
      const finalCloudBackups = mergedCloudBackups.slice(0, 3);

      const mergedSettings = {
        ...localSettings,
        ...(cloudData.settings || {}),
        apiKey: localSettings.apiKey || '',
        githubPAT: patToUse,
        syncCode: codeToUse,
        relaxedMode: cloudData.settings?.relaxedMode !== undefined ? cloudData.settings.relaxedMode : (localSettings.relaxedMode || false),
        stressMode: cloudData.settings?.stressMode !== undefined ? cloudData.settings.stressMode : (localSettings.stressMode || false),
        xp: Math.max(cloudData.settings?.xp || 0, localSettings.xp || 0),
        streak: Math.max(cloudData.settings?.streak || 0, localSettings.streak || 0),
        lastStudyDate: (cloudData.lastModified || 0) > localTS ? (cloudData.settings?.lastStudyDate || localSettings.lastStudyDate || '') : (localSettings.lastStudyDate || cloudData.settings?.lastStudyDate || '')
      };

      const localDecksStr = JSON.stringify(localDecks);
      const localCardsStr = JSON.stringify(localCards);
      const cloudDecksStr = JSON.stringify(cloudData.decks);
      const cloudCardsStr = JSON.stringify(cloudData.cards);
      
      const mergedDecksStr = JSON.stringify(mergedDecks);
      const mergedCardsStr = JSON.stringify(mergedCards);

      const localHasChanges = (mergedDecksStr !== localDecksStr || mergedCardsStr !== localCardsStr);
      const cloudHasChanges = (mergedDecksStr !== cloudDecksStr || mergedCardsStr !== cloudCardsStr);

      const now = Date.now();

      if (localHasChanges) {
        setDecks(mergedDecks);
        setCards(mergedCards);
        setSettings(mergedSettings);
        setCloudBackups(finalCloudBackups);

        safeLocalStorageSetItem('simanki_decks', mergedDecksStr);
        setVal('simanki_cards', mergedCards);
        safeLocalStorageSetItem('simanki_cards', JSON.stringify(sanitizeCardsForLocalStorage(mergedCards)));
        safeLocalStorageSetItem('simanki_settings', JSON.stringify(mergedSettings));
        safeLocalStorageSetItem('simanki_cloud_backups', JSON.stringify(finalCloudBackups));
        
        saveLocalBackup(mergedDecks, mergedCards);
      } else {
        setSettings(mergedSettings);
        setCloudBackups(finalCloudBackups);
        safeLocalStorageSetItem('simanki_settings', JSON.stringify(mergedSettings));
        safeLocalStorageSetItem('simanki_cloud_backups', JSON.stringify(finalCloudBackups));
      }

      if (cloudHasChanges) {
        const finalTS = now;
        safeLocalStorageSetItem('simanki_last_modified', String(finalTS));
        setLastModified(finalTS);

        const payload = {
          decks: mergedDecks,
          cards: mergedCards,
          settings: getSettingsPayload(mergedSettings),
          backups: finalCloudBackups,
          lastModified: finalTS
        };

        await pushToGist(patToUse, codeToUse, payload);
        console.log("Self-healing Sync: Pushed merged changes and backups to Gist successfully!");
      } else {
        const finalTS = Math.max(localTS, cloudLastModified);
        safeLocalStorageSetItem('simanki_last_modified', String(finalTS));
        setLastModified(finalTS);
      }

      setLastSyncTime(new Date());
      setSyncError(null);
      return true;
    } catch (err) {
      const msg = err.message || '';
      // Don't set sticky syncError for transient network failures
      if (!msg.toLowerCase().includes("failed to fetch") && !msg.toLowerCase().includes("networkerror")) {
        setSyncError(msg);
      }
      console.error("performMergeSync failed:", err);
      return false;
    }
  };

  // Trigger MathJax typesetting whenever view or cards change
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise().catch((err) => console.log('MathJax typesetting failed:', err));
    }
  }, [view, activeDeckId, cards]);

  // Load state from localStorage on init
  useEffect(() => {
    let activeSyncCode = null;
    try {
      const savedSettings = localStorage.getItem('simanki_settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        let needsSave = false;

        // Automatically migrate deprecated model names to gemini-3.5-flash
        if (parsed.model && (
          parsed.model.includes('1.5') || 
          parsed.model.includes('2.0') || 
          parsed.model.includes('2.5') ||
          parsed.model === 'gemini-pro'
        )) {
          parsed.model = 'gemini-3.5-flash';
          needsSave = true;
        }

        if (parsed.syncCode) {
          const cleanCode = sanitizeGistId(parsed.syncCode);
          if (cleanCode !== parsed.syncCode) {
            parsed.syncCode = cleanCode;
            needsSave = true;
          }
          activeSyncCode = cleanCode;
        }

        if (needsSave) {
          safeLocalStorageSetItem('simanki_settings', JSON.stringify(parsed));
        }
        setSettings(parsed);
      }
    } catch (e) {
      console.error("Error loading settings from localStorage:", e);
    }

    try {
      const savedDecks = localStorage.getItem('simanki_decks');
      if (savedDecks) setDecks(JSON.parse(savedDecks));
    } catch (e) {
      console.error("Error loading decks from localStorage:", e);
    }

    const loadCardsAsync = async () => {
      try {
        const dbCards = await getVal('simanki_cards');
        if (dbCards && Array.isArray(dbCards) && dbCards.length > 0) {
          setCards(dbCards);
        } else {
          const savedCards = localStorage.getItem('simanki_cards');
          if (savedCards) {
            const cleaned = escapeJsonLaTeX(savedCards);
            setCards(JSON.parse(cleaned));
          } else {
            setCards(initialCards);
          }
        }
      } catch (e) {
        console.error("Error loading cards from IndexedDB/localStorage:", e);
        setCards(initialCards);
      }
    };
    loadCardsAsync();

    // Self-healing Storage Cleanup: Clean existing cloud backups and local backup slots to free space
    try {
      const rawCloudBackups = localStorage.getItem('simanki_cloud_backups');
      if (rawCloudBackups) {
        const parsed = JSON.parse(rawCloudBackups);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.map(backup => ({
            ...backup,
            cards: sanitizeCardsForBackup(backup.cards)
          }));
          safeLocalStorageSetItem('simanki_cloud_backups', JSON.stringify(cleaned));
        }
      }
      
      for (let i = 1; i <= 3; i++) {
        const rawLocal = localStorage.getItem(`simanki_local_backup_${i}`);
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (parsed && parsed.cards) {
            const cleaned = {
              ...parsed,
              cards: sanitizeCardsForBackup(parsed.cards)
            };
            safeLocalStorageSetItem(`simanki_local_backup_${i}`, JSON.stringify(cleaned));
          }
        }
      }
    } catch (e) {
      console.error("Self-healing storage cleanup failed:", e);
    }

    // Auto-sync pull on startup if syncCode is configured
    if (activeSyncCode) {
      console.log("Auto-sync: Found active sync code, pulling latest cloud data...");
      const silentPull = async () => {
        try {
          const pat = settings.githubPAT || (localStorage.getItem('simanki_settings') ? JSON.parse(localStorage.getItem('simanki_settings')).githubPAT : '');
          const data = await pullFromGist(pat, activeSyncCode);
          const cloudLastModified = Number(data.lastModified) || 0;
          await performMergeSync(data, pat, activeSyncCode, cloudLastModified);
          console.log("Auto-sync: Silent startup merge-sync completed.");
        } catch (e) {
          console.error("Auto-sync silent startup Gist pull failed:", e);
        }
      };
      silentPull();
    }
  }, []);

  // Background polling for auto-sync
  useEffect(() => {
    const pat = settings.githubPAT;
    const code = settings.syncCode;
    
    // Only poll if credentials look valid to avoid background noise/failures during editing/setup
    const isPatValid = pat && (pat.startsWith('ghp_') || pat.startsWith('github_pat_'));
    const isCodeValid = code && code.length >= 20;
    
    if (!isPatValid || !isCodeValid || isSyncing) return;

    const interval = setInterval(async () => {
      // Skip background sync operations if the tab is not currently visible
      if (document.visibilityState === 'hidden') return;
      
      try {
        const data = await pullFromGist(pat, code);
        const cloudLastModified = Number(data.lastModified) || 0;
        
        // Load local lastModified from localStorage directly to avoid stale state closures
        const localSaved = localStorage.getItem('simanki_last_modified');
        const localTS = localSaved ? Number(localSaved) : 0;

        if (cloudLastModified > localTS) {
          console.log("Auto-sync: Cloud Gist data is newer. Pulling and merging automatically...", cloudLastModified, localTS);
          await performMergeSync(data, pat, code, cloudLastModified);
        } else {
          setLastSyncTime(new Date());
          setSyncError(null);
        }
      } catch (e) {
        const msg = e.message || '';
        // Silently ignore transient network errors (e.g. phone sleeping, wifi switching).
        // These resolve themselves on the next poll cycle. Only show persistent errors for
        // genuine API failures (auth issues, missing gist, etc.)
        if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
          console.warn("Auto-sync poll: transient network error, will retry next cycle.", msg);
        } else {
          setSyncError(msg);
          console.error("Auto-sync Gist background poll failed:", e);
        }
      }
    }, 25000); // Poll every 25 seconds

    return () => clearInterval(interval);
  }, [settings.syncCode, settings.githubPAT]);

  // Anki-like auto-sync: push on tab hide / page close, pull on tab return
  useEffect(() => {
    if (!settings.syncCode || !settings.githubPAT) return;

    // When user switches away or closes tab → push local changes
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        try {
          const localDecks = JSON.parse(localStorage.getItem('simanki_decks') || '[]');
          const localCards = (await getVal('simanki_cards')) || JSON.parse(localStorage.getItem('simanki_cards') || '[]');
          const localSettings = JSON.parse(localStorage.getItem('simanki_settings') || '{}');
          const localCloudBackups = JSON.parse(localStorage.getItem('simanki_cloud_backups') || '[]');
          const now = Date.now();
          const payload = {
            decks: localDecks,
            cards: localCards,
            settings: getSettingsPayload(localSettings),
            backups: localCloudBackups,
            lastModified: now
          };
          const gistId = sanitizeGistId(localSettings.syncCode);
          const pat = sanitizeToken(localSettings.githubPAT);
          if (gistId && pat) {
            fetch(`https://api.github.com/gists/${gistId}`, {
              method: 'PATCH',
              headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${pat}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                files: { "simanki_backup.json": { content: JSON.stringify(payload) } }
              }),
              keepalive: true
            }).catch(() => {});
            safeLocalStorageSetItem('simanki_last_modified', String(now));
          }
        } catch (e) {
          console.error('Auto-sync push on hide failed:', e);
        }
      } else if (document.visibilityState === 'visible') {
        // Tab came back → pull latest from cloud
        try {
          const localSettings = JSON.parse(localStorage.getItem('simanki_settings') || '{}');
          const pat = sanitizeToken(localSettings.githubPAT);
          const code = sanitizeGistId(localSettings.syncCode);
          if (!pat || !code) return;
          
          const data = await pullFromGist(pat, code);
          const cloudTS = Number(data.lastModified) || 0;
          const localTS = Number(localStorage.getItem('simanki_last_modified')) || 0;

          if (cloudTS > localTS && data.decks && data.cards) {
            await performMergeSync(data, pat, code, cloudTS);
            console.log('Auto-sync: Merged newer data on tab focus', cloudTS, localTS);
          }
        } catch (e) {
          console.error('Auto-sync pull on focus failed:', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [settings.syncCode, settings.githubPAT]);

  const triggerAutoPush = (newDecks, newCards, customCloudBackups = null, customSettings = null, timestamp = null) => {
    const activeSettings = customSettings || settings;
    if (!activeSettings.githubPAT || !activeSettings.syncCode) return;
    const ts = timestamp || Date.now();
    const activeBackups = customCloudBackups || cloudBackups;

    if (autoPushTimeoutRef.current) {
      clearTimeout(autoPushTimeoutRef.current);
    }

    autoPushTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const payload = {
          decks: newDecks,
          cards: newCards,
          settings: getSettingsPayload(activeSettings),
          backups: activeBackups,
          lastModified: ts
        };
        await pushToGist(activeSettings.githubPAT, activeSettings.syncCode, payload);
        setLastSyncTime(new Date());
        setSyncError(null);
        console.log("Auto-sync background Gist push success:", activeSettings.syncCode, "timestamp:", ts);
      } catch (e) {
        // Don't set persistent syncError for background auto-push failures —
        // transient network hiccups or rate limits shouldn't paint the badge red permanently.
        console.error("Auto-sync background Gist push failed:", e);
      } finally {
        setIsSyncing(false);
      }
    }, 2000); // 2-second debounce to throttle pushes and prevent rate limit (403) errors on fast updates
  };

  // Save changes to localStorage helper
  const saveDecks = (newDecks, skipAutoPush = false) => {
    setDecks(newDecks);
    safeLocalStorageSetItem('simanki_decks', JSON.stringify(newDecks));
    const now = Date.now();
    setLastModified(now);
    safeLocalStorageSetItem('simanki_last_modified', String(now));

    // Update cloud backups and save local snapshot
    const updatedCloudBackups = createNewCloudBackup(newDecks, cards, cloudBackups);
    setCloudBackups(updatedCloudBackups);
    saveLocalBackup(newDecks, cards);

    if (!skipAutoPush) {
      triggerAutoPush(newDecks, cards, updatedCloudBackups, null, now);
    }
  };

  const saveCards = (newCards, skipAutoPush = false) => {
    try {
      // Limit simulation HTML lists and SVG lists history to max 3 items to save storage space
      const limitedCards = newCards.map(card => {
        let updated = { ...card };
        if (Array.isArray(updated.simulationHtmlList) && updated.simulationHtmlList.length > 3) {
          updated.simulationHtmlList = updated.simulationHtmlList.slice(-3);
          if (updated.activeSimulationIndex >= updated.simulationHtmlList.length) {
            updated.activeSimulationIndex = updated.simulationHtmlList.length - 1;
          }
        }
        if (Array.isArray(updated.answerSvgs) && updated.answerSvgs.length > 3) {
          updated.answerSvgs = updated.answerSvgs.slice(-3);
          if (updated.activeAnswerSvgIndex >= updated.answerSvgs.length) {
            updated.activeAnswerSvgIndex = updated.answerSvgs.length - 1;
          }
        }
        if (Array.isArray(updated.questionSvgs) && updated.questionSvgs.length > 3) {
          updated.questionSvgs = updated.questionSvgs.slice(-3);
          if (updated.activeQuestionSvgIndex >= updated.questionSvgs.length) {
            updated.activeQuestionSvgIndex = updated.questionSvgs.length - 1;
          }
        }
        return updated;
      });

      setCards(limitedCards);
      setVal('simanki_cards', limitedCards);
      safeLocalStorageSetItem('simanki_cards', JSON.stringify(sanitizeCardsForLocalStorage(limitedCards)));
      const now = Date.now();
      setLastModified(now);
      safeLocalStorageSetItem('simanki_last_modified', String(now));

      // Update cloud backups and save local snapshot
      const updatedCloudBackups = createNewCloudBackup(decks, limitedCards, cloudBackups);
      setCloudBackups(updatedCloudBackups);
      saveLocalBackup(decks, limitedCards);

      if (!skipAutoPush) {
        triggerAutoPush(decks, limitedCards, updatedCloudBackups, null, now);
      }
    } catch (err) {
      console.error('saveCards error:', err);
      alert('Error saving cards to storage: ' + err.message);
    }
  };

  // --- SETTINGS CONTROL HANDLERS ---
  const handleSaveSettings = (newSettings) => {
    const cleaned = {
      ...newSettings,
      apiKey: cleanApiKey(newSettings.apiKey),
      model: cleanModelName(newSettings.model),
      githubPAT: sanitizeToken(newSettings.githubPAT),
      syncCode: sanitizeGistId(newSettings.syncCode)
    };
    setSettings(cleaned);
    safeLocalStorageSetItem('simanki_settings', JSON.stringify(cleaned));
    const now = Date.now();
    setLastModified(now);
    safeLocalStorageSetItem('simanki_last_modified', String(now));
    if (cleaned.syncCode) {
      triggerAutoPush(decks, cards, cleaned, now);
    }
  };

  const handleExportData = () => {
    const backup = { decks, cards };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `simanki-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (data) => {
    saveDecks(data.decks);
    saveCards(data.cards);
  };

  const handleClearData = () => {
    localStorage.removeItem('simanki_settings');
    localStorage.removeItem('simanki_decks');
    localStorage.removeItem('simanki_cards');
    setSettings({ apiKey: '', model: 'gemini-3.5-flash', targetRetention: 90, customInstructions: '', voiceURI: '' });
    setDecks(initialDecks);
    setCards(initialCards);
    setView('dashboard');
  };

  const handleImportAnkiCards = (importedCards, deckId = null) => {
    let targetDeckId = deckId || activeDeckId;
    let updatedDecks = [...decks];
    
    if (!targetDeckId) {
      const structuralDeckExists = decks.some(d => d.id === 'deck-structural');
      if (structuralDeckExists) {
        targetDeckId = 'deck-structural';
      } else if (decks.length > 0) {
        targetDeckId = decks[0].id;
      } else {
        targetDeckId = `deck-imported-${Date.now()}`;
        const newDeck = {
          id: targetDeckId,
          title: 'Imported Deck',
          description: 'Flashcards imported from Anki tab-separated text file.'
        };
        updatedDecks.push(newDeck);
        saveDecks(updatedDecks);
      }
    }
    
    const newCards = importedCards.map((c, index) => ({
      id: `card-imported-${Date.now()}-${index}`,
      deckId: targetDeckId,
      question: c.question,
      concept: c.concept,
      imageUrl: c.imageUrl || "",
      youtubeUrl: c.youtubeUrl || "",
      state: null
    }));
    
    saveCards([...cards, ...newCards]);
  };

  const handlePushSync = async (passedPat = null, passedSyncCode = null) => {
    const patToUse = sanitizeToken(passedPat || settings.githubPAT || '');
    if (!patToUse) {
      alert("GitHub Personal Access Token (PAT) is required to push/create a Gist sync.");
      return null;
    }
    
    // Use explicitly passed syncCode (from Settings component) over stale state
    const syncCodeToUse = sanitizeGistId(passedSyncCode || settings.syncCode || '');
    
    setIsSyncing(true);
    try {
      // Validate token structure before hitting GitHub
      if (!patToUse.startsWith('ghp_') && !patToUse.startsWith('github_pat_')) {
        throw new Error(`Token format is invalid. A classic token must start with 'ghp_' and a fine-grained token must start with 'github_pat_'.\n\nYour token starts with: "${patToUse.slice(0, 10)}..." (Length: ${patToUse.length})`);
      }

      // Preemptively test token connectivity against GitHub user endpoint
      const testRes = await fetch("https://api.github.com/user", {
        headers: { 
          'Authorization': `Bearer ${patToUse}`,
          'Accept': 'application/vnd.github+json'
        }
      });
      if (!testRes.ok) {
        throw new Error(`Invalid GitHub token (status ${testRes.status}).\n\nLoaded token starts with "${patToUse.slice(0, 6)}..." and ends with "...${patToUse.slice(-4)}" (Length: ${patToUse.length}).\n\nPlease check your copied token.`);
      }

      // First, update and save the settings locally
      const updatedSettings = { 
        ...settings, 
        githubPAT: patToUse,
        syncCode: syncCodeToUse
      };
      setSettings(updatedSettings);
      safeLocalStorageSetItem('simanki_settings', JSON.stringify(updatedSettings));

      const now = Date.now();
      const payload = {
        decks,
        cards,
        settings: getSettingsPayload(updatedSettings),
        backups: cloudBackups,
        lastModified: now
      };

      const gistId = await pushToGist(patToUse, syncCodeToUse, payload);
      
      const finalSettings = { ...updatedSettings, syncCode: gistId };
      setSettings(finalSettings);
      safeLocalStorageSetItem('simanki_settings', JSON.stringify(finalSettings));
      
      setLastModified(now);
      safeLocalStorageSetItem('simanki_last_modified', String(now));
      alert(`Sync completed successfully!\n\nYour Gist ID (Sync Code) is: ${gistId}\n\nUse this Gist ID on your other devices to pull your cards and progress.`);
      return gistId;
    } catch (err) {
      console.error(err);
      let friendlyMessage = err.message;
      if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
        friendlyMessage = `Failed to fetch (CORS/Network error).\n\nOn mobile devices, this usually means a Safari Content Blocker, AdBlocker, or VPN is blocking requests to api.github.com.\n\nPlease check your content blockers and ensure you have an active network connection.`;
      }
      alert(`Sync failed: ${friendlyMessage}`);
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullSync = async (code, passedPat = null) => {
    const codeToUse = sanitizeGistId(code || '');
    if (!codeToUse) return false;
    
    const patToUse = sanitizeToken(passedPat || settings.githubPAT || '');
    setIsSyncing(true);
    try {
      // Validate token structure before hitting GitHub
      if (patToUse && !patToUse.startsWith('ghp_') && !patToUse.startsWith('github_pat_')) {
        throw new Error(`Token format is invalid. A classic token must start with 'ghp_' and a fine-grained token must start with 'github_pat_'.\n\nYour token starts with: "${patToUse.slice(0, 10)}..." (Length: ${patToUse.length})`);
      }

      if (patToUse) {
        // Preemptively test token connectivity against GitHub user endpoint
        const testRes = await fetch("https://api.github.com/user", {
          headers: { 
            'Authorization': `Bearer ${patToUse}`,
            'Accept': 'application/vnd.github+json'
          }
        });
        if (!testRes.ok) {
          throw new Error(`Invalid GitHub token (status ${testRes.status}).\n\nLoaded token starts with "${patToUse.slice(0, 6)}..." and ends with "...${patToUse.slice(-4)}" (Length: ${patToUse.length}).\n\nPlease check your copied token.`);
        }
      }

      // Temporarily save code/pat inputs so they persist
      const preSavedSettings = {
        ...settings,
        githubPAT: patToUse,
        syncCode: codeToUse
      };
      setSettings(preSavedSettings);
      safeLocalStorageSetItem('simanki_settings', JSON.stringify(preSavedSettings));

      const data = await pullFromGist(patToUse, codeToUse);
      const cloudTS = Number(data.lastModified) || Date.now();
      const success = await performMergeSync(data, patToUse, codeToUse, cloudTS);
      if (success) {
        alert('Data synchronized and merged successfully from GitHub Gist!');
        return true;
      } else {
        throw new Error('Invalid cloud data format.');
      }
    } catch (err) {
      console.error(err);
      let friendlyMessage = err.message;
      if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
        friendlyMessage = `Failed to fetch (CORS/Network error).\n\nOn mobile devices, this usually means a Safari Content Blocker, AdBlocker, or VPN is blocking requests to api.github.com.\n\nPlease:\n1. Turn off any mobile adblockers or content filters.\n2. Check that both Gist ID and GitHub PAT are set correctly (Secret Gists require authentication!).\n3. Verify your internet connection.`;
      }
      alert(`Sync Pull failed: ${friendlyMessage}`);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // --- DECK MANAGEMENT HANDLERS ---
  const handleCreateDeck = (title, description) => {
    const newId = `deck-${Date.now()}`;
    const newDeck = {
      id: newId,
      title,
      description
    };
    saveDecks([...decks, newDeck]);
    return newId;
  };

  const handleDeleteDeck = (deckId) => {
    const updatedDecks = decks.filter(d => d.id !== deckId);
    saveDecks(updatedDecks);
    // Delete all cards associated with that deck
    const updatedCards = cards.filter(c => c.deckId !== deckId);
    saveCards(updatedCards);
  };

  // --- CARD MANAGEMENT HANDLERS ---
  const handleAddCard = (deckId, question, concept, imageUrl = "", youtubeUrl = "") => {
    const newCard = {
      id: `card-${Date.now()}`,
      deckId,
      question,
      concept,
      imageUrl,
      youtubeUrl,
      state: null
    };
    saveCards([...cards, newCard]);
  };

  const handleUpdateCards = (updatedCards) => {
    setCards(prev => {
      const copy = [...prev];
      updatedCards.forEach(uc => {
        const idx = copy.findIndex(c => c.id === uc.id);
        if (idx !== -1) {
          copy[idx] = { ...copy[idx], ...uc };
        }
      });
      saveCards(copy); // Persist to local storage
      return copy;
    });
  };

  const handleDeleteCard = (cardId) => {
    const updatedCards = cards.filter(c => c.id !== cardId);
    saveCards(updatedCards);
  };

  const handleBulkDeleteCards = (cardIds) => {
    const updatedCards = cards.filter(c => !cardIds.includes(c.id));
    saveCards(updatedCards);
  };

  const handleMoveCards = (cardIds, targetDeckId) => {
    const updatedCards = cards.map(c => {
      if (cardIds.includes(c.id)) {
        return { ...c, deckId: targetDeckId };
      }
      return c;
    });
    saveCards(updatedCards);
  };

  const handleRefactorCard = (cardId, refactoredData) => {
    setCards(prevCards => {
      const copy = [...prevCards];
      const parentIdx = copy.findIndex(c => c.id === cardId);
      if (parentIdx === -1) return prevCards;
      
      const parentCard = copy[parentIdx];
      
      if (refactoredData.methodApplied === 'simplify') {
        const updatedCard = {
          ...parentCard,
          question: refactoredData.simplifiedCard.question,
          concept: refactoredData.simplifiedCard.concept
        };
        copy[parentIdx] = updatedCard;
        saveCards(copy);
        // If we are in study mode, update sessionCards
        setSessionCards(prevSession => prevSession.map(sc => sc.id === cardId ? updatedCard : sc));
      } else if (refactoredData.methodApplied === 'split') {
        const childIds = [];
        const newChildCards = refactoredData.splitCards.map((sc, idx) => {
          const childId = `card-child-${Date.now()}-${idx}`;
          childIds.push(childId);
          return {
            id: childId,
            deckId: parentCard.deckId,
            question: sc.question,
            concept: sc.concept,
            parentCardId: parentCard.id,
            state: null,
            history: [],
            cardType: parentCard.cardType || 'default'
          };
        });
        
        const updatedParentCard = {
          ...parentCard,
          paused: true,
          childCardIds: childIds
        };
        copy[parentIdx] = updatedParentCard;
        
        const finalCards = [...copy, ...newChildCards];
        saveCards(finalCards);
        
        // If we are in study mode, swap the parent card in the remaining queue with child cards
        setSessionCards(prevSession => {
          const idx = prevSession.findIndex(sc => sc.id === cardId);
          if (idx === -1) return prevSession;
          const left = prevSession.slice(0, idx);
          const right = prevSession.slice(idx + 1);
          return [...left, ...newChildCards, ...right];
        });
      }
      return copy;
    });
  };

  // --- STUDY SESSION CONTROL HANDLERS ---
  const handleStartStudy = (deckId, options = { filter: 'due', type: 'all' }) => {
    setActiveDeckId(deckId);
    
    const deckCards = cards.filter(c => c.deckId === deckId && !c.paused && !c.suspended);
    let filtered = deckCards;

    // 1. Status Filter
    if (options.filter === 'due') {
      filtered = filtered.filter(card => {
        if (!card.state || !card.state.dueDate) return true;
        const due = new Date(card.state.dueDate);
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        return due <= now;
      });
    } else if (options.filter === 'new') {
      filtered = filtered.filter(c => !c.state || !c.state.dueDate);
    } else if (options.filter === 'leech') {
      filtered = filtered.filter(c => {
        const fails = (c.history || []).filter(h => h.rating === 'again').length;
        return fails >= 6;
      });
    }

    // 2. Type Filter
    if (options.type !== 'all') {
      filtered = filtered.filter(c => (c.cardType || 'default') === options.type);
    }
    
    setSessionCards(filtered);
    setView('study');
  };

  const handleRateCard = (cardId, rating, userAnswer, score, logicAnalysis, confidence, timeSpent, evaluation = null) => {
    try {
      // Outlier filtering: ignore readings over 120 seconds
      const finalTimeSpent = timeSpent > 120 ? 0 : timeSpent;

      let finalRating = rating;
      if (settings.relaxedMode && rating === 'again') {
        finalRating = 'hard';
      }

      // Calculate XP Gain
      let xpGain = 5; // Fail gets +5 XP for effort
      if (finalRating === 'hard') xpGain = 10;
      else if (finalRating === 'good') xpGain = 15;
      else if (finalRating === 'easy') xpGain = 20;

      const currentXp = settings.xp || 0;
      const newXp = currentXp + xpGain;

      // Calculate Streak
      const todayStr = new Date().toLocaleDateString('en-CA');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA');

      let newStreak = settings.streak || 0;
      const lastDate = settings.lastStudyDate || '';

      if (lastDate !== todayStr) {
        if (lastDate === yesterdayStr) {
          newStreak += 1;
        } else {
          newStreak = 1; // reset/new streak
        }
      }

      const updatedSettings = {
        ...settings,
        xp: newXp,
        streak: newStreak,
        lastStudyDate: todayStr
      };

      setSettings(updatedSettings);
      safeLocalStorageSetItem('simanki_settings', JSON.stringify(updatedSettings));

      const updatedCards = cards.map(card => {
        if (card.id === cardId) {
          const nextState = calculateNextState(card, finalRating, settings.targetRetention);
                // Log history entry
          const historyEntry = {
            date: new Date().toISOString(),
            userAnswer: userAnswer || '',
            score: score || 0,
            logicAnalysis: logicAnalysis || '',
            confidence: confidence || 3,
            timeSpent: finalTimeSpent,
            rating: finalRating,
            strengths: evaluation?.strengths || [],
            weaknesses: evaluation?.weaknesses || [],
            correctExplanation: evaluation?.correctExplanation || '',
            simulation: evaluation?.simulation || null,
            highlights: evaluation?.highlights || [],
            conceptHighlights: evaluation?.conceptHighlights || [],
            memoryAnchor: evaluation?.memoryAnchor || card.evaluation?.memoryAnchor || card.memoryAnchor || '',
            simulationHtml: card.simulationHtml || null,
            simulationHtmlList: card.simulationHtmlList || [],
            questionSvgs: card.questionSvgs || [],
            answerSvgs: card.answerSvgs || []
          };
          
          return {
            ...card,
            state: nextState,
            history: [...(card.history || []), historyEntry]
          };
        }
        return card;
      });
      saveCards(updatedCards);
      
      // Update local sessionCards to keep stable indices
      setSessionCards(prev => prev.map(c => {
        if (c.id === cardId) {
          const nextState = calculateNextState(c, finalRating, settings.targetRetention);
          const historyEntry = {
            date: new Date().toISOString(),
            userAnswer: userAnswer || '',
            score: score || 0,
            logicAnalysis: logicAnalysis || '',
            confidence: confidence || 3,
            timeSpent: finalTimeSpent,
            rating: finalRating,
            strengths: evaluation?.strengths || [],
            weaknesses: evaluation?.weaknesses || [],
            correctExplanation: evaluation?.correctExplanation || '',
            simulation: evaluation?.simulation || null,
            highlights: evaluation?.highlights || [],
            conceptHighlights: evaluation?.conceptHighlights || [],
            memoryAnchor: evaluation?.memoryAnchor || c.evaluation?.memoryAnchor || c.memoryAnchor || '',
            simulationHtml: c.simulationHtml || null,
            simulationHtmlList: c.simulationHtmlList || [],
            questionSvgs: c.questionSvgs || [],
            answerSvgs: c.answerSvgs || []
          };
          return {
            ...c,
            state: nextState,
            history: [...(c.history || []), historyEntry]
          };
        }
        return c;
      }));

      // Trigger sync with updated settings
      triggerAutoPush(decks, updatedCards, null, updatedSettings);
    } catch (err) {
      console.error('handleRateCard error:', err);
      alert('Error saving card progress: ' + err.message);
    }
  };

  const handleUpdateDeckMindMap = (deckId, mindMap) => {
    const updatedDecks = decks.map(d => {
      if (d.id === deckId) {
        return { ...d, mindMap };
      }
      return d;
    });
    saveDecks(updatedDecks);
  };

  // Helper to filter currently due cards in selected deck
  const getDueCards = () => {
    const deckCards = cards.filter(c => c.deckId === activeDeckId && !c.paused && !c.suspended);
    // We sort such that failed cards (due immediately) appear first
    const now = new Date();
    now.setHours(23, 59, 59, 999); // Due today includes cards due by midnight
    return deckCards.filter(card => {
      if (!card.state || !card.state.dueDate) return true;
      const due = new Date(card.state.dueDate);
      return due <= now;
    });
  };

  // Helper for sync status badge
  const getSyncStatusText = () => {
    if (!settings.syncCode || !settings.githubPAT) return null;
    if (isSyncing) return 'Syncing...';
    if (syncError) return 'Sync error';
    if (lastSyncTime) {
      const secs = Math.round((Date.now() - lastSyncTime.getTime()) / 1000);
      if (secs < 5) return 'Just synced';
      if (secs < 60) return `${secs}s ago`;
      const mins = Math.round(secs / 60);
      if (mins < 60) return `${mins}m ago`;
      return `${Math.round(mins / 60)}h ago`;
    }
    return 'Waiting...';
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* 🏷️ Top Corner Version Indicator */}
      <div 
        style={{
          position: 'fixed',
          top: '12px',
          left: '12px',
          background: '#8b5cf6',
          border: '1px solid #c084fc',
          borderRadius: '6px',
          padding: '0.35rem 0.7rem',
          fontSize: '0.82rem',
          fontWeight: 'bold',
          color: '#ffffff',
          zIndex: 999999,
          boxShadow: '0 4px 16px rgba(139, 92, 246, 0.45)',
          pointerEvents: 'none',
          userSelect: 'none',
          fontFamily: 'monospace'
        }}
      >
        v2.2.1
      </div>
      {/* Floating Auto-Sync Status Indicator */}
      {settings.syncCode && settings.githubPAT && (
        <div
          title={syncError ? `Error: ${syncError}` : lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleTimeString()}` : 'Auto-sync enabled'}
          onClick={() => {
            if (syncError) {
              alert(`Auto-Sync Error Details:\n\n${syncError}\n\nTroubleshooting tips:\n1. Check your internet connection.\n2. Verify that your GitHub PAT is valid and has 'gist' scope permissions.\n3. Verify your Gist ID (Sync Code).\n4. Adblockers/VPNs might be blocking requests to api.github.com.`);
            } else {
              alert(`SimAnki Sync Status:\n\nStatus: Connected & active\nLast synced: ${lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}`);
            }
          }}
          style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.75rem',
            borderRadius: '20px',
            background: syncError
              ? 'rgba(239, 68, 68, 0.15)'
              : isSyncing
                ? 'rgba(139, 92, 246, 0.15)'
                : 'rgba(34, 197, 94, 0.12)',
            border: `1px solid ${syncError ? 'rgba(239, 68, 68, 0.3)' : isSyncing ? 'rgba(139, 92, 246, 0.3)' : 'rgba(34, 197, 94, 0.25)'}`,
            backdropFilter: 'blur(12px)',
            fontSize: '0.72rem',
            fontWeight: 500,
            color: syncError ? '#fca5a5' : isSyncing ? '#c4b5fd' : '#86efac',
            zIndex: 1000,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            userSelect: 'none'
          }}
        >
          {isSyncing ? (
            <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
          ) : syncError ? (
            <CloudOff size={12} />
          ) : (
            <Cloud size={12} />
          )}
          <span>{getSyncStatusText()}</span>
        </div>
      )}
      {/* Settings warning header (if no key is saved) */}
      {view === 'dashboard' && !settings.apiKey && (
        <div 
          className="glass-panel" 
          style={{ 
            padding: '0.85rem 1.25rem', 
            background: 'rgba(245, 158, 11, 0.08)', 
            border: '1px solid rgba(245, 158, 11, 0.3)', 
            borderRadius: '10px',
            color: '#fcd34d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            textAlign: 'left',
            fontSize: '0.9rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={18} />
            <span><strong>Gemini API Key missing.</strong> Enter your key in Settings to enable AI grading and custom simulations.</span>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => setView('settings')} 
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fcd34d' }}
          >
            Configure Now
          </button>
        </div>
      )}

      {/* Main Views Routing */}
      {view === 'dashboard' && (
        <Dashboard
          Decks={decks}
          Cards={cards}
          settings={settings}
          onCreateDeck={handleCreateDeck}
          onDeleteDeck={handleDeleteDeck}
          onAddCard={handleAddCard}
          onDeleteCard={handleDeleteCard}
          onStartStudy={handleStartStudy}
          onOpenSettings={() => setView('settings')}
          onImportCards={handleImportAnkiCards}
          onBulkDeleteCards={handleBulkDeleteCards}
          onMoveCards={handleMoveCards}
          onUpdateDeckMindMap={handleUpdateDeckMindMap}
          onUpdateCards={handleUpdateCards}
          onRefactorCard={handleRefactorCard}
        />
      )}

      {view === 'settings' && (
        <Settings
          settings={settings}
          onSaveSettings={handleSaveSettings}
          onBack={() => setView('dashboard')}
          onExportData={handleExportData}
          onImportData={handleImportData}
          onClearData={handleClearData}
          onImportAnkiCards={handleImportAnkiCards}
          onPushSync={handlePushSync}
          onPullSync={handlePullSync}
          isSyncing={isSyncing}
          onRestoreBackup={handleRestoreBackup}
          cloudBackups={cloudBackups}
        />
      )}

      {view === 'study' && activeDeckId && (
        (() => {
          const activeDeck = decks.find(d => d.id === activeDeckId);

          if (!settings.apiKey) {
            return (
              <div className="glass-panel animate-fade-in" style={{ padding: '3rem', maxWidth: '500px', margin: '3rem auto', textAlign: 'center' }}>
                <ShieldAlert size={48} style={{ color: 'var(--warning)', marginBottom: '1rem' }} />
                <h3>API Key Required</h3>
                <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>
                  You must configure a Gemini API key in settings before you can start an AI-enabled study session.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={() => setView('dashboard')}>
                    Back to Dashboard
                  </button>
                  <button className="btn btn-primary" onClick={() => setView('settings')}>
                    Configure Settings
                  </button>
                </div>
              </div>
            );
          }

          return (
            <StudySession
              Deck={activeDeck}
              DueCards={sessionCards}
              apiKey={settings.apiKey}
              model={settings.model}
              targetRetention={settings.targetRetention}
              customInstructions={settings.customInstructions || ''}
              voiceURI={settings.voiceURI || ''}
              onRateCard={handleRateCard}
              onClose={() => setView('dashboard')}
              settings={settings}
              onRefactorCard={handleRefactorCard}
              onUpdateCard={(updated) => handleUpdateCards([updated])}
            />
          );
        })()
      )}
    </div>
  );
}

// Clean single backslashes in JSON strings that are not valid JSON escape sequences
function escapeJsonLaTeX(str) {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
      continue;
    }
    
    if (inString && char === '\\') {
      const nextChar = str[i + 1];
      if (nextChar === '"' || nextChar === '\\' || nextChar === '/' || nextChar === 'n' || nextChar === 't' || nextChar === 'r' || nextChar === 'b' || nextChar === 'f') {
        result += '\\' + nextChar;
        i += 2;
      } else if (nextChar === 'u') {
        result += '\\u';
        i += 2;
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}
