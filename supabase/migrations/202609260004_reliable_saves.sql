-- Run once. Existing clients must refresh after this migration: blind writes
-- are rejected, rather than permitted to overwrite version-checked edits.
begin;
create table side_picker_private.before_reliable_saves as
select 'sessions'::text as source, to_jsonb(t) as record from public.sessions t
union all select 'presets', to_jsonb(t) from public.presets t;
revoke all on side_picker_private.before_reliable_saves from public,anon,authenticated;
alter table public.sessions add column save_version uuid not null default gen_random_uuid();
alter table public.presets add column save_version uuid not null default gen_random_uuid();
create table side_picker_private.save_receipts (
  owner_key text not null, operation_id uuid not null, request_hash text not null,
  response jsonb not null, created_at timestamptz not null default now(),
  primary key(owner_key,operation_id)
);
revoke all on side_picker_private.save_receipts from public, anon, authenticated;
alter function public.sp_workspace(text,text,jsonb) set schema side_picker_private;
alter function side_picker_private.sp_workspace(text,text,jsonb) rename to workspace_legacy;
revoke all on function side_picker_private.workspace_legacy(text,text,jsonb) from public,anon,authenticated;

create function public.sp_workspace(action text, credential text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare w text; current_version uuid; target_version uuid; expected uuid; op uuid; fingerprint text;
  previous side_picker_private.save_receipts; result jsonb; n text; source_name text; v uuid;
begin
  if action not in ('save_session','delete_session','save_preset','delete_preset','rename_preset') then
    return side_picker_private.workspace_legacy(action,credential,payload);
  end if;
  if credential is null or credential !~ '^[0-9a-f]{64}$' then raise exception 'Invalid organizer link' using errcode='42501'; end if;
  -- Match the existing API's lock order, including load/rotate requests.
  perform pg_advisory_xact_lock(hashtextextended(encode(extensions.digest(credential,'sha256'),'hex'),0));
  select owner_key into w from side_picker_private.workspaces
    where token_hash=encode(extensions.digest(credential,'sha256'),'hex') for update;
  if w is null then raise exception 'Invalid organizer link' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>300000
     or not payload ? 'expected_version' or coalesce(payload->>'operation_id','') !~ '^[0-9a-f-]{36}$' then
    raise exception 'Refresh Side Picker to save with the updated app' using errcode='22023';
  end if;
  begin op := (payload->>'operation_id')::uuid; expected := (payload->>'expected_version')::uuid;
  exception when invalid_text_representation then raise exception 'Invalid save request' using errcode='22023'; end;
  fingerprint := encode(extensions.digest(action || payload::text,'sha256'),'hex');
  select * into previous from side_picker_private.save_receipts where owner_key=w and operation_id=op;
  if found then
    if previous.request_hash<>fingerprint then raise exception 'Save request changed during retry' using errcode='22023'; end if;
    return previous.response;
  end if;
  n := payload->>'name'; source_name := case when action='rename_preset' then payload->>'original_name' else n end;
  if n is null or length(n) not between 1 and 500 or source_name is null or length(source_name) not between 1 and 500 then
    raise exception 'Invalid name' using errcode='22023';
  end if;
  if action in ('save_session','delete_session') then
    select save_version into current_version from public.sessions where owner_key=w and name=n for update;
  else
    select save_version into current_version from public.presets where owner_key=w and name=source_name for update;
  end if;
  if current_version is distinct from expected then
    raise exception 'This game changed elsewhere. Keep your edits as a copy or load the latest saved version.' using errcode='40001';
  end if;
  if action='rename_preset' then
    if current_version is null or source_name=n or not payload ? 'target_version' then raise exception 'Invalid rename' using errcode='22023'; end if;
    select save_version into target_version from public.presets where owner_key=w and name=n for update;
    if target_version is distinct from (payload->>'target_version')::uuid then raise exception 'The destination changed elsewhere' using errcode='40001'; end if;
    perform side_picker_private.workspace_legacy('save_preset',credential,payload);
    perform side_picker_private.workspace_legacy('delete_preset',credential,jsonb_build_object('name',source_name));
  else
    perform side_picker_private.workspace_legacy(action,credential,payload);
  end if;
  v := gen_random_uuid();
  if action='save_session' then
    update public.sessions set save_version=v where owner_key=w and name=n returning to_jsonb(sessions) into result;
  elsif action in ('save_preset','rename_preset') then
    update public.presets set save_version=v where owner_key=w and name=n returning to_jsonb(presets) into result;
  else result := jsonb_build_object('save_version',null); end if;
  insert into side_picker_private.save_receipts(owner_key,operation_id,request_hash,response) values(w,op,fingerprint,result);
  -- Older pending requests safely conflict if the receipt has expired.
  delete from side_picker_private.save_receipts where owner_key=w and created_at<now()-interval '30 days';
  return result;
end $$;
revoke all on function public.sp_workspace(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sp_workspace(text,text,jsonb) to anon,authenticated;
commit;
