// The Projects list and project detail both show get_project_list_time_metrics.
// These checks pin that aggregate to the rows the detail view lists, using the
// real migrations and running as signed-in users.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { asUser, createSupabaseLikeDatabase } from "./support/pglite-supabase.mjs";

const OFFICE = "10000000-0000-4000-8000-000000000001";
const PROJECT = "10000000-0000-4000-8000-000000000010";
const PARTNER = "10000000-0000-4000-8000-000000000020";
const PARTNER_ACCOUNT = "10000000-0000-4000-8000-000000000030";
const WORKER = "10000000-0000-4000-8000-000000000021";
const OUTSIDER = "10000000-0000-4000-8000-000000000022";
const PARTNER_EMAIL = "partner@example.test";
const WORKER_EMAIL = "worker@example.test";
const OUTSIDER_EMAIL = "outsider@example.test";

// Hours chosen so a floating-point sum would drift (0.05 + 0.10).
const SEEDED_HOURS = ["0.05", "0.10", "1.51", "0.50"];

let db;

before(async () => {
  db = await createSupabaseLikeDatabase();
  await db.query("insert into offices(id, name) values ($1, 'Calicut')", [OFFICE]);

  for (const [id, name, email] of [
    [PARTNER, "Partner", PARTNER_EMAIL],
    [WORKER, "Worker", WORKER_EMAIL],
    [OUTSIDER, "Outsider", OUTSIDER_EMAIL],
  ]) {
    await db.query(
      `insert into people(id, full_name, office_id, annual_salary, availability_hours_per_week, email, active)
       values ($1, $2, $3, 0, 40, $4, true)`,
      [id, name, OFFICE, email],
    );
  }

  await db.query(
    "insert into user_accounts(id, person_id, email, active) values ($1, $2, $3, true)",
    [PARTNER_ACCOUNT, PARTNER, PARTNER_EMAIL],
  );
  await db.query("insert into user_accounts(person_id, email, active) values ($1, $2, true)", [WORKER, WORKER_EMAIL]);
  await db.query("insert into user_accounts(person_id, email, active) values ($1, $2, true)", [OUTSIDER, OUTSIDER_EMAIL]);
  await db.query(
    `insert into role_assignments(user_account_id, role, office_id, assigned_by_user_account_id, active)
     values ($1, 'partner', null, $1, true)`,
    [PARTNER_ACCOUNT],
  );
  await db.query(
    `insert into projects(id, name, originating_office_id, managing_office_id, lead_person_id, stage, active)
     values ($1, 'HiLITE Atlantis', $2, $2, null, 'active', true)`,
    [PROJECT, OFFICE],
  );
  await db.query(
    "insert into assignments(project_id, person_id, assigned_hours_per_week, active) values ($1, $2, 20, true)",
    [PROJECT, WORKER],
  );

  for (const [index, hours] of SEEDED_HOURS.entries()) {
    await db.query(
      `insert into time_entries(person_id, project_id, date, hours, source)
       values ($1, $2, $3, $4, $5)`,
      [WORKER, PROJECT, `2026-10-0${index + 1}`, hours, index % 2 ? "manual" : "windows-tracker"],
    );
  }
});

after(async () => {
  await db?.close();
});

function projectTotal(email) {
  return asUser(db, email, async (tx) => {
    const { rows } = await tx.query(
      "select project_id, total_hours::text as total_hours from get_project_list_time_metrics(array[$1]::uuid[])",
      [PROJECT],
    );
    return rows;
  });
}

function detailEntries(email) {
  return asUser(db, email, async (tx) => {
    const { rows } = await tx.query("select get_project_detail_context($1) as context", [PROJECT]);
    return rows[0].context.timeEntries ?? [];
  });
}

// Exact decimal sum of two-decimal hours, in hundredths.
function hundredths(values) {
  return values.reduce((sum, value) => sum + Math.round(Number(value) * 100), 0);
}

test("the project total is the exact sum of the rows the detail view lists", async () => {
  const [total] = await projectTotal(PARTNER_EMAIL);
  const entries = await detailEntries(PARTNER_EMAIL);

  assert.equal(entries.length, SEEDED_HOURS.length);
  assert.equal(total.total_hours, "2.16");
  assert.equal(Math.round(Number(total.total_hours) * 100), hundredths(entries.map((entry) => entry.hours)));
});

test("a Windows agent save is counted in the total and listed in the detail at once", async () => {
  const sessionId = "10000000-0000-4000-8000-0000000000f1";

  await asUser(db, WORKER_EMAIL, (tx) =>
    tx.query("select start_desktop_work_session($1, $2, (now() at time zone 'UTC')::date)", [sessionId, PROJECT]),
  );
  await db.query(
    "update desktop_work_sessions set started_at = started_at - interval '30 minutes' where id = $1",
    [sessionId],
  );
  const [{ receipt }] = await asUser(db, WORKER_EMAIL, async (tx) =>
    (await tx.query("select finish_desktop_work_session($1, clock_timestamp()) as receipt", [sessionId])).rows,
  );
  const { rows: [saved] } = await db.query("select hours::text as hours from time_entries where id = $1", [receipt.time_entry_id]);

  const [total] = await projectTotal(PARTNER_EMAIL);
  const entries = await detailEntries(PARTNER_EMAIL);

  assert.equal(saved.hours, "0.50");
  assert.ok(entries.some((entry) => entry.id === receipt.time_entry_id));
  assert.equal(total.total_hours, "2.66");
  assert.equal(Math.round(Number(total.total_hours) * 100), hundredths(entries.map((entry) => entry.hours)));
});

test("people without internal access to the project get no total", async () => {
  assert.deepEqual(await projectTotal(OUTSIDER_EMAIL), []);
});
