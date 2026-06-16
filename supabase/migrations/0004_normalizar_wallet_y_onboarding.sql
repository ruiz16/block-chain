-- =============================================================================
-- 0004 — Normalización de wallet_address + onboarding_completado
-- =============================================================================
--
-- Contexto (bug "registered: false aunque la billetera ya tiene usuario"):
--
--   1. wallet_address se guardaba a veces en checksum (mayúsculas) y a veces en
--      minúsculas. Los lookups de SIWE/MiniPay comparan SIEMPRE en minúsculas
--      (.eq(wallet_address, address.toLowerCase())), y el índice único era
--      case-sensitive. Una fila checksummed no se encontraba -> el flujo caía a
--      la rama de "wallet no asociada" y devolvía profile_completed = false.
--
--   2. profile_completed se INFERÍA con la heurística frágil
--      `!nombre.startsWith('Wallet ')`. No había una fuente de verdad real.
--
-- Esta migración:
--   a) Normaliza todas las wallet reales a minúsculas.
--   b) Cambia el índice único a lower(wallet_address) para que sea IMPOSIBLE
--      almacenar la misma wallet en distinto case.
--   c) Agrega la columna real onboarding_completado y la backfillea.
-- =============================================================================

-- ── a) Normalizar wallets existentes a minúsculas (respeta centinelas no-0x) ──
update public.participantes
set wallet_address = lower(wallet_address)
where wallet_address like '0x%'
  and wallet_address <> lower(wallet_address);

-- ── b) Índice único case-insensitive ─────────────────────────────────────────
drop index if exists idx_participantes_wallet_address;
create unique index idx_participantes_wallet_address
  on public.participantes (lower(wallet_address));

-- ── c) Columna real de onboarding + backfill ─────────────────────────────────
alter table public.participantes
  add column if not exists onboarding_completado boolean not null default false;

update public.participantes
set onboarding_completado = true
where nombre is not null
  and nombre <> ''
  and nombre not like 'Wallet %';
