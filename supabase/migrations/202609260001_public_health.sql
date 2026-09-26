-- SEC-02 prerequisite: a public, read-only sentinel independent of game access.
-- Apply as project administrator. Does not read or change game records/policies.
begin;

create table if not exists public.app_health (
    status text primary key check (status = 'ok')
);
comment on table public.app_health is
    'Non-sensitive sentinel for the local daily database check. Public read only.';
insert into public.app_health (status) values ('ok') on conflict (status) do nothing;

alter table public.app_health enable row level security;
revoke all on public.app_health from public, anon, authenticated;
grant select (status) on public.app_health to anon, authenticated;
drop policy if exists health_read on public.app_health;
create policy health_read on public.app_health
    for select to anon, authenticated using (status = 'ok');

commit;
