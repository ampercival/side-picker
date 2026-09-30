-- Run once after 008. Add tied competition ranks without rewriting saved games.
begin;
create table side_picker_private.before_tied_preferences as
select 'sessions'::text as source,to_jsonb(t) as record from public.sessions t
union all select 'picks',to_jsonb(t) from side_picker_private.picks t;
alter table side_picker_private.before_tied_preferences enable row level security;
revoke all on side_picker_private.before_tied_preferences from public,anon,authenticated;
alter table side_picker_private.picks add column preference_ranks jsonb;

create function side_picker_private.valid_ranks(p jsonb,r jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare v jsonb; i int:=0; previous_rank int:=0; current_rank int;
begin
 if r is null then return true; end if; -- Older clients and existing saves have distinct ranks.
 if jsonb_typeof(r) is distinct from 'array' then return false; end if;
 if jsonb_array_length(r)<>jsonb_array_length(p) then return false; end if;
 for v in select * from jsonb_array_elements(r) loop
  i:=i+1;
  if jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]{1,3}$' then return false; end if;
  current_rank:=(v::text)::int;
  if current_rank<1 or (i=1 and current_rank<>1) or (i>1 and current_rank<>previous_rank and current_rank<>i) then return false; end if;
  previous_rank:=current_rank;
 end loop;
 return true;
end $$;
alter table side_picker_private.picks add constraint picks_valid_ranks check(side_picker_private.valid_ranks(preferences,preference_ranks));

create or replace function side_picker_private.filtered_choices(p jsonb,f jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare item record; prefs jsonb:='[]'; ranks jsonb:='[]'; old_ranks jsonb; old_rank int; prior_rank int; new_rank int;
begin
 old_ranks:=coalesce(p->'preferenceRanks',nullif(p->'preference_ranks','null'::jsonb));
 for item in select value,ordinality from jsonb_array_elements(p->'preferences') with ordinality loop
  if f @> jsonb_build_array(item.value) then
   old_rank:=coalesce((old_ranks->>(item.ordinality::int-1))::int,item.ordinality::int);
   if prior_rank is distinct from old_rank then new_rank:=jsonb_array_length(prefs)+1; end if;
   prefs:=prefs||jsonb_build_array(item.value); ranks:=ranks||jsonb_build_array(new_rank); prior_rank:=old_rank;
  end if;
 end loop;
 return jsonb_build_object('preferences',prefs,'preferenceRanks',ranks,
  'bans',coalesce((select jsonb_agg(v) from jsonb_array_elements(p->'bans') v where f @> jsonb_build_array(v)),'[]'),
  'noPreference',coalesce(p->'noPreference',p->'no_preference','false'));
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
            or not side_picker_private.valid_ranks(p->'preferences',p->'preferenceRanks')
            or not side_picker_private.valid_picks(v->'factions',p->'preferences',p->'bans',coalesce(p->'noPreference','false')) then
            raise exception 'Invalid player choices' using errcode='22023';
        end if;
    end loop;
end $$;

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
      no_preference=(choices->>'noPreference')::boolean,preference_ranks=choices->'preferenceRanks',source='organizer',updated_at=clock_timestamp()
      where session_id=new.id and player_id=p->>'id' returning * into current_pick;
   end if;
   p := p || choices || jsonb_build_object('submittedAt',current_pick.updated_at,'submittedSource',current_pick.source,
       'submittedChoices',jsonb_build_array(choices->'preferences',choices->'bans',choices->'noPreference',choices->'preferenceRanks'));
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
  if not side_picker_private.valid_ranks(payload->'preferences',payload->'preference_ranks') then
   raise exception 'Invalid preference ranks' using errcode='22023';
  end if;
  if not payload ? 'expected_pick' or payload->>'expected_room' is distinct from r.revision::text
     or payload->>'expected_pick' is distinct from to_jsonb(prior.updated_at)#>>'{}' then
   raise exception 'The room or your saved choices changed. Review the latest choices before submitting.' using errcode='40001';
  end if;
  insert into side_picker_private.picks(session_id,player_id,preferences,bans,no_preference,preference_ranks)
  values(s.id,player,payload->'preferences',payload->'bans',(payload->>'no_preference')::boolean,payload->'preference_ranks')
  on conflict(session_id,player_id) do update set preferences=excluded.preferences,bans=excluded.bans,
    no_preference=excluded.no_preference,preference_ranks=excluded.preference_ranks,source='player',updated_at=clock_timestamp();
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
-- CREATE OR REPLACE preserves the existing public RPC grants.
commit;
