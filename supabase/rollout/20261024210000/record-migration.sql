-- Last file of the single apply transaction: record the migration the same way
-- 20260907090000 was recorded, then ask PostgREST to reload its schema cache so
-- the new start_desktop_work_session signature is visible immediately.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'No migration history table; nothing recorded.';
  elsif exists (select 1 from information_schema.columns
                 where table_schema = 'supabase_migrations' and table_name = 'schema_migrations' and column_name = 'name') then
    execute $sql$insert into supabase_migrations.schema_migrations (version, name) values ('20261024210000', 'keep_all_desktop_time')$sql$;
  else
    execute $sql$insert into supabase_migrations.schema_migrations (version) values ('20261024210000')$sql$;
  end if;
end $$;
notify pgrst, 'reload schema';
