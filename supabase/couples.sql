-- Focus OS study-couple feature. Run once in Supabase SQL Editor as project owner.
-- Shared rows contain only task title, subject, date and completion state.
-- Personal notes, logs, email addresses and private tasks stay in study_data.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

-- Only the two linked accounts can read each other's display photo/name.
create table if not exists public.couple_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Study partner' check (length(display_name) between 1 and 80),
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- In-portal invitations are addressed to an existing Supabase Auth email, but
-- this table never sends email and clients cannot create/accept rows directly.
create table if not exists public.couple_invitations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_id <> invitee_id)
);
create unique index if not exists couple_one_pending_invitation
  on public.couple_invitations(couple_id, invitee_id) where status = 'pending';

create table if not exists public.couple_events (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('partner_joined')),
  created_at timestamptz not null default now()
);

create table if not exists public.couple_tasks (
  couple_id uuid not null references public.couples(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  subject text not null,
  title text not null,
  due_date text not null,
  is_done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (couple_id, owner_id, task_id),
  check (length(title) between 1 and 200),
  check (length(subject) between 1 and 80),
  check (length(due_date) between 1 and 20)
);

create table if not exists public.couple_focus_sessions (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  started_by uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 60 and 14400),
  label text not null default 'Focus session' check (length(label) between 1 and 80),
  status text not null check (status in ('running', 'stopped')),
  updated_at timestamptz not null default now()
);

alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_profiles enable row level security;
alter table public.couple_invites enable row level security;
alter table public.couple_invitations enable row level security;
alter table public.couple_events enable row level security;
alter table public.couple_tasks enable row level security;
alter table public.couple_focus_sessions enable row level security;

-- Definer helper prevents recursive RLS checks on couple_members.
create or replace function public.is_couple_member(target_couple uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.couple_members m
    where m.couple_id = target_couple and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_couple_member(uuid) from public, anon;
grant execute on function public.is_couple_member(uuid) to authenticated;

create or replace function public.is_study_partner(partner_user uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.couple_members me
    join public.couple_members partner using (couple_id)
    where me.user_id = auth.uid() and partner.user_id = partner_user
  );
$$;
revoke all on function public.is_study_partner(uuid) from public, anon;
grant execute on function public.is_study_partner(uuid) to authenticated;

drop policy if exists "Users and their partner can read couple profiles" on public.couple_profiles;
create policy "Users and their partner can read couple profiles" on public.couple_profiles
  for select to authenticated using (user_id = auth.uid() or public.is_study_partner(user_id));
revoke all on public.couple_profiles from anon, authenticated;
grant select on public.couple_profiles to authenticated;

drop policy if exists "Members can read their couple" on public.couples;
create policy "Members can read their couple" on public.couples
  for select to authenticated using (public.is_couple_member(id));

drop policy if exists "Members can read couple membership" on public.couple_members;
create policy "Members can read couple membership" on public.couple_members
  for select to authenticated using (user_id = auth.uid() or public.is_couple_member(couple_id));

drop policy if exists "Members can read couple events" on public.couple_events;
create policy "Members can read couple events" on public.couple_events
  for select to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Invitation parties can read portal invitations" on public.couple_invitations;
create policy "Invitation parties can read portal invitations" on public.couple_invitations
  for select to authenticated using (invitee_id = auth.uid());

drop policy if exists "Members can read shared tasks" on public.couple_tasks;
create policy "Members can read shared tasks" on public.couple_tasks
  for select to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Members can read shared focus" on public.couple_focus_sessions;
create policy "Members can read shared focus" on public.couple_focus_sessions
  for select to authenticated using (public.is_couple_member(couple_id));
drop policy if exists "Members can start shared focus" on public.couple_focus_sessions;
create policy "Members can start shared focus" on public.couple_focus_sessions
  for insert to authenticated with check (
    public.is_couple_member(couple_id) and started_by = auth.uid()
  );
drop policy if exists "Members can update shared focus" on public.couple_focus_sessions;
create policy "Members can update shared focus" on public.couple_focus_sessions
  for update to authenticated using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));

revoke all on public.couples, public.couple_members, public.couple_invites, public.couple_invitations,
  public.couple_events, public.couple_tasks, public.couple_focus_sessions from anon, authenticated;
grant select on public.couples, public.couple_members, public.couple_invitations, public.couple_events, public.couple_tasks,
  public.couple_focus_sessions to authenticated;
grant insert, update on public.couple_focus_sessions to authenticated;

create or replace function public.create_study_couple()
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You already belong to a study couple.';
  end if;
  insert into public.couples(created_by) values (auth.uid()) returning id into new_id;
  insert into public.couple_members(couple_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

create or replace function public.save_my_couple_profile(p_display_name text, p_avatar_url text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare safe_name text; safe_avatar text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  safe_name := left(coalesce(nullif(btrim(p_display_name), ''), 'Study partner'), 80);
  safe_avatar := nullif(btrim(p_avatar_url), '');
  if safe_avatar is not null and safe_avatar !~ '^https://([a-zA-Z0-9-]+\.)?googleusercontent\.com/[^[:space:]]*$' then
    safe_avatar := null;
  end if;
  insert into public.couple_profiles(user_id, display_name, avatar_url, updated_at)
    values (auth.uid(), safe_name, safe_avatar, now())
    on conflict (user_id) do update set display_name = excluded.display_name,
      avatar_url = excluded.avatar_url, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.create_study_couple_invite()
returns text language plpgsql security definer
set search_path = ''
as $$
declare my_couple uuid; raw_code text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select couple_id into my_couple from public.couple_members where user_id = auth.uid() for update;
  if my_couple is null then raise exception 'Create a study couple first.'; end if;
  perform 1 from public.couples where id = my_couple for update;
  if (select count(*) from public.couple_members where couple_id = my_couple) >= 2 then
    raise exception 'This study couple already has two members.';
  end if;
  update public.couple_invites set revoked_at = now()
    where couple_id = my_couple and used_at is null and revoked_at is null;
  raw_code := lower(encode(extensions.gen_random_bytes(9), 'hex'));
  insert into public.couple_invites(couple_id, code_hash, created_by, expires_at)
    values (my_couple, encode(extensions.digest(raw_code, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days');
  return raw_code;
end;
$$;

create or replace function public.accept_study_couple_invite(invite_code text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare invite_row public.couple_invites%rowtype; new_member_count integer; target_couple uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if invite_code is null or lower(btrim(invite_code)) !~ '^[a-f0-9]{18}$' then
    raise exception 'That invite code is not valid.';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You already belong to a study couple.';
  end if;
  select couple_id into target_couple from public.couple_invites
    where code_hash = encode(extensions.digest(lower(btrim(invite_code)), 'sha256'), 'hex')
      and used_at is null and revoked_at is null and expires_at > now()
    limit 1;
  if target_couple is null then raise exception 'Invite code is invalid or expired.'; end if;
  perform 1 from public.couples where id = target_couple for update;
  select * into invite_row from public.couple_invites
    where couple_id = target_couple
      and code_hash = encode(extensions.digest(lower(btrim(invite_code)), 'sha256'), 'hex')
      and used_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Invite code is invalid or expired.'; end if;
  select count(*) into new_member_count from public.couple_members where couple_id = invite_row.couple_id;
  if new_member_count >= 2 then raise exception 'This study couple already has two members.'; end if;
  update public.couple_invites set used_by = auth.uid(), used_at = now() where id = invite_row.id;
  insert into public.couple_members(couple_id, user_id) values (invite_row.couple_id, auth.uid());
  insert into public.couple_events(couple_id, actor_id, event_type)
    values (invite_row.couple_id, auth.uid(), 'partner_joined');
  update public.couple_invitations set status = 'expired', responded_at = now()
    where couple_id = invite_row.couple_id and status = 'pending';
  return invite_row.couple_id;
end;
$$;

create or replace function public.send_study_couple_portal_invite(invitee_email text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare my_couple uuid; target_user uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if invitee_email is null or length(btrim(invitee_email)) not between 3 and 254 then
    raise exception 'Enter your partner’s Google account email.';
  end if;
  select couple_id into my_couple from public.couple_members where user_id = auth.uid() for update;
  if my_couple is null then raise exception 'Create a study room first.'; end if;
  perform 1 from public.couples where id = my_couple for update;
  if (select count(*) from public.couple_members where couple_id = my_couple) >= 2 then
    raise exception 'This study room already has two members.';
  end if;
  update public.couple_invitations set status = 'expired', responded_at = now()
    where couple_id = my_couple and status = 'pending' and created_at <= now() - interval '7 days';
  select id into target_user from auth.users
    where lower(email) = lower(btrim(invitee_email)) and id <> auth.uid() limit 1;
  -- Generic result prevents using this RPC to enumerate registered emails.
  if target_user is null then return; end if;
  if exists (select 1 from public.couple_members where user_id = target_user) then return; end if;
  if (select count(*) from public.couple_invitations
      where couple_id = my_couple and status = 'pending' and created_at > now() - interval '7 days') >= 5 then
    raise exception 'There are already several pending invites. Wait for a response first.';
  end if;
  insert into public.couple_invitations(couple_id, inviter_id, invitee_id)
    values (my_couple, auth.uid(), target_user)
    on conflict (couple_id, invitee_id) where status = 'pending' do nothing;
end;
$$;

create or replace function public.respond_to_study_couple_invite(invitation_id uuid, accept boolean)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare invitation public.couple_invitations%rowtype; member_count integer; target_couple uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select couple_id into target_couple from public.couple_invitations
    where id = invitation_id and invitee_id = auth.uid() and status = 'pending'
      and created_at > now() - interval '7 days'
    limit 1;
  if target_couple is null then raise exception 'This portal invitation is no longer available.'; end if;
  perform 1 from public.couples where id = target_couple for update;
  select * into invitation from public.couple_invitations
    where id = invitation_id and invitee_id = auth.uid() and status = 'pending'
      and created_at > now() - interval '7 days'
    for update;
  if not found then raise exception 'This portal invitation is no longer available.'; end if;
  if not accept then
    update public.couple_invitations set status = 'declined', responded_at = now() where id = invitation.id;
    return null;
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You already belong to a study room.';
  end if;
  perform 1 from public.couples where id = invitation.couple_id for update;
  select count(*) into member_count from public.couple_members where couple_id = invitation.couple_id;
  if member_count >= 2 then raise exception 'This study room already has two members.'; end if;
  update public.couple_invitations set status = 'accepted', responded_at = now() where id = invitation.id;
  insert into public.couple_members(couple_id, user_id) values (invitation.couple_id, auth.uid());
  update public.couple_invitations set status = 'expired', responded_at = now()
    where couple_id = invitation.couple_id and id <> invitation.id and status = 'pending';
  insert into public.couple_events(couple_id, actor_id, event_type)
    values (invitation.couple_id, auth.uid(), 'partner_joined');
  return invitation.couple_id;
end;
$$;

create or replace function public.replace_my_shared_tasks(tasks jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare my_couple uuid; task_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select couple_id into my_couple from public.couple_members where user_id = auth.uid();
  if my_couple is null then return; end if;
  if tasks is null or jsonb_typeof(tasks) <> 'array' then raise exception 'Invalid task list.'; end if;
  task_count := jsonb_array_length(tasks);
  if task_count > 3000 then raise exception 'Too many tasks to share.'; end if;
  delete from public.couple_tasks where couple_id = my_couple and owner_id = auth.uid();
  insert into public.couple_tasks(couple_id, owner_id, task_id, subject, title, due_date, is_done)
  select my_couple, auth.uid(), x.task_id, x.subject, x.title, x.due_date, x.is_done
  from jsonb_to_recordset(tasks) as x(task_id text, subject text, title text, due_date text, is_done boolean)
  where length(x.task_id) between 1 and 80
    and length(x.subject) between 1 and 80
    and length(x.title) between 1 and 200
    and length(x.due_date) between 1 and 20;
end;
$$;

create or replace function public.leave_study_couple()
returns void language plpgsql security definer
set search_path = ''
as $$
declare my_couple uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select couple_id into my_couple from public.couple_members where user_id = auth.uid();
  if my_couple is null then return; end if;
  -- Unpairing deletes the room and its shared timer/tasks for both people.
  delete from public.couples where id = my_couple;
end;
$$;

revoke all on function public.create_study_couple() from public, anon;
revoke all on function public.save_my_couple_profile(text, text) from public, anon;
revoke all on function public.create_study_couple_invite() from public, anon;
revoke all on function public.accept_study_couple_invite(text) from public, anon;
revoke all on function public.send_study_couple_portal_invite(text) from public, anon;
revoke all on function public.respond_to_study_couple_invite(uuid, boolean) from public, anon;
revoke all on function public.replace_my_shared_tasks(jsonb) from public, anon;
revoke all on function public.leave_study_couple() from public, anon;
grant execute on function public.create_study_couple() to authenticated;
grant execute on function public.save_my_couple_profile(text, text) to authenticated;
grant execute on function public.create_study_couple_invite() to authenticated;
grant execute on function public.accept_study_couple_invite(text) to authenticated;
grant execute on function public.send_study_couple_portal_invite(text) to authenticated;
grant execute on function public.respond_to_study_couple_invite(uuid, boolean) to authenticated;
grant execute on function public.replace_my_shared_tasks(jsonb) to authenticated;
grant execute on function public.leave_study_couple() to authenticated;

-- Enable live updates in Supabase Realtime (safe if already added).
do $$ begin
  alter publication supabase_realtime add table public.couple_tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.couple_focus_sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.couple_events;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.couple_invitations;
exception when duplicate_object then null; end $$;
