-- Fondo animado: cuál y con cuánta intensidad. Sustituye a la textura de
-- papel, cuya columna se deja en su lugar por si una versión anterior de la
-- app sigue abierta en algún dispositivo.
-- Idempotente, como el resto de las migraciones.

alter table public.settings
  add column if not exists backdrop text not null default 'ninguno',
  add column if not exists backdrop_amount double precision not null default 0.5;
