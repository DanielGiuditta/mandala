// Pages that show tracked hours must read them live. Windows agent saves never
// reach a web action, so a cached copy of these reads can stay stale forever
// (Atlantis showed 8.6h for weeks while the database held 28.01h).
import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, test } from "node:test";

register("../../../test/support/typescript-hooks.mjs", import.meta.url, {
  data: {
    aliases: {
      "@mandala/db": new URL("./fakes/mandala-db.mjs", import.meta.url).href,
      "next/cache": new URL("./fakes/next-cache.mjs", import.meta.url).href,
    },
  },
});

const { database } = await import("./fakes/mandala-db.mjs");
const { cachedKeys } = await import("./fakes/next-cache.mjs");
const projects = await import("../app/projects/data-cache.ts");
const people = await import("../app/people/data-cache.ts");
const context = { sessionEmail: "owner@example.test" };

beforeEach(() => {
  database.savedHours = 8.64;
});

async function readTwiceAroundWindowsSave(read) {
  const before = await read();
  database.savedHours = 28.01;
  const after = await read();
  return { after, before };
}

test("project list hours reflect a Windows save on the next load", async () => {
  const { after, before } = await readTwiceAroundWindowsSave(() => projects.loadProjects({}, context));

  assert.equal(before.projects[0].totalHours, 8.64);
  assert.equal(after.projects[0].totalHours, 28.01);
});

test("project detail hours reflect a Windows save on the next load", async () => {
  const { after, before } = await readTwiceAroundWindowsSave(() =>
    projects.loadProjectDetail("atlantis", context),
  );

  assert.equal(before.timeSummary.totalHours, 8.64);
  assert.equal(after.timeSummary.totalHours, 28.01);
});

test("people list hours reflect a Windows save on the next load", async () => {
  const { after } = await readTwiceAroundWindowsSave(() => people.loadPeople({}, context));

  assert.equal(after.people[0].hoursThisWeek, 28.01);
});

test("person detail hours reflect a Windows save on the next load", async () => {
  const { after } = await readTwiceAroundWindowsSave(() => people.loadPersonDetail("jabir", context));

  assert.equal(after.timeSummary.totalHours, 28.01);
});

test("list filters still apply to live reads", async () => {
  const projectData = await projects.loadProjects({ query: "olympus" }, context);
  const peopleData = await people.loadPeople({ query: "jabir" }, context);

  assert.deepEqual(projectData.projects.map((project) => project.id), ["olympus"]);
  assert.deepEqual(peopleData.people.map((person) => person.id), ["jabir"]);
});

test("only reads without hours use the data cache", async () => {
  cachedKeys.length = 0;
  await projects.loadProjects({}, context);
  await projects.loadProjectDetail("atlantis", context);
  await people.loadPeople({}, context);
  await people.loadPersonDetail("jabir", context);
  assert.deepEqual(cachedKeys, []);

  await projects.getCachedProjectRailData(context);
  await people.getCachedPeopleRailData(context);
  assert.deepEqual(cachedKeys, ["project-rail", "people-rail"]);
});
