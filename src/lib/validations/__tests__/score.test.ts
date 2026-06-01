import { describe, it, expect } from 'vitest';
import { HistorialScoreQuerySchema, RecalcularScoreSchema } from '@/lib/validations/score';

describe('HistorialScoreQuerySchema', () => {
  it('usa valores por defecto cuando no se envía nada', () => {
    const result = HistorialScoreQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('coerce string numérico a number', () => {
    const result = HistorialScoreQuerySchema.parse({ limit: '5', offset: '10' });
    expect(result.limit).toBe(5);
    expect(result.offset).toBe(10);
  });

  it('acepta límite en rango válido 1-100', () => {
    expect(HistorialScoreQuerySchema.parse({ limit: 1 }).limit).toBe(1);
    expect(HistorialScoreQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it('rechaza límite menor a 1', () => {
    const result = HistorialScoreQuerySchema.safeParse({ limit: 0 });
    expect(result.error).toBeDefined();
  });

  it('rechaza límite mayor a 100', () => {
    const result = HistorialScoreQuerySchema.safeParse({ limit: 101 });
    expect(result.error).toBeDefined();
  });

  it('rechaza offset negativo', () => {
    const result = HistorialScoreQuerySchema.safeParse({ offset: -1 });
    expect(result.error).toBeDefined();
  });
});

describe('RecalcularScoreSchema', () => {
  it('acepta objeto vacío (participante_id opcional)', () => {
    const result = RecalcularScoreSchema.parse({});
    expect(result.participante_id).toBeUndefined();
  });

  it('acepta UUID válido', () => {
    const result = RecalcularScoreSchema.parse({
      participante_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.participante_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rechaza UUID inválido', () => {
    const result = RecalcularScoreSchema.safeParse({ participante_id: 'not-a-uuid' });
    expect(result.error).toBeDefined();
  });
});
