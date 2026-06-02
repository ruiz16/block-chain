import { describe, it, expect } from 'vitest';
import { SolicitarCreditoSchema, validateSolicitarCredito } from './creditos';

// =============================================================================
// SolicitarCreditoSchema — Zod validation tests
// =============================================================================

describe('SolicitarCreditoSchema', () => {
  describe('valid inputs', () => {
    it('accepts minimum valid credit request', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 100000,
        plazo_dias: 30,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.monto).toBe(100000);
        expect(result.data.plazo_dias).toBe(30);
        expect(result.data.numero_cuotas).toBe(1); // default
      }
    });

    it('accepts credit with optional descripcion', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 500000,
        descripcion: 'Compra de insumos',
        plazo_dias: 90,
      });

      expect(result.success).toBe(true);
    });

    it('accepts credit with numero_cuotas', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 3000000,
        plazo_dias: 180,
        numero_cuotas: 6,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numero_cuotas).toBe(6);
      }
    });

    it('accepts maximum plazo_dias', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 100000,
        plazo_dias: 365,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('rejects negative monto', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: -1000,
        plazo_dias: 30,
      });

      expect(result.success).toBe(false);
    });

    it('rejects zero monto', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 0,
        plazo_dias: 30,
      });

      expect(result.success).toBe(false);
    });

    it('rejects plazo_dias below minimum (30)', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 100000,
        plazo_dias: 29,
      });

      expect(result.success).toBe(false);
    });

    it('rejects plazo_dias above maximum (365)', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 100000,
        plazo_dias: 366,
      });

      expect(result.success).toBe(false);
    });

    it('rejects non-integer plazo_dias', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 100000,
        plazo_dias: 30.5,
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty body (missing required fields)', () => {
      const result = SolicitarCreditoSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('rejects extra unknown keys (strict mode)', () => {
      const result = SolicitarCreditoSchema.safeParse({
        monto: 100000,
        plazo_dias: 30,
        extraField: 'should not be here',
      });

      expect(result.success).toBe(false);
    });

    it('rejects null input', () => {
      const result = SolicitarCreditoSchema.safeParse(null);
      expect(result.success).toBe(false);
    });
  });

  describe('validateSolicitarCredito wrapper', () => {
    it('wraps successful validation correctly', () => {
      const result = validateSolicitarCredito({
        monto: 100000,
        plazo_dias: 30,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.monto).toBe(100000);
      }
    });

    it('wraps failed validation correctly', () => {
      const result = validateSolicitarCredito({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
