import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { scoreEfectivo } from './calculator';

// =============================================================================
// scoreEfectivo — Pure function tests
// =============================================================================

describe('scoreEfectivo', () => {
  beforeEach(() => {
    // Freeze time to 2025-06-01 for deterministic seniority calculation
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-06-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns base score when created_at is now (0 months seniority)', () => {
    const result = scoreEfectivo(50, '2025-06-01T00:00:00Z');
    expect(result).toBe(50);
  });

  it('adds seniority bonus for each full month since creation', () => {
    // Created 6 months ago → +6 seniority
    const result = scoreEfectivo(50, '2024-12-01T00:00:00Z');
    expect(result).toBe(56);
  });

  it('caps seniority bonus at MAX_ANTIGUEDAD (10 months)', () => {
    // Created 24 months ago → should cap at +10
    const result = scoreEfectivo(50, '2023-06-01T00:00:00Z');
    expect(result).toBe(60);
  });

  it('clamps result to maximum of 100', () => {
    // 95 + 10 = 105 → clamped to 100
    const result = scoreEfectivo(95, '2023-06-01T00:00:00Z');
    expect(result).toBe(100);
  });

  it('clamps result to minimum of 0', () => {
    // -5 + 0 seniority = -5 → clamped to 0
    const result = scoreEfectivo(-5, '2025-06-01T00:00:00Z');
    expect(result).toBe(0);
  });

  it('works with low score and no seniority', () => {
    const result = scoreEfectivo(0, '2025-06-01T00:00:00Z');
    expect(result).toBe(0);
  });

  it('handles partial month correctly (no fractional seniority)', () => {
    // Created 1.5 months ago → diffMeses returns 1 (only full months)
    const result = scoreEfectivo(50, '2025-04-15T00:00:00Z');
    expect(result).toBe(51);
  });
});
