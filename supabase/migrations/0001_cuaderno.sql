-- Cuaderno — esquema inicial.
-- Idempotente: puede volver a ejecutarse sobre una base ya migrada.
--
-- Modelo: cada fila pertenece a una cuenta (owner). Las políticas RLS son la
-- única frontera de seguridad: la anon key es pública y viaja en el navegador,
-- así que nada puede depender de una comprobación hecha en el cliente.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists documents_owner_updated_idx
  on public.documents (owner, updated_at desc);

-- ---------------------------------------------------------------------------
-- Ajustes: una fila por cuenta
-- ---------------------------------------------------------------------------

create table if not exists public.settings (
  owner         uuid primary key references auth.users (id) on delete cascade,
  default_font  text not null default 'b0',
  size          smallint not null default 1,
  lead          smallint not null default 1,
  theme         smallint not null default 0,
  texture       boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tipografías subidas. El archivo vive en Storage; aquí queda su índice.
-- ---------------------------------------------------------------------------

create table if not exists public.fonts (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users (id) on delete cascade,
  label       text not null,
  ext         text not null,
  path        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists fonts_owner_idx on public.fonts (owner);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = greatest(coalesce(new.updated_at, now()), old.updated_at);
  return new;
end;
$$;

-- El cliente manda su propio updated_at (es el criterio de resolución de
-- conflictos entre dispositivos), así que el trigger sólo impide que una
-- escritura retroceda el reloj, no lo reescribe.
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch
  before update on public.documents
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: cada cuenta sólo alcanza sus propias filas
-- ---------------------------------------------------------------------------

alter table public.documents enable row level security;
alter table public.settings  enable row level security;
alter table public.fonts     enable row level security;

drop policy if exists documents_own on public.documents;
create policy documents_own on public.documents
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

drop policy if exists settings_own on public.settings;
create policy settings_own on public.settings
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

drop policy if exists fonts_own on public.fonts;
create policy fonts_own on public.fonts
  for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- Sin grants a anon: una sesión sin autenticar no alcanza ninguna tabla.
revoke all on public.documents from anon;
revoke all on public.settings  from anon;
revoke all on public.fonts     from anon;

grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.settings  to authenticated;
grant select, insert, update, delete on public.fonts     to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: los cambios de documentos llegan solos a los otros dispositivos
-- ---------------------------------------------------------------------------

alter table public.documents replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: bucket de tipografías, una carpeta por cuenta
-- ---------------------------------------------------------------------------

-- Público en lectura a propósito: un @font-face necesita una URL estable y
-- una URL firmada caduca. Los archivos de fuente no son datos sensibles; los
-- documentos, que sí lo son, nunca pasan por aquí. La escritura sigue atada
-- a la carpeta de cada cuenta.
insert into storage.buckets (id, name, public)
values ('fonts', 'fonts', true)
on conflict (id) do update set public = true;

drop policy if exists fonts_read on storage.objects;
create policy fonts_read on storage.objects
  for select to public
  using (bucket_id = 'fonts');

drop policy if exists fonts_write on storage.objects;
create policy fonts_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fonts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists fonts_drop on storage.objects;
create policy fonts_drop on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fonts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
