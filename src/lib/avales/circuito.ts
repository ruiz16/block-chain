// =============================================================================
// circuito.ts — Lógica pura del circuito de avales GACC
// =============================================================================
//
// Modelo: cada crédito requiere DOS avales secuenciales con roles fijos:
//   - referadora (1/2): la elegida por el solicitante → crédito sigue 'pendiente'
//   - lider (2/2): el Líder Social → completa el circuito → 'avalado'
//
// Esta función NO hace I/O: recibe el estado ya consultado y devuelve la decisión.
// Eso la hace 100% testeable y es la fuente de verdad de las reglas del circuito.
// =============================================================================

export type RolAval = 'referadora' | 'lider';

export interface DecidirAvalParams {
  avaladorId: string;
  prestatarioId: string;
  referadoraId: string | null;
  liderId: string | null;
  tieneAvalReferadora: boolean;
  tieneAvalLider: boolean;
  yaAvalo: boolean;
}

export type DecisionAval =
  | { ok: true; rolAval: RolAval; nuevoEstado: 'pendiente' | 'avalado' }
  | { ok: false; error: string; detail: string; status: number };

/**
 * Decide si un avalador puede avalar y con qué rol, aplicando las reglas del
 * circuito GACC. El crédito debe estar 'pendiente' y la expiración/membresía
 * deben validarse aparte (requieren I/O); aquí va solo la máquina de estados.
 */
export function decidirAval(p: DecidirAvalParams): DecisionAval {
  // No auto-aval
  if (p.avaladorId === p.prestatarioId) {
    return {
      ok: false,
      error: 'AUTOVAL_INVALIDO',
      detail: 'No puedes avalar tu propio crédito',
      status: 400,
    };
  }

  // Ya avaló este crédito
  if (p.yaAvalo) {
    return { ok: false, error: 'AVAL_DUPLICADO', detail: 'Ya avalaste este crédito', status: 409 };
  }

  // Determinar el rol del avalador en el circuito
  let rolAval: RolAval;
  if (p.referadoraId && p.avaladorId === p.referadoraId) {
    rolAval = 'referadora';
  } else if (p.liderId && p.avaladorId === p.liderId) {
    rolAval = 'lider';
  } else {
    return {
      ok: false,
      error: 'NO_AUTORIZADO_AVAL',
      detail: 'Solo la referadora elegida y el Líder Social pueden avalar este crédito.',
      status: 403,
    };
  }

  // Reglas de secuencia
  if (rolAval === 'referadora') {
    if (p.tieneAvalReferadora) {
      return {
        ok: false,
        error: 'AVAL_REFERADORA_EXISTE',
        detail: 'Este crédito ya tiene el aval de la referadora',
        status: 409,
      };
    }
    return { ok: true, rolAval: 'referadora', nuevoEstado: 'pendiente' };
  }

  // rolAval === 'lider' (aval 2/2)
  if (!p.tieneAvalReferadora) {
    return {
      ok: false,
      error: 'FALTA_AVAL_REFERADORA',
      detail: 'La referadora debe avalar (1/2) antes que el Líder Social.',
      status: 409,
    };
  }
  if (p.tieneAvalLider) {
    return {
      ok: false,
      error: 'AVAL_LIDER_EXISTE',
      detail: 'Este crédito ya tiene el aval del Líder Social',
      status: 409,
    };
  }
  return { ok: true, rolAval: 'lider', nuevoEstado: 'avalado' };
}
