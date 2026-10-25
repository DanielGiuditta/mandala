// Rehearses the production rollout of 20261024210000 exactly as documented in
// docs/04-delivery/rollout-2026-10-25-no-time-gaps.md, using the same files:
// precheck -> apply (one transaction) -> verify -> rollback -> re-apply.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import { createSupabaseLikeDatabase } from "./support/pglite-supabase.mjs";

const ROLLOUT = new URL("../rollout/20261024210000/", import.meta.url);
const MIGRATION = new URL("../migrations/20261024210000_keep_all_desktop_time.sql", import.meta.url);
const read = (name) => readFile(new URL(name, ROLLOUT), "utf8");

let db;

// Same checks the documented commands run, in a read-only transaction.
async function runReadOnly(sql) {
  await db.exec("begin read only");
  try { await db.exec(sql); } finally { await db.exec("rollback"); }
}

// psql --single-transaction -f a -f b ... : all files commit together or not at all.
async function runInOneTransaction(...sqls) {
  await db.exec("begin");
  try {
    for (const sql of sqls) await db.exec(sql);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function fingerprints() {
  const { rows } = await db.query(`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn, md5(p.prosrc) as md5
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('start_desktop_work_session', 'touch_desktop_work_session',
       'finish_desktop_work_session', 'set_desktop_session_stop') order by 1`);
  return Object.fromEntries(rows.map((row) => [row.fn, row.md5]));
}

before(async () => {
  db = await createSupabaseLikeDatabase({ through: "20260907090000" });
  // Production records applied migrations like this (version, name).
  await db.exec(`
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
    insert into supabase_migrations.schema_migrations (version, name) values ('20260907090000', 'add_lan_desktop_sessions');
  `);
});

after(async () => {
  await db?.close();
});

test("rollout rehearsal: precheck, apply, verify, rollback and re-apply", async () => {
  const before = await fingerprints();
  await runReadOnly(await read("precheck.sql"));

  await runInOneTransaction(await read("apply-guards.sql"), await readFile(MIGRATION, "utf8"), await read("record-migration.sql"));
  await runReadOnly(await read("verify.sql"));
  await assert.rejects(runReadOnly(await read("precheck.sql")), /STOP: 20261024210000 is already recorded/);

  await runInOneTransaction(await read("apply-guards.sql"), await read("rollback.sql"));
  assert.deepEqual(await fingerprints(), before, "rollback restores the exact previous function bodies");
  const { rows: history } = await db.query("select version from supabase_migrations.schema_migrations order by version");
  assert.deepEqual(history.map((row) => row.version), ["20260907090000"]);
  const { rows: grants } = await db.query(
    "select has_function_privilege('authenticated', 'public.start_desktop_work_session(uuid,uuid,date)', 'execute') as ok");
  assert.equal(grants[0].ok, true, "installed agents can start work again after rollback");

  // Re-applying after a rollback must work (the kept columns are not re-added).
  await runInOneTransaction(await read("apply-guards.sql"), await readFile(MIGRATION, "utf8"), await read("record-migration.sql"));
  await runReadOnly(await read("verify.sql"));
});

test("a failed apply changes nothing", async () => {
  const fresh = await createSupabaseLikeDatabase({ through: "20260907090000" });
  const original = db;
  db = fresh;
  try {
    const before = await fingerprints();
    await assert.rejects(runInOneTransaction(
      await read("apply-guards.sql"),
      await readFile(MIGRATION, "utf8"),
      "select 1/0; -- simulated failure after the migration statements",
    ));
    assert.deepEqual(await fingerprints(), before);
    await runReadOnly(await read("precheck.sql"));
  } finally {
    db = original;
    await fresh.close();
  }
});

test("the precheck stops if production's functions drifted from the repository", async () => {
  const drifted = await createSupabaseLikeDatabase({ through: "20260907090000" });
  const original = db;
  db = drifted;
  try {
    const { rows } = await db.query(
      "select pg_get_functiondef('public.touch_desktop_work_session(uuid,timestamptz)'::regprocedure) as def");
    await db.exec(rows[0].def.replace("begin", "begin\n  -- hand edit made outside the migrations"));
    await assert.rejects(runReadOnly(await read("precheck.sql")), /STOP: production session functions differ/);
  } finally {
    db = original;
    await drifted.close();
  }
});
