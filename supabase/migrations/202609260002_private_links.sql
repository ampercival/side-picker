-- Stage 1: prepare the capability API without interrupting the old application.
-- Apply 202609260003_lock_game_tables.sql only after deploying/testing the client.
begin;
create schema if not exists side_picker_private;
revoke all on schema side_picker_private from public, anon, authenticated;

-- Database-local recovery snapshot. Never expose/export this through the API.
create table if not exists side_picker_private.before_private_links as
select 'users'::text as source, to_jsonb(t) as record from public.users t
union all select 'sessions', to_jsonb(t) from public.sessions t
union all select 'presets', to_jsonb(t) from public.presets t
union all select 'submissions', to_jsonb(t) from public.submissions t;

alter table public.sessions add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists sessions_id_key on public.sessions(id);

create table if not exists side_picker_private.workspaces (
    owner_key text primary key,
    token_hash text unique not null check (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now()
);
create table if not exists side_picker_private.rooms (
    session_id uuid primary key references public.sessions(id) on delete cascade,
    seed bytea not null default extensions.gen_random_bytes(32)
);
create table if not exists side_picker_private.picks (
    session_id uuid references public.sessions(id) on delete cascade,
    player_id text not null,
    preferences jsonb not null,
    bans jsonb not null,
    no_preference boolean not null,
    updated_at timestamptz not null default clock_timestamp(),
    primary key (session_id, player_id)
);
revoke all on all tables in schema side_picker_private from public, anon, authenticated;

-- Carry forward existing submissions by stable player id, without deleting originals.
insert into side_picker_private.picks(session_id, player_id, preferences, bans, no_preference, updated_at)
select s.id, p->>'id', u.preferences, u.bans, u.no_preference, u.updated_at
from public.submissions u join public.sessions s on s.room_code=u.room_code
cross join lateral jsonb_array_elements(s.players) p
where p->>'name'=u.player_name and p->>'id' is not null
on conflict do nothing;
insert into side_picker_private.rooms(session_id)
select id from public.sessions where room_code is not null on conflict do nothing;

create or replace function side_picker_private.text_list(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
    if v is null or jsonb_typeof(v) <> 'array' then return false; end if;
    if jsonb_array_length(v)>100 then return false; end if;
    return not exists(select 1 from jsonb_array_elements(v) x
        where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 500)
        and (select count(*) from jsonb_array_elements(v))=(select count(distinct x) from jsonb_array_elements(v) x);
end $$;

create or replace function side_picker_private.valid_picks(f jsonb, p jsonb, b jsonb, n jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
    if not side_picker_private.text_list(p) or not side_picker_private.text_list(b)
        or n is null or jsonb_typeof(n)<>'boolean' then return false; end if;
    return f @> p and f @> b and not exists
        (select 1 from jsonb_array_elements(p) x where b @> jsonb_build_array(x));
end $$;

create or replace function side_picker_private.check_session(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare p jsonb;
begin
    if jsonb_typeof(v) is distinct from 'object' or octet_length(v::text)>262144
        or not side_picker_private.text_list(v->'factions')
        or jsonb_typeof(v->'players') is distinct from 'array' then
        raise exception 'Invalid game setup' using errcode='22023';
    end if;
    if jsonb_array_length(v->'players')>100
        or length(coalesce(v->>'session_name',''))>500 or length(coalesce(v->>'game_title',''))>500 then
        raise exception 'Game setup is too large' using errcode='22023';
    end if;
    if (select count(*) from jsonb_array_elements(v->'players')) <>
       (select count(distinct x->>'id') from jsonb_array_elements(v->'players') x) then
        raise exception 'Player ids must be unique' using errcode='22023';
    end if;
    for p in select * from jsonb_array_elements(v->'players') loop
        if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'id') is distinct from 'string'
            or length(p->>'id') not between 1 and 100 or jsonb_typeof(p->'name') is distinct from 'string'
            or length(p->>'name') not between 1 and 500
            or not side_picker_private.valid_picks(v->'factions',p->'preferences',p->'bans',coalesce(p->'noPreference','false')) then
            raise exception 'Invalid player choices' using errcode='22023';
        end if;
    end loop;
end $$;

-- Every operation scopes records using the server's token lookup, never a
-- client-supplied workspace label. The browser sends the capability in a POST
-- body, not a URL query. All names/ids in payload are untrusted selectors.
create or replace function public.sp_workspace(action text, credential text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare w text; h text; s public.sessions; n text; result jsonb; secret bytea; pid text;
begin
    if credential is null or credential !~ '^[0-9a-f]{64}$' then
        raise exception 'Organizer link is missing or invalid' using errcode='42501';
    end if;
    if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>300000 then
        raise exception 'Invalid request' using errcode='22023';
    end if;
    h := encode(extensions.digest(credential,'sha256'),'hex');
    -- Serialize rotations with authenticated requests (and idempotent create).
    perform pg_advisory_xact_lock(hashtextextended(h,0));
    select owner_key into w from side_picker_private.workspaces where token_hash=h for update;
    if action='create' then
        if w is null then
            w := gen_random_uuid()::text;
            insert into side_picker_private.workspaces(owner_key,token_hash) values(w,h);
            insert into public.users(owner_key) values(w);
        end if;
        return jsonb_build_object('owner_key',w);
    end if;
    if w is null then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
    if action='load' then
        return jsonb_build_object('owner_key',w,
            'sessions',coalesce((select jsonb_agg(to_jsonb(t)) from public.sessions t where t.owner_key=w),'[]'),
            'presets',coalesce((select jsonb_agg(to_jsonb(t)) from public.presets t where t.owner_key=w),'[]'));
    elsif action='rotate' then
        if coalesce(payload->>'token_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid replacement' using errcode='22023'; end if;
        update side_picker_private.workspaces set token_hash=payload->>'token_hash' where owner_key=w;
        return jsonb_build_object('owner_key',w);
    end if;
    n := payload->>'name';
    if n is null or length(n) not between 1 and 500 then raise exception 'Invalid name' using errcode='22023'; end if;
    if action='save_preset' then
        if not side_picker_private.text_list(payload->'factions') then raise exception 'Invalid factions' using errcode='22023'; end if;
        insert into public.presets(owner_key,name,factions) values(w,n,payload->'factions')
        on conflict(owner_key,name) do update set factions=excluded.factions,updated_at=clock_timestamp();
        return '{}'::jsonb;
    elsif action='delete_preset' then
        delete from public.presets where owner_key=w and name=n;
        return '{}'::jsonb;
    end if;
    select * into s from public.sessions where owner_key=w and name=n for update;
    if action='save_session' then
        perform side_picker_private.check_session(payload);
        insert into public.sessions(owner_key,name,session_name,game_title,factions,players,results)
        values(w,n,payload->>'session_name',payload->>'game_title',payload->'factions',payload->'players',nullif(payload->'results','null'))
        on conflict(owner_key,name) do update set session_name=excluded.session_name,game_title=excluded.game_title,
            factions=excluded.factions,players=excluded.players,results=excluded.results,updated_at=clock_timestamp()
        returning * into s;
        delete from side_picker_private.picks k where k.session_id=s.id and not exists
            (select 1 from jsonb_array_elements(s.players) p where p->>'id'=k.player_id);
        return to_jsonb(s);
    elsif action='delete_session' then
        delete from public.sessions where owner_key=w and name=n;
        return '{}'::jsonb;
    end if;
    if s.id is null then raise exception 'Game not found' using errcode='42501'; end if;
    if action='submissions' then
        return coalesce((select jsonb_agg(to_jsonb(k)) from side_picker_private.picks k where k.session_id=s.id),'[]');
    elsif action='open_room' then
        if jsonb_array_length(s.players)=0 or jsonb_array_length(s.factions)<jsonb_array_length(s.players) then
            raise exception 'Add players and enough factions first' using errcode='22023';
        end if;
        if s.room_code is null then
            update public.sessions set room_code=upper(encode(extensions.gen_random_bytes(12),'hex')) where id=s.id returning * into s;
        end if;
        insert into side_picker_private.rooms(session_id) values(s.id) on conflict do nothing;
        return to_jsonb(s);
    elsif action='reset_room_links' then
        update side_picker_private.rooms set seed=extensions.gen_random_bytes(32) where session_id=s.id;
        return '{}'::jsonb;
    elsif action='invite' then
        pid := coalesce(payload->>'player_id','');
        if pid<>'' and not exists(select 1 from jsonb_array_elements(s.players) p where p->>'id'=pid) then
            raise exception 'Player not found' using errcode='22023';
        end if;
        select seed into secret from side_picker_private.rooms where session_id=s.id;
        if secret is null or s.room_code is null then raise exception 'Open the room first' using errcode='22023'; end if;
        return jsonb_build_object('room_code',s.room_code,'player_id',pid,
            'token',encode(extensions.hmac(convert_to(pid,'UTF8'),secret,'sha256'),'hex'));
    end if;
    raise exception 'Unknown operation' using errcode='22023';
end $$;

-- Guest reads disclose only room metadata, roster/status, published results,
-- and that guest's own picks. A view-only room link has an empty player_id.
create or replace function public.sp_room(room text, player text, credential text, action text default 'read', payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; secret bytea; expected text; chosen jsonb; mine jsonb; roster jsonb;
begin
    if credential is null or credential !~ '^[0-9a-f]{64}$' or room is null or length(room)>100
        or player is null or length(player)>100 then raise exception 'Room link is invalid or expired' using errcode='42501'; end if;
    select * into s from public.sessions where room_code=room for update;
    select seed into secret from side_picker_private.rooms where session_id=s.id;
    expected := encode(extensions.hmac(convert_to(player,'UTF8'),secret,'sha256'),'hex');
    if expected is null or expected<>credential then raise exception 'Room link is invalid or expired' using errcode='42501'; end if;
    select p into chosen from jsonb_array_elements(s.players) p where p->>'id'=player;
    if player<>'' and chosen is null then raise exception 'Player is no longer in this game' using errcode='42501'; end if;
    if action='submit' then
        if player='' then raise exception 'A personal player link is required' using errcode='42501'; end if;
        if s.results is not null then raise exception 'Results are published. Ask the organizer to reopen picking.' using errcode='42501'; end if;
        if payload is null or octet_length(payload::text)>120000 or not side_picker_private.valid_picks
            (s.factions,payload->'preferences',payload->'bans',payload->'no_preference') then
            raise exception 'Invalid choices. Refresh the room and try again.' using errcode='22023';
        end if;
        insert into side_picker_private.picks(session_id,player_id,preferences,bans,no_preference)
        values(s.id,player,payload->'preferences',payload->'bans',(payload->>'no_preference')::boolean)
        on conflict(session_id,player_id) do update set preferences=excluded.preferences,bans=excluded.bans,
            no_preference=excluded.no_preference,updated_at=clock_timestamp();
    elsif action<>'read' then raise exception 'Unknown operation' using errcode='22023'; end if;
    select to_jsonb(k) - 'session_id' into mine from side_picker_private.picks k where k.session_id=s.id and k.player_id=player;
    select jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','submitted',exists
        (select 1 from side_picker_private.picks k where k.session_id=s.id and k.player_id=p->>'id'))) into roster
        from jsonb_array_elements(s.players) p;
    return jsonb_build_object('session_name',s.session_name,'game_title',s.game_title,'factions',s.factions,
        'players',coalesce(roster,'[]'),'results',s.results,'mine',mine,'player_name',chosen->>'name');
end $$;

revoke all on all functions in schema side_picker_private from public, anon, authenticated;
revoke all on function public.sp_workspace(text,text,jsonb), public.sp_room(text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.sp_workspace(text,text,jsonb), public.sp_room(text,text,text,text,jsonb) to anon, authenticated;
commit;
