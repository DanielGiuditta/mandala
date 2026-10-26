// Hours come only from the tracker functions (migration 20261026030000, audit
// D4): employees can no longer insert time entries directly, while desktop
// and web timers, reading and lead corrections keep working. Also rehearses
// the documented rollout: precheck -> apply -> verify -> rollback -> re-apply.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import { asUser, createSupabaseLikeDatabase } from "./support/pglite-supabase.mjs";

const OFFICE = "30000000-0000-4000-8000-000000000001";
const PROJECT = "30000000-0000-4000-8000-000000000010";
const WORKER = "30000000-0000-4000-8000-000000000021";
const EMAIL = "worker@example.test";
const ROLLOUT = new URL("../rollout/20261026030000/", import.meta.url);
const MIGRATION = new URL("../migrations/20261026030000_deny_direct_time_entry_inserts.sql", import.meta.url);
const read = (name) => readFile(new URL(name, ROLLOUT), "utf8");

let db;

async function seed(target) {
  await target.query("insert into offices(id, name) values ($1, 'Calicut')", [OFFICE]);
  await target.query(
    `insert into people(id, full_name, office_id, annual_salary, availability_hours_per_week, email, active)
     values ($1, 'Worker', $2, 0, 40, $3, true)`,
    [WORKER, OFFICE, EMAIL],
  );
  await target.query("insert into user_accounts(person_id, email, active) values ($1, $2, true)", [WORKER, EMAIL]);
  await target.query(
    `insert into projects(id, name, originating_office_id, managing_office_id, stage, active, lead_person_id)
     values ($1, 'HiLITE Atlantis', $2, $2, 'active', true, $3)`,
    [PROJECT, OFFICE, WORKER],
  );
  await target.query(
    "insert into assignments(project_id, person_id, assigned_hours_per_week, active) values ($1, $2, 20, true)",
    [PROJECT, WORKER],
  );
}

const asWorker = (sql, params = []) => asUser(db, EMAIL, async (tx) => (await tx.query(sql, params)).rows);

before(async () => {
  db = await createSupabaseLikeDatabase();
  await seed(db);
});

after(async () => {
  await db?.close();
});

test("an employee cannot insert hours directly", async () => {
  await assert.rejects(
    asWorker(
      `insert into time_entries(person_id, project_id, date, hours, source)
       values ($1, $2, '2026-01-01', 9999.99, 'manual')`,
      [WORKER, PROJECT],
    ),
    /permission denied/,
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query(
        "insert into time_entries(person_id, project_id, date, hours, source) values ($1, $2, '2026-01-01', 1, 'manual')",
        [WORKER, PROJECT],
      );
    }),
    /permission denied/,
  );
});

test("the Windows agent still saves hours", async () => {
  const id = "30000000-0000-4000-8000-0000000000a1";
  await asWorker("select start_desktop_work_session($1, $2, (now() at time zone 'UTC')::date)", [id, PROJECT]);
  await db.query(
    `update desktop_work_sessions set started_at = clock_timestamp() - interval '30 minutes',
            last_activity_at = clock_timestamp() - interval '1 minute' where id = $1`,
    [id],
  );
  await asWorker("select finish_desktop_work_session($1, clock_timestamp())", [id]);
  const { rows } = await db.query(
    "select t.hours::text as hours, t.source from desktop_work_sessions d join time_entries t on t.id = d.time_entry_id where d.id = $1",
    [id],
  );
  assert.deepEqual(rows, [{ hours: "0.50", source: "windows-tracker" }]);
});

test("the web sidebar timer still saves hours", async () => {
  await asWorker("select * from start_self_work_session($1, (now() at time zone 'UTC')::date)", [PROJECT]);
  await db.query(
    `update active_work_sessions set started_at = clock_timestamp() - interval '15 minutes',
            last_activity_at = clock_timestamp() where person_id = $1`,
    [WORKER],
  );
  await asWorker("select * from stop_self_work_session((now() at time zone 'UTC')::date)");
  const { rows } = await db.query("select hours::text as hours from time_entries where source = 'manual'");
  assert.deepEqual(rows, [{ hours: "0.25" }]);
});

test("a project lead can still read and correct hours", async () => {
  const rows = await asWorker("select id from time_entries where source = 'manual'");
  assert.equal(rows.length, 1);
  const updated = await asWorker("update time_entries set hours = 0.30 where id = $1 returning hours::text as hours", [rows[0].id]);
  assert.deepEqual(updated, [{ hours: "0.30" }]);
});

// --- Rollout rehearsal with the exact files the runbook uses ---

async function runReadOnly(target, sql) {
  await target.exec("begin read only");
  try { await target.exec(sql); } finally { await target.exec("rollback"); }
}

async function runInOneTransaction(target, ...sqls) {
  await target.exec("begin");
  try {
    for (const sql of sqls) await target.exec(sql);
    await target.exec("commit");
  } catch (error) {
    await target.exec("rollback");
    throw error;
  }
}

async function accessState(target) {
  const { rows } = await target.query(`
    select (select json_agg(json_build_object('name', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual, 'check', with_check)
                            order by policyname)
              from pg_policies where schemaname = 'public' and tablename = 'time_entries') as policies,
           has_table_privilege('authenticated', 'public.time_entries', 'INSERT') as auth_insert,
           has_table_privilege('anon', 'public.time_entries', 'INSERT') as anon_insert`);
  return rows[0];
}

test("rollout rehearsal: precheck, apply, verify, rollback and re-apply", async () => {
  const target = await createSupabaseLikeDatabase({ through: "20261024210000" });
  try {
    await target.exec(`
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
      insert into supabase_migrations.schema_migrations (version, name)
      values ('20260907090000', 'add_lan_desktop_sessions'), ('20261024210000', 'keep_all_desktop_time');
    `);
    const original = await accessState(target);
    assert.equal(original.auth_insert, true, "the hole exists before the migration");

    await runReadOnly(target, await read("precheck.sql"));
    await runInOneTransaction(target, await read("apply-guards.sql"), await readFile(MIGRATION, "utf8"), await read("record-migration.sql"));
    await runReadOnly(target, await read("verify.sql"));
    await assert.rejects(runReadOnly(target, await read("precheck.sql")), /STOP: 20261026030000 is already recorded/);

    await runInOneTransaction(target, await read("apply-guards.sql"), await read("rollback.sql"));
    assert.deepEqual(await accessState(target), original, "rollback restores the exact previous policies and grants");
    await runReadOnly(target, await read("precheck.sql"));

    await runInOneTransaction(target, await read("apply-guards.sql"), await readFile(MIGRATION, "utf8"), await read("record-migration.sql"));
    await runReadOnly(target, await read("verify.sql"));
  } finally {
    await target.close();
  }
});
