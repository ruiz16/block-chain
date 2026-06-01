import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scoreEfectivo } from '@/lib/score/calculator';

describe('scoreEfectivo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna el score base sin cambios cuando no hay antigüedad', () => {
    expect(scoreEfectivo(50, '2025-06-15')).toBe(50);
  });

  it('agrega 1 punto por mes de antigüedad hasta 10 meses máximo', () => {
    expect(scoreEfectivo(50, '2024-12-15')).toBe(56);
    expect(scoreEfectivo(40, '2024-06-15')).toBe(50);
  });

  it('no acumula más de 10 meses de bonus de antigüedad', () => {
    expect(scoreEfectivo(50, '2024-01-15')).toBe(60);
    expect(scoreEfectivo(30, '2023-01-15')).toBe(40);
  });

  it('clampa por debajo de 0 (score negativo con penalización)', () => {
    expect(scoreEfectivo(-10, '2025-06-15')).toBe(0);
    expect(scoreEfectivo(-999, '2025-06-15')).toBe(0);
  });

  it('clampa por encima de 100', () => {
    expect(scoreEfectivo(95, '2024-08-15')).toBe(100);
    expect(scoreEfectivo(200, '2025-06-15')).toBe(100);
  });
});
