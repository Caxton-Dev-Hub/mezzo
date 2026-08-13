import { describe, expect, it } from 'vitest';
import { formatRemaining } from '@/lib/format-duration';

describe('formatRemaining', () => {
  it('shows hours and minutes for a long window', () => {
    expect(formatRemaining(3 * 60 * 60 * 1000 + 25 * 60 * 1000)).toBe('3h 25m');
  });

  it('shows minutes only under an hour', () => {
    expect(formatRemaining(45 * 60 * 1000)).toBe('45m');
  });

  it('shows a zero-minute remainder on a whole hour', () => {
    expect(formatRemaining(2 * 60 * 60 * 1000)).toBe('2h 0m');
  });

  it('rounds part-minutes down rather than up', () => {
    expect(formatRemaining(59_999)).toBe('0m');
  });

  it('clamps an elapsed deadline to zero instead of going negative', () => {
    expect(formatRemaining(-5_000)).toBe('0m');
  });

  it('handles a multi-day window in hours', () => {
    expect(formatRemaining(72 * 60 * 60 * 1000)).toBe('72h 0m');
  });

  it('reports zero for exactly zero', () => {
    expect(formatRemaining(0)).toBe('0m');
  });
});
