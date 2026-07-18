/**
 * SimAnki Data Export Utilities
 * Exports cards/decks to CSV, Markdown, and Anki-importable TSV formats.
 */

/**
 * Trigger a browser download of a text file.
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export cards to CSV format.
 * Columns: Deck, Question, Answer, Concept, CardType, Difficulty, Stability, DueDate, Interval, Repetitions
 */
export function exportToCSV(decks, cards) {
  const deckMap = new Map(decks.map(d => [d.id, d.title]));
  const header = 'Deck,Question,Answer,Concept,CardType,Difficulty,Stability,DueDate,Interval,Repetitions';
  
  const rows = cards.map(c => {
    const deckTitle = deckMap.get(c.deckId) || 'Unknown';
    const q = `"${(c.question || '').replace(/"/g, '""')}"`;
    const a = `"${(c.concept || '').replace(/"/g, '""')}"`;
    const concept = `"${(c.concept || '').replace(/"/g, '""')}"`;
    const cardType = c.cardType || 'standard';
    const diff = c.state?.difficulty?.toFixed(2) || '';
    const stab = c.state?.stability?.toFixed(2) || '';
    const due = c.state?.dueDate || '';
    const interval = c.state?.interval || 0;
    const reps = c.state?.repetitions || 0;
    return `"${deckTitle}",${q},${a},${concept},${cardType},${diff},${stab},${due},${interval},${reps}`;
  });

  const csv = [header, ...rows].join('\n');
  downloadFile(csv, `simanki_export_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  return rows.length;
}

/**
 * Export cards to Markdown format.
 * Grouped by deck with Q/A pairs.
 */
export function exportToMarkdown(decks, cards) {
  const deckMap = new Map(decks.map(d => [d.id, d]));
  const cardsByDeck = new Map();
  
  cards.forEach(c => {
    if (!cardsByDeck.has(c.deckId)) cardsByDeck.set(c.deckId, []);
    cardsByDeck.get(c.deckId).push(c);
  });

  let md = `# SimAnki Export\n\n_Exported on ${new Date().toLocaleDateString()}_\n\n---\n\n`;

  cardsByDeck.forEach((deckCards, deckId) => {
    const deck = deckMap.get(deckId);
    const title = deck ? deck.title : 'Unknown Deck';
    md += `## ${title}\n\n`;
    
    deckCards.forEach((c, i) => {
      md += `### Card ${i + 1}\n\n`;
      md += `**Q:** ${c.question || '(empty)'}\n\n`;
      md += `**A:** ${c.concept || '(empty)'}\n\n`;
      if (c.state) {
        md += `> Difficulty: ${c.state.difficulty?.toFixed(1) || '?'} | Stability: ${c.state.stability?.toFixed(1) || '?'} | Interval: ${c.state.interval || 0}d | Reps: ${c.state.repetitions || 0}\n\n`;
      }
      md += `---\n\n`;
    });
  });

  downloadFile(md, `simanki_export_${new Date().toISOString().slice(0,10)}.md`, 'text/markdown');
  return cards.length;
}

/**
 * Export cards to Anki-importable TSV format.
 * Format: Front\tBack\tTags
 * Anki can import this via File → Import.
 */
export function exportToAnkiTSV(decks, cards) {
  const deckMap = new Map(decks.map(d => [d.id, d.title]));
  
  const rows = cards.map(c => {
    const deckTitle = (deckMap.get(c.deckId) || 'SimAnki').replace(/\s+/g, '_');
    const front = (c.question || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const back = (c.concept || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const tags = `simanki::${deckTitle}`;
    return `${front}\t${back}\t${tags}`;
  });

  const tsv = rows.join('\n');
  downloadFile(tsv, `simanki_anki_import_${new Date().toISOString().slice(0,10)}.txt`, 'text/tab-separated-values');
  return rows.length;
}
