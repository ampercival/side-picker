-- Run once, after reliable saves. Existing data is retained in a private snapshot.
begin;
create table side_picker_private.before_room_lifecycle as
select 'sessions'::text as source,to_jsonb(t) as record from public.sessions t
union all select 'rooms',to_jsonb(t) from side_picker_private.rooms t
union all select 'picks',to_jsonb(t) from side_picker_private.picks t;
revoke all on side_picker_private.before_room_lifecycle from public,anon,authenticated;
alter table side_picker_private.rooms add column locked boolean not null default false;
alter table side_picker_private.rooms add column revision uuid not null default gen_random_uuid();
alter table side_picker_private.picks add column source text not null default 'player' check(source in ('player','organizer'));

create function side_picker_private.filtered_choices(p jsonb,f jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('preferences',coalesce((select jsonb_agg(v) from jsonb_array_elements(p->'preferences') v where f @> jsonb_build_array(v)),'[]'),
 'bans',coalesce((select jsonb_agg(v) from jsonb_array_elements(p->'bans') v where f @> jsonb_build_array(v)),'[]'),
 'noPreference',coalesce(p->'noPreference',p->'no_preference','false'))
$$;

-- A guest writes only their private pick row. Merge it when the organizer saves.
-- An unseen guest edit and a competing local host edit fail safely; the durable
-- journal retains the host's version for recovery as a separate game.
create function side_picker_private.reconcile_room() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb; before_p jsonb; choices jsonb; incoming jsonb; current_pick side_picker_private.picks; merged jsonb := '[]';
begin
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
create trigger reconcile_room before update of players,factions,results on public.sessions
for each row execute function side_picker_private.reconcile_room();

-- Keep the versioned/idempotent save API intact and add a narrow room control API.
alter function public.sp_workspace(text,text,jsonb) set schema side_picker_private;
alter function side_picker_private.sp_workspace(text,text,jsonb) rename to workspace_versioned;
create function public.sp_workspace(action text,credential text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare data jsonb; s public.sessions; r side_picker_private.rooms;
begin
 if action not in ('room_status','set_room_stage') then return side_picker_private.workspace_versioned(action,credential,payload); end if;
 -- Authenticate and take the same workspace/session locks as existing operations.
 data := side_picker_private.workspace_legacy('submissions',credential,payload);
 select t.* into s from public.sessions t join side_picker_private.workspaces w on w.owner_key=t.owner_key
 where w.token_hash=encode(extensions.digest(credential,'sha256'),'hex') and t.name=payload->>'name';
 select * into r from side_picker_private.rooms where session_id=s.id;
 if r.session_id is null then raise exception 'Open the room first' using errcode='22023'; end if;
 if action='set_room_stage' then
  if payload->>'stage' not in ('collecting','locked') or payload->>'stage' is null then raise exception 'Invalid room stage' using errcode='22023'; end if;
  if s.save_version::text is distinct from payload->>'expected_version' then raise exception 'Reload the latest game before changing the room' using errcode='40001'; end if;
  if s.results is not null then raise exception 'Clear results before reopening picking' using errcode='22023'; end if;
  if r.locked is distinct from (payload->>'stage'='locked') then
   update side_picker_private.rooms set locked=(payload->>'stage'='locked'),revision=gen_random_uuid() where session_id=s.id returning * into r;
  end if;
 end if;
 return jsonb_build_object('picks',data,'stage',case when s.results is not null then 'published' when r.locked then 'locked' else 'collecting' end,
 'save_version',s.save_version);
end $$;

create or replace function public.sp_room(room text,player text,credential text,action text default 'read',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; r side_picker_private.rooms; expected text; chosen jsonb; mine jsonb; roster jsonb; prior side_picker_private.picks;
begin
 if credential is null or credential !~ '^[0-9a-f]{64}$' or room is null or length(room)>100
    or player is null or length(player)>100 then raise exception 'Room link is invalid or expired' using errcode='42501'; end if;
 select * into s from public.sessions where room_code=room for update;
 select * into r from side_picker_private.rooms where session_id=s.id;
 expected := encode(extensions.hmac(convert_to(player,'UTF8'),r.seed,'sha256'),'hex');
 if expected is null or expected<>credential then raise exception 'Room link is invalid or expired' using errcode='42501'; end if;
 select p into chosen from jsonb_array_elements(s.players) p where p->>'id'=player;
 if player<>'' and chosen is null then raise exception 'Player is no longer in this game' using errcode='42501'; end if;
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
 'revision',r.revision,'stage',case when s.results is not null then 'published' when r.locked then 'locked' else 'collecting' end);
end $$;
revoke all on all functions in schema side_picker_private from public,anon,authenticated;
revoke all on function public.sp_workspace(text,text,jsonb),public.sp_room(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sp_workspace(text,text,jsonb),public.sp_room(text,text,text,text,jsonb) to anon,authenticated;
commit;
