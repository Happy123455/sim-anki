export function cleanTextForTTS(text) {
  if (!text) return "";
  let clean = text;
  
  // 1. Remove LaTeX mathematical block wrappers like \( ... \) or \[ ... \]
  clean = clean.replace(/\\\(|\\\)|\\\[|\\\]/g, ' ');

  // 2. Remove dollar signs used for mathematical expressions (e.g. $97.2\%$ -> 97.2%)
  clean = clean.replace(/\$/g, '');

  // 3. Remove backslashes
  clean = clean.replace(/\\/g, '');

  // 4. Remove mathematical syntax characters like underscores, curly braces, sub/superscript notations
  clean = clean.replace(/[{}_^]/g, ' ');

  // 5. Strip markdown formatting
  clean = clean.replace(/\*\*|###|##|#|`|~|\*|_/g, '');

  // 6. Clean multiple spaces
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}
