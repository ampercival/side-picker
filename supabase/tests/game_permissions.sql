-- Read-only post-cutover assertions. No game records are read or written.
begin;
do $$ declare r text; t text; begin
  foreach r in array array['anon','authenticated'] loop
    foreach t in array array['users','sessions','presets','submissions'] loop
      if has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Unexpected direct access for % on %', r, t;
      end if;
      if not (select relrowsecurity from pg_class where oid=('public.' || t)::regclass) then
        raise exception 'RLS is disabled on %', t;
      end if;
    end loop;
    if has_schema_privilege(r,'side_picker_private','USAGE') then
      raise exception 'Private schema is exposed to %', r;
    end if;
    if not has_function_privilege(r,'public.sp_workspace(text,text,jsonb)','EXECUTE')
       or not has_function_privilege(r,'public.sp_room(text,text,text,text,jsonb)','EXECUTE') then
      raise exception 'Scoped API is unavailable for %', r;
    end if;
  end loop;
  -- After migration 006: accounts require a signed-in (authenticated) caller.
  if to_regprocedure('public.sp_account(text,jsonb)') is not null and
     (has_function_privilege('anon','public.sp_account(text,jsonb)','EXECUTE')
      or not has_function_privilege('authenticated','public.sp_account(text,jsonb)','EXECUTE')) then
    raise exception 'Account API grants are wrong';
  end if;
end $$;
rollback;
select 'PASS: direct game access denied, RLS enabled, private schema hidden, scoped API available for anon/authenticated' as result;
