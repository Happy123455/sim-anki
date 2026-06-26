export const getUnlockLevel = (streak) => {
  if (streak >= 30) return 6; // Level 6: Interactive Tutor
  if (streak >= 21) return 5; // Level 5: Auto-Categorization & Mnemonics
  if (streak >= 14) return 4; // Level 4: Deck Filtering & Estimated Time
  if (streak >= 7) return 3;  // Level 3: TTS & Sound Effects
  if (streak >= 3) return 2;  // Level 2: Hint Feature & Gentle AI
  return 1;                   // Level 1: Basic Q&A
};

export const hasFeatureUnlocked = (settings, featureName) => {
  // Default unlockAllFeatures to true if it's undefined (for backwards compatibility with the current user)
  const isVeteran = settings.unlockAllFeatures !== false;
  if (isVeteran) return true;
  
  const level = getUnlockLevel(settings.streak || 0);

  switch (featureName) {
    case 'hint':
    case 'gentleMode':
      return level >= 2;
    case 'tts':
    case 'sound':
      return level >= 3;
    case 'filters':
    case 'estimatedTime':
      return level >= 4;
    case 'mnemonics':
    case 'categorization':
      return level >= 5;
    case 'interactiveTutor':
      return level >= 6;
    default:
      return true; // Basic features
  }
};
