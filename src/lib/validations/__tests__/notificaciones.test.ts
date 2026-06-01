import { describe, it, expect } from 'vitest';
import {
  NotificacionQuerySchema,
  MarcarLeidaSchema,
} from '@/lib/validations/notificaciones';

describe('NotificacionQuerySchema', () => {
  it('usa valores por defecto cuando no se envía nada', () => {
    const result = NotificacionQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('coerce string a number', () => {
    const result = NotificacionQuerySchema.parse({ limit: '10', offset: '5' });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  it('acepta límite en rango válido 1-50', () => {
    expect(NotificacionQuerySchema.parse({ limit: 1 }).limit).toBe(1);
    expect(NotificacionQuerySchema.parse({ limit: 50 }).limit).toBe(50);
  });

  it('rechaza límite menor a 1', () => {
    const result = NotificacionQuerySchema.safeParse({ limit: 0 });
    expect(result.error).toBeDefined();
  });

  it('rechaza límite mayor a 50', () => {
    const result = NotificacionQuerySchema.safeParse({ limit: 51 });
    expect(result.error).toBeDefined();
  });

  it('rechaza offset negativo', () => {
    const result = NotificacionQuerySchema.safeParse({ offset: -1 });
    expect(result.error).toBeDefined();
  });
});

describe('MarcarLeidaSchema', () => {
  it('acepta UUID válido', () => {
    const result = MarcarLeidaSchema.parse({
      notificacion_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.notificacion_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rechaza UUID inválido', () => {
    const result = MarcarLeidaSchema.safeParse({ notificacion_id: 'not-a-uuid' });
    expect(result.error).toBeDefined();
  });

  it('rechaza string vacío', () => {
    const result = MarcarLeidaSchema.safeParse({ notificacion_id: '' });
    expect(result.error).toBeDefined();
  });
});
