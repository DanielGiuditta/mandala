-- Read-only. Run with: psql -X -v ON_ERROR_STOP=1 -c "set session characteristics as transaction read only" -f precheck.sql
-- Stops unless production is exactly in the state the migration expects.
do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261026030000') then
    raise exception 'STOP: 20261026030000 is already recorded.';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261024210000') then
    raise exception 'STOP: 20261024210000 (keep_all_desktop_time) must be applied first.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_entries'
                  and policyname = 'authenticated users can insert self manual time entries' and cmd = 'INSERT') then
    raise exception 'STOP: the self manual insert policy is not present as expected.';
  end if;
  -- Every function that writes hours must keep working without the employee's INSERT right.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosrc ~* 'insert\s+into\s+(public\.)?time_entries' and not p.prosecdef) then
    raise exception 'STOP: a function that inserts time entries is not security definer.';
  end if;
end $$;
select count(*) as time_entries, sum(hours) as hours from public.time_entries;
select r as role, has_table_privilege(r, 'public.time_entries', 'INSERT') as can_insert
  from unnest(array['anon', 'authenticated']) r;
