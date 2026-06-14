import { describe, it, expect } from 'vitest';
import { decidirAval, type DecidirAvalParams } from '../circuito';

// =============================================================================
// decidirAval — Máquina de estados del circuito de avales GACC
// =============================================================================

const PRESTATARIO = 'p-juan';
const REFERADORA = 'r-ana';
const LIDER = 'l-maria';

/** Base: nadie ha avalado todavía. */
function base(overrides: Partial<DecidirAvalParams> = {}): DecidirAvalParams {
  return {
    avaladorId: REFERADORA,
    prestatarioId: PRESTATARIO,
    referadoraId: REFERADORA,
    liderId: LIDER,
    tieneAvalReferadora: false,
    tieneAvalLider: false,
    yaAvalo: false,
    ...overrides,
  };
}

describe('decidirAval — camino feliz (secuencia correcta)', () => {
  it('la referadora otorga el aval 1/2 → rol referadora, crédito sigue pendiente', () => {
    const d = decidirAval(base({ avaladorId: REFERADORA }));
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.rolAval).toBe('referadora');
      expect(d.nuevoEstado).toBe('pendiente');
    }
  });

  it('el líder otorga el aval 2/2 tras la referadora → rol lider, crédito avalado', () => {
    const d = decidirAval(base({ avaladorId: LIDER, tieneAvalReferadora: true }));
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.rolAval).toBe('lider');
      expect(d.nuevoEstado).toBe('avalado');
    }
  });
});

describe('decidirAval — reglas de secuencia', () => {
  it('rechaza al líder si la referadora aún no avaló (FALTA_AVAL_REFERADORA)', () => {
    const d = decidirAval(base({ avaladorId: LIDER, tieneAvalReferadora: false }));
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.error).toBe('FALTA_AVAL_REFERADORA');
      expect(d.status).toBe(409);
    }
  });

  it('rechaza segundo aval de la referadora (AVAL_REFERADORA_EXISTE)', () => {
    // Otra referadora-id imposible; modelamos "ya existe aval de referadora"
    const d = decidirAval(base({ avaladorId: REFERADORA, tieneAvalReferadora: true }));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe('AVAL_REFERADORA_EXISTE');
  });

  it('rechaza segundo aval del líder (AVAL_LIDER_EXISTE)', () => {
    const d = decidirAval(
      base({ avaladorId: LIDER, tieneAvalReferadora: true, tieneAvalLider: true }),
    );
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe('AVAL_LIDER_EXISTE');
  });
});

describe('decidirAval — autorización', () => {
  it('rechaza a un tercero que no es referadora ni líder (NO_AUTORIZADO_AVAL)', () => {
    const d = decidirAval(base({ avaladorId: 'x-pedro', tieneAvalReferadora: true }));
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.error).toBe('NO_AUTORIZADO_AVAL');
      expect(d.status).toBe(403);
    }
  });

  it('rechaza auto-aval del prestatario (AUTOVAL_INVALIDO)', () => {
    const d = decidirAval(base({ avaladorId: PRESTATARIO }));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe('AUTOVAL_INVALIDO');
  });

  it('rechaza si el avalador ya avaló (AVAL_DUPLICADO)', () => {
    const d = decidirAval(base({ avaladorId: REFERADORA, yaAvalo: true }));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe('AVAL_DUPLICADO');
  });

  it('rechaza al líder cuando el crédito no tiene referadora asignada y él no es líder', () => {
    const d = decidirAval(
      base({ avaladorId: 'x-pedro', referadoraId: null, liderId: LIDER }),
    );
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe('NO_AUTORIZADO_AVAL');
  });
});

describe('decidirAval — circuito completo en orden', () => {
  it('referadora (1/2) y luego líder (2/2) completan el circuito', () => {
    // Paso 1: referadora
    const paso1 = decidirAval(base({ avaladorId: REFERADORA }));
    expect(paso1.ok).toBe(true);

    // Paso 2: líder, ya con aval de referadora
    const paso2 = decidirAval(base({ avaladorId: LIDER, tieneAvalReferadora: true }));
    expect(paso2.ok).toBe(true);
    if (paso2.ok) expect(paso2.nuevoEstado).toBe('avalado');
  });
});
