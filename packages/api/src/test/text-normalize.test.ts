import { describe, it, expect } from 'vitest';
import { normalizeQuestionText } from '../lib/text-normalize';

describe('normalizeQuestionText', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuestionText('  5  ×  3  =  ?  ')).toBe('5 × 3 = ?');
  });
  it('collapses multi-line whitespace', () => {
    expect(normalizeQuestionText('What is\n\n5×3?\n')).toBe('what is 5×3?');
  });
  it('lower-cases for case-insensitive compare', () => {
    expect(normalizeQuestionText('Name the Plant')).toBe('name the plant');
  });
  it('strips common zero-width and NBSP chars', () => {
    expect(normalizeQuestionText('foo\u00a0bar\u200b')).toBe('foo bar');
  });
});
