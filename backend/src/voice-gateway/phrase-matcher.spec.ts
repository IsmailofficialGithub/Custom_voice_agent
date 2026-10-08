import { describe, it, expect } from 'vitest';
import {
  normalizePhrase,
  isWakePhraseMatch,
  isEndPhraseMatch,
} from './phrase-matcher';

describe('phrase-matcher', () => {
  describe('normalizePhrase', () => {
    it('lowercases and removes punctuation and extra whitespace', () => {
      expect(normalizePhrase('  Hey, Boss!  ')).toBe('hey boss');
      expect(normalizePhrase('STOP... Please?')).toBe('stop please');
    });
  });

  describe('isWakePhraseMatch', () => {
    it('matches exact wake phrase standalone', () => {
      const res = isWakePhraseMatch('Hey boss', 'hey boss');
      expect(res.matched).toBe(true);
      expect(res.remainder).toBe('');
    });

    it('matches wake phrase with punctuation and casing', () => {
      const res = isWakePhraseMatch('HEY, BOSS!', 'hey boss');
      expect(res.matched).toBe(true);
      expect(res.remainder).toBe('');
    });

    it('matches combined wake phrase + command and extracts remainder', () => {
      const res = isWakePhraseMatch('Hey boss, what is the current time in Tokyo?', 'hey boss');
      expect(res.matched).toBe(true);
      expect(res.remainder).toBe('what is the current time in Tokyo?');
    });

    it('matches when wake phrase has leading filler word like "Okay, hey boss"', () => {
      const res = isWakePhraseMatch('Okay, hey boss, tell me a joke', 'hey boss');
      expect(res.matched).toBe(true);
      expect(res.remainder).toBe('tell me a joke');
    });

    it('does not match unrelated utterance', () => {
      const res = isWakePhraseMatch('What is the weather outside today?', 'hey boss');
      expect(res.matched).toBe(false);
      expect(res.remainder).toBe('');
    });

    it('does not match partial word prefix (e.g. "hey bossy")', () => {
      const res = isWakePhraseMatch('hey bossy look here', 'hey boss');
      expect(res.matched).toBe(false);
    });
  });

  describe('isEndPhraseMatch', () => {
    it('matches exact end phrase standalone', () => {
      expect(isEndPhraseMatch('Goodbye', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('goodbye!', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('Good bye', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('Bye', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('bye bye', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('stop', 'stop')).toBe(true);
      expect(isEndPhraseMatch('end chat', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('end conference', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('close chat', 'goodbye')).toBe(true);
    });

    it('matches end phrase within sentence', () => {
      expect(isEndPhraseMatch('Okay thanks, goodbye!', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('Please stop now', 'stop')).toBe(true);
    });

    it('matches phonetic and acoustic misrecognitions of goodbye', () => {
      expect(isEndPhraseMatch('Good boy', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('good boy.', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('Cool boy!', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('good buy', 'goodbye')).toBe(true);
      expect(isEndPhraseMatch('cut the call', 'goodbye')).toBe(true);
    });

    it('does not match substring within a different word (e.g. "stopping")', () => {
      expect(isEndPhraseMatch('I am non-stopping today', 'stop')).toBe(false);
    });

    it('does not match unrelated utterance', () => {
      expect(isEndPhraseMatch('Can you explain quantum physics?', 'goodbye')).toBe(false);
    });
  });
});
