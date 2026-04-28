-- Migration: add first-class published map variants
-- Safe to run multiple times.

begin;

create table if not exists public.map_variants (
  id uuid primary key default gen_random_uuid(),
  map_name text not null,
  variant_key text not null,
  label text,
  map_state_id uuid not null references public.map_states(id) on delete cascade,
  revision_id uuid references public.map_revisions(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint map_variants_variant_key_not_empty check (char_length(trim(variant_key)) > 0),
  constraint map_variants_map_name_variant_key_unique unique (map_name, variant_key)
);

-- Backfill from legacy convention in map_states.name: <map_name>variant:<variant_key>
insert into public.map_variants (map_name, variant_key, map_state_id, created_at, updated_at)
select
  split_part(ms.name, 'variant:', 1) as map_name,
  split_part(ms.name, 'variant:', 2) as variant_key,
  ms.id as map_state_id,
  ms.created_at,
  ms.updated_at
from public.map_states ms
where ms.stage = 'published'
  and position('variant:' in ms.name) > 0
  and char_length(trim(split_part(ms.name, 'variant:', 2))) > 0
on conflict (map_name, variant_key)
do update set
  map_state_id = excluded.map_state_id,
  updated_at = excluded.updated_at;

create index if not exists idx_map_variants_map_name on public.map_variants(map_name);
create index if not exists idx_map_variants_map_state_id on public.map_variants(map_state_id);
create index if not exists idx_map_variants_revision_id on public.map_variants(revision_id);
create index if not exists idx_map_variants_created_at on public.map_variants(created_at desc);

drop trigger if exists trg_map_variants_updated_at on public.map_variants;
create trigger trg_map_variants_updated_at
before update on public.map_variants
for each row execute function public.set_updated_at();

alter table public.map_variants enable row level security;

drop policy if exists "map_variants_select_all" on public.map_variants;
create policy "map_variants_select_all"
on public.map_variants
for select
to anon, authenticated
using (true);

drop policy if exists "map_variants_insert_all" on public.map_variants;
create policy "map_variants_insert_all"
on public.map_variants
for insert
to anon, authenticated
with check (true);

drop policy if exists "map_variants_update_all" on public.map_variants;
create policy "map_variants_update_all"
on public.map_variants
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "map_variants_delete_all" on public.map_variants;
create policy "map_variants_delete_all"
on public.map_variants
for delete
to anon, authenticated
using (true);

grant select, insert, update, delete on public.map_variants to anon, authenticated;

commit;
