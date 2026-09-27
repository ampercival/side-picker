-- Isolated data only; all test changes roll back.
begin;
set local role anon;
do $$
declare token text := encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  game jsonb := '{"name":"REL01 isolated game","factions":["A"],"players":[]}';
  request jsonb; first_save jsonb; second_save jsonb; p jsonb; q jsonb; reply jsonb;
begin
  perform public.sp_workspace('create',token);
  begin perform public.sp_workspace('save_session',token,game); raise exception 'Blind write accepted'; exception when invalid_parameter_value then null; end;
  request := game || jsonb_build_object('expected_version',null,'operation_id',gen_random_uuid());
  first_save := public.sp_workspace('save_session',token,request);
  second_save := public.sp_workspace('save_session',token,game || jsonb_build_object('game_title','Latest','expected_version',first_save->'save_version','operation_id',gen_random_uuid()));
  begin
    perform public.sp_workspace('save_session',token,game || jsonb_build_object('expected_version',first_save->'save_version','operation_id',gen_random_uuid()));
    raise exception 'Stale edit overwrote game';
  exception when serialization_failure then null; end;
  reply := public.sp_workspace('save_session',token,request);
  if reply<>first_save or public.sp_workspace('load',token)->'sessions'->0->>'game_title'<>'Latest' then raise exception 'Retry changed newer data'; end if;
  begin perform public.sp_workspace('save_session',token,request || '{"game_title":"Changed retry"}'); raise exception 'Reused id accepted changed body'; exception when invalid_parameter_value then null; end;
  begin perform public.sp_workspace('delete_session',token,jsonb_build_object('name',game->>'name','expected_version',first_save->'save_version','operation_id',gen_random_uuid())); raise exception 'Stale deletion allowed'; exception when serialization_failure then null; end;
  p := public.sp_workspace('save_preset',token,jsonb_build_object('name','Original','factions','["A"]'::jsonb,'expected_version',null,'operation_id',gen_random_uuid()));
  q := public.sp_workspace('save_preset',token,jsonb_build_object('name','Destination','factions','["B"]'::jsonb,'expected_version',null,'operation_id',gen_random_uuid()));
  request := jsonb_build_object('name','Destination','original_name','Original','factions','["A"]'::jsonb,'expected_version',p->'save_version','target_version',null,'operation_id',gen_random_uuid());
  begin perform public.sp_workspace('rename_preset',token,request); raise exception 'Rename overwrote changed target'; exception when serialization_failure then null; end;
  if jsonb_array_length(public.sp_workspace('load',token)->'presets')<>2 then raise exception 'Failed rename removed original'; end if;
  request := request || jsonb_build_object('target_version',q->'save_version');
  p := public.sp_workspace('rename_preset',token,request);
  q := public.sp_workspace('rename_preset',token,request);
  if p<>q or jsonb_array_length(public.sp_workspace('load',token)->'presets')<>1 then raise exception 'Atomic rename/retry failed'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','side_picker_private.workspace_legacy(text,text,jsonb)','EXECUTE') then raise exception 'Legacy write API exposed'; end if;
end $$;
rollback;
select 'PASS: stale saves/deletes rejected, blind writes rejected, retries idempotent, preset rename atomic; fixtures rolled back' as result;
