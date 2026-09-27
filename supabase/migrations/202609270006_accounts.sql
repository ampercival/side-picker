-- Run once, after room lifecycle. Optional accounts sit on top of organizer keys:
-- links keep working, and nothing here is required to create or join a game.
-- An account can list workspaces it has proven control of and add revocable
-- per-device organizer keys. The database still stores only key hashes.
begin;
create table side_picker_private.before_accounts as
select 'workspaces'::text as source, to_jsonb(t) as record from side_picker_private.workspaces t;
revoke all on side_picker_private.before_accounts from public,anon,authenticated;

-- A workspace may now hold several keys: its shareable link plus device keys.
do $$ declare c text; begin
 select conname into c from pg_constraint where conrelid='side_picker_private.workspaces'::regclass and contype='p';
 execute format('alter table side_picker_private.workspaces drop constraint %I',c);
end $$;
alter table side_picker_private.workspaces alter column owner_key set not null;
alter table side_picker_private.workspaces add constraint workspaces_pkey primary key (token_hash);
create index workspaces_owner_idx on side_picker_private.workspaces(owner_key);
alter table side_picker_private.workspaces
 add column id uuid not null default gen_random_uuid() unique,
 add column kind text not null default 'link' check (kind in ('link','device')),
 add column user_id uuid references auth.users(id) on delete set null,
 add column label text check (label is null or length(label) between 1 and 100);

-- One owning account per workspace. Anyone else with a link can still use it,
-- but cannot claim it.
create table side_picker_private.account_workspaces (
 owner_key text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 linked_at timestamptz not null default now()
);
create index account_workspaces_user_idx on side_picker_private.account_workspaces(user_id);
revoke all on all tables in schema side_picker_private from public,anon,authenticated;
-- Defense in depth, matching production: no policies, so only the owning
-- security-definer functions below can read or write these rows.
alter table side_picker_private.before_accounts enable row level security;
alter table side_picker_private.account_workspaces enable row level security;

-- Serialize every request for a workspace, whichever of its keys is used, so
-- first saves and version checks behave as they did with a single key.
alter function public.sp_workspace(text,text,jsonb) set schema side_picker_private;
alter function side_picker_private.sp_workspace(text,text,jsonb) rename to workspace_rooms;
create function public.sp_workspace(action text,credential text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare h text; w text; k side_picker_private.workspaces;
begin
 if action='create' then return side_picker_private.workspace_rooms(action,credential,payload); end if;
 if credential is null or credential !~ '^[0-9a-f]{64}$' then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
 h := encode(extensions.digest(credential,'sha256'),'hex');
 select owner_key into w from side_picker_private.workspaces where token_hash=h;
 if w is null then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace:'||w,0));
 select * into k from side_picker_private.workspaces where token_hash=h for update;
 if k.owner_key is distinct from w then raise exception 'Organizer link is missing or invalid' using errcode='42501'; end if;
 if action='rotate' then
  if coalesce(payload->>'token_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid replacement' using errcode='22023'; end if;
  update side_picker_private.workspaces set token_hash=payload->>'token_hash' where token_hash=h;
  -- The signed-in owning account replaces only this key; its other devices keep
  -- theirs. Anyone else resets all access, as before accounts, so a leaked link
  -- cannot be kept alive by attaching it to another account.
  if not exists(select 1 from side_picker_private.account_workspaces where owner_key=w and user_id=auth.uid()) then
   delete from side_picker_private.workspaces where owner_key=w and token_hash<>payload->>'token_hash';
   delete from side_picker_private.account_workspaces where owner_key=w;
   update side_picker_private.workspaces set kind='link',user_id=null,label=null where token_hash=payload->>'token_hash';
  end if;
  return jsonb_build_object('owner_key',w);
 end if;
 return side_picker_private.workspace_rooms(action,credential,payload);
end $$;

-- Account operations use the signed-in user's id from the verified JWT. A raw
-- organizer credential is accepted only as proof of control and never stored.
create function public.sp_account(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); h text; w text; k side_picker_private.workspaces; key_id uuid; label text;
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
 if action='list' then
  return jsonb_build_object('workspaces',coalesce((select jsonb_agg(jsonb_build_object(
   'owner_key',a.owner_key,'linked_at',a.linked_at,
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'session_name',s.session_name,'game_title',s.game_title,'updated_at',s.updated_at) order by s.updated_at desc)
     from public.sessions s where s.owner_key=a.owner_key),'[]'),
   'presets',coalesce((select jsonb_agg(p.name order by p.name) from public.presets p where p.owner_key=a.owner_key),'[]'),
   'keys',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'label',x.label,'created_at',x.created_at,
     'current',x.token_hash is not distinct from h) order by x.created_at) from side_picker_private.workspaces x where x.owner_key=a.owner_key),'[]')
   ) order by a.linked_at) from side_picker_private.account_workspaces a where a.user_id=uid),'[]'));
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
  label := nullif(left(btrim(regexp_replace(coalesce(payload->>'label',''),'[[:cntrl:]]','','g')),100),'');
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

revoke all on all functions in schema side_picker_private from public,anon,authenticated;
revoke all on function public.sp_workspace(text,text,jsonb),public.sp_room(text,text,text,text,jsonb),public.sp_account(text,jsonb) from public,anon,authenticated;
grant execute on function public.sp_workspace(text,text,jsonb),public.sp_room(text,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.sp_account(text,jsonb) to authenticated;
commit;
