-- Isolated, rolled-back account checks. Run after migration 007.
-- Three sample auth users and every workspace/key below disappear on rollback.
begin;
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-00000000000a','account-a@example.invalid','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000000b','account-b@example.invalid','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000000c','account-c@example.invalid','authenticated','authenticated');
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

 -- The signed-in owner replacing a link replaces only that key.
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

-- Account games everywhere: start once, then merge other games into them.
do $$
declare c text := '00000000-0000-4000-8000-00000000000c'; b text := '00000000-0000-4000-8000-00000000000b';
 device text := encode(extensions.gen_random_bytes(32),'hex'); second text := encode(extensions.gen_random_bytes(32),'hex');
 local text := encode(extensions.gen_random_bytes(32),'hex'); extra text := encode(extensions.gen_random_bytes(32),'hex');
 foreign_link text := encode(extensions.gen_random_bytes(32),'hex');
 mine text; other text; game jsonb; opened jsonb; invite jsonb; moved jsonb; listed jsonb;
begin
 perform pg_temp.as_user(c);
 mine := public.sp_account('start',jsonb_build_object('token_hash',pg_temp.key_hash(device),'label','Phone'))->>'owner_key';
 begin perform public.sp_account('start',jsonb_build_object('token_hash',pg_temp.key_hash(second)));
  raise exception 'Started a second set of account games'; exception when invalid_parameter_value then null; end;
 game := '{"name":"Game night","session_name":"Game night","factions":["A","B"],"players":[{"id":"p1","name":"Alex","preferences":[],"bans":[]}]}';
 perform public.sp_workspace('save_session',device,game || jsonb_build_object('expected_version',null,'operation_id',gen_random_uuid()));

 -- Games made in a browser before signing in move in with their live room intact.
 other := public.sp_workspace('create',local)->>'owner_key';
 perform public.sp_workspace('save_session',local,game || jsonb_build_object('expected_version',null,'operation_id',gen_random_uuid()));
 perform public.sp_workspace('save_preset',local,jsonb_build_object('name','Favourite','factions','["A"]'::jsonb,'expected_version',null,'operation_id',gen_random_uuid()));
 opened := public.sp_workspace('open_room',local,game);
 invite := public.sp_workspace('invite',local,game || '{"player_id":"p1"}');
 begin perform public.sp_account('merge',jsonb_build_object('owner_key',other,'credential',local));
  raise exception 'Merged into games outside the account'; exception when insufficient_privilege then null; end;
 moved := public.sp_account('merge',jsonb_build_object('owner_key',mine,'credential',local));
 if (moved->>'sessions')::int<>1 or (moved->>'presets')::int<>1 then raise exception 'Merge moved the wrong rows: %',moved; end if;
 begin perform public.sp_workspace('load',local); raise exception 'Merged link still works';
 exception when insufficient_privilege then null; end;
 listed := public.sp_account('list',jsonb_build_object('credential',device))->'workspaces';
 if jsonb_array_length(listed)<>1 or jsonb_array_length(listed->0->'sessions')<>2 or listed->0->'presets'<>'["Favourite"]'::jsonb
  or not exists(select 1 from jsonb_array_elements(listed->0->'sessions') x where x->>'name'='Game night (2)') then
  raise exception 'Merged games missing or not renamed: %',listed;
 end if;
 if public.sp_room(opened->>'room_code','p1',invite->>'token')->>'player_name'<>'Alex' then raise exception 'Live room lost in merge'; end if;

 -- A player keeps a valid personal invitation; replacing player links retires it.
 begin perform public.sp_account('save_invite',jsonb_build_object('room',opened->>'room_code','player','p1','token',repeat('0',64)));
  raise exception 'Saved a forged invitation'; exception when insufficient_privilege then null; end;
 begin perform public.sp_account('save_invite',jsonb_build_object('room',opened->>'room_code','player','','token',invite->>'token'));
  raise exception 'Saved a viewing link as a player'; exception when invalid_parameter_value then null; end;
 perform public.sp_account('save_invite',jsonb_build_object('room',opened->>'room_code','player','p1','token',invite->>'token'));
 listed := public.sp_account('list')->'invitations';
 if jsonb_array_length(listed)<>1 or listed->0->>'player_name'<>'Alex' or (listed->0->>'current')::boolean is not true or listed->0->>'stage'<>'collecting' then
  raise exception 'Saved invitation summary is wrong: %',listed;
 end if;
 if public.sp_account('open_invite',jsonb_build_object('session_id',listed->0->>'session_id','player_id','p1'))->>'token'<>invite->>'token' then
  raise exception 'Saved invitation did not reopen';
 end if;
 perform pg_temp.as_user(b);
 begin perform public.sp_account('open_invite',jsonb_build_object('session_id',listed->0->>'session_id','player_id','p1'));
  raise exception 'Another account opened a saved invitation'; exception when insufficient_privilege then null; end;
 perform pg_temp.as_user(c);
 perform public.sp_workspace('reset_room_links',device,'{"name":"Game night (2)"}');
 if (public.sp_account('list')->'invitations'->0->>'current')::boolean then raise exception 'Replaced invitation still current'; end if;
 begin perform public.sp_account('open_invite',jsonb_build_object('session_id',listed->0->>'session_id','player_id','p1'));
  raise exception 'Replaced invitation reopened'; exception when insufficient_privilege then null; end;
 invite := public.sp_workspace('invite',device,'{"name":"Game night (2)","player_id":"p1"}');
 perform public.sp_account('save_invite',jsonb_build_object('room',opened->>'room_code','player','p1','token',invite->>'token'));
 if not (public.sp_account('list')->'invitations'->0->>'current')::boolean then raise exception 'Fresh invitation not current'; end if;
 perform public.sp_account('forget_invite',jsonb_build_object('session_id',listed->0->>'session_id','player_id','p1'));
 if jsonb_array_length(public.sp_account('list')->'invitations')<>0 then raise exception 'Forgotten invitation still listed'; end if;

 -- A second account workspace folds into the first by owner key.
 perform public.sp_workspace('create',extra);
 perform public.sp_account('attach',jsonb_build_object('credential',extra));
 other := public.sp_workspace('load',extra)->>'owner_key';
 perform public.sp_account('merge',jsonb_build_object('owner_key',mine,'source_owner_key',other));
 if jsonb_array_length(public.sp_account('list')->'workspaces')<>1 then raise exception 'Account still has two sets of games'; end if;

 -- Another account's games cannot be pulled in, even with their link.
 perform pg_temp.as_user(b);
 perform public.sp_account('start',jsonb_build_object('token_hash',pg_temp.key_hash(foreign_link)));
 perform pg_temp.as_user(c);
 begin perform public.sp_account('merge',jsonb_build_object('owner_key',mine,'credential',foreign_link));
  raise exception 'Merged another account''s games'; exception when insufficient_privilege then null; end;
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
select 'PASS: account proof, ownership, device keys, start, merge, saved invitations, sign-out, unlink, and deletion checks rolled back' as result;
