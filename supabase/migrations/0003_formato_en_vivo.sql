-- Interruptor del formato en vivo, para que viaje con el resto de los ajustes.
-- Idempotente, como el resto de las migraciones.

alter table public.settings
  add column if not exists gloss boolean not null default true;
