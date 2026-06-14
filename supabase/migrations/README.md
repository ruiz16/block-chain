# Migraciones — Mangle

## Estado actual

- **`0001_baseline.sql`** — Esquema consolidado a **2026-06-14**. Equivale a las
  antiguas migraciones `001`–`031` (squash). Es la **única fuente de verdad** del
  esquema. Las migraciones incrementales originales se eliminaron porque tenían
  conflictos (doble `017`, drops redundantes de `monto_cop`/`tasa_cambio`, el
  reset destructivo `014`, y duplicados en `mangle-mobile`).

`mangle-mobile` **comparte esta misma base de datos**; por eso ya no tiene su
propia carpeta `supabase/migrations/`. Toda migración vive aquí.

## Cómo aplicar (base de datos limpia)

Con Supabase CLI:

```bash
supabase db reset          # ejecuta todo lo que haya en migrations/ en orden
```

O manualmente, pegando `0001_baseline.sql` en el SQL Editor de Supabase.

Luego, para datos de prueba:

```bash
node supabase/seed-users.mjs   # requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_KEY
```

## Crear nuevas migraciones

- Numera de forma incremental y ordenable: `0002_descripcion.sql`, `0003_...`, etc.
- Una migración **nunca** se reescribe ni se borra una vez aplicada en un entorno
  compartido o en producción. Si necesitas cambiar algo ya aplicado, crea una
  migración nueva que lo modifique.
- El squash a baseline (como este `0001`) solo es válido en desarrollo, antes de
  tener datos de producción.

## Esquema (resumen)

- **Enums:** `rol_participante (usuario|admin)`, `estado_credito (pendiente|avalado|aprobado|desembolsado|pagado|default|expirado)`, `tipo_accion`.
- **Tablas:** `participantes`, `creditos`, `avales`, `audit_log`, `siwe_nonces`,
  `cuotas`, `grupos_gacc`, `gacc_miembros`, `eventos_score`, `referidos`,
  `redes_apoyo`, `red_miembros`, `notificaciones`, `cola_email`,
  `modulos_educativos`, `progreso_educacion`, `push_subscriptions`.
- **Funciones:** `update_fecha_actualizacion`, `audit_credito_estado_change`,
  `gacc_auto_add_creator`, `recalcular_score_gacc(uuid)`.
- **RLS** habilitado en todas las tablas de negocio (defensa en profundidad; la
  app opera con service-role).
