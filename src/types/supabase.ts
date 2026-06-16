// =============================================================================
// Supabase Database Types — generated manually from supabase/migrations/
// =============================================================================
//
// Covers all 28 migrations (001 → 028). Matches the Postgres schema exactly.
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
          oficio: string | null;
          user_id: string;
          score_reputacion: number;
          activo: boolean;
          codigo_referido: string | null;
          auth_password: string | null;
          gacc_id: string | null;
          validado_gacc: boolean;
          telefono: string;
          email: string;
          onboarding_completado: boolean;
        };
        Insert: {
          id?: string; // gen_random_uuid()
          created_at?: string; // default now()
          wallet_address: string;
          nombre: string;
          rol: DbRolParticipante;
          oficio?: string | null;
          user_id: string;
          score_reputacion?: number; // default 50
          activo?: boolean; // default true
          codigo_referido?: string | null;
          auth_password?: string | null;
          gacc_id?: string | null;
          validado_gacc?: boolean; // default false
          telefono?: string; // default ''
          email?: string; // default ''
          onboarding_completado?: boolean; // default false
        };
        Update: {
          id?: string;
          created_at?: string;
          wallet_address?: string;
          nombre?: string;
          rol?: DbRolParticipante;
          oficio?: string | null;
          user_id?: string;
          score_reputacion?: number;
          activo?: boolean;
          codigo_referido?: string | null;
          auth_password?: string | null;
          gacc_id?: string | null;
          validado_gacc?: boolean;
          telefono?: string;
          email?: string;
          onboarding_completado?: boolean;
        };
        Relationships: [];
      };
      creditos: {
        Row: {
          id: string;
          prestatario_id: string;
          referadora_id: string | null; // Referadora elegida (aval 1/2) — mig 029
          monto: string; // numeric(40,0) — COPm value (human-readable)
          descripcion: string | null;
          estado: DbEstadoCredito;
          uso: string;              // Propósito del crédito — mig 022
          moneda: string;           // Siempre 'COPm' — mig 017
          interes_porcentaje: number; // numeric(5,2)
          plazo_dias: number;
          numero_cuotas: number;
          fecha_vencimiento: string | null;
          expiracion_en: string | null; // Fecha de expiración — mig 023
          repayment_mode: string;       // 'legacy' | 'pool' — mig 024
          tx_hash: string | null;
          tx_hash_pago: string | null;
          fecha_solicitud: string;
          fecha_actualizacion: string;
          fecha_pago: string | null;
        };
        Insert: {
          id?: string;
          prestatario_id: string;
          referadora_id?: string | null;
          monto: string; // COPm value (human-readable)
          descripcion?: string | null;
          estado?: DbEstadoCredito; // default 'pendiente'
          uso?: string;             // default ''
          moneda?: string;          // default 'COPm'
          interes_porcentaje?: number; // default 0
          plazo_dias: number;
          numero_cuotas?: number; // default 1
          fecha_vencimiento?: string | null;
          expiracion_en?: string | null;
          repayment_mode?: string;  // default 'legacy'
          tx_hash?: string | null;
          tx_hash_pago?: string | null;
          fecha_solicitud?: string;
          fecha_actualizacion?: string;
          fecha_pago?: string | null;
        };
        Update: {
          id?: string;
          prestatario_id?: string;
          referadora_id?: string | null;
          monto?: string;
          descripcion?: string | null;
          estado?: DbEstadoCredito;
          uso?: string;
          moneda?: string;
          interes_porcentaje?: number;
          plazo_dias?: number;
          numero_cuotas?: number;
          fecha_vencimiento?: string | null;
          expiracion_en?: string | null;
          repayment_mode?: string;
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
          rol_aval: string | null; // 'referadora'|'lider' — mig 029
        };
        Insert: {
          id?: string;
          aval_id: string;
          prestatario_id: string;
          credito_id: string;
          monto_maximo: string;
          fecha_creacion?: string;
          activo?: boolean; // default true
          rol_aval?: string | null;
        };
        Update: {
          id?: string;
          aval_id?: string;
          prestatario_id?: string;
          credito_id?: string;
          monto_maximo?: string;
          fecha_creacion?: string;
          activo?: boolean;
          rol_aval?: string | null;
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
          creador_id: string | null; // Nullable — admin GACCs don't have a creator
          activo: boolean;
          created_at: string;
          municipio: string | null;  // Municipio donde opera — mig 026
          email_lider: string | null; // Correo del Líder Social — mig 029
          lider_id: string | null;    // Líder Social resuelto — mig 029
          score_gacc: number;         // numeric(5,2) media del grupo — mig 029
          estado: string;             // 'activo'|'restringido'|'inactivo' — mig 029
        };
        Insert: {
          id?: string;
          nombre: string;
          descripcion?: string | null;
          codigo: string;
          creador_id?: string | null;
          activo?: boolean; // default true
          created_at?: string;
          municipio?: string | null;
          email_lider?: string | null;
          lider_id?: string | null;
          score_gacc?: number; // default 0
          estado?: string;     // default 'activo'
        };
        Update: {
          id?: string;
          nombre?: string;
          descripcion?: string | null;
          codigo?: string;
          creador_id?: string | null;
          activo?: boolean;
          created_at?: string;
          municipio?: string | null;
          email_lider?: string | null;
          lider_id?: string | null;
          score_gacc?: number;
          estado?: string;
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
      modulos_educativos: {
        Row: {
          id: string;
          orden: number;
          sender: 'system' | 'whatsapp_fld';
          mensaje: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          orden: number;
          sender: 'system' | 'whatsapp_fld';
          mensaje: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          orden?: number;
          sender?: 'system' | 'whatsapp_fld';
          mensaje?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      progreso_educacion: {
        Row: {
          id: string;
          participante_id: string;
          modulo_actual: number;
          completado: boolean;
          actualizado_en: string;
        };
        Insert: {
          id?: string;
          participante_id: string;
          modulo_actual?: number; // default 1
          completado?: boolean; // default false
          actualizado_en?: string;
        };
        Update: {
          id?: string;
          participante_id?: string;
          modulo_actual?: number;
          completado?: boolean;
          actualizado_en?: string;
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
      // Migration 012 — Referidos y Redes de Apoyo
      referidos: {
        Row: {
          id: string;
          referidor_id: string;
          referido_id: string;
          created_at: string;
          activo: boolean;
        };
        Insert: {
          id?: string;
          referidor_id: string;
          referido_id: string;
          created_at?: string;
          activo?: boolean;
        };
        Update: {
          id?: string;
          referidor_id?: string;
          referido_id?: string;
          created_at?: string;
          activo?: boolean;
        };
        Relationships: [];
      };
      redes_apoyo: {
        Row: {
          id: string;
          nombre: string;
          score_red: number;
          estado: string; // 'verde' | 'amarillo' | 'rojo'
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          score_red?: number;
          estado?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          score_red?: number;
          estado?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      red_miembros: {
        Row: {
          id: string;
          red_id: string;
          participante_id: string;
          es_referidora: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          red_id: string;
          participante_id: string;
          es_referidora?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          red_id?: string;
          participante_id?: string;
          es_referidora?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      notificaciones: {
        Row: {
          id: string;
          participante_id: string;
          tipo: string; // 'bienvenida_red' | 'score_red_mejoro' | etc.
          titulo: string;
          cuerpo: string;
          leida: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          participante_id: string;
          tipo: string;
          titulo: string;
          cuerpo: string;
          leida?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          participante_id?: string;
          tipo?: string;
          titulo?: string;
          cuerpo?: string;
          leida?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      cola_email: {
        Row: {
          id: string;
          para: string;
          asunto: string;
          cuerpo_html: string;
          estado: string; // 'pendiente' | 'enviado' | 'fallido'
          error: string | null;
          created_at: string;
          enviado_at: string | null;
        };
        Insert: {
          id?: string;
          para: string;
          asunto: string;
          cuerpo_html: string;
          estado?: string;
          error?: string | null;
          created_at?: string;
          enviado_at?: string | null;
        };
        Update: {
          id?: string;
          para?: string;
          asunto?: string;
          cuerpo_html?: string;
          estado?: string;
          error?: string | null;
          created_at?: string;
          enviado_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      recalcular_score_gacc: {
        Args: { grupo: string };
        Returns: number;
      };
    };
    Enums: {
      rol_participante: DbRolParticipante;
      estado_credito: DbEstadoCredito;
      tipo_accion: DbTipoAccion;
    };
    CompositeTypes: Record<string, never>;
  };
}
