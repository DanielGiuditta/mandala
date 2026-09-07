import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Execute the real session functions and new migration in PostgreSQL (WASM),
// using a small authorization fixture rather than unrelated application fixtures.
test('database: reconnect is idempotent, ownership is exclusive, and revoked access fails closed', async () => {
  const db = new PGlite()
  const person = '11111111-1111-4111-8111-111111111111'
  const project = '22222222-2222-4222-8222-222222222222'
  const session = '33333333-3333-4333-8333-333333333333'
  const secondSession = '44444444-4444-4444-8444-444444444444'
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table people(id uuid primary key, active boolean default true);
      create table user_accounts(email text, active boolean default true);
      create table projects(id uuid primary key, managing_office_id uuid, lead_person_id uuid);
      create table assignments(id uuid, active boolean, person_id uuid, project_id uuid, start_date date, end_date date);
      create table resource_documents(id uuid primary key, project_id uuid, server_path text);
      create table time_entries(id uuid primary key default gen_random_uuid(), assignment_id uuid, date date, hours numeric, notes text, person_id uuid, project_id uuid, source text);
      create function current_person_id() returns uuid language sql stable as $$ select nullif(current_setting('test.person', true), '')::uuid $$;
      create function current_user_email() returns text language sql stable as $$ select 'employee@example.test'::text $$;
      create function can_self_track_project(uuid) returns boolean language sql stable as $$ select current_setting('test.allowed', true) = 'yes' $$;
      create function can_access_shared_library() returns boolean language sql stable as $$ select false $$;
      create function can_view_internal_project(uuid,uuid,uuid) returns boolean language sql stable as $$ select current_setting('test.allowed', true) = 'yes' $$;
      insert into people(id) values ('${person}');
      insert into user_accounts(email) values ('employee@example.test');
      insert into projects(id) values ('${project}');
      insert into resource_documents values ('${session}', '${project}', 'approved-original');
      set test.person = '${person}'; set test.allowed = 'yes';
    `)
    const actualLegacy = await readFile(new URL('../../../supabase/migrations/20260722120000_add_active_work_sessions.sql', import.meta.url), 'utf8')
    await db.exec(actualLegacy.split('alter policy')[0])
    await db.exec(await readFile(new URL('../../../supabase/migrations/20260907090000_add_lan_desktop_sessions.sql', import.meta.url), 'utf8'))
    const call = async (sql, params = []) => (await db.query(sql, params)).rows
    const start = () => call('select start_desktop_work_session($1,$2,current_date) as receipt', [session, project])
    const first = (await start())[0].receipt
    assert.equal((await start())[0].receipt.started_at, first.started_at)
    await assert.rejects(call('select start_self_work_session($1,current_date,false)', [project]), /original workstation/)
    await assert.rejects(call('select stop_self_work_session(current_date)'), /original workstation/)
    await assert.rejects(call('select start_desktop_work_session($1,$2,current_date)', [secondSession, project]), /existing timer/)
    assert.equal((await call('select pause_stale_self_work_session(current_date) as paused'))[0].paused, false)
    await db.exec(`update desktop_work_sessions set started_at = clock_timestamp() - interval '1 hour'; update active_work_sessions set started_at = clock_timestamp() - interval '1 hour';`)
    const stopped = new Date().toISOString()
    await assert.rejects(call('select finish_desktop_work_session($1,clock_timestamp() + interval \'2 hours\')', [session]), /invalid/)
    const saved = (await call('select finish_desktop_work_session($1,$2) as receipt', [session, stopped]))[0].receipt
    assert.ok(saved.time_entry_id)
    assert.equal((await call('select finish_desktop_work_session($1,$2) as receipt', [session, stopped]))[0].receipt.time_entry_id, saved.time_entry_id)
    assert.equal((await call('select count(*)::int as n from time_entries'))[0].n, 1)
    assert.equal((await call('select source from time_entries'))[0].source, 'windows-tracker')
    assert.equal((await call('select count(*)::int as n from active_work_sessions'))[0].n, 0)
    assert.equal((await call('select * from authorize_resource_preview($1)', [session])).length, 1)
    await db.exec("set test.allowed = 'no'")
    assert.equal((await call('select * from authorize_resource_preview($1)', [session])).length, 0)
    await assert.rejects(call('select start_desktop_work_session($1,$2,current_date)', [secondSession, project]), /unavailable/)
    await db.exec("set test.allowed = 'yes'; update user_accounts set active = false")
    await assert.rejects(call('select finish_desktop_work_session($1,$2)', [session, stopped]), /active internal/)
    await assert.rejects(call('select * from authorize_resource_preview($1)', [session]), /active internal/)
    // Direct table access and the renamed legacy bypass must not be executable by employees.
    assert.equal((await call("select has_function_privilege('authenticated','start_online_work_session(uuid,date,boolean)','execute') as allowed"))[0].allowed, false)
    assert.equal((await call("select has_table_privilege('authenticated','desktop_work_sessions','insert') as allowed"))[0].allowed, false)
  } finally { await db.close() }
})
