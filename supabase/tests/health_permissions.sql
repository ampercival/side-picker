-- Run after 202609260001_public_health.sql, as administrator.
-- Uses only the non-sensitive sentinel, with rollback even on successful checks.
begin;
set local role anon;
do $$
begin
    if (select count(*) from public.app_health where status = 'ok') <> 1 then
        raise exception 'Anonymous health read failed';
    end if;
    begin
        insert into public.app_health values ('ok');
        raise exception 'Anonymous insert unexpectedly allowed';
    exception when insufficient_privilege then null;
    end;
    begin
        update public.app_health set status = 'ok';
        raise exception 'Anonymous update unexpectedly allowed';
    exception when insufficient_privilege then null;
    end;
    begin
        delete from public.app_health;
        raise exception 'Anonymous delete unexpectedly allowed';
    exception when insufficient_privilege then null;
    end;
    begin
        truncate public.app_health;
        raise exception 'Anonymous truncate unexpectedly allowed';
    exception when insufficient_privilege then null;
    end;
end $$;
reset role;
set local role authenticated;
do $$
begin
    if (select count(*) from public.app_health where status = 'ok') <> 1 then
        raise exception 'Authenticated health read failed';
    end if;
    if has_table_privilege(current_user, 'public.app_health', 'INSERT')
       or has_table_privilege(current_user, 'public.app_health', 'UPDATE')
       or has_table_privilege(current_user, 'public.app_health', 'DELETE')
       or has_table_privilege(current_user, 'public.app_health', 'TRUNCATE') then
        raise exception 'Authenticated mutation grant found';
    end if;
end $$;
reset role;
rollback;
select 'PASS: health reads allowed; writes denied; test transaction rolled back' as result;
