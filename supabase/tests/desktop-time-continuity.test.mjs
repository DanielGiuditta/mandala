// Desktop time is never blocked or dropped (migration 20261024210000):
// a new start ends an older open session instead of failing, the older
// computer can still upload its own stop up to that point, and offline or
// slow starts are backdated without overlapping time already saved.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { asUser, createSupabaseLikeDatabase } from "./support/pglite-supabase.mjs";

const OFFICE = "20000000-0000-4000-8000-000000000001";
const PROJECT = "20000000-0000-4000-8000-000000000010";
const OTHER_PROJECT = "20000000-0000-4000-8000-000000000011";
const WORKER = "20000000-0000-4000-8000-000000000021";
const EMAIL = "worker@example.test";

let db;
let sequence = 0;

function newSessionId() {
  sequence += 1;
  return `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

async function asWorker(sql, params = []) {
  return asUser(db, EMAIL, async (tx) => (await tx.query(sql, params)).rows);
}

async function start(sessionId, { project = PROJECT, secondsAgo } = {}) {
  const rows = secondsAgo === undefined
    ? await asWorker("select start_desktop_work_session($1, $2, (now() at time zone 'UTC')::date) as r", [sessionId, project])
    : await asWorker("select start_desktop_work_session($1, $2, (now() at time zone 'UTC')::date, $3) as r", [sessionId, project, secondsAgo]);
  return rows[0].r;
}

async function finish(sessionId, stopSql = "clock_timestamp()") {
  return (await asWorker(`select finish_desktop_work_session($1, ${stopSql}) as r`, [sessionId]))[0].r;
}

async function session(id) {
  const { rows } = await db.query(
    `select d.*, t.hours::text as entry_hours,
            round(extract(epoch from d.stopped_at - d.started_at))::int as seconds
       from desktop_work_sessions d left join time_entries t on t.id = d.time_entry_id
      where d.id = $1`,
    [id],
  );
  return rows[0];
}

// Move a session (and its live timer) back in time, as if it started earlier.
async function age(id, minutes, activityMinutesAgo = minutes) {
  await db.query(
    `update desktop_work_sessions
        set started_at = clock_timestamp() - make_interval(mins => $2),
            last_activity_at = clock_timestamp() - make_interval(mins => $3)
      where id = $1`,
    [id, minutes, activityMinutesAgo],
  );
  await db.query(
    `update active_work_sessions
        set started_at = clock_timestamp() - make_interval(mins => $2),
            last_activity_at = clock_timestamp() - make_interval(mins => $3)
      where desktop_session_id = $1`,
    [id, minutes, activityMinutesAgo],
  );
}

before(async () => {
  db = await createSupabaseLikeDatabase();
  await db.query("insert into offices(id, name) values ($1, 'Calicut')", [OFFICE]);
  await db.query(
    `insert into people(id, full_name, office_id, annual_salary, availability_hours_per_week, email, active)
     values ($1, 'Worker', $2, 0, 40, $3, true)`,
    [WORKER, OFFICE, EMAIL],
  );
  await db.query("insert into user_accounts(person_id, email, active) values ($1, $2, true)", [WORKER, EMAIL]);
  for (const [id, name] of [[PROJECT, "HiLITE Atlantis"], [OTHER_PROJECT, "HiLITE Olympus"]]) {
    await db.query(
      `insert into projects(id, name, originating_office_id, managing_office_id, stage, active)
       values ($1, $2, $3, $3, 'active', true)`,
      [id, name, OFFICE],
    );
    await db.query(
      "insert into assignments(project_id, person_id, assigned_hours_per_week, active) values ($1, $2, 20, true)",
      [id, WORKER],
    );
  }
});

beforeEach(async () => {
  await db.exec(`
    delete from active_work_sessions;
    update desktop_work_sessions set time_entry_id = null, superseded_by = null;
    delete from desktop_work_sessions;
    delete from time_entries;
  `);
});

after(async () => {
  await db?.close();
});

async function assertNoOverlaps() {
  const { rows } = await db.query(`
    select a.id as a, b.id as b from desktop_work_sessions a
      join desktop_work_sessions b on a.person_id = b.person_id and a.id < b.id
     where tstzrange(a.started_at, coalesce(a.stopped_at, 'infinity')) &&
           tstzrange(b.started_at, coalesce(b.stopped_at, 'infinity'))
       and a.stopped_at is distinct from a.started_at
       and b.stopped_at is distinct from b.started_at`);
  assert.deepEqual(rows, [], "a person's sessions must never overlap");
}

test("a start on another computer ends the stuck session instead of failing", async () => {
  const stuck = newSessionId();
  const fresh = newSessionId();
  await start(stuck);
  await age(stuck, 60, 40); // started an hour ago, last heard from 40 minutes ago

  const receipt = await start(fresh);
  const old = await session(stuck);

  assert.equal(receipt.stopped_at, null);
  assert.equal(old.superseded_by, fresh);
  assert.equal(old.client_finished_at, null);
  // Saved up to its last activity plus the five-minute idle allowance: 25 minutes.
  assert.equal(old.seconds, 25 * 60);
  assert.equal(old.entry_hours, "0.42");
  const { rows: active } = await db.query("select desktop_session_id from active_work_sessions");
  assert.deepEqual(active.map((row) => row.desktop_session_id), [fresh]);
  await assertNoOverlaps();
});

test("the older computer can still upload its own stop, up to the new start", async () => {
  const stuck = newSessionId();
  const fresh = newSessionId();
  await start(stuck);
  await age(stuck, 60, 40);
  await start(fresh);
  const freshStart = (await session(fresh)).started_at;

  // Its journal shows work until well after the new start: capped there.
  const saved = await finish(stuck, "clock_timestamp()");
  const old = await session(stuck);
  assert.ok(saved.client_finished_at);
  assert.equal(old.stopped_at.getTime(), freshStart.getTime());
  assert.equal(old.entry_hours, "1.00");

  // A repeated upload changes nothing.
  await finish(stuck, "clock_timestamp() - interval '50 minutes'");
  assert.equal((await session(stuck)).entry_hours, "1.00");
  await assertNoOverlaps();
});

test("the older computer's upload can also shorten the saved time", async () => {
  const stuck = newSessionId();
  await start(stuck);
  await age(stuck, 60, 10);
  await start(newSessionId());
  assert.equal((await session(stuck)).entry_hours, "0.92"); // last activity + 5 min = 55 min

  // Its journal shows the employee actually went idle 30 minutes in.
  await finish(stuck, "clock_timestamp() - interval '30 minutes'");
  assert.equal((await session(stuck)).entry_hours, "0.50");
});

test("a superseded computer is told so on its next heartbeat", async () => {
  const stuck = newSessionId();
  await start(stuck);
  await age(stuck, 30, 20);
  await start(newSessionId());

  await assert.rejects(
    asWorker("select touch_desktop_work_session($1, clock_timestamp())", [stuck]),
    /AGENT-SESSION-SUPERSEDED/,
  );
});

test("an offline start is backdated to when the employee pressed Start", async () => {
  const offline = newSessionId();
  const receipt = await start(offline, { secondsAgo: 3600 });

  assert.ok(new Date(receipt.confirmed_at) - new Date(receipt.started_at) >= 3599_000);
  await asWorker("select touch_desktop_work_session($1, clock_timestamp())", [offline]);
  await finish(offline);
  assert.equal((await session(offline)).entry_hours, "1.00");
});

test("an offline start never overlaps time already saved", async () => {
  const earlier = newSessionId();
  await start(earlier);
  await age(earlier, 120, 60);
  await finish(earlier, "clock_timestamp() - interval '60 minutes'"); // worked 2h ago to 1h ago

  const offline = newSessionId();
  await start(offline, { secondsAgo: 90 * 60 }); // claims to have started 90 minutes ago
  const late = await session(offline);
  const earlierStop = (await session(earlier)).stopped_at;

  assert.equal(late.started_at.getTime(), earlierStop.getTime());
  await assertNoOverlaps();
});

test("an offline session that began before a later one ends where the later one began", async () => {
  const current = newSessionId();
  await start(current);
  await age(current, 30, 1); // running on another computer for 30 minutes

  const offline = newSessionId();
  const receipt = await start(offline, { project: OTHER_PROJECT, secondsAgo: 60 * 60 });
  assert.ok(receipt.stopped_at, "already ended by the later session");
  assert.equal(receipt.superseded_by, current);

  await finish(offline, "clock_timestamp()");
  const saved = await session(offline);
  assert.equal(saved.entry_hours, "0.50");
  assert.equal((await session(current)).stopped_at, null, "the later session keeps running");
  await assertNoOverlaps();
});

test("a desktop start closes a leftover web timer instead of failing", async () => {
  await db.query(
    `insert into active_work_sessions(person_id, project_id, started_at, last_activity_at)
     values ($1, $2, clock_timestamp() - interval '40 minutes', clock_timestamp() - interval '20 minutes')`,
    [WORKER, OTHER_PROJECT],
  );

  const fresh = newSessionId();
  await start(fresh);
  const { rows } = await db.query("select hours::text as hours, source from time_entries where project_id = $1", [OTHER_PROJECT]);
  assert.deepEqual(rows, [{ hours: "0.42", source: "manual" }]);
  const { rows: active } = await db.query("select desktop_session_id from active_work_sessions");
  assert.deepEqual(active.map((row) => row.desktop_session_id), [fresh]);
});

test("installed 1.0.17 agents (three arguments) and retries keep working", async () => {
  const id = newSessionId();
  const first = await start(id);
  const again = await start(id);
  assert.equal(again.started_at, first.started_at);
  await assert.rejects(
    asWorker("select start_desktop_work_session($1, $2, (now() at time zone 'UTC')::date + 1)", [id, PROJECT]),
    /identity mismatch/,
  );
});

test("sessions finished before this change are not reopened by a late retry", async () => {
  const id = newSessionId();
  await start(id);
  await age(id, 60, 1);
  await finish(id);
  await db.query("update desktop_work_sessions set client_finished_at = null where id = $1", [id]);
  const before = await session(id);

  await finish(id, "clock_timestamp() - interval '30 minutes'");
  assert.equal((await session(id)).stopped_at.getTime(), before.stopped_at.getTime());
});

test("Agent 1.0.18 records its version and PC name; older agents leave them empty", async () => {
  const reported = newSessionId();
  await asWorker(
    "select start_desktop_work_session($1, $2, (now() at time zone 'UTC')::date, 0, $3, $4)",
    [reported, PROJECT, " 1.0.18.0 ", "STP43"],
  );
  let row = await session(reported);
  assert.equal(row.agent_version, "1.0.18.0");
  assert.equal(row.device_name, "STP43");

  // A retry never changes what was recorded first.
  await asWorker(
    "select start_desktop_work_session($1, $2, (now() at time zone 'UTC')::date, 0, $3, $4)",
    [reported, PROJECT, "9.9.9", "OTHER-PC"],
  );
  row = await session(reported);
  assert.equal(row.device_name, "STP43");

  const legacy = newSessionId();
  await start(legacy);
  row = await session(legacy);
  assert.equal(row.agent_version, null);
  assert.equal(row.device_name, null);
});

test("implausible offline start times are refused", async () => {
  await assert.rejects(start(newSessionId(), { secondsAgo: -5 }), /accepted range/);
  await assert.rejects(start(newSessionId(), { secondsAgo: 8 * 86400 }), /accepted range/);
});
