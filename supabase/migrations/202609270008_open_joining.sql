-- Run once, after 007. Organizers can let players add themselves from the room's
-- group (viewing) link, within a seat range. A join writes the player straight
-- into the session, so it works while the organizer is offline. Until the
-- organizer's device has saved that player, an older player list saved by the
-- organizer keeps them instead of dropping them.
begin;
alter table side_picker_private.rooms
 add column join_open boolean not null default false,
 add column min_players int check (min_players between 1 and 100),
 add column max_players int check (max_players between 1 and 100),
 add constraint rooms_player_range check (min_players is null or max_players is null or min_players<=max_players);

create table side_picker_private.room_joins (
 session_id uuid not null references public.sessions(id) on delete cascade,
 player_id text not null check (length(player_id) between 1 and 100),
 name text not null check (length(name) between 1 and 60),
 joined_at timestamptz not null default now(),
 acknowledged boolean not null default false,
 primary key (session_id, player_id)
);
alter table side_picker_private.room_joins enable row level security;
revoke all on side_picker_private.room_joins from public,anon,authenticated;

-- Unchanged from 005 except the first block, which protects unseen joins.
create or replace function side_picker_private.reconcile_room() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb; before_p jsonb; choices jsonb; incoming jsonb; current_pick side_picker_private.picks; merged jsonb := '[]'; unseen jsonb;
begin
 if coalesce(current_setting('side_picker.joining',true),'')<>'on' then
  -- Joiners in the organizer's list are now seen; joiners missing from it that
  -- were never seen are kept; seen joiners missing from it were removed on purpose.
  update side_picker_private.room_joins j set acknowledged=true where j.session_id=new.id and not j.acknowledged
   and exists(select 1 from jsonb_array_elements(new.players) n where n->>'id'=j.player_id);
  for unseen in select o from jsonb_array_elements(old.players) o
    join side_picker_private.room_joins j on j.session_id=old.id and j.player_id=o->>'id' and not j.acknowledged
    where not exists(select 1 from jsonb_array_elements(new.players) n where n->>'id'=o->>'id') loop
   new.players := new.players || jsonb_build_array(unseen);
  end loop;
  delete from side_picker_private.room_joins j where j.session_id=new.id and j.acknowledged
   and not exists(select 1 from jsonb_array_elements(new.players) n where n->>'id'=j.player_id);
 end if;
 for p in select * from jsonb_array_elements(new.players) loop
  select * into current_pick from side_picker_private.picks where session_id=new.id and player_id=p->>'id';
  if found then
   incoming := side_picker_private.filtered_choices(p,new.factions);
   choices := side_picker_private.filtered_choices(to_jsonb(current_pick),new.factions);
   select v into before_p from jsonb_array_elements(old.players) v where v->>'id'=p->>'id';
   if p->>'submittedAt' is distinct from to_jsonb(current_pick.updated_at)#>>'{}' then
    if incoming is distinct from choices and incoming is distinct from side_picker_private.filtered_choices(before_p,new.factions) then
     raise exception 'This player submitted new choices while you were editing. Recover your edits as a copy or reload this game.' using errcode='40001';
    end if;
    if new.results is distinct from old.results and new.results is not null and incoming is distinct from choices then
     raise exception 'Player choices changed before publishing. Reload and optimize again.' using errcode='40001';
    end if;
   else
    choices := incoming;
   end if;
   if choices is distinct from side_picker_private.filtered_choices(to_jsonb(current_pick),old.factions)
      or not new.factions @> current_pick.preferences or not new.factions @> current_pick.bans then
    update side_picker_private.picks set preferences=choices->'preferences',bans=choices->'bans',
      no_preference=(choices->>'noPreference')::boolean,source='organizer',updated_at=clock_timestamp()
      where session_id=new.id and player_id=p->>'id' returning * into current_pick;
   end if;
   p := p || choices || jsonb_build_object('submittedAt',current_pick.updated_at,'submittedSource',current_pick.source,
       'submittedChoices',jsonb_build_array(choices->'preferences',choices->'bans',choices->'noPreference'));
  end if;
  merged := merged || jsonb_build_array(p);
 end loop;
 new.players := merged;
 if new.factions is distinct from old.factions
    or (select jsonb_agg(member->'id' order by member->>'id') from jsonb_array_elements(new.players) member)
       is distinct from (select jsonb_agg(member->'id' order by member->>'id') from jsonb_array_elements(old.players) member)
    or new.results is distinct from old.results then
  update side_picker_private.rooms set revision=gen_random_uuid(),
    locked=case when old.results is not null and new.results is null then false else locked end where session_id=new.id;
 end if;
 return new;
end $$;

-- Organizer API: joining settings, zero-player rooms, and unseen joins in room_status.
-- Everything else, including 006's per-key rotation rule, is unchanged.
create or replace function public.sp_workspace(action text,credential text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare h text; w text; k side_picker_private.workspaces; s public.sessions; r side_picker_private.rooms; data jsonb;
begin
 if action='create' then return side_picker_private.workspace_rooms(action,credential,payload); end if;
 if credential is null or credential !~ '^[0-9a-f]{64}$' then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
 h := encode(extensions.digest(credential,'sha256'),'hex');
 select owner_key into w from side_picker_private.workspaces where token_hash=h;
 if w is null then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace:'||w,0));
 select * into k from side_picker_private.workspaces where token_hash=h for update;
 if k.owner_key is distinct from w then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
 if action='rotate' then
  if coalesce(payload->>'token_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid replacement' using errcode='22023'; end if;
  update side_picker_private.workspaces set token_hash=payload->>'token_hash' where token_hash=h;
  -- The signed-in owning account replaces only this key; its other devices keep
  -- theirs. Anyone else resets all access, as before accounts, so a leaked link
  -- cannot be kept alive by attaching it to another account.
  if not exists(select 1 from side_picker_private.account_workspaces where owner_key=w and user_id=auth.uid()) then
   delete from side_picker_private.workspaces where owner_key=w and token_hash<>payload->>'token_hash';
   delete from side_picker_private.account_workspaces where owner_key=w;
   update side_picker_private.workspaces set kind='link',user_id=null,label=null where token_hash=payload->>'token_hash';
  end if;
  return jsonb_build_object('owner_key',w);
 end if;
 if action in ('open_room','set_room_join','acknowledge_join','room_status') then
  select * into s from public.sessions where owner_key=w and name=payload->>'name' for update;
  if s.id is null then raise exception 'Game not found' using errcode='42501'; end if;
 end if;
 if action='open_room' then
  -- Players may join later, so a room can open before any players are added.
  if jsonb_array_length(s.factions)=0 or jsonb_array_length(s.factions)<jsonb_array_length(s.players) then
   raise exception 'Add factions first, at least one per player' using errcode='22023';
  end if;
  if s.room_code is null then
   update public.sessions set room_code=upper(encode(extensions.gen_random_bytes(12),'hex')) where id=s.id returning * into s;
  end if;
  insert into side_picker_private.rooms(session_id) values(s.id) on conflict do nothing;
  return to_jsonb(s);
 end if;
 if action in ('set_room_join','acknowledge_join','room_status') then
  select * into r from side_picker_private.rooms where session_id=s.id;
  if r.session_id is null then raise exception 'Open the room first' using errcode='22023'; end if;
 end if;
 if action='set_room_join' then
  if jsonb_typeof(payload->'join_open') is distinct from 'boolean'
     or (payload->'min_players' is not null and payload->'min_players'<>'null'::jsonb and coalesce(payload->>'min_players','') !~ '^[0-9]{1,3}$')
     or (payload->'max_players' is not null and payload->'max_players'<>'null'::jsonb and coalesce(payload->>'max_players','') !~ '^[0-9]{1,3}$') then
   raise exception 'Invalid joining settings' using errcode='22023';
  end if;
  begin
   update side_picker_private.rooms set join_open=(payload->>'join_open')::boolean,
     min_players=nullif(payload->>'min_players','')::int, max_players=nullif(payload->>'max_players','')::int
   where session_id=s.id returning * into r;
  exception when check_violation then raise exception 'Use a player range from 1 to 100, with the minimum no higher than the maximum' using errcode='22023';
  end;
  return jsonb_build_object('open',r.join_open,'min',r.min_players,'max',r.max_players);
 elsif action='acknowledge_join' then
  -- The organizer is removing a joiner their device has seen; let the save remove them.
  update side_picker_private.room_joins set acknowledged=true where session_id=s.id and player_id=payload->>'player_id';
  return '{}'::jsonb;
 elsif action='room_status' then
  data := side_picker_private.workspace_rooms(action,credential,payload);
  return data || jsonb_build_object('join',jsonb_build_object('open',r.join_open,'min',r.min_players,'max',r.max_players),
   'joins',coalesce((select jsonb_agg(jsonb_build_object('id',j.player_id,'name',j.name) order by j.joined_at)
     from side_picker_private.room_joins j where j.session_id=s.id and not j.acknowledged
     and exists(select 1 from jsonb_array_elements(s.players) p where p->>'id'=j.player_id)),'[]'));
 end if;
 return side_picker_private.workspace_rooms(action,credential,payload);
end $$;

-- Guest API: unchanged from 005 except the join action and joining details in reads.
create or replace function public.sp_room(room text,player text,credential text,action text default 'read',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; r side_picker_private.rooms; expected text; chosen jsonb; mine jsonb; roster jsonb; prior side_picker_private.picks;
  joiner text; seats int; pid text;
begin
 if credential is null or credential !~ '^[0-9a-f]{64}$' or room is null or length(room)>100
    or player is null or length(player)>100 then raise exception 'Room link is invalid or expired' using errcode='42501'; end if;
 select * into s from public.sessions where room_code=room for update;
 select * into r from side_picker_private.rooms where session_id=s.id;
 expected := encode(extensions.hmac(convert_to(player,'UTF8'),r.seed,'sha256'),'hex');
 if expected is null or expected<>credential then raise exception 'Room link is invalid or expired' using errcode='42501'; end if;
 select p into chosen from jsonb_array_elements(s.players) p where p->>'id'=player;
 if player<>'' and chosen is null then raise exception 'Player is no longer in this game' using errcode='42501'; end if;
 seats := least(coalesce(r.max_players,100),jsonb_array_length(s.factions));
 if action='join' then
  if player<>'' then raise exception 'You already have a seat in this session' using errcode='22023'; end if;
  if not r.join_open or s.results is not null or r.locked then
   raise exception 'Joining is closed. Ask the organizer for a player link.' using errcode='42501';
  end if;
  joiner := btrim(regexp_replace(coalesce(payload->>'name',''),'[[:cntrl:]]','','g'));
  if length(joiner) not between 1 and 60 then raise exception 'Enter a name of up to 60 characters' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(s.players) p where lower(p->>'name')=lower(joiner)) then
   raise exception 'Someone named % has already joined. Add an initial or a nickname.',joiner using errcode='22023';
  end if;
  if jsonb_array_length(s.players)>=seats then raise exception 'This session is full' using errcode='22023'; end if;
  pid := 'player-'||gen_random_uuid()::text;
  perform set_config('side_picker.joining','on',true);
  update public.sessions set players=players || jsonb_build_array(jsonb_build_object('id',pid,'name',joiner,'preferences','[]'::jsonb,
    'bans','[]'::jsonb,'noPreference',false,'locked',false,'expanded',false,'joined',true)) where id=s.id;
  perform set_config('side_picker.joining','off',true);
  insert into side_picker_private.room_joins(session_id,player_id,name) values(s.id,pid,joiner);
  return jsonb_build_object('player_id',pid,'player_name',joiner,'token',encode(extensions.hmac(convert_to(pid,'UTF8'),r.seed,'sha256'),'hex'));
 end if;
 select * into prior from side_picker_private.picks where session_id=s.id and player_id=player;
 if action='submit' then
  if player='' or s.results is not null or r.locked then raise exception 'Picking is closed or this is a viewing link' using errcode='42501'; end if;
  if payload is null or octet_length(payload::text)>120000 or not side_picker_private.valid_picks
     (s.factions,payload->'preferences',payload->'bans',payload->'no_preference') then raise exception 'Invalid choices. Refresh the room and try again.' using errcode='22023'; end if;
  if not payload ? 'expected_pick' or payload->>'expected_room' is distinct from r.revision::text
     or payload->>'expected_pick' is distinct from to_jsonb(prior.updated_at)#>>'{}' then
   raise exception 'The room or your saved choices changed. Review the latest choices before submitting.' using errcode='40001';
  end if;
  insert into side_picker_private.picks(session_id,player_id,preferences,bans,no_preference)
  values(s.id,player,payload->'preferences',payload->'bans',(payload->>'no_preference')::boolean)
  on conflict(session_id,player_id) do update set preferences=excluded.preferences,bans=excluded.bans,
    no_preference=excluded.no_preference,source='player',updated_at=clock_timestamp();
 elsif action<>'read' then raise exception 'Unknown operation' using errcode='22023'; end if;
 select to_jsonb(k)-'session_id' into mine from side_picker_private.picks k where k.session_id=s.id and k.player_id=player;
 select jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','submitted',exists
   (select 1 from side_picker_private.picks k where k.session_id=s.id and k.player_id=p->>'id' and source='player'))) into roster from jsonb_array_elements(s.players) p;
 return jsonb_build_object('session_name',s.session_name,'game_title',s.game_title,'factions',s.factions,'players',coalesce(roster,'[]'),
 'results',s.results,'mine',mine,'player_name',chosen->>'name','initial_choices',case when player<>'' then side_picker_private.filtered_choices(chosen,s.factions) else null end,
 'revision',r.revision,'stage',case when s.results is not null then 'published' when r.locked then 'locked' else 'collecting' end,
 'join',jsonb_build_object('open',r.join_open and s.results is null and not r.locked,'min',r.min_players,'max',seats,'taken',jsonb_array_length(s.players)));
end $$;

revoke all on all functions in schema side_picker_private from public,anon,authenticated;
revoke all on function public.sp_workspace(text,text,jsonb),public.sp_room(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sp_workspace(text,text,jsonb),public.sp_room(text,text,text,text,jsonb) to anon,authenticated;
commit;
