-- Stage 2: after legacy workspace binding, client deployment and API tests.
begin;
do $$ begin
    if exists (select 1 from (select owner_key from public.sessions union select owner_key from public.presets) d
        where not exists (select 1 from side_picker_private.workspaces w where w.owner_key=d.owner_key)) then
        raise exception 'Stop: a saved workspace has no private organizer link';
    end if;
end $$;
revoke all on public.users, public.sessions, public.presets, public.submissions from public, anon, authenticated;
drop policy if exists users_all on public.users;
drop policy if exists sessions_all on public.sessions;
drop policy if exists presets_all on public.presets;
drop policy if exists submissions_all on public.submissions;
-- RLS stays enabled as a second layer. Game access is now capability-checked RPC only.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.presets enable row level security;
alter table public.submissions enable row level security;
commit;
