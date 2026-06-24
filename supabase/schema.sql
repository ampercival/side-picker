-- Side Picker — Supabase schema
-- Run this in your project: SQL Editor -> New query -> paste -> Run.
-- The script is idempotent and also migrates older versions (drops the old
-- standalone `rooms` table now that a room is just a feature of a session).

-- Organizers (scaffolding for future login/auth; today just a workspace key).
create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  owner_key  text unique not null,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
drop policy if exists users_all on public.users;
create policy users_all on public.users for all to anon using (true) with check (true);
grant select, insert, update, delete on public.users to anon;

-- Sessions: the canonical entity. A session optionally has a room_code (its
-- shareable identity) and, after optimizing, a results snapshot.
create table if not exists public.sessions (
  owner_key    text not null,
  name         text not null,          -- stable identity within a workspace
  session_name text,                   -- editable display name
  game_title   text,
  factions     jsonb not null default '[]'::jsonb,
  players      jsonb not null default '[]'::jsonb,
  room_code    text,
  results      jsonb,
  updated_at   timestamptz not null default now(),
  primary key (owner_key, name)
);

-- Bring older session tables up to date.
alter table public.sessions add column if not exists results jsonb;
do $$ begin
  alter table public.sessions add constraint sessions_room_code_key unique (room_code);
exception when duplicate_object then null;
end $$;

create index if not exists sessions_owner_idx on public.sessions (owner_key);

alter table public.sessions enable row level security;
drop policy if exists sessions_all on public.sessions;
create policy sessions_all on public.sessions for all to anon using (true) with check (true);
grant select, insert, update, delete on public.sessions to anon;

-- Preset games (named faction lists), scoped by the same workspace key.
create table if not exists public.presets (
  owner_key  text not null,
  name       text not null,
  factions   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_key, name)
);

create index if not exists presets_owner_idx on public.presets (owner_key);

alter table public.presets enable row level security;
drop policy if exists presets_all on public.presets;
create policy presets_all on public.presets for all to anon using (true) with check (true);
grant select, insert, update, delete on public.presets to anon;

-- Submissions: one row per player per room, now tied to the session's room_code
-- so deleting a session cascades its submissions automatically.
create table if not exists public.submissions (
  room_code     text not null,
  player_name   text not null,
  preferences   jsonb not null default '[]'::jsonb,
  bans          jsonb not null default '[]'::jsonb,
  no_preference boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (room_code, player_name)
);

-- Repoint the foreign key from the old rooms table to sessions(room_code).
alter table public.submissions drop constraint if exists submissions_room_code_fkey;
delete from public.submissions s
  where not exists (select 1 from public.sessions ss where ss.room_code = s.room_code);
alter table public.submissions
  add constraint submissions_room_code_fkey
  foreign key (room_code) references public.sessions(room_code) on delete cascade;

alter table public.submissions enable row level security;
drop policy if exists submissions_all on public.submissions;
create policy submissions_all on public.submissions for all to anon using (true) with check (true);
grant select, insert, update, delete on public.submissions to anon;

-- Realtime: submissions (organizer sees picks live) and sessions (guests see
-- results the moment the organizer optimizes).
do $$ begin
  alter publication supabase_realtime add table public.submissions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null;
end $$;

-- The standalone rooms table is no longer used (merged into sessions).
drop table if exists public.rooms;
