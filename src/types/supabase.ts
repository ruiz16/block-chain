// =============================================================================
// Supabase Database Types — generated manually from supabase/migrations/
// =============================================================================
//
// Covers all 11 migrations (001 → 011). Matches the Postgres schema exactly.
//
// Usage:
//   import { createClient } from '@supabase/supabase-js'
//   import type { Database } from '@/types/supabase'
//   const supabase = createClient<Database>(url, key)
//
// Then all .from('table') calls are fully typed — no more `as never`
// or `as unknown as X` casts needed.
// =============================================================================

import type {
  RolParticipante,
  EstadoCredito,
  TipoAccion,
} from './database';

// ---------------------------------------------------------------------------
// Enums (mirrors SQL ENUM types)
// ---------------------------------------------------------------------------

export type DbRolParticipante = RolParticipante;
export type DbEstadoCredito = EstadoCredito;
export type DbTipoAccion = TipoAccion;

// Nueva enum para estado de cuota (no es enum SQL, es CHECK constraint)
export type DbEstadoCuota = 'pendiente' | 'pagada' | 'vencida';

// Nueva enum para tipo_evento_score (CHECK constraint)
export type DbTipoEventoScore =
  | 'pago_puntual'
  | 'pago_atrasado'
  | 'default'
  | 'recalculo_manual';

// ---------------------------------------------------------------------------
// Database type container
// ---------------------------------------------------------------------------
//
// NOTE: GenericTable (supabase-js internal) requires Row + Insert + Update
// + Relationships: GenericRelationship[]. We add Relationships: [] to every
// table so that Database['public'] satisfies GenericSchema.
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      participantes: {
        Row: {
          id: string;
          created_at: string;
          wallet_address: string;
          nombre: string;
          rol: DbRolParticipante;
          user_id: string;
          score_reputacion: number;
          activo: boolean;
          estado: string;
          codigo_referido: string | null;
          auth_password: string | null;
          gacc_id: string | null;
          validado_gacc: boolean;
        };
        Insert: {
          id?: string; // gen_random_uuid()
          created_at?: string; // default now()
          wallet_address: string;
          nombre: string;
          rol: DbRolParticipante;
          user_id: string;
          score_reputacion?: number; // default 50
          activo?: boolean; // default true
          estado?: string;
          codigo_referido?: string | null;
          auth_password?: string | null;
          gacc_id?: string | null;
          validado_gacc?: boolean; // default false
        };
        Update: {
          id?: string;
          created_at?: string;
          wallet_address?: string;
          nombre?: string;
          rol?: DbRolParticipante;
          user_id?: string;
          score_reputacion?: number;
          activo?: boolean;
          estado?: string;
          codigo_referido?: string | null;
          auth_password?: string | null;
          gacc_id?: string | null;
          validado_gacc?: boolean;
        };
        Relationships: [];
      };
      creditos: {
        Row: {
          id: string;
          prestatario_id: string;
          monto: string; // numeric(40,0) — cUSD wei
          monto_cop: string; // numeric(15,2)
          tasa_cambio: string; // numeric(12,2)
          descripcion: string | null;
          estado: DbEstadoCredito;
          interes_porcentaje: number; // numeric(5,2)
          plazo_dias: number;
          numero_cuotas: number;
          fecha_vencimiento: string | null;
          tx_hash: string | null;
          tx_hash_pago: string | null;
          fecha_solicitud: string;
          fecha_actualizacion: string;
          fecha_pago: string | null;
        };
        Insert: {
          id?: string;
          prestatario_id: string;
          monto: string; // cUSD wei
          monto_cop: number; // COP amount
          tasa_cambio: number; // exchange rate
          descripcion?: string | null;
          estado?: DbEstadoCredito; // default 'pendiente'
          interes_porcentaje?: number; // default 0
          plazo_dias: number;
          numero_cuotas?: number; // default 1
          fecha_vencimiento?: string | null;
          tx_hash?: string | null;
          tx_hash_pago?: string | null;
          fecha_solicitud?: string;
          fecha_actualizacion?: string;
          fecha_pago?: string | null;
        };
        Update: {
          id?: string;
          prestatario_id?: string;
          monto?: string;
          monto_cop?: number;
          tasa_cambio?: number;
          descripcion?: string | null;
          estado?: DbEstadoCredito;
          interes_porcentaje?: number;
          plazo_dias?: number;
          numero_cuotas?: number;
          fecha_vencimiento?: string | null;
          tx_hash?: string | null;
          tx_hash_pago?: string | null;
          fecha_solicitud?: string;
          fecha_actualizacion?: string;
          fecha_pago?: string | null;
        };
        Relationships: [];
      };
      avales: {
        Row: {
          id: string;
          aval_id: string;
          prestatario_id: string;
          credito_id: string;
          monto_maximo: string; // numeric(40,0)
          fecha_creacion: string;
          activo: boolean;
        };
        Insert: {
          id?: string;
          aval_id: string;
          prestatario_id: string;
          credito_id: string;
          monto_maximo: string;
          fecha_creacion?: string;
          activo?: boolean; // default true
        };
        Update: {
          id?: string;
          aval_id?: string;
          prestatario_id?: string;
          credito_id?: string;
          monto_maximo?: string;
          fecha_creacion?: string;
          activo?: boolean;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          accion: DbTipoAccion;
          entidad_tipo: string;
          entidad_id: string;
          participante_id: string | null;
          detalles: Record<string, unknown>; // jsonb
          fecha: string;
        };
        Insert: {
          id?: number; // GENERATED ALWAYS AS IDENTITY
          accion: DbTipoAccion;
          entidad_tipo: string;
          entidad_id: string;
          participante_id?: string | null;
          detalles?: Record<string, unknown>; // default '{}'
          fecha?: string;
        };
        Update: {
          id?: number;
          accion?: DbTipoAccion;
          entidad_tipo?: string;
          entidad_id?: string;
          participante_id?: string | null;
          detalles?: Record<string, unknown>;
          fecha?: string;
        };
        Relationships: [];
      };
      siwe_nonces: {
        Row: {
          id: string;
          nonce: string;
          wallet_address: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          nonce: string;
          wallet_address: string;
          expires_at?: string; // default now() + 10min
          created_at?: string;
        };
        Update: {
          id?: string;
          nonce?: string;
          wallet_address?: string;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      cuotas: {
        Row: {
          id: string;
          credito_id: string;
          numero_cuota: number;
          monto_capital: string; // numeric(40,0)
          monto_interes: string; // numeric(40,0)
          monto_cuota: string; // numeric(40,0)
          saldo_restante: string; // numeric(40,0)
          fecha_vencimiento: string;
          estado: DbEstadoCuota;
          tx_hash_pago: string | null;
          fecha_pago: string | null;
          fecha_creacion: string;
        };
        Insert: {
          id?: string;
          credito_id: string;
          numero_cuota: number;
          monto_capital: string;
          monto_interes: string;
          monto_cuota: string;
          saldo_restante: string;
          fecha_vencimiento: string;
          estado?: DbEstadoCuota; // default 'pendiente'
          tx_hash_pago?: string | null;
          fecha_pago?: string | null;
          fecha_creacion?: string;
        };
        Update: {
          id?: string;
          credito_id?: string;
          numero_cuota?: number;
          monto_capital?: string;
          monto_interes?: string;
          monto_cuota?: string;
          saldo_restante?: string;
          fecha_vencimiento?: string;
          estado?: DbEstadoCuota;
          tx_hash_pago?: string | null;
          fecha_pago?: string | null;
          fecha_creacion?: string;
        };
        Relationships: [];
      };
      grupos_gacc: {
        Row: {
          id: string;
          nombre: string;
          descripcion: string | null;
          codigo: string;
          creador_id: string;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          descripcion?: string | null;
          codigo: string;
          creador_id: string;
          activo?: boolean; // default true
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          descripcion?: string | null;
          codigo?: string;
          creador_id?: string;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      gacc_miembros: {
        Row: {
          id: string;
          grupo_id: string;
          participante_id: string;
          validado_por: string | null;
          validado_en: string | null;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          grupo_id: string;
          participante_id: string;
          validado_por?: string | null;
          validado_en?: string | null;
          activo?: boolean; // default true
          created_at?: string;
        };
        Update: {
          id?: string;
          grupo_id?: string;
          participante_id?: string;
          validado_por?: string | null;
          validado_en?: string | null;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      eventos_score: {
        Row: {
          id: string;
          participante_id: string;
          tipo_evento: DbTipoEventoScore;
          delta: number;
          score_anterior: number;
          score_nuevo: number;
          referencia_tipo: string | null;
          referencia_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          participante_id: string;
          tipo_evento: DbTipoEventoScore;
          delta: number;
          score_anterior: number;
          score_nuevo: number;
          referencia_tipo?: string | null;
          referencia_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          participante_id?: string;
          tipo_evento?: DbTipoEventoScore;
          delta?: number;
          score_anterior?: number;
          score_nuevo?: number;
          referencia_tipo?: string | null;
          referencia_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      rol_participante: DbRolParticipante;
      estado_credito: DbEstadoCredito;
      tipo_accion: DbTipoAccion;
    };
    CompositeTypes: Record<string, never>;
  };
}
