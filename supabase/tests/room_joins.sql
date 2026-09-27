-- Isolated, rolled-back checks for joining from the group link. Run after migration 008.
begin;
create function pg_temp.save(c text, game jsonb) returns jsonb language plpgsql as $$
declare v jsonb; begin
 select s->'save_version' into v from jsonb_array_elements(public.sp_workspace('load',c)->'sessions') s where s->>'name'=game->>'name';
 return public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',v,'operation_id',gen_random_uuid()));
end $$;
set local role anon;
do $$
declare c text := encode(extensions.gen_random_bytes(32),'hex'); other text := encode(extensions.gen_random_bytes(32),'hex');
 game jsonb := '{"name":"Join fixture","session_name":"Open table","factions":["A","B","C"],"players":[]}';
 opened jsonb; viewer jsonb; sam jsonb; kim jsonb; row jsonb; status jsonb; code text; fresh jsonb;
begin
 perform public.sp_workspace('create',c); perform public.sp_workspace('create',other);
 perform pg_temp.save(c,game);
 -- A room can open before anyone is added.
 opened := public.sp_workspace('open_room',c,game); code := opened->>'room_code';
 viewer := public.sp_workspace('invite',c,game);
 begin perform public.sp_room(code,'',viewer->>'token','join','{"name":"Sam"}'); raise exception 'Joined while joining was off';
 exception when insufficient_privilege then null; end;
 begin perform public.sp_workspace('set_room_join',other,jsonb_build_object('name','Join fixture','join_open',true,'min_players',2,'max_players',2));
  raise exception 'Another organizer changed joining'; exception when insufficient_privilege then null; end;
 begin perform public.sp_workspace('set_room_join',c,jsonb_build_object('name','Join fixture','join_open',true,'min_players',3,'max_players',2));
  raise exception 'Accepted a minimum above the maximum'; exception when invalid_parameter_value then null; end;
 perform public.sp_workspace('set_room_join',c,jsonb_build_object('name','Join fixture','join_open',true,'min_players',2,'max_players',5));
 if (public.sp_room(code,'',viewer->>'token')->'join'->>'max')::int<>3 then raise exception 'Seats not capped at the number of factions'; end if;

 -- Joining gives a normal personal invitation; names are trimmed and must be distinct.
 sam := public.sp_room(code,'',viewer->>'token','join','{"name":"  Sam "}');
 if sam->>'player_name'<>'Sam' then raise exception 'Name not trimmed'; end if;
 if public.sp_workspace('invite',c,game || jsonb_build_object('player_id',sam->>'player_id'))->>'token'<>sam->>'token' then
  raise exception 'Join did not return the personal invitation';
 end if;
 begin perform public.sp_room(code,'',viewer->>'token','join','{"name":"sam"}'); raise exception 'Duplicate name joined';
 exception when invalid_parameter_value then null; end;
 begin perform public.sp_room(code,'',viewer->>'token','join','{"name":"   "}'); raise exception 'Empty name joined';
 exception when invalid_parameter_value then null; end;
 begin perform public.sp_room(code,sam->>'player_id',sam->>'token','join','{"name":"Again"}'); raise exception 'A seated player joined twice';
 exception when invalid_parameter_value then null; end;

 -- The joined player can pick at once, before the organizer's device has seen them.
 fresh := public.sp_room(code,sam->>'player_id',sam->>'token');
 perform public.sp_room(code,sam->>'player_id',sam->>'token','submit',jsonb_build_object('preferences','["A"]'::jsonb,
   'bans','[]'::jsonb,'no_preference',false,'expected_pick',null,'expected_room',fresh->'revision'));
 status := public.sp_workspace('room_status',c,jsonb_build_object('name','Join fixture'));
 if status->'joins'->0->>'name'<>'Sam' or (status->'join'->>'open')::boolean is not true then raise exception 'Unseen join missing from room status: %',status; end if;
 -- An organizer save with an older player list keeps Sam and his pick.
 row := pg_temp.save(c,game);
 if jsonb_array_length(row->'players')<>1 or row->'players'->0->'preferences'<>'["A"]'::jsonb then raise exception 'Older player list dropped the joiner: %',row; end if;
 -- Saving a list that includes Sam marks him seen; a later list without him removes him.
 perform pg_temp.save(c,game || jsonb_build_object('players',row->'players'));
 if jsonb_array_length(public.sp_workspace('room_status',c,jsonb_build_object('name','Join fixture'))->'joins')<>0 then raise exception 'Seen join still listed'; end if;
 row := pg_temp.save(c,game);
 if jsonb_array_length(row->'players')<>0 then raise exception 'Organizer could not remove a seen joiner'; end if;
 begin perform public.sp_room(code,sam->>'player_id',sam->>'token'); raise exception 'Removed joiner kept access';
 exception when insufficient_privilege then null; end;

 -- A joiner the organizer removes right away is acknowledged first, then removed.
 kim := public.sp_room(code,'',viewer->>'token','join','{"name":"Kim"}');
 perform public.sp_workspace('acknowledge_join',c,jsonb_build_object('name','Join fixture','player_id',kim->>'player_id'));
 row := pg_temp.save(c,game);
 if jsonb_array_length(row->'players')<>0 then raise exception 'Acknowledged joiner was kept'; end if;

 -- Seats fill up, and closing picking closes joining.
 perform public.sp_room(code,'',viewer->>'token','join','{"name":"One"}');
 perform public.sp_room(code,'',viewer->>'token','join','{"name":"Two"}');
 perform public.sp_room(code,'',viewer->>'token','join','{"name":"Three"}');
 begin perform public.sp_room(code,'',viewer->>'token','join','{"name":"Four"}'); raise exception 'Joined a full session';
 exception when invalid_parameter_value then null; end;
 row := (select s from jsonb_array_elements(public.sp_workspace('load',c)->'sessions') s where s->>'name'='Join fixture');
 perform public.sp_workspace('set_room_stage',c,jsonb_build_object('name','Join fixture','stage','locked','expected_version',row->'save_version'));
 if (public.sp_room(code,'',viewer->>'token')->'join'->>'open')::boolean then raise exception 'Closed picking still open for joining'; end if;
end $$;
reset role;
rollback;
select 'PASS: open rooms, join settings, seats, distinct names, early picks, unseen joins kept, seen joins removable; rolled back' as result;
