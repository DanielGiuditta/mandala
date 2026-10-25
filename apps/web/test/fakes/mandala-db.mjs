// Stand-in for @mandala/db. `database.savedHours` plays the role of time saved
// directly in Postgres by the Windows agent, which no web action ever sees.
export const database = { savedHours: 8.64 };

const projects = [
  { clientName: "HiLITE", description: null, id: "atlantis", managingOfficeId: "calicut", name: "HiLITE Atlantis", originatingOfficeId: "calicut", stage: "active" },
  { clientName: "HiLITE", description: null, id: "olympus", managingOfficeId: "calicut", name: "HiLITE Olympus", originatingOfficeId: "calicut", stage: "active" },
];
const people = [
  { email: "a@example.test", fullName: "Ar. Godwin", id: "godwin", officeId: "calicut", title: null },
  { email: "b@example.test", fullName: "Jabir", id: "jabir", officeId: "calicut", title: null },
];

export async function listProjects(filters) {
  return {
    filters,
    projects: projects.map((project) => ({ ...project, totalHours: database.savedHours })),
  };
}

export async function getProjectDetail(projectId) {
  return { project: { id: projectId }, timeSummary: { totalHours: database.savedHours } };
}

export async function listPeople(filters) {
  return {
    filters,
    people: people.map((person) => ({ ...person, hoursThisWeek: database.savedHours })),
  };
}

export async function getPersonDetail(personId) {
  return { person: { id: personId }, timeSummary: { totalHours: database.savedHours } };
}

export async function listProjectRailData() {
  return { offices: [], projects };
}

export async function listPeopleRailData() {
  return { configured: true, forbidden: false, people };
}

export async function listPeopleOfficeOptions() {
  return { configured: true, forbidden: false, offices: [] };
}

export async function listPeopleOptions() {
  return { forbidden: false, people };
}
