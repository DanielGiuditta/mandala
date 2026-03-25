import type { TimeEntry } from "@mandala/domain";
import { canTrackOwnTimeForProject } from "@mandala/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentViewerAccess,
  type ViewerRequestContext,
} from "./auth";
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer";

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

interface TodayHoursRow {
  hours: number | string;
  project_id: string;
}

export interface SelfTimeTrackerProjectOption {
  id: string;
  name: string;
  photoUrl: string | null;
  todayHours: number;
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

  if (!viewerAccess.viewer?.personId) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to track time.");
  }

  const client = createServerSupabaseClient({ accessToken: context.accessToken });

  if (!client) {
    throw new Error(
      status.message ?? "Time tracker requires a configured database connection.",
    );
  }

  return {
    client,
    personId: viewerAccess.viewer.personId,
    viewer: viewerAccess.viewer,
  };
}

async function listTrackableProjectRows(
  client: SupabaseClient,
  viewer: ResolvedTrackerContext["viewer"],
): Promise<TrackerProjectRow[]> {
  if (!viewer.personId) {
    return [];
  }

  const { data, error } = await client.rpc("list_time_tracker_projects_for_current_user");

  if (error) {
    throw error;
  }

  return ((data ?? []) as TrackerProjectRow[]).filter((project) =>
    canTrackOwnTimeForProject(viewer, toProjectPermissionSubject(project)),
  );
}

async function getTodayHoursByProjectId(
  client: SupabaseClient,
  personId: string,
  localDate: string,
  projectIds: string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("time_entries")
    .select("project_id, hours")
    .eq("person_id", personId)
    .eq("date", localDate)
    .in("project_id", projectIds);

  if (error) {
    throw error;
  }

  return ((data ?? []) as TodayHoursRow[]).reduce((hoursByProjectId, row) => {
    hoursByProjectId.set(
      row.project_id,
      (hoursByProjectId.get(row.project_id) ?? 0) + Number(row.hours),
    );
    return hoursByProjectId;
  }, new Map<string, number>());
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

export async function getSelfTimeTrackerData(
  input: GetSelfTimeTrackerDataInput,
  context: ViewerRequestContext = {},
): Promise<SelfTimeTrackerData> {
  if (!isIsoDate(input.localDate)) {
    throw new Error("Tracker date is invalid.");
  }

  const status = getDatabaseStatus();
  const viewerAccess = await getCurrentViewerAccess(context);

  if (!status.configured) {
    return emptyTrackerData(
      false,
      status.message,
      viewerAccess.accessMessage,
      true,
    );
  }

  if (!viewerAccess.viewer?.personId) {
    return emptyTrackerData(
      true,
      status.message,
      viewerAccess.accessMessage ?? "Sign in to track time.",
      true,
    );
  }

  const client = createServerSupabaseClient({ accessToken: context.accessToken });

  if (!client) {
    return emptyTrackerData(
      true,
      status.message,
      "Sign in to track time.",
      true,
    );
  }

  const projects = await listTrackableProjectRows(client, viewerAccess.viewer);
  const todayHoursByProjectId = await getTodayHoursByProjectId(
    client,
    viewerAccess.viewer.personId,
    input.localDate,
    projects.map((project) => project.id),
  );

  return {
    accessMessage: null,
    configured: true,
    configMessage: status.message,
    forbidden: false,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      photoUrl: project.photo_url ?? null,
      todayHours: todayHoursByProjectId.get(project.id) ?? 0,
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

  const todayHoursByProjectId = await getTodayHoursByProjectId(
    client,
    personId,
    entryDate,
    [projectId],
  );

  return {
    entry: toTimeEntry(data as TrackerTimeEntryRow),
    todayHours: todayHoursByProjectId.get(projectId) ?? 0,
  };
}
