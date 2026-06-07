import type { TimeEntry } from "@mandala/domain";
import {
  canAccessTimeTracker,
  canTrackOwnTimeForProject,
  canViewFinancialData,
  deriveHourlyCost,
} from "@mandala/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentViewerAccess,
  type ViewerRequestContext,
} from "./auth";
import { fetchPeopleCompensationById } from "./lookups";
import {
  PREVIEW_CONFIG_MESSAGE,
  previewAssignments,
  previewPeople,
  previewProjects,
  previewTimeEntries,
} from "./previewData";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getDatabaseStatus,
} from "./supabaseServer";
import { createPerfTrace } from "./perf";

interface TrackerProjectRow {
  active: boolean;
  id: string;
  lead_person_id: string | null;
  managing_office_id: string;
  name: string;
  photo_url: string | null;
}

interface TrackerAssignmentRow {
  end_date: string | null;
  id: string;
  start_date: string | null;
}

interface TrackerTimeEntryRow {
  assignment_id: string | null;
  date: string;
  hours: number | string;
  id: string;
  notes: string | null;
  person_id: string;
  project_id: string;
  source: string | null;
}

interface TrackerIdRow {
  id: string;
}

interface ProjectHoursRow {
  hours: number | string;
  project_id: string;
}

export interface SelfTimeTrackerProjectOption {
  id: string;
  name: string;
  photoUrl: string | null;
  todayHours: number;
  totalCost: number | null;
  totalHours: number;
}

export interface SelfTimeTrackerData {
  accessMessage: string | null;
  configured: boolean;
  configMessage: string | null;
  forbidden: boolean;
  projects: SelfTimeTrackerProjectOption[];
}

export interface GetSelfTimeTrackerDataInput {
  localDate: string;
}

export interface RecordSelfTimeTrackerEntryInput {
  entryDate: string;
  projectId: string;
  startedAt: string;
  stoppedAt: string;
}

export interface RecordSelfTimeTrackerEntryResult {
  entry: TimeEntry;
  todayHours: number;
}

interface ResolvedTrackerContext {
  client: SupabaseClient;
  personId: string;
  viewer: NonNullable<
    Awaited<ReturnType<typeof getCurrentViewerAccess>>["viewer"]
  >;
}

const PROJECT_ROW_SELECT =
  "id, name, photo_url, managing_office_id, lead_person_id, active";
const TIME_ENTRY_ROW_SELECT =
  "id, person_id, project_id, assignment_id, date, hours, notes, source";

function emptyTrackerData(
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  forbidden: boolean,
): SelfTimeTrackerData {
  return {
    accessMessage,
    configured,
    configMessage,
    forbidden,
    projects: [],
  };
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function parseTimestamp(value: string, fieldName: string): Date {
  const normalized = value.trim();
  const parsed = new Date(normalized);

  if (!normalized || Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed;
}

function roundHours(durationMs: number): number {
  return Math.round((durationMs / 3_600_000) * 100) / 100;
}

function createPreviewTimeEntryId(): string {
  const maxSuffix = previewTimeEntries.reduce((currentMax, entry) => {
    const suffix = Number(entry.id.split("-").at(-1));
    return Number.isFinite(suffix) ? Math.max(currentMax, suffix) : currentMax;
  }, 0);

  return `40000000-0000-0000-0000-${String(maxSuffix + 1).padStart(12, "0")}`;
}

function toTimeEntry(row: TrackerTimeEntryRow): TimeEntry {
  return {
    assignmentId: row.assignment_id,
    date: row.date,
    hours: Number(row.hours),
    id: row.id,
    notes: row.notes,
    personId: row.person_id,
    projectId: row.project_id,
    source: row.source,
  };
}

function toProjectPermissionSubject(project: TrackerProjectRow) {
  return {
    id: project.id,
    leadPersonId: project.lead_person_id,
    managingOfficeId: project.managing_office_id,
  };
}

function createTrackerDatabaseClient(
  context: ViewerRequestContext,
): SupabaseClient | null {
  return createServerSupabaseClient({ accessToken: context.accessToken });
}

async function resolveTrackerPersonId(
  context: ViewerRequestContext,
  viewer: Awaited<ReturnType<typeof getCurrentViewerAccess>>["viewer"],
): Promise<string | null> {
  if (viewer?.personId) {
    return viewer.personId;
  }

  const sessionEmail = normalizeEmail(context.sessionEmail);
  const client = createServiceRoleSupabaseClient();

  if (!viewer || !sessionEmail || !client) {
    return null;
  }

  const { data, error } = await client
    .from("people")
    .select("id")
    .ilike("email", sessionEmail)
    .eq("active", true);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as TrackerIdRow[];
  return rows.length === 1 ? rows[0].id : null;
}

async function resolveTrackerContext(
  context: ViewerRequestContext,
): Promise<ResolvedTrackerContext> {
  const status = getDatabaseStatus();

  if (!status.configured) {
    throw new Error(
      status.message ?? "Time tracker requires a configured database connection.",
    );
  }

  const viewerAccess = await getCurrentViewerAccess(context);
  const personId = await resolveTrackerPersonId(context, viewerAccess.viewer);

  if (!viewerAccess.viewer || !personId) {
    throw new Error(
      viewerAccess.accessMessage ?? "Finish account setup to track time.",
    );
  }

  const client = createTrackerDatabaseClient(context);

  if (!client) {
    throw new Error(
      status.message ?? "Time tracker requires a configured database connection.",
    );
  }

  return {
    client,
    personId,
    viewer: {
      ...viewerAccess.viewer,
      personId,
    },
  };
}

async function listTrackableProjectRows(
  client: SupabaseClient,
  viewer: ResolvedTrackerContext["viewer"],
): Promise<TrackerProjectRow[]> {
  if (!viewer.active) {
    return [];
  }

  const { data, error } = await client
    .from("projects")
    .select(PROJECT_ROW_SELECT)
    .eq("active", true)
    .order("name");

  if (error) {
    throw error;
  }

  return ((data ?? []) as TrackerProjectRow[]).filter((project) =>
    canTrackOwnTimeForProject(viewer, toProjectPermissionSubject(project)),
  );
}

async function getTrackedHoursByProjectId(
  client: SupabaseClient,
  personId: string,
  projectIds: string[],
  localDate?: string,
): Promise<Map<string, number>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  let query = client
    .from("time_entries")
    .select("project_id, hours")
    .eq("person_id", personId)
    .in("project_id", projectIds);

  if (localDate) {
    query = query.eq("date", localDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as ProjectHoursRow[]).reduce((hoursByProjectId, row) => {
    hoursByProjectId.set(
      row.project_id,
      (hoursByProjectId.get(row.project_id) ?? 0) + Number(row.hours),
    );
    return hoursByProjectId;
  }, new Map<string, number>());
}

async function getTrackerHourlyCost(
  client: SupabaseClient,
  personId: string | null,
): Promise<number> {
  if (!personId) {
    return 0;
  }

  const compensationByPersonId = await fetchPeopleCompensationById([personId], {
    client,
  });
  const annualSalary = compensationByPersonId.get(personId);

  return annualSalary === undefined ? 0 : deriveHourlyCost(annualSalary);
}

async function resolveTrackableProject(
  client: SupabaseClient,
  viewer: ResolvedTrackerContext["viewer"],
  projectId: string,
): Promise<TrackerProjectRow> {
  const projects = await listTrackableProjectRows(client, viewer);
  const project = projects.find((candidate) => candidate.id === projectId);

  if (!project) {
    throw new Error("Selected project is unavailable.");
  }

  if (!project.active) {
    throw new Error("Selected project is inactive.");
  }

  if (!canTrackOwnTimeForProject(viewer, toProjectPermissionSubject(project))) {
    throw new Error("You do not have permission to track time for this project.");
  }

  return project;
}

function assignmentMatchesDate(
  assignment: TrackerAssignmentRow,
  entryDate: string,
): boolean {
  if (assignment.start_date && assignment.start_date > entryDate) {
    return false;
  }

  if (assignment.end_date && assignment.end_date < entryDate) {
    return false;
  }

  return true;
}

async function resolveAssignmentId(
  client: SupabaseClient,
  personId: string,
  projectId: string,
  entryDate: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("assignments")
    .select("id, start_date, end_date")
    .eq("active", true)
    .eq("person_id", personId)
    .eq("project_id", projectId);

  if (error) {
    throw error;
  }

  const matchingAssignments = ((data ?? []) as TrackerAssignmentRow[]).filter((assignment) =>
    assignmentMatchesDate(assignment, entryDate),
  );

  return matchingAssignments.length === 1 ? matchingAssignments[0].id : null;
}

function listPreviewTrackableProjectRows(
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentViewerAccess>>["viewer"]>,
): TrackerProjectRow[] {
  if (!viewer.active) {
    return [];
  }

  return previewProjects
    .filter((project) => project.active)
    .filter((project) =>
      canTrackOwnTimeForProject(viewer, toProjectPermissionSubject(project)),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getPreviewTrackedHoursByProjectId(
  personId: string,
  projectIds: string[],
  localDate?: string,
): Map<string, number> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const projectIdSet = new Set(projectIds);

  return previewTimeEntries.reduce((hoursByProjectId, row) => {
    if (
      row.person_id !== personId ||
      (localDate ? row.date !== localDate : false) ||
      !projectIdSet.has(row.project_id)
    ) {
      return hoursByProjectId;
    }

    hoursByProjectId.set(
      row.project_id,
      (hoursByProjectId.get(row.project_id) ?? 0) + Number(row.hours),
    );
    return hoursByProjectId;
  }, new Map<string, number>());
}

function getPreviewTrackerHourlyCost(personId: string | null): number {
  if (!personId) {
    return 0;
  }

  const person = previewPeople.find((candidate) => candidate.id === personId);
  return person ? deriveHourlyCost(Number(person.annual_salary)) : 0;
}

function resolvePreviewTrackableProject(
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentViewerAccess>>["viewer"]>,
  projectId: string,
): TrackerProjectRow {
  const project = listPreviewTrackableProjectRows(viewer).find(
    (candidate) => candidate.id === projectId,
  );

  if (!project) {
    throw new Error("Selected project is unavailable.");
  }

  return project;
}

function resolvePreviewAssignmentId(
  personId: string,
  projectId: string,
  entryDate: string,
): string | null {
  const matchingAssignments = previewAssignments.filter(
    (assignment) =>
      assignment.active &&
      assignment.person_id === personId &&
      assignment.project_id === projectId &&
      assignmentMatchesDate(assignment, entryDate),
  );

  return matchingAssignments.length === 1 ? matchingAssignments[0].id : null;
}

export async function getSelfTimeTrackerData(
  input: GetSelfTimeTrackerDataInput,
  context: ViewerRequestContext = {},
): Promise<SelfTimeTrackerData> {
  const trace = createPerfTrace("getSelfTimeTrackerData", {
    hasLocalDate: Boolean(input.localDate),
  });

  if (!isIsoDate(input.localDate)) {
    throw new Error("Tracker date is invalid.");
  }

  const status = getDatabaseStatus();
  const viewerAccess = await trace.measure("getCurrentViewerAccess", () =>
    getCurrentViewerAccess(context),
  );

  if (!status.configured) {
    if (!viewerAccess.viewer) {
      trace.finish({
        hasViewer: false,
        projectCount: 0,
        result: "preview-forbidden",
      });
      return emptyTrackerData(
        false,
        PREVIEW_CONFIG_MESSAGE,
        viewerAccess.accessMessage ?? "Sign in to track time.",
        true,
      );
    }

    const personId = await trace.measure("resolveTrackerPersonId", () =>
      resolveTrackerPersonId(context, viewerAccess.viewer),
    );
    const trackerViewer = personId
      ? { ...viewerAccess.viewer, personId }
      : viewerAccess.viewer;

    if (!canAccessTimeTracker(trackerViewer)) {
      trace.finish({
        hasPersonId: Boolean(personId),
        hasViewer: true,
        projectCount: 0,
        result: "preview-forbidden",
      });
      return emptyTrackerData(
        false,
        PREVIEW_CONFIG_MESSAGE,
        "Current viewer cannot access the time tracker.",
        true,
      );
    }

    const projects = await trace.measure("listPreviewTrackableProjectRows", () =>
      Promise.resolve(listPreviewTrackableProjectRows(trackerViewer)),
    );
    const todayHoursByProjectId = personId
      ? await trace.measure("getPreviewTodayHoursByProjectId", () =>
          Promise.resolve(
            getPreviewTrackedHoursByProjectId(
              personId,
              projects.map((project) => project.id),
              input.localDate,
            ),
          ),
        )
      : new Map<string, number>();
    const totalHoursByProjectId = personId
      ? await trace.measure("getPreviewTotalHoursByProjectId", () =>
          Promise.resolve(
            getPreviewTrackedHoursByProjectId(
              personId,
              projects.map((project) => project.id),
            ),
          ),
        )
      : new Map<string, number>();
    const hourlyCost = personId
      ? await trace.measure("getPreviewTrackerHourlyCost", () =>
          Promise.resolve(getPreviewTrackerHourlyCost(personId)),
        )
      : 0;
    const canViewTrackerCosts = canViewFinancialData(trackerViewer);

    trace.finish({
      hasPersonId: Boolean(personId),
      hasViewer: true,
      projectCount: projects.length,
      result: "preview",
    });

    return {
      accessMessage: personId ? null : "Finish account setup to record time.",
      configured: false,
      configMessage: PREVIEW_CONFIG_MESSAGE,
      forbidden: false,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        photoUrl: project.photo_url ?? null,
        todayHours: todayHoursByProjectId.get(project.id) ?? 0,
        totalCost: canViewTrackerCosts
          ? (totalHoursByProjectId.get(project.id) ?? 0) * hourlyCost
          : null,
        totalHours: totalHoursByProjectId.get(project.id) ?? 0,
      })),
    };
  }

  if (!viewerAccess.viewer) {
    trace.finish({
      hasViewer: false,
      projectCount: 0,
      result: "forbidden",
    });
    return emptyTrackerData(
      true,
      status.message,
      viewerAccess.accessMessage ?? "Sign in to track time.",
      true,
    );
  }

  const client = createTrackerDatabaseClient(context);

  if (!client) {
    trace.finish({
      hasViewer: true,
      projectCount: 0,
      result: "missing-client",
    });
    return emptyTrackerData(
      true,
      status.message,
      "Sign in to track time.",
      true,
    );
  }

  const personId = await trace.measure("resolveTrackerPersonId", () =>
    resolveTrackerPersonId(context, viewerAccess.viewer),
  );
  const trackerViewer = personId
    ? { ...viewerAccess.viewer, personId }
    : viewerAccess.viewer;

  if (!canAccessTimeTracker(trackerViewer)) {
    trace.finish({
      hasPersonId: Boolean(personId),
      hasViewer: true,
      projectCount: 0,
      result: "forbidden",
    });
    return emptyTrackerData(
      true,
      status.message,
      "Current viewer cannot access the time tracker.",
      true,
    );
  }

  const projects = await trace.measure("listTrackableProjectRows", () =>
    listTrackableProjectRows(client, trackerViewer),
  );
  const todayHoursByProjectId = personId
    ? await trace.measure("getTodayHoursByProjectId", () =>
        getTrackedHoursByProjectId(
          client,
          personId,
          projects.map((project) => project.id),
          input.localDate,
        ),
      )
    : new Map<string, number>();
  const totalHoursByProjectId = personId
    ? await trace.measure("getTotalHoursByProjectId", () =>
        getTrackedHoursByProjectId(
          client,
          personId,
          projects.map((project) => project.id),
        ),
      )
    : new Map<string, number>();
  const canViewTrackerCosts = canViewFinancialData(trackerViewer);
  const hourlyCost = personId && canViewTrackerCosts
    ? await trace.measure("getTrackerHourlyCost", () =>
        getTrackerHourlyCost(client, personId),
      )
    : 0;

  trace.finish({
    hasPersonId: Boolean(personId),
    hasViewer: true,
    projectCount: projects.length,
    result: "live",
  });

  return {
    accessMessage: personId
      ? null
      : "Finish account setup to record time.",
    configured: true,
    configMessage: status.message,
    forbidden: false,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      photoUrl: project.photo_url ?? null,
      todayHours: todayHoursByProjectId.get(project.id) ?? 0,
      totalCost: canViewTrackerCosts
        ? (totalHoursByProjectId.get(project.id) ?? 0) * hourlyCost
        : null,
      totalHours: totalHoursByProjectId.get(project.id) ?? 0,
    })),
  };
}

export async function recordSelfTimeTrackerEntry(
  input: RecordSelfTimeTrackerEntryInput,
  context: ViewerRequestContext = {},
): Promise<RecordSelfTimeTrackerEntryResult> {
  const entryDate = normalizeRequiredText(input.entryDate, "Entry date");

  if (!isIsoDate(entryDate)) {
    throw new Error("Entry date is invalid.");
  }

  const projectId = normalizeRequiredText(input.projectId, "Project");
  const startedAt = parseTimestamp(input.startedAt, "Start time");
  const stoppedAt = parseTimestamp(input.stoppedAt, "Stop time");
  const durationMs = stoppedAt.getTime() - startedAt.getTime();

  if (durationMs <= 0) {
    throw new Error("Tracked duration must be greater than 0.");
  }

  const hours = roundHours(durationMs);

  if (hours <= 0) {
    throw new Error("Tracked duration is too short to save.");
  }

  const status = getDatabaseStatus();

  if (!status.configured) {
    const viewerAccess = await getCurrentViewerAccess(context);
    const personId = await resolveTrackerPersonId(context, viewerAccess.viewer);

    if (!viewerAccess.viewer || !personId) {
      throw new Error(
        viewerAccess.accessMessage ?? "Finish account setup to track time.",
      );
    }

    resolvePreviewTrackableProject(
      { ...viewerAccess.viewer, personId },
      projectId,
    );

    const assignmentId = resolvePreviewAssignmentId(personId, projectId, entryDate);
    const row = {
      assignment_id: assignmentId,
      date: entryDate,
      hours,
      id: createPreviewTimeEntryId(),
      notes: null,
      person_id: personId,
      project_id: projectId,
      source: "manual",
    };

    previewTimeEntries.push(row);

    return {
      entry: toTimeEntry(row),
      todayHours:
        getPreviewTrackedHoursByProjectId(personId, [projectId], entryDate).get(projectId) ?? 0,
    };
  }

  const { client, personId, viewer } = await resolveTrackerContext(context);

  await resolveTrackableProject(client, viewer, projectId);

  const assignmentId = await resolveAssignmentId(client, personId, projectId, entryDate);
  const { data, error } = await client
    .from("time_entries")
    .insert({
      assignment_id: assignmentId,
      date: entryDate,
      hours,
      notes: null,
      person_id: personId,
      project_id: projectId,
      source: "manual",
    })
    .select(TIME_ENTRY_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const todayHoursByProjectId = await getTrackedHoursByProjectId(
    client,
    personId,
    [projectId],
    entryDate,
  );

  return {
    entry: toTimeEntry(data as TrackerTimeEntryRow),
    todayHours: todayHoursByProjectId.get(projectId) ?? 0,
  };
}
