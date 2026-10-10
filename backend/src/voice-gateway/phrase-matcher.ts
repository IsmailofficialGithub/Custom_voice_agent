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

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function isFuzzySimilar(candidate: string, target: string, maxDistance = 2): boolean {
  if (!candidate || !target) return false;
  if (Math.abs(candidate.length - target.length) > maxDistance) return false;
  const dist = levenshteinDistance(candidate, target);
  return dist <= maxDistance;
}

/**
 * Checks if a speech transcript contains the agent's end phrase.
 * Supports exact end phrase, phonetic/Whisper misrecognitions (e.g. "good boy", "cool boy", "good buy"),
 * fuzzy similarity matching, and universal session termination keywords.
 */
export function isEndPhraseMatch(transcript: string, endPhrase: string): boolean {
  const normTranscript = normalizePhrase(transcript);
  const normEnd = normalizePhrase(endPhrase || 'goodbye');

  if (!normTranscript) {
    return false;
  }

  // 1. Direct configured phrase match with word boundaries
  if (normEnd) {
    const endRegex = new RegExp(`(^|\\s)${escapeRegex(normEnd)}(\\s|$)`);
    if (endRegex.test(normTranscript)) {
      return true;
    }
  }

  // 2. Whisper acoustic & phonetic misrecognitions for goodbye / bye
  // Users with accents or background noise frequently get transcribed as "good boy", "cool boy", "good buy", etc.
  const phoneticGoodbyeRegex =
    /(^|\s)(good\s*boy|cool\s*boy|good\s*buy|good\s*by|god\s*boy|good\s*boi|good\s*day|goodbye|good\s+bye|bye|bye\s+bye|bye-bye|byebye)(\s|$)/;
  if (phoneticGoodbyeRegex.test(normTranscript)) {
    return true;
  }

  // 3. Universal termination commands
  const universalRegex =
    /(^|\s)(goodbye|good\s+bye|bye\s+bye|bye|cut\s+the\s+call|cut\s+call|hang\s+up|disconnect|stop\s+listening|end\s+call|end\s+chat|end\s+conversation|end\s+conference|close\s+chat|exit|quit|stop|allah\s*hafiz|khuda\s*hafiz|alvida|rab\s*rakha)(\s|$)/;
  if (universalRegex.test(normTranscript)) {
    return true;
  }

  // 4. Fuzzy word / sliding window comparison with target end phrase & "goodbye" / "good bye"
  // Only for phrases of length >= 4 to avoid false matches on short words
  const targetPhrases = [normEnd, 'goodbye', 'good bye'].filter((p) => p && p.length >= 4);
  const words = normTranscript.split(' ');

  for (const target of targetPhrases) {
    const targetWords = target.split(' ');
    const windowSize = targetWords.length;

    // Check sliding window of matching length
    for (let i = 0; i <= words.length - windowSize; i++) {
      const windowStr = words.slice(i, i + windowSize).join(' ');
      if (Math.abs(windowStr.length - target.length) <= 1 && isFuzzySimilar(windowStr, target, 1)) {
        return true;
      }
    }
  }

  return false;
}

