-- =============================================================================
-- Migration 030: Suscripciones Web Push (VAPID)
-- =============================================================================
--
-- Almacena las suscripciones del navegador (Web Push API) para enviar
-- notificaciones push del sistema operativo a web (mangle-app) y a la SPA móvil
-- (mangle-mobile). El push es una mejora progresiva: el canal garantizado son
-- las notificaciones in-app (tabla notificaciones).
--
-- Rollback:
--   DROP TABLE IF EXISTS push_subscriptions;
-- =============================================================================

CREATE TABLE push_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id  uuid NOT NULL REFERENCES participantes (id) ON DELETE CASCADE,
  endpoint         text NOT NULL UNIQUE,
  p256dh           text NOT NULL,
  auth             text NOT NULL,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_participante
  ON push_subscriptions (participante_id);

COMMENT ON TABLE  push_subscriptions          IS 'Suscripciones Web Push (VAPID) por participante';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Endpoint único del push service del navegador';
COMMENT ON COLUMN push_subscriptions.p256dh   IS 'Clave pública del cliente para cifrar el payload';
COMMENT ON COLUMN push_subscriptions.auth     IS 'Secreto de autenticación de la suscripción';

-- ---------------------------------------------------------------------------
-- RLS (defensa-en-profundidad; la app opera con service-role)
-- ---------------------------------------------------------------------------
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- El dueño ve sus propias suscripciones
CREATE POLICY "push_subscriptions_select_own"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (participante_id = auth.uid());

-- El dueño puede borrar sus suscripciones (al desuscribirse)
CREATE POLICY "push_subscriptions_delete_own"
  ON push_subscriptions FOR DELETE
  TO authenticated
  USING (participante_id = auth.uid());

-- Solo service_role inserta/actualiza (registro vía API server-side)
CREATE POLICY "push_subscriptions_insert_service_role"
  ON push_subscriptions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "push_subscriptions_update_service_role"
  ON push_subscriptions FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
