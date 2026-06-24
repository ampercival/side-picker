-- Side Picker — Supabase schema for live rooms
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.

-- One row per game night, identified by a short shareable code.
create table if not exists public.rooms (
  code         text primary key,
  session_name text,
  game_title   text,
  factions     jsonb not null default '[]'::jsonb,
  roster       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

-- One row per player per room (upserted when a player submits/changes picks).
create table if not exists public.submissions (
  room_code     text not null references public.rooms(code) on delete cascade,
  player_name   text not null,
  preferences   jsonb not null default '[]'::jsonb,
  bans          jsonb not null default '[]'::jsonb,
  no_preference boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (room_code, player_name)
);

-- Row Level Security on.
alter table public.rooms enable row level security;
alter table public.submissions enable row level security;

-- Permissive policies for a no-login game-night tool: anyone with the room code
-- can read and write. Tighten later if you ever need to.
drop policy if exists rooms_all on public.rooms;
create policy rooms_all on public.rooms
  for all to anon using (true) with check (true);

drop policy if exists submissions_all on public.submissions;
create policy submissions_all on public.submissions
  for all to anon using (true) with check (true);

-- Make sure the anon role can reach these tables through the Data API even if the
-- project's "automatically expose new tables" setting is off. Row-level access is
-- still governed by the RLS policies above.
grant usage on schema public to anon;
grant select, insert, update, delete on public.rooms to anon;
grant select, insert, update, delete on public.submissions to anon;

-- Broadcast submission changes over Realtime so the organizer sees picks live.
-- (Wrapped so the script can be re-run safely.)
do $$
begin
  alter publication supabase_realtime add table public.submissions;
exception when duplicate_object then null;
end $$;

-- Organizer sessions (game-night setups), scoped by a workspace key the
-- organizer chooses. Lets sessions load on any device, not just one browser.
create table if not exists public.sessions (
  owner_key    text not null,
  name         text not null,          -- session identity within a workspace
  session_name text,                   -- editable display name
  game_title   text,
  factions     jsonb not null default '[]'::jsonb,
  players      jsonb not null default '[]'::jsonb,
  room_code    text,
  updated_at   timestamptz not null default now(),
  primary key (owner_key, name)
);

create index if not exists sessions_owner_idx on public.sessions (owner_key);

alter table public.sessions enable row level security;

drop policy if exists sessions_all on public.sessions;
create policy sessions_all on public.sessions
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.sessions to anon;
