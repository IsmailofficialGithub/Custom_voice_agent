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

  // Build variants (e.g. "hey boss", "hi boss", "hello boss")
  const wakeVariants = [normWake];
  if (normWake === 'hey boss') {
    wakeVariants.push('hi boss', 'hello boss');
  }

  let matchedVariant: string | null = null;
  for (const variant of wakeVariants) {
    const wakeRegex = new RegExp(`(^|\\s)${escapeRegex(variant)}(\\s|$)`);
    if (wakeRegex.test(normTranscript)) {
      matchedVariant = variant;
      break;
    }
  }

  if (!matchedVariant) {
    return { matched: false, remainder: '' };
  }

  // Extract remainder from original transcript after the wake phrase
  const wakeWords = matchedVariant.split(' ');
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
 * Supports exact end phrase, "goodbye" vs "good bye" vs "bye",
 * and universal session termination keywords.
 */
export function isEndPhraseMatch(transcript: string, endPhrase: string): boolean {
  const normTranscript = normalizePhrase(transcript);
  const normEnd = normalizePhrase(endPhrase);

  if (!normTranscript) {
    return false;
  }

  // 1. Direct configured phrase match
  if (normEnd) {
    const endRegex = new RegExp(`(^|\\s)${escapeRegex(normEnd)}(\\s|$)`);
    if (endRegex.test(normTranscript)) {
      return true;
    }

    // Handle "goodbye" vs "good bye" vs "bye"
    if (normEnd === 'goodbye' || normEnd === 'good bye' || normEnd === 'bye') {
      if (/(^|\s)(goodbye|good\s+bye|bye|bye\s+bye)(\s|$)/.test(normTranscript)) {
        return true;
      }
    }
  }

  // 2. Universal termination commands
  const universalRegex =
    /(^|\s)(goodbye|good\s+bye|bye\s+bye|bye|stop\s+listening|end\s+call|end\s+chat|end\s+conversation|end\s+conference|close\s+chat|exit|quit|stop)(\s|$)/;
  return universalRegex.test(normTranscript);
}
