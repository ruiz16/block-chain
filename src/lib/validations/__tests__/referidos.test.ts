import { describe, it, expect } from 'vitest';
import { CodigoReferidoSchema } from '@/lib/validations/referidos';

describe('CodigoReferidoSchema', () => {
  it('acepta objeto vacío (campo opcional)', () => {
    const result = CodigoReferidoSchema.parse({});
    expect(result.codigo_referido).toBeUndefined();
  });

  it('acepta string de 8 caracteres', () => {
    const result = CodigoReferidoSchema.parse({ codigo_referido: '12345678' });
    expect(result.codigo_referido).toBe('12345678');
  });

  it('acepta string de 40 caracteres', () => {
    const result = CodigoReferidoSchema.parse({ codigo_referido: 'a'.repeat(40) });
    expect(result.codigo_referido).toBe('a'.repeat(40));
  });

  it('rechaza string de menos de 8 caracteres', () => {
    const result = CodigoReferidoSchema.safeParse({ codigo_referido: '1234567' });
    expect(result.error).toBeDefined();
  });

  it('rechaza string de más de 40 caracteres', () => {
    const result = CodigoReferidoSchema.safeParse({ codigo_referido: 'a'.repeat(41) });
    expect(result.error).toBeDefined();
  });
});
