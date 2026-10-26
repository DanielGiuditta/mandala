-- Hours are written only by the tracker functions (desktop start/finish and the
-- web sidebar timer), which run as their owner. Until now an employee could also
-- insert their own 'manual' rows straight through the REST API, for any date
-- and any number of hours (audit D4, 24 October 2026). No screen uses that path.
-- Reading and the existing lead/admin correction (UPDATE) are unchanged.
drop policy if exists "authenticated users can insert self manual time entries" on public.time_entries;
revoke insert on table public.time_entries from anon, authenticated;
