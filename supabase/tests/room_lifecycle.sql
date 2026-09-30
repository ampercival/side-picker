-- Isolated, rolled-back room workflow. Run after migration 005.
begin;
set local role anon;
do $$
declare c text := encode(extensions.gen_random_bytes(32),'hex'); game jsonb; row jsonb; invite jsonb; guest jsonb; stale jsonb; request jsonb; status jsonb;
begin
 perform public.sp_workspace('create',c);
 game := '{"name":"Room lifecycle fixture","session_name":"Test","factions":["A","B","C"],"players":[{"id":"p1","name":"Alex","preferences":[],"bans":[]},{"id":"p2","name":"Jordan","preferences":[],"bans":[]}]}';
 row := public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',null,'operation_id',gen_random_uuid()));
 row := public.sp_workspace('open_room',c,game);
 invite := public.sp_workspace('invite',c,game || '{"player_id":"p1"}');
 guest := public.sp_room(row->>'room_code','p1',invite->>'token');
 request := jsonb_build_object('preferences','[]'::jsonb,'bans','[]'::jsonb,'no_preference',false,'expected_pick',null,'expected_room',guest->'revision');
 guest := public.sp_room(row->>'room_code','p1',invite->>'token','submit',request);
 if guest->'players'->0->>'submitted'<>'true' then raise exception 'Neutral submission missing'; end if;
 begin perform public.sp_room(row->>'room_code','p1',invite->>'token','submit',request); raise exception 'Stale guest accepted'; exception when serialization_failure then null; end;
 -- Merge unseen guest choices without discarding an unrelated rename.
 game := jsonb_set(game,'{players,0,name}','"Renamed"');
 row := public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',row->'save_version','operation_id',gen_random_uuid()));
 if row->'players'->0->>'submittedAt' is null then raise exception 'Submission not reconciled'; end if;
 game := row;
 -- Organizer override is visible to the guest and no longer claims guest submission.
 game := jsonb_set(game,'{players,0,preferences}','["A"]');
 game := jsonb_set(game,'{players,0,preferenceRanks}','[1]');
 row := public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',row->'save_version','operation_id',gen_random_uuid()));
 guest := public.sp_room(row->>'room_code','p1',invite->>'token');
 if guest->'mine'->'preferences'<>'["A"]'::jsonb or guest->'mine'->>'source'<>'organizer' or guest->>'player_name'<>'Renamed' then raise exception 'Organizer update not visible'; end if;
 stale := guest;
 status := public.sp_workspace('set_room_stage',c,jsonb_build_object('name',row->'name','stage','locked','expected_version',row->'save_version'));
 if status->>'stage'<>'locked' then raise exception 'Did not lock'; end if;
 request := request || jsonb_build_object('expected_pick',guest->'mine'->'updated_at','expected_room',guest->'revision');
 begin perform public.sp_room(row->>'room_code','p1',invite->>'token','submit',request); raise exception 'Locked room accepted picks'; exception when insufficient_privilege then null; end;
 perform public.sp_workspace('set_room_stage',c,jsonb_build_object('name',row->'name','stage','collecting','expected_version',row->'save_version'));
 begin perform public.sp_room(row->>'room_code','p1',invite->>'token','submit',request); raise exception 'Old room revision accepted'; exception when serialization_failure then null; end;
 guest := public.sp_room(row->>'room_code','p1',invite->>'token');
 request := request || jsonb_build_object('preferences','["B"]'::jsonb,'expected_room',guest->'revision');
 guest := public.sp_room(row->>'room_code','p1',invite->>'token','submit',request);
 -- A host who edited while offline cannot overwrite the newer guest choice.
 game := jsonb_set(row,'{players,0,preferences}','["C"]');
 begin
  perform public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',row->'save_version','operation_id',gen_random_uuid()));
  raise exception 'Competing host edit accepted';
 exception when serialization_failure then null; end;
 row := public.sp_workspace('save_session',c,row || jsonb_build_object('expected_version',row->'save_version','operation_id',gen_random_uuid()));
 if row->'players'->0->'preferences'<>'["B"]'::jsonb then raise exception 'Unseen guest edit lost'; end if;
 -- Removed factions are pruned and a new setup revision rejects late requests.
 game := jsonb_set(row,'{factions}','["A","C"]');
 game := jsonb_set(game,'{players,0,preferences}','[]');
 game := jsonb_set(game,'{players,0,preferenceRanks}','[]');
 row := public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',row->'save_version','operation_id',gen_random_uuid()));
 guest := public.sp_room(row->>'room_code','p1',invite->>'token');
 if guest->'mine'->'preferences'<>'[]'::jsonb then raise exception 'Removed faction retained'; end if;
 -- Published -> explicit clear reopens. Removed player invitation stops working.
 game := row || '{"results":{"v":1}}';
 row := public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',row->'save_version','operation_id',gen_random_uuid()));
 guest := public.sp_room(row->>'room_code','p1',invite->>'token');
 if guest->>'stage'<>'published' then raise exception 'Published state missing'; end if;
 begin perform public.sp_room(row->>'room_code','p1',invite->>'token','submit',request); raise exception 'Published room accepted picks'; exception when insufficient_privilege then null; end;
 row := public.sp_workspace('save_session',c,row || jsonb_build_object('results',null,'expected_version',row->'save_version','operation_id',gen_random_uuid()));
 if public.sp_room(row->>'room_code','p1',invite->>'token')->>'stage'<>'collecting' then raise exception 'Reopen failed'; end if;
 game := jsonb_set(row,'{players}',jsonb_build_array(row->'players'->1));
 row := public.sp_workspace('save_session',c,game || jsonb_build_object('expected_version',row->'save_version','operation_id',gen_random_uuid()));
 begin perform public.sp_room(row->>'room_code','p1',invite->>'token'); raise exception 'Removed player retained access'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: room lifecycle, revisions, reconciliation, locking, setup changes and removed players' as result;
