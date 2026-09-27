-- Isolated fixtures only. Everything (including workspace creation) rolls back.
begin;
-- Test adapter supplies current versions; REL-01 tests stale versions separately.
create function pg_temp.private_link_mutation(a text,c text,p jsonb) returns jsonb
language plpgsql as $$
declare data jsonb; v jsonb; begin
  data := public.sp_workspace('load',c);
  select row->'save_version' into v from jsonb_array_elements(data->'sessions') row where row->>'name'=p->>'name';
  return public.sp_workspace(a,c,p || jsonb_build_object('expected_version',v,'operation_id',gen_random_uuid()));
end $$;
create function pg_temp.room_request(r text,p text,c text,a text default 'read',v jsonb default '{}') returns jsonb
language plpgsql as $$
declare current_room jsonb; begin
 if a='submit' then
  current_room := public.sp_room(r,p,c);
  v := v || jsonb_build_object('expected_room',current_room->'revision','expected_pick',current_room->'mine'->'updated_at');
 end if;
 return public.sp_room(r,p,c,a,v);
end $$;
set local role anon;
do $$
declare a text := repeat('a',64); b text := repeat('b',64); c text := repeat('c',64);
    wa jsonb; wb jsonb; game jsonb; opened jsonb; invite jsonb; viewer jsonb; got jsonb; bad jsonb;
begin
    wa := public.sp_workspace('create',a);
    wb := public.sp_workspace('create',b);
    game := '{"name":"SEC02 isolated test","session_name":"Test only","factions":["A","B"],"players":[{"id":"p1","name":"Same name","preferences":[],"bans":[]},{"id":"p2","name":"Same name","preferences":[],"bans":[]}]}';
    perform pg_temp.private_link_mutation('save_session',a,game);
    got := public.sp_workspace('load',b,jsonb_build_object('owner_key',wa->>'owner_key'));
    if jsonb_array_length(got->'sessions')<>0 then raise exception 'Other organizer could read game'; end if;
    perform pg_temp.private_link_mutation('delete_session',b,jsonb_build_object('name',game->>'name','owner_key',wa->>'owner_key'));
    if jsonb_array_length(public.sp_workspace('load',a)->'sessions')<>1 then raise exception 'Other organizer deleted game'; end if;
    begin perform public.sp_workspace('load',repeat('d',64)); raise exception 'Invalid token accepted'; exception when insufficient_privilege then null; end;
    opened := public.sp_workspace('open_room',a,game);
    invite := public.sp_workspace('invite',a,game || '{"player_id":"p1"}');
    viewer := public.sp_workspace('invite',a,game);
    got := pg_temp.room_request(opened->>'room_code','p1',invite->>'token');
    if got ? 'owner_key' or got ? 'seed' or (got->'players'->0) ? 'preferences' then raise exception 'Guest read leaked private data'; end if;
    begin perform pg_temp.room_request(opened->>'room_code','p2',invite->>'token'); raise exception 'Player impersonation allowed'; exception when insufficient_privilege then null; end;
    begin perform pg_temp.room_request('UNKNOWN','p1',invite->>'token'); raise exception 'Unknown room accepted'; exception when insufficient_privilege then null; end;
    begin perform pg_temp.room_request(opened->>'room_code','',viewer->>'token','submit','{"preferences":[],"bans":[],"no_preference":false}'); raise exception 'Viewer write allowed'; exception when insufficient_privilege then null; end;
    for bad in select value from jsonb_array_elements('[
        {"preferences":["A","A"],"bans":[],"no_preference":false},
        {"preferences":["A"],"bans":["A"],"no_preference":false},
        {"preferences":["C"],"bans":[],"no_preference":false},
        {"preferences":[],"bans":[],"no_preference":null},
        {"preferences":{},"bans":[],"no_preference":false}
    ]') loop
        begin perform pg_temp.room_request(opened->>'room_code','p1',invite->>'token','submit',bad); raise exception 'Invalid picks accepted'; exception when invalid_parameter_value then null; end;
    end loop;
    got := pg_temp.room_request(opened->>'room_code','p1',invite->>'token','submit','{"preferences":[],"bans":[],"no_preference":false}');
    if got->'mine' is null or got->'players'->0->>'submitted'<>'true' then raise exception 'Neutral submission missing'; end if;
    got := pg_temp.room_request(opened->>'room_code','',viewer->>'token');
    if got->'mine'<>'null'::jsonb then raise exception 'Viewer could read private picks'; end if;
    -- Renaming does not transfer the invite to another person with the same name.
    game := jsonb_set(game,'{players,0,name}','"Renamed"');
    perform pg_temp.private_link_mutation('save_session',a,game);
    if pg_temp.room_request(opened->>'room_code','p1',invite->>'token')->>'player_name'<>'Renamed' then raise exception 'Stable identity lost'; end if;
    perform pg_temp.private_link_mutation('save_session',a,game || '{"results":{"v":1}}');
    begin perform pg_temp.room_request(opened->>'room_code','p1',invite->>'token','submit','{"preferences":[],"bans":[],"no_preference":false}'); raise exception 'Published room accepted picks'; exception when insufficient_privilege then null; end;
    perform pg_temp.private_link_mutation('save_session',a,game);
    perform public.sp_workspace('reset_room_links',a,game);
    begin perform pg_temp.room_request(opened->>'room_code','p1',invite->>'token'); raise exception 'Revoked player link worked'; exception when insufficient_privilege then null; end;
    invite := public.sp_workspace('invite',a,game || '{"player_id":"p1"}');
    game := jsonb_set(game,'{players}','[]');
    perform pg_temp.private_link_mutation('save_session',a,game);
    begin perform pg_temp.room_request(opened->>'room_code','p1',invite->>'token'); raise exception 'Removed player retained access'; exception when insufficient_privilege then null; end;
    perform public.sp_workspace('rotate',a,jsonb_build_object('token_hash',encode(sha256(convert_to(c,'UTF8')),'hex')));
    begin perform public.sp_workspace('load',a); raise exception 'Revoked organizer link worked'; exception when insufficient_privilege then null; end;
    if jsonb_array_length(public.sp_workspace('load',c)->'sessions')<>1 then raise exception 'Rotation lost game'; end if;
    if has_schema_privilege(current_user,'side_picker_private','USAGE') then raise exception 'Private schema exposed'; end if;
end $$;
reset role;
rollback;
select 'PASS: organizer isolation, scoped guests, validated picks, locking, stable identities, revocation; all test data rolled back' as result;
