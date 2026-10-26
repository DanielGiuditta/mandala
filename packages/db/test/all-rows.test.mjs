// Totals summed in JavaScript must read every page: PostgREST returns at most
// 1,000 rows per request without any error (audit D12). The fake client caps
// each request the same way.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

register("../../../test/support/typescript-hooks.mjs", import.meta.url, {
  data: {
    aliases: {
      "@supabase/supabase-js": new URL("./fakes/supabase-js.mjs", import.meta.url).href,
    },
  },
});

const { selectAllRows } = await import("../allRows.ts");
const { createClient, installFakeDatabase } = await import("./fakes/supabase-js.mjs");

const PERSON = "00000000-0000-4000-8000-000000000021";

function entries(count) {
  return Array.from({ length: count }, (_, index) => ({
    hours: 0.25,
    id: `e-${String(index).padStart(6, "0")}`,
    person_id: PERSON,
    project_id: "p",
  }));
}

const query = (client) =>
  client.from("time_entries").select("project_id, hours").eq("person_id", PERSON);

test("a single request stops at the row cap (the bug being fixed)", async () => {
  installFakeDatabase({ maxRows: 1000, tables: { time_entries: entries(2345) } });
  const { data } = await query(createClient());
  assert.equal(data.length, 1000);
});

test("selectAllRows reads every page", async () => {
  installFakeDatabase({ maxRows: 1000, tables: { time_entries: entries(2345) } });
  const client = createClient();
  const rows = await selectAllRows((from, to) => query(client).order("id").range(from, to));
  assert.equal(rows.length, 2345);
  assert.equal(new Set(rows.map((row) => row.id)).size, 2345, "no row read twice");
  assert.equal(rows.reduce((sum, row) => sum + row.hours, 0), 586.25);
});

test("selectAllRows handles exact multiples and empty results", async () => {
  installFakeDatabase({ maxRows: 1000, tables: { time_entries: entries(2000) } });
  assert.equal((await selectAllRows((from, to) => query(createClient()).order("id").range(from, to))).length, 2000);
  installFakeDatabase({ maxRows: 1000, tables: { time_entries: [] } });
  assert.deepEqual(await selectAllRows((from, to) => query(createClient()).order("id").range(from, to)), []);
});

test("selectAllRows surfaces errors instead of returning a partial total", async () => {
  let calls = 0;
  await assert.rejects(
    selectAllRows(async () => {
      calls += 1;
      return calls === 1
        ? { data: Array.from({ length: 1000 }, () => ({})), error: null }
        : { data: null, error: new Error("timeout") };
    }),
    /timeout/,
  );
});
