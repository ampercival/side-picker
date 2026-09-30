-- Isolated RPC round trip and validation; leaves no sample data behind.
begin;
set local role anon;
do $$
declare c text:=encode(extensions.gen_random_bytes(32),'hex'); game jsonb; saved jsonb; invite jsonb; guest jsonb; request jsonb; bad jsonb;
begin
 perform public.sp_workspace('create',c);
 game:='{"name":"Tied ranks fixture","factions":["A","B","C","D","E","F"],"players":[{"id":"p","name":"Alex","preferences":[],"bans":[]}]}';
 saved:=public.sp_workspace('save_session',c,game||jsonb_build_object('expected_version',null,'operation_id',gen_random_uuid()));
 saved:=public.sp_workspace('open_room',c,game);
 invite:=public.sp_workspace('invite',c,game||'{"player_id":"p"}');
 guest:=public.sp_room(saved->>'room_code','p',invite->>'token');
 request:=jsonb_build_object('preferences','["A","B","C","D","E","F"]'::jsonb,'preference_ranks','[1,1,3,3,3,6]'::jsonb,
  'bans','[]'::jsonb,'no_preference',false,'expected_pick',null,'expected_room',guest->'revision');
 guest:=public.sp_room(saved->>'room_code','p',invite->>'token','submit',request);
 if guest->'mine'->'preference_ranks'<>'[1,1,3,3,3,6]'::jsonb then raise exception 'Guest ties lost'; end if;
 saved:=public.sp_workspace('save_session',c,saved||jsonb_build_object('expected_version',saved->'save_version','operation_id',gen_random_uuid()));
 if saved->'players'->0->'preferenceRanks'<>'[1,1,3,3,3,6]'::jsonb then raise exception 'Host merge lost ties'; end if;
 -- Edits only to ranks participate in concurrency checks.
 request:=request||jsonb_build_object('preference_ranks','[1,2,3,3,3,6]'::jsonb,'expected_pick',guest->'mine'->'updated_at');
 guest:=public.sp_room(saved->>'room_code','p',invite->>'token','submit',request);
 game:=jsonb_set(saved,'{players,0,preferenceRanks}','[1,1,1,4,5,6]');
 begin
  perform public.sp_workspace('save_session',c,game||jsonb_build_object('expected_version',saved->'save_version','operation_id',gen_random_uuid()));
  raise exception 'Competing rank edit accepted';
 exception when serialization_failure then null; end;
 saved:=public.sp_workspace('save_session',c,saved||jsonb_build_object('expected_version',saved->'save_version','operation_id',gen_random_uuid()));
 game:=jsonb_set(saved,'{players,0,preferenceRanks}','[1,1,3,3,3,6]');
 saved:=public.sp_workspace('save_session',c,game||jsonb_build_object('expected_version',saved->'save_version','operation_id',gen_random_uuid()));
 guest:=public.sp_room(saved->>'room_code','p',invite->>'token');
 if guest->'mine'->'preference_ranks'<>'[1,1,3,3,3,6]'::jsonb or guest->'mine'->>'source'<>'organizer' then raise exception 'Organizer ties not returned'; end if;
 request:=request||jsonb_build_object('expected_pick',guest->'mine'->'updated_at');
 for bad in select value from jsonb_array_elements('[[1,1,2,4,5,6],[0,2,3,4,5,6],[1],{},null,[1,2,3,4,5,"6"]]') loop
  begin
   perform public.sp_room(saved->>'room_code','p',invite->>'token','submit',request||jsonb_build_object('preference_ranks',bad));
   raise exception 'Invalid guest ranks accepted';
  exception when invalid_parameter_value then null; end;
  begin
   game:=jsonb_set(saved,'{players,0,preferenceRanks}',bad);
   perform public.sp_workspace('save_session',c,game||jsonb_build_object('expected_version',saved->'save_version','operation_id',gen_random_uuid()));
   raise exception 'Invalid host ranks accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 -- Removing a faction keeps remaining ties and compacts the consumed slots.
 game:=jsonb_set(saved,'{factions}','["B","C","D","E","F"]');
 game:=jsonb_set(game,'{players,0,preferences}','["B","C","D","E","F"]');
 game:=jsonb_set(game,'{players,0,preferenceRanks}','[1,2,2,2,5]');
 saved:=public.sp_workspace('save_session',c,game||jsonb_build_object('expected_version',saved->'save_version','operation_id',gen_random_uuid()));
 guest:=public.sp_room(saved->>'room_code','p',invite->>'token');
 if guest->'mine'->'preference_ranks'<>'[1,2,2,2,5]'::jsonb then raise exception 'Filtered ranks wrong'; end if;
 -- Legacy requests still mean strictly ordered preferences.
 request:=jsonb_build_object('preferences','["B","C"]'::jsonb,'bans','[]'::jsonb,'no_preference',false,
  'expected_pick',guest->'mine'->'updated_at','expected_room',guest->'revision');
 perform public.sp_room(saved->>'room_code','p',invite->>'token','submit',request);
end $$;
rollback;
select 'PASS: tied ranks, host/guest round trip, conflicts, validation, removal and legacy picks' as result;
