-- Isolated, rolled-back account checks. Run after migration 006.
-- Two sample auth users and every workspace/key below disappear on rollback.
begin;
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-00000000000a','account-a@example.invalid','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000000b','account-b@example.invalid','authenticated','authenticated');
create function pg_temp.as_user(u text,anonymous boolean default false) returns void language sql as $$
 select set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated','is_anonymous',anonymous)::text,true)
$$;
create function pg_temp.key_hash(k text) returns text language sql as $$ select encode(extensions.digest(k,'sha256'),'hex') $$;

set local role anon;
do $$ begin
 begin perform public.sp_account('list'); raise exception 'Anonymous role reached accounts';
 exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
do $$
declare a text := '00000000-0000-4000-8000-00000000000a'; b text := '00000000-0000-4000-8000-00000000000b';
 link text := encode(extensions.gen_random_bytes(32),'hex'); device text := encode(extensions.gen_random_bytes(32),'hex');
 device2 text := encode(extensions.gen_random_bytes(32),'hex'); device3 text := encode(extensions.gen_random_bytes(32),'hex');
 other text := encode(extensions.gen_random_bytes(32),'hex');
 owner text; game jsonb; saved jsonb; listed jsonb; link_id text;
begin
 perform pg_temp.as_user(a);
 owner := public.sp_workspace('create',link)->>'owner_key';
 game := '{"name":"Account fixture","session_name":"Test only","factions":["A","B"],"players":[{"id":"p1","name":"Alex","preferences":[],"bans":[]}]}';
 saved := public.sp_workspace('save_session',link,game || jsonb_build_object('expected_version',null,'operation_id',gen_random_uuid()));

 -- Nothing is listed or openable before proof of control.
 if jsonb_array_length(public.sp_account('list')->'workspaces')<>0 then raise exception 'Unproven workspace listed'; end if;
 begin perform public.sp_account('open',jsonb_build_object('owner_key',owner,'token_hash',pg_temp.key_hash(device)));
  raise exception 'Opened a workspace without proof'; exception when insufficient_privilege then null; end;
 begin perform public.sp_account('attach',jsonb_build_object('credential',other));
  raise exception 'Attached an unknown link'; exception when insufficient_privilege then null; end;

 perform public.sp_account('attach',jsonb_build_object('credential',link));
 perform public.sp_account('attach',jsonb_build_object('credential',link));
 listed := public.sp_account('list',jsonb_build_object('credential',link))->'workspaces';
 if jsonb_array_length(listed)<>1 or listed->0->'sessions'->0->>'session_name'<>'Test only'
  or jsonb_array_length(listed->0->'keys')<>1 or listed->0->'keys'->0->>'kind'<>'link' or (listed->0->'keys'->0->>'current')::boolean is not true then
  raise exception 'Attached workspace summary is wrong: %',listed;
 end if;
 link_id := listed->0->'keys'->0->>'id';

 -- A device key opens the same games, and version checks still span keys.
 perform public.sp_account('open',jsonb_build_object('owner_key',owner,'token_hash',pg_temp.key_hash(device),'label',E'Test\nbrowser'));
 if public.sp_workspace('load',device)->>'owner_key'<>owner then raise exception 'Device key did not open the workspace'; end if;
 perform public.sp_workspace('save_session',device,game || jsonb_build_object('session_name','Changed','expected_version',saved->'save_version','operation_id',gen_random_uuid()));
 begin perform public.sp_workspace('save_session',link,game || jsonb_build_object('expected_version',saved->'save_version','operation_id',gen_random_uuid()));
  raise exception 'Stale save accepted through another key'; exception when serialization_failure then null; end;
 listed := public.sp_account('list')->'workspaces';
 if (select k->>'label' from jsonb_array_elements(listed->0->'keys') k where k->>'kind'='device') is distinct from 'Testbrowser'
  or listed->0->'sessions'->0->>'session_name'<>'Changed' then raise exception 'Device label or save missing: %',listed; end if;

 -- Replacing a link replaces only the key that asked.
 perform public.sp_workspace('rotate',device,jsonb_build_object('token_hash',pg_temp.key_hash(device2)));
 begin perform public.sp_workspace('load',device); raise exception 'Replaced device key still works';
 exception when insufficient_privilege then null; end;
 perform public.sp_workspace('load',device2); perform public.sp_workspace('load',link);

 -- Another account cannot claim, list, open, revoke, unlink, or sign out these keys.
 perform pg_temp.as_user(b);
 begin perform public.sp_account('attach',jsonb_build_object('credential',link));
  raise exception 'Second account claimed games'; exception when insufficient_privilege then null; end;
 if jsonb_array_length(public.sp_account('list')->'workspaces')<>0 then raise exception 'Second account listed games'; end if;
 begin perform public.sp_account('open',jsonb_build_object('owner_key',owner,'token_hash',pg_temp.key_hash(other)));
  raise exception 'Second account opened games'; exception when insufficient_privilege then null; end;
 begin perform public.sp_account('revoke_key',jsonb_build_object('id',link_id));
  raise exception 'Second account revoked a key'; exception when insufficient_privilege then null; end;
 begin perform public.sp_account('unlink',jsonb_build_object('owner_key',owner));
  raise exception 'Second account unlinked games'; exception when insufficient_privilege then null; end;
 if (public.sp_account('forget_device',jsonb_build_object('credential',device2))->>'forget')::boolean then raise exception 'Second account signed out a device'; end if;
 perform public.sp_workspace('load',device2);
 begin perform public.sp_account('revoke_key',jsonb_build_object('id','not-a-uuid'));
  raise exception 'Invalid key id accepted'; exception when invalid_parameter_value then null; end;
 perform pg_temp.as_user(b,true);
 begin perform public.sp_account('list'); raise exception 'Anonymous sign-in reached accounts';
 exception when insufficient_privilege then null; end;

 -- The owner can revoke the shareable link; the device key keeps working.
 perform pg_temp.as_user(a);
 perform public.sp_account('revoke_key',jsonb_build_object('id',link_id));
 begin perform public.sp_workspace('load',link); raise exception 'Revoked link still works';
 exception when insufficient_privilege then null; end;

 -- Unlinking leaves device keys as ordinary organizer links.
 perform public.sp_account('unlink',jsonb_build_object('owner_key',owner));
 if jsonb_array_length(public.sp_account('list')->'workspaces')<>0 then raise exception 'Unlinked games still listed'; end if;
 perform public.sp_workspace('load',device2);

 -- Signing out removes this browser's device key.
 perform public.sp_account('attach',jsonb_build_object('credential',device2));
 if not (public.sp_account('forget_device',jsonb_build_object('credential',device2))->>'forget')::boolean then raise exception 'Sign-out kept account games'; end if;
 begin perform public.sp_workspace('load',device2); raise exception 'Signed-out device key still works';
 exception when insufficient_privilege then null; end;

 -- With no key left, only the account can open these games, so removal is refused.
 begin perform public.sp_account('unlink',jsonb_build_object('owner_key',owner));
  raise exception 'Unlinked unreachable games'; exception when invalid_parameter_value then null; end;
 begin perform public.sp_account('delete_account');
  raise exception 'Deleted account holding unreachable games'; exception when invalid_parameter_value then null; end;

 -- Deleting the account keeps open devices working as ordinary links.
 perform public.sp_account('open',jsonb_build_object('owner_key',owner,'token_hash',pg_temp.key_hash(device3)));
 perform public.sp_account('delete_account');
 if public.sp_workspace('load',device3)->>'owner_key'<>owner then raise exception 'Device lost access after account deletion'; end if;

 -- Without the owning account, replacing a link resets all other access, so a
 -- leaked link attached to another account cannot outlive the replacement.
 perform pg_temp.as_user(b);
 perform public.sp_account('attach',jsonb_build_object('credential',device3));
 perform public.sp_account('open',jsonb_build_object('owner_key',owner,'token_hash',pg_temp.key_hash(other)));
 perform pg_temp.as_user(gen_random_uuid()::text);
 perform public.sp_workspace('rotate',device3,jsonb_build_object('token_hash',pg_temp.key_hash(device)));
 begin perform public.sp_workspace('load',other); raise exception 'Another account kept access after a link reset';
 exception when insufficient_privilege then null; end;
 perform public.sp_workspace('load',device);
 perform pg_temp.as_user(b);
 if jsonb_array_length(public.sp_account('list')->'workspaces')<>0 then raise exception 'Account ownership survived a link reset'; end if;
 perform set_config('sp_test.owner',owner,true);
end $$;

reset role;
do $$ begin
 if exists(select 1 from auth.users where id='00000000-0000-4000-8000-00000000000a') then raise exception 'Account was not deleted'; end if;
 if exists(select 1 from side_picker_private.account_workspaces where owner_key=current_setting('sp_test.owner')) then raise exception 'Account link survived deletion'; end if;
 if exists(select 1 from side_picker_private.workspaces where owner_key=current_setting('sp_test.owner') and user_id is not null) then raise exception 'Device key kept a deleted user'; end if;
 if has_function_privilege('anon','public.sp_account(text,jsonb)','EXECUTE') or not has_function_privilege('authenticated','public.sp_account(text,jsonb)','EXECUTE') then
  raise exception 'Account API grants are wrong';
 end if;
 if has_schema_privilege('authenticated','side_picker_private','USAGE') then raise exception 'Private schema exposed'; end if;
end $$;
rollback;
select 'PASS: account proof, ownership, device keys, sign-out, unlink, and deletion checks rolled back' as result;
