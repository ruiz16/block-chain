import { describe, it, expect } from 'vitest';
import { SolicitarCreditoSchema, validateSolicitarCredito } from './creditos';

// =============================================================================
// SolicitarCreditoSchema — Zod validation tests (modelo GACC)
// =============================================================================
//
// Campos requeridos: monto (>0), uso (no vacío), referadora_id (uuid),
// plazo_dias (7..365). Opcionales: descripcion, numero_cuotas (default 1).
// =============================================================================

// UUID v4 válido (variante correcta) — Zod 4 valida versión y variante (RFC 9562)
const REFERADORA = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function valido(overrides: Record<string, unknown> = {}) {
  return {
    monto: 100000,
    uso: 'insumos',
    referadora_id: REFERADORA,
    plazo_dias: 30,
    ...overrides,
  };
}

describe('SolicitarCreditoSchema', () => {
  describe('valid inputs', () => {
    it('accepts a minimum valid credit request', () => {
      const result = SolicitarCreditoSchema.safeParse(valido());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.referadora_id).toBe(REFERADORA);
        expect(result.data.numero_cuotas).toBe(1); // default
      }
    });

    it('accepts optional descripcion and numero_cuotas', () => {
      const result = SolicitarCreditoSchema.safeParse(
        valido({ descripcion: 'Compra de insumos', plazo_dias: 180, numero_cuotas: 6 }),
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.numero_cuotas).toBe(6);
    });

    it('accepts maximum plazo_dias (365)', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ plazo_dias: 365 })).success).toBe(true);
    });
  });

  describe('referadora_id (modelo GACC)', () => {
    it('rejects when referadora_id is missing', () => {
      const { referadora_id, ...sinReferadora } = valido();
      void referadora_id;
      expect(SolicitarCreditoSchema.safeParse(sinReferadora).success).toBe(false);
    });

    it('rejects a non-uuid referadora_id', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ referadora_id: 'no-es-uuid' })).success).toBe(false);
    });
  });

  describe('invalid inputs', () => {
    it('rejects negative monto', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ monto: -1000 })).success).toBe(false);
    });

    it('rejects zero monto', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ monto: 0 })).success).toBe(false);
    });

    it('rejects empty uso', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ uso: '' })).success).toBe(false);
    });

    it('rejects plazo_dias below minimum (7)', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ plazo_dias: 6 })).success).toBe(false);
    });

    it('rejects plazo_dias above maximum (365)', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ plazo_dias: 366 })).success).toBe(false);
    });

    it('rejects non-integer plazo_dias', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ plazo_dias: 30.5 })).success).toBe(false);
    });

    it('rejects extra unknown keys (strict mode)', () => {
      expect(SolicitarCreditoSchema.safeParse(valido({ extraField: 'x' })).success).toBe(false);
    });

    it('rejects empty body', () => {
      expect(SolicitarCreditoSchema.safeParse({}).success).toBe(false);
    });

    it('rejects null input', () => {
      expect(SolicitarCreditoSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('validateSolicitarCredito wrapper', () => {
    it('wraps successful validation correctly', () => {
      const result = validateSolicitarCredito(valido());
      expect(result.success).toBe(true);
    });

    it('wraps failed validation correctly', () => {
      const result = validateSolicitarCredito({});
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeDefined();
    });
  });
});
