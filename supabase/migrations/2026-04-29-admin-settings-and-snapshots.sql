begin;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_all" on public.app_settings;
create policy "app_settings_select_all"
on public.app_settings
for select
to anon, authenticated
using (true);

drop policy if exists "app_settings_insert_all" on public.app_settings;
create policy "app_settings_insert_all"
on public.app_settings
for insert
to anon, authenticated
with check (true);

drop policy if exists "app_settings_update_all" on public.app_settings;
create policy "app_settings_update_all"
on public.app_settings
for update
to anon, authenticated
using (true)
with check (true);

grant select, insert, update on public.app_settings to anon, authenticated;

alter table public.map_revisions
  add column if not exists snapshot_name text;

alter table public.map_revisions
  drop constraint if exists map_revisions_event_type_check;

alter table public.map_revisions
  add constraint map_revisions_event_type_check
  check (event_type in ('autosave', 'publish', 'restore', 'snapshot'));

commit;