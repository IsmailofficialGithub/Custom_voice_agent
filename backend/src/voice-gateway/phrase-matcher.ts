/**
 * Normalizes text for voice trigger phrase comparison.
 * Trims, lowercases, replaces non-alphanumeric punctuation with spaces,
 * and collapses multiple whitespace characters.
 */
export function normalizePhrase(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a speech transcript contains the agent's wake phrase.
 * If matched, also extracts any remaining command speech after the wake phrase.
 */
export function isWakePhraseMatch(
  transcript: string,
  wakePhrase: string,
): { matched: boolean; remainder: string } {
  const normTranscript = normalizePhrase(transcript);
  const normWake = normalizePhrase(wakePhrase);

  if (!normWake) {
    return { matched: true, remainder: transcript.trim() };
  }

  // Match wake phrase with word boundaries in normalized text
  const wakeRegex = new RegExp(`(^|\\s)${escapeRegex(normWake)}(\\s|$)`);
  const match = normTranscript.match(wakeRegex);

  if (!match) {
    return { matched: false, remainder: '' };
  }

  // Extract remainder from original transcript after the wake phrase
  const wakeWords = normWake.split(' ');
  const regexPattern = wakeWords.map((w) => escapeRegex(w)).join('[\\s,\\.!?;:-]+');
  const originalRegex = new RegExp(regexPattern, 'i');
  const origMatch = transcript.match(originalRegex);

  let remainder = '';
  if (origMatch && origMatch.index !== undefined) {
    const afterWake = transcript.slice(origMatch.index + origMatch[0].length);
    remainder = afterWake.replace(/^[\s,\.!?;:-]+/, '').trim();
  }

  return { matched: true, remainder };
}

/**
 * Checks if a speech transcript contains the agent's end phrase.
 */
export function isEndPhraseMatch(transcript: string, endPhrase: string): boolean {
  const normTranscript = normalizePhrase(transcript);
  const normEnd = normalizePhrase(endPhrase);

  if (!normEnd) {
    return false;
  }

  const endRegex = new RegExp(`(^|\\s)${escapeRegex(normEnd)}(\\s|$)`);
  return endRegex.test(normTranscript);
}
