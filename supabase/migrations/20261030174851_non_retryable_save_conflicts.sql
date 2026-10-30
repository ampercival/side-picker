-- Business conflicts must return HTTP 409, never trigger PostgREST transaction retries.
-- Preserve function signatures, bodies, ownership and grants; no table data changes.
do $migration$
declare target text; definition text;
begin
 foreach target in array array[
  'side_picker_private.workspace_versioned(text,text,jsonb)',
  'side_picker_private.workspace_rooms(text,text,jsonb)',
  'side_picker_private.reconcile_room()',
  'public.sp_room(text,text,text,text,jsonb)'
 ] loop
  definition := pg_get_functiondef(target::regprocedure);
  if position('''40001''' in definition) = 0 then
   raise exception 'Expected conflict code missing in %', target;
  end if;
  execute replace(definition, '''40001''', '''PT409''');
 end loop;
end $migration$;
