-- =====================================================================
-- Módulo "Diseño y Dibujo" (DD) — NEXUS TOOLS
-- Basado en el formato MF-F-QHSE-142 SOLICITUD DE TAREA V1
-- Ejecutar en Supabase → SQL Editor (una sola vez).
-- =====================================================================

-- ---------- Tabla principal: solicitudes ----------
create table if not exists public.solicitudes_diseno (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text unique,                       -- DD-2026-001
  -- --- datos del formato MF-F-QHSE-142 ---
  solicitante_id            uuid not null default auth.uid() references auth.users(id),
  email_cliente             text,                              -- correo para notificar (se auto-llena con el del creador)
  nombre_solicita           text,
  area                      text,
  contacto                  text,
  lugar                     text,
  nombre_proyecto           text,
  prioridad                 text default 'media' check (prioridad in ('alta','media','baja')),
  tipos                     text[] default '{}',               -- levantamiento_3d, modelado_3d, diseno_3d, planos, informes_aef, ficha_tecnica, simulaciones
  descripcion               text,
  requiere_memoria_calculo  boolean default false,
  requiere_norma            boolean default false,
  norma_cual                text,
  info_adicional            text,
  -- --- gestión ---
  estado                    text default 'pendiente' check (estado in ('pendiente','en_proceso','entregada')),
  asignado_id               uuid references auth.users(id),
  avance                    int  default 0 check (avance between 0 and 100),
  formato_url               text,                              -- link del formato diligenciado (Drive/FORMATOS)
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- ---------- Tabla de entregas (parciales / total) ----------
create table if not exists public.entregas_diseno (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.solicitudes_diseno(id) on delete cascade,
  tipo          text default 'parcial' check (tipo in ('parcial','total')),
  descripcion   text,
  avance        int  default 0 check (avance between 0 and 100),
  archivo_path  text,                                          -- ruta en Storage (bucket documentos) o URL
  creado_por    uuid default auth.uid() references auth.users(id),
  created_at    timestamptz default now()
);

-- Si la tabla ya existía sin esta columna, agregarla:
alter table public.solicitudes_diseno add column if not exists formato_url text;

create index if not exists idx_sol_diseno_solicitante on public.solicitudes_diseno(solicitante_id);
create index if not exists idx_sol_diseno_estado       on public.solicitudes_diseno(estado);
create index if not exists idx_entregas_diseno_sol     on public.entregas_diseno(solicitud_id);

-- ---------- Helper: ¿el usuario es admin? ----------
create or replace function public.es_admin_diseno()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin');
$$;

-- ---------- RLS ----------
alter table public.solicitudes_diseno enable row level security;
alter table public.entregas_diseno    enable row level security;

-- SOLICITUDES: el cliente ve solo las suyas; el admin (dibujante) ve todas.
drop policy if exists sol_diseno_select on public.solicitudes_diseno;
create policy sol_diseno_select on public.solicitudes_diseno for select
  using ( solicitante_id = auth.uid() or public.es_admin_diseno() );

-- Cualquier usuario autenticado crea su propia solicitud.
drop policy if exists sol_diseno_insert on public.solicitudes_diseno;
create policy sol_diseno_insert on public.solicitudes_diseno for insert
  with check ( solicitante_id = auth.uid() );

-- Solo el admin gestiona (estado, asignado, avance, entregas).
drop policy if exists sol_diseno_update on public.solicitudes_diseno;
create policy sol_diseno_update on public.solicitudes_diseno for update
  using ( public.es_admin_diseno() ) with check ( public.es_admin_diseno() );

drop policy if exists sol_diseno_delete on public.solicitudes_diseno;
create policy sol_diseno_delete on public.solicitudes_diseno for delete
  using ( public.es_admin_diseno() );

-- ENTREGAS: visibles si la solicitud padre es visible; solo admin las crea.
drop policy if exists ent_diseno_select on public.entregas_diseno;
create policy ent_diseno_select on public.entregas_diseno for select
  using ( exists (select 1 from public.solicitudes_diseno s
                  where s.id = solicitud_id
                    and (s.solicitante_id = auth.uid() or public.es_admin_diseno())) );

drop policy if exists ent_diseno_insert on public.entregas_diseno;
create policy ent_diseno_insert on public.entregas_diseno for insert
  with check ( public.es_admin_diseno() );

-- ---------- (Opcional) trigger para updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_sol_diseno_touch on public.solicitudes_diseno;
create trigger trg_sol_diseno_touch before update on public.solicitudes_diseno
  for each row execute function public.touch_updated_at();

-- ---------- Código consecutivo automático: DD-AAAA-NNN ----------
create sequence if not exists public.seq_diseno;
create or replace function public.gen_codigo_diseno()
returns trigger language plpgsql as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := 'DD-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.seq_diseno')::text, 3, '0');
  end if;
  return new;
end; $$;

drop trigger if exists trg_diseno_codigo on public.solicitudes_diseno;
create trigger trg_diseno_codigo before insert on public.solicitudes_diseno
  for each row execute function public.gen_codigo_diseno();
