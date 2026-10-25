// Project time totals must come from one SQL aggregate
// (get_project_list_time_metrics) in both the Projects list and the project
// detail view, so the same project never shows two different totals.
import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, test } from "node:test";

register("../../../test/support/typescript-hooks.mjs", import.meta.url, {
  data: {
    aliases: {
      "@supabase/supabase-js": new URL("./fakes/supabase-js.mjs", import.meta.url).href,
    },
  },
});

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake-project.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.MANDALA_DEBUG_PERF = "false";

const { getProjectDetail, listProjects } = await import("@mandala/db");
const { installFakeDatabase, recordedRpcCalls } = await import("./fakes/supabase-js.mjs");

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000010";
const LEAD_ID = "00000000-0000-4000-8000-000000000020";
const WORKER_ID = "00000000-0000-4000-8000-000000000021";
const OWNER_PERSON_ID = "00000000-0000-4000-8000-000000000022";

const projectRow = {
  active: true,
  client_name: "Client",
  description: null,
  id: PROJECT_ID,
  lead_person_id: LEAD_ID,
  managing_office_id: OFFICE_ID,
  name: "HiLITE Atlantis",
  originating_office_id: OFFICE_ID,
  photo_url: null,
  stage: "active",
  start_date: null,
  target_completion_date: null,
};

function person(id, fullName) {
  return {
    active: true,
    availability_hours_per_week: 40,
    email: `${id}@example.test`,
    full_name: fullName,
    id,
    office_id: OFFICE_ID,
    photo_url: null,
    supervisor_person_id: null,
    title: null,
  };
}

// 0.05 + 0.10 is 0.15000000000000002 in JavaScript but exactly 0.15 in SQL.
// One decimal place turns those into 0.2 and 0.1, so summing in two places
// could show two different totals.
const timeEntryRows = [
  { assignment_id: null, date: "2026-10-19", hours: 0.05, id: "e1", notes: null, person_id: WORKER_ID, project_id: PROJECT_ID, source: "windows-tracker" },
  { assignment_id: null, date: "2026-10-18", hours: 0.1, id: "e2", notes: null, person_id: LEAD_ID, project_id: PROJECT_ID, source: "windows-tracker" },
];

function viewerAccess(overrides = {}) {
  return {
    accessMessage: null,
    summary: null,
    viewer: {
      active: true,
      activeAssignedProjectIds: [],
      clientProjectIds: [],
      email: "owner@example.test",
      leadProjectIds: [],
      personId: OWNER_PERSON_ID,
      roleAssignments: [
        {
          active: true,
          assignedByUserAccountId: "ua-owner",
          id: "role-partner",
          officeId: null,
          role: "partner",
          userAccountId: "ua-owner",
        },
      ],
      userAccountId: "ua-owner",
      ...overrides,
    },
  };
}

function installProject({ metrics } = {}) {
  installFakeDatabase({
    rpc: {
      get_project_detail_context: () => ({
        data: {
          assignments: [],
          checklistItems: [],
          documents: [],
          found: true,
          offices: [{ id: OFFICE_ID, name: "Calicut" }],
          people: [person(LEAD_ID, "Lead Architect"), person(WORKER_ID, "Design Assistant")],
          project: projectRow,
          timeEntries: timeEntryRows,
        },
        error: null,
      }),
      get_project_list_time_metrics: metrics ?? (() => ({
        data: [{ project_id: PROJECT_ID, rough_labor_cost: "150.00", total_hours: "0.15" }],
        error: null,
      })),
      list_people_compensation: () => ({
        data: [
          { annual_salary: 2_080_000, person_id: LEAD_ID },
          { annual_salary: 2_080_000, person_id: WORKER_ID },
        ],
        error: null,
      }),
    },
    tables: {
      active_work_sessions: [],
      offices: [{ id: OFFICE_ID, name: "Calicut" }],
      people: [person(LEAD_ID, "Lead Architect"), person(WORKER_ID, "Design Assistant")],
      projects: [projectRow],
    },
  });
}

beforeEach(() => installProject());

test("project detail shows the same SQL total as the Projects list", async () => {
  const context = { viewerAccess: viewerAccess() };
  const list = await listProjects({}, context);
  const detail = await getProjectDetail(PROJECT_ID, context);
  const listRow = list.projects.find((project) => project.id === PROJECT_ID);

  assert.equal(listRow.totalHours, 0.15);
  assert.equal(detail.timeSummary.totalHours, 0.15);
  assert.equal(detail.timeSummary.totalHours.toFixed(1), listRow.totalHours.toFixed(1));
  assert.equal(detail.project.totalHours, listRow.totalHours);
  assert.equal(detail.timeSummary.totalLaborCost, 150);
  assert.equal(detail.timeSummary.totalLaborCost, listRow.totalLaborCost);
  // The work log still lists every stored row.
  assert.deepEqual(detail.timeSummary.recentEntries.map((entry) => entry.id), ["e1", "e2"]);
});

test("project detail asks the SQL aggregate for exactly that project", async () => {
  await getProjectDetail(PROJECT_ID, { viewerAccess: viewerAccess() });

  assert.deepEqual(
    recordedRpcCalls("get_project_list_time_metrics").map((call) => call.args),
    [{ input_project_ids: [PROJECT_ID] }],
  );
});

test("a failed total is an error, not a silently different number", async () => {
  installProject({
    metrics: () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }),
  });

  await assert.rejects(
    getProjectDetail(PROJECT_ID, { viewerAccess: viewerAccess() }),
    (error) => error.code === "57014",
  );
});

test("client viewers keep the summary-only view and never request totals", async () => {
  const context = {
    viewerAccess: viewerAccess({
      clientProjectIds: [PROJECT_ID],
      personId: null,
      roleAssignments: [],
    }),
  };
  const detail = await getProjectDetail(PROJECT_ID, context);

  assert.equal(detail.restrictedToSummary, true);
  assert.equal(detail.project.totalHours, null);
  assert.equal(detail.timeSummary.totalHours, 0);
  assert.deepEqual(recordedRpcCalls("get_project_list_time_metrics"), []);
});
