-- Run once, after 006. Signed-in people see one set of account games on every
-- device, and players can keep their invitations in an account:
--   start: create the account's games (a new workspace) with this device's key.
--   merge: move another workspace's games into the account's games. The source
--          is proven by an organizer key, or is another workspace of this account.
--   save_invite / open_invite / forget_invite: keep a personal player invitation.
--          Saving requires the valid invitation; opening recomputes it and fails
--          once the organizer replaces player links or removes that player.
-- Everything else is unchanged from 006.
begin;
create table side_picker_private.account_invitations (
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references public.sessions(id) on delete cascade,
 player_id text not null check (length(player_id) between 1 and 100),
 token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
 saved_at timestamptz not null default now(),
 primary key (user_id, session_id, player_id)
);
alter table side_picker_private.account_invitations enable row level security;
revoke all on side_picker_private.account_invitations from public,anon,authenticated;

create or replace function public.sp_account(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); h text; w text; b text; k side_picker_private.workspaces; key_id uuid; label text;
  item record; new_name text; n int; moved_sessions int := 0; moved_presets int := 0;
  s public.sessions; r side_picker_private.rooms; sid uuid; pid text; token text;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Sign in to use your account' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4000 then
  raise exception 'Invalid request' using errcode='22023';
 end if;
 if payload ? 'credential' then
  if coalesce(payload->>'credential','') !~ '^[0-9a-f]{64}$' then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
  h := encode(extensions.digest(payload->>'credential','sha256'),'hex');
 end if;
 label := nullif(left(btrim(regexp_replace(coalesce(payload->>'label',''),'[[:cntrl:]]','','g')),100),'');
 if action='list' then
  return jsonb_build_object('workspaces',coalesce((select jsonb_agg(jsonb_build_object(
   'owner_key',a.owner_key,'linked_at',a.linked_at,
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'session_name',s.session_name,'game_title',s.game_title,'updated_at',s.updated_at) order by s.updated_at desc)
     from public.sessions s where s.owner_key=a.owner_key),'[]'),
   'presets',coalesce((select jsonb_agg(p.name order by p.name) from public.presets p where p.owner_key=a.owner_key),'[]'),
   'keys',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'label',x.label,'created_at',x.created_at,
     'current',x.token_hash is not distinct from h) order by x.created_at) from side_picker_private.workspaces x where x.owner_key=a.owner_key),'[]')
   ) order by a.linked_at, a.owner_key) from side_picker_private.account_workspaces a where a.user_id=uid),'[]'),
  'invitations',coalesce((select jsonb_agg(jsonb_build_object('session_id',i.session_id,'player_id',i.player_id,
   'session_name',x.session_name,'game_title',x.game_title,'saved_at',i.saved_at,
   'player_name',(select p->>'name' from jsonb_array_elements(x.players) p where p->>'id'=i.player_id),
   'stage',case when x.results is not null then 'published' when y.locked then 'locked' else 'collecting' end,
   'current',exists(select 1 from jsonb_array_elements(x.players) p where p->>'id'=i.player_id)
     and encode(extensions.digest(encode(extensions.hmac(convert_to(i.player_id,'UTF8'),y.seed,'sha256'),'hex'),'sha256'),'hex')=i.token_hash
   ) order by x.updated_at desc)
   from side_picker_private.account_invitations i join public.sessions x on x.id=i.session_id
   join side_picker_private.rooms y on y.session_id=x.id where i.user_id=uid),'[]'));
 elsif action='save_invite' then
  pid := coalesce(payload->>'player','');
  if coalesce(payload->>'token','') !~ '^[0-9a-f]{64}$' or length(pid) not between 1 and 100 or length(coalesce(payload->>'room','')) not between 1 and 100 then
   raise exception 'Only a personal player invitation can be saved' using errcode='22023';
  end if;
  select * into s from public.sessions where room_code=payload->>'room';
  select * into r from side_picker_private.rooms where session_id=s.id;
  if r.seed is null or encode(extensions.hmac(convert_to(pid,'UTF8'),r.seed,'sha256'),'hex')<>payload->>'token'
     or not exists(select 1 from jsonb_array_elements(s.players) p where p->>'id'=pid) then
   raise exception 'Room link is invalid or expired' using errcode='42501';
  end if;
  if (select count(*) from side_picker_private.account_invitations where user_id=uid and not (session_id=s.id and player_id=pid))>=200 then
   raise exception 'An account can keep up to 200 invitations. Remove an old one first.' using errcode='22023';
  end if;
  insert into side_picker_private.account_invitations(user_id,session_id,player_id,token_hash)
  values(uid,s.id,pid,encode(extensions.digest(payload->>'token','sha256'),'hex'))
  on conflict(user_id,session_id,player_id) do update set token_hash=excluded.token_hash,saved_at=now();
  return jsonb_build_object('saved',true);
 elsif action in ('open_invite','forget_invite') then
  begin sid := (payload->>'session_id')::uuid;
  exception when invalid_text_representation then raise exception 'Invalid invitation' using errcode='22023'; end;
  pid := payload->>'player_id';
  if action='forget_invite' then
   delete from side_picker_private.account_invitations where user_id=uid and session_id=sid and player_id=pid;
   return '{}'::jsonb;
  end if;
  select x.* into s from side_picker_private.account_invitations i join public.sessions x on x.id=i.session_id
   where i.user_id=uid and i.session_id=sid and i.player_id=pid;
  if s.id is null then raise exception 'Invitation not found' using errcode='42501'; end if;
  select * into r from side_picker_private.rooms where session_id=s.id;
  token := encode(extensions.hmac(convert_to(pid,'UTF8'),r.seed,'sha256'),'hex');
  if token is null or not exists(select 1 from jsonb_array_elements(s.players) p where p->>'id'=pid)
     or encode(extensions.digest(token,'sha256'),'hex') is distinct from
        (select token_hash from side_picker_private.account_invitations where user_id=uid and session_id=sid and player_id=pid) then
   raise exception 'This invitation was replaced or you were removed from the game. Ask the organizer for a new one.' using errcode='42501';
  end if;
  return jsonb_build_object('room_code',s.room_code,'player_id',pid,'token',token);
 elsif action='start' then
  -- One call per account at a time, so two devices cannot both start games.
  perform pg_advisory_xact_lock(hashtextextended('account:'||uid::text,0));
  if exists(select 1 from side_picker_private.account_workspaces where user_id=uid) then
   raise exception 'Your account already has games. Refresh to load them.' using errcode='22023';
  end if;
  if coalesce(payload->>'token_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid device key' using errcode='22023'; end if;
  w := gen_random_uuid()::text;
  insert into public.users(owner_key) values(w);
  insert into side_picker_private.workspaces(owner_key,token_hash,kind,user_id,label) values(w,payload->>'token_hash','device',uid,label);
  insert into side_picker_private.account_workspaces(owner_key,user_id) values(w,uid);
  return jsonb_build_object('owner_key',w);
 elsif action='merge' then
  w := payload->>'owner_key';
  if not exists(select 1 from side_picker_private.account_workspaces where owner_key=w and user_id=uid) then
   raise exception 'These games are not in your account' using errcode='42501';
  end if;
  if h is not null then
   select owner_key into b from side_picker_private.workspaces where token_hash=h;
   if b is null then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
  else
   b := payload->>'source_owner_key';
   if not exists(select 1 from side_picker_private.account_workspaces where owner_key=b and user_id=uid) then
    raise exception 'These games are not in your account' using errcode='42501';
   end if;
  end if;
  if b=w then return jsonb_build_object('owner_key',w,'sessions',0,'presets',0); end if;
  if exists(select 1 from side_picker_private.account_workspaces where owner_key=b and user_id<>uid) then
   raise exception 'These games belong to another account' using errcode='42501';
  end if;
  -- Same lock as organizer requests, taken in a fixed order to avoid deadlocks.
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||least(w,b),0));
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||greatest(w,b),0));
  -- Rows move with their ids, so live rooms, invitations, and picks keep working.
  for item in select name from public.sessions where owner_key=b order by updated_at, name loop
   new_name := item.name; n := 1;
   while exists(select 1 from public.sessions where owner_key=w and name=new_name) loop
    n := n+1; new_name := left(item.name,480)||' ('||n||')';
   end loop;
   update public.sessions set owner_key=w,name=new_name,save_version=gen_random_uuid() where owner_key=b and name=item.name;
   moved_sessions := moved_sessions+1;
  end loop;
  for item in select name from public.presets where owner_key=b order by updated_at, name loop
   new_name := item.name; n := 1;
   while exists(select 1 from public.presets where owner_key=w and name=new_name) loop
    n := n+1; new_name := left(item.name,480)||' ('||n||')';
   end loop;
   update public.presets set owner_key=w,name=new_name,save_version=gen_random_uuid() where owner_key=b and name=item.name;
   moved_presets := moved_presets+1;
  end loop;
  -- The emptied workspace and every key to it go away; its links stop working.
  delete from side_picker_private.save_receipts where owner_key=b;
  delete from side_picker_private.workspaces where owner_key=b;
  delete from side_picker_private.account_workspaces where owner_key=b;
  delete from public.users where owner_key=b;
  return jsonb_build_object('owner_key',w,'sessions',moved_sessions,'presets',moved_presets);
 elsif action='attach' then
  if h is null then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
  select owner_key into w from side_picker_private.workspaces where token_hash=h;
  if w is null then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||w,0));
  if exists(select 1 from side_picker_private.account_workspaces where owner_key=w and user_id=uid) then
   return jsonb_build_object('owner_key',w);
  end if;
  if (select count(*) from side_picker_private.account_workspaces where user_id=uid)>=50 then
   raise exception 'An account can hold up to 50 workspaces' using errcode='22023';
  end if;
  insert into side_picker_private.account_workspaces(owner_key,user_id) values(w,uid) on conflict(owner_key) do nothing;
  if not found then raise exception 'These games already belong to another account' using errcode='42501'; end if;
  return jsonb_build_object('owner_key',w);
 elsif action='open' then
  w := payload->>'owner_key';
  if coalesce(payload->>'token_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid device key' using errcode='22023'; end if;
  if not exists(select 1 from side_picker_private.account_workspaces where owner_key=w and user_id=uid) then
   raise exception 'These games are not in your account' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||w,0));
  if (select count(*) from side_picker_private.workspaces where owner_key=w)>=20 then
   raise exception 'These games are open on too many devices. Remove an old device first.' using errcode='22023';
  end if;
  insert into side_picker_private.workspaces(owner_key,token_hash,kind,user_id,label) values(w,payload->>'token_hash','device',uid,label);
  return jsonb_build_object('owner_key',w);
 elsif action='revoke_key' then
  begin key_id := (payload->>'id')::uuid;
  exception when invalid_text_representation then raise exception 'Invalid key' using errcode='22023'; end;
  select x.* into k from side_picker_private.workspaces x
   join side_picker_private.account_workspaces a on a.owner_key=x.owner_key and a.user_id=uid where x.id=key_id;
  if k.token_hash is null then raise exception 'Key not found' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||k.owner_key,0));
  delete from side_picker_private.workspaces where id=key_id;
  return '{}'::jsonb;
 elsif action='forget_device' then
  -- Signing out removes this browser's device key; a shareable link stays valid.
  if h is null then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
  select * into k from side_picker_private.workspaces where token_hash=h;
  if k.token_hash is null then return jsonb_build_object('forget',true); end if;
  if not exists(select 1 from side_picker_private.account_workspaces where owner_key=k.owner_key and user_id=uid) then
   return jsonb_build_object('forget',false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||k.owner_key,0));
  delete from side_picker_private.workspaces where token_hash=h and kind='device';
  return jsonb_build_object('forget',true);
 elsif action='unlink' then
  w := payload->>'owner_key';
  if not exists(select 1 from side_picker_private.account_workspaces where owner_key=w and user_id=uid) then
   raise exception 'These games are not in your account' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||w,0));
  if not exists(select 1 from side_picker_private.workspaces where owner_key=w) then
   raise exception 'Open these games on a device before removing them, or they could not be opened again' using errcode='22023';
  end if;
  delete from side_picker_private.account_workspaces where owner_key=w and user_id=uid;
  -- Device keys become ordinary organizer links, so no open device loses access.
  update side_picker_private.workspaces set user_id=null where owner_key=w and user_id=uid;
  return '{}'::jsonb;
 elsif action='delete_account' then
  if exists(select 1 from side_picker_private.account_workspaces a where a.user_id=uid
     and not exists(select 1 from side_picker_private.workspaces x where x.owner_key=a.owner_key)) then
   raise exception 'Some games can only be opened through your account. Open them on a device or delete them first.' using errcode='22023';
  end if;
  -- Linked rows cascade; device keys become ordinary organizer links.
  delete from auth.users where id=uid;
  return '{}'::jsonb;
 end if;
 raise exception 'Unknown operation' using errcode='22023';
end $$;
revoke all on function public.sp_account(text,jsonb) from public,anon,authenticated;
grant execute on function public.sp_account(text,jsonb) to authenticated;
commit;
