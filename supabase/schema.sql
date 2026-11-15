create table if not exists public.study_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  data_key text not null check (data_key ~ '^[A-Za-z0-9_-]{1,100}$'),
  data jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_key)
);
-- The app stores null for cleared values such as active_task after stopping a timer.
-- Keep the JSONB column nullable so those updates can sync correctly.
alter table public.study_data alter column data drop not null;
alter table public.study_data enable row level security;
revoke all on table public.study_data from anon, authenticated;
grant select, insert, update, delete on public.study_data to authenticated;
drop policy if exists "Owner email can access own Focus OS data" on public.study_data;
drop policy if exists "Users can access own Focus OS data" on public.study_data;
create policy "Users can access own Focus OS data"
on public.study_data for all to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);
