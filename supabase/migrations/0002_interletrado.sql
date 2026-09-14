-- Interletrado personalizable: un ajuste continuo más, junto al resto.
-- Idempotente, como el resto de las migraciones.

alter table public.settings
  add column if not exists tracking double precision not null default -0.012;
