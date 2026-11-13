-- Replace the email below with your Google account email before running.
create table if not exists public.study_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  data_key text not null check (data_key ~ '^[A-Za-z0-9_-]{1,100}$'),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_key)
);
alter table public.study_data enable row level security;
revoke all on table public.study_data from anon, authenticated;
grant select, insert, update, delete on table public.study_data to authenticated;
drop policy if exists "Owner email can access own Focus OS data" on public.study_data;
create policy "Owner email can access own Focus OS data"
on public.study_data for all to authenticated
using ((select auth.uid())=user_id and lower((select auth.jwt()->>'email'))=lower('REPLACE_WITH_YOUR_GOOGLE_EMAIL'))
with check ((select auth.uid())=user_id and lower((select auth.jwt()->>'email'))=lower('REPLACE_WITH_YOUR_GOOGLE_EMAIL'));
