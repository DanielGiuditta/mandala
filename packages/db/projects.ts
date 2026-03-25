import type {
  Assignment,
  ChecklistItem,
  Project,
  ProjectStage,
  ResourceDocument,
  TimeEntry,
} from "@mandala/domain";
import {
  canAddChecklistItemsToProject,
  canAssignPeopleToProject,
  canCreateOrUpdateProjects,
  canEditProjectTime,
  canUploadProjectDocuments,
  canViewInternalProject,
  canViewProjectSummary,
  deriveHourlyCost,
  isProjectStage,
} from "@mandala/domain";

import {
  getCurrentViewerAccess,
  getViewerLabel,
  type CurrentViewerAccess,
  type ViewerRequestContext,
} from "./auth";
import {
  fetchOfficeRows,
  fetchPeopleRows,
  type OfficeRow,
  type PersonRow,
} from "./lookups";
import {
  PREVIEW_CONFIG_MESSAGE,
  previewAssignments,
  previewChecklistItems,
  previewOffices,
  previewPeople,
  previewProjects,
  previewResourceDocuments,
  previewTimeEntries,
} from "./previewData";
import {
  createServerSupabaseClient,
  getDatabaseStatus,
} from "./supabaseServer";

const PROJECT_READ_CACHE_TTL_MS = 15_000;

interface ProjectRow {
  id: string;
  name: string;
  client_name: string | null;
  description: string | null;
  photo_url: string | null;
  originating_office_id: string;
  managing_office_id: string;
  lead_person_id: string | null;
  stage: string;
  start_date: string | null;
  target_completion_date: string | null;
  active: boolean;
}

interface ProjectMutationContext {
  client: NonNullable<ReturnType<typeof createServerSupabaseClient>>;
  projectRow: ProjectRow;
  viewer: NonNullable<CurrentViewerAccess["viewer"]>;
}

interface AssignmentRow {
  id: string;
  project_id: string;
  person_id: string;
  assigned_hours_per_week: number | string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  active: boolean;
}

interface ChecklistItemRow {
  id: string;
  project_id: string;
  title: string;
  assigned_person_id: string | null;
  completed: boolean;
  created_at: string;
  completed_at: string | null;
}

interface ResourceDocumentRow {
  id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  project_id: string | null;
  category: string | null;
  description: string | null;
  uploaded_by_person_id: string | null;
  created_at: string;
}

interface TimeEntryRow {
  id: string;
  person_id: string;
  project_id: string;
  assignment_id: string | null;
  date: string;
  hours: number | string;
  notes: string | null;
  source: string | null;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const projectListCache = new Map<string, CacheEntry<ProjectListData>>();
const projectRailCache = new Map<string, CacheEntry<ProjectRailData>>();
const projectDetailCache = new Map<string, CacheEntry<ProjectDetailData>>();

function getCachedValue<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedValue<T>(store: Map<string, CacheEntry<T>>, key: string, value: T): T {
  store.set(key, {
    expiresAt: Date.now() + PROJECT_READ_CACHE_TTL_MS,
    value,
  });

  return value;
}

function normalizeCacheEmail(context: ViewerRequestContext): string | null {
  const sessionEmail = context.sessionEmail?.trim().toLowerCase();
  return sessionEmail || null;
}

function getProjectListCacheKey(
  filters: ProjectListFilters,
  context: ViewerRequestContext,
): string | null {
  const sessionEmail = normalizeCacheEmail(context);

  if (!sessionEmail) {
    return null;
  }

  return JSON.stringify({
    officeId: filters.officeId ?? "",
    query: filters.query?.trim().toLowerCase() ?? "",
    sessionEmail,
    stage: filters.stage ?? "",
  });
}

function getProjectRailCacheKey(context: ViewerRequestContext): string | null {
  return normalizeCacheEmail(context);
}

function getProjectDetailCacheKey(
  projectId: string,
  context: ViewerRequestContext,
): string | null {
  const sessionEmail = normalizeCacheEmail(context);

  if (!sessionEmail) {
    return null;
  }

  return `${sessionEmail}:${projectId}`;
}

export function invalidateProjectReadCaches(): void {
  projectListCache.clear();
  projectRailCache.clear();
  projectDetailCache.clear();
}

export interface ProjectOfficeFilter {
  id: string;
  name: string;
}

export interface ProjectListFilters {
  officeId?: string;
  query?: string;
  stage?: ProjectStage;
}

export interface ProjectListItem extends Project {
  clientName: string | null;
  description: string | null;
  leadPersonName: string | null;
  leadPersonPhotoUrl: string | null;
  managingOfficeName: string;
  originatingOfficeName: string;
  plannedHoursPerWeek: number | null;
  restrictedToSummary: boolean;
  roughLaborCost: number | null;
}

export interface ProjectAssignmentItem extends Assignment {
  personName: string;
  personOfficeName: string | null;
  personPhotoUrl: string | null;
  personTitle: string | null;
}

export interface ProjectChecklistItem extends ChecklistItem {
  assignedPersonName: string | null;
  assignedPersonPhotoUrl: string | null;
}

export interface ProjectDocumentItem extends ResourceDocument {
  uploadedByPersonName: string | null;
  uploadedByPersonPhotoUrl: string | null;
}

export interface ProjectTimeSummary {
  byPerson: Array<{
    hours: number;
    hourlyCost: number | null;
    laborCost: number;
    personId: string;
    personName: string;
    personPhotoUrl: string | null;
    personTitle: string | null;
  }>;
  recentEntries: Array<
    TimeEntry & {
      hourlyCost: number | null;
      laborCost: number;
      personName: string | null;
      personPhotoUrl: string | null;
      personTitle: string | null;
    }
  >;
  totalHours: number;
  totalLaborCost: number;
}

export interface ProjectDetailData {
  accessMessage: string | null;
  checklistItems: ProjectChecklistItem[];
  configured: boolean;
  configMessage: string | null;
  documents: ProjectDocumentItem[];
  forbidden: boolean;
  project: ProjectListItem | null;
  restrictedToSummary: boolean;
  staffing: ProjectAssignmentItem[];
  timeSummary: ProjectTimeSummary;
  viewerLabel: string | null;
}

export interface ProjectRailItem {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface ProjectRailData {
  accessMessage: string | null;
  configured: boolean;
  configMessage: string | null;
  forbidden: boolean;
  offices: ProjectOfficeFilter[];
  projects: ProjectRailItem[];
  viewerLabel: string | null;
}

export interface ProjectListData {
  accessMessage: string | null;
  configured: boolean;
  configMessage: string | null;
  forbidden: boolean;
  filters: ProjectListFilters;
  offices: ProjectOfficeFilter[];
  projects: ProjectListItem[];
  viewerLabel: string | null;
}

export interface CreateProjectInput {
  name: string;
  clientName?: string | null;
  description?: string | null;
  photoUrl?: string | null;
  originatingOfficeId: string;
  managingOfficeId: string;
  leadPersonId?: string | null;
  stage: ProjectStage;
  startDate?: string | null;
  targetCompletionDate?: string | null;
}

export interface CreateProjectAssignmentInput {
  assignedHoursPerWeek: number;
  endDate?: string | null;
  notes?: string | null;
  personId: string;
  projectId: string;
  startDate?: string | null;
}

export interface CreateProjectChecklistItemInput {
  assignedPersonId?: string | null;
  projectId: string;
  title: string;
}

export interface UpdateProjectChecklistItemInput {
  assignedPersonId?: string | null;
  checklistItemId: string;
  completed?: boolean;
  projectId: string;
  title?: string;
}

export interface CreateProjectDocumentInput {
  category?: string | null;
  description?: string | null;
  fileType?: string | null;
  fileUrl: string;
  name: string;
  projectId: string;
}

export interface UpdateProjectTimeEntryInput {
  assignmentId?: string | null;
  date?: string;
  hours?: number;
  notes?: string | null;
  projectId: string;
  timeEntryId: string;
}

const PROJECT_ROW_SELECT =
  "id, name, client_name, description, photo_url, originating_office_id, managing_office_id, lead_person_id, stage, start_date, target_completion_date, active";
const ASSIGNMENT_ROW_SELECT =
  "id, project_id, person_id, assigned_hours_per_week, start_date, end_date, notes, active";
const CHECKLIST_ROW_SELECT =
  "id, project_id, title, assigned_person_id, completed, created_at, completed_at";
const RESOURCE_DOCUMENT_ROW_SELECT =
  "id, name, file_url, file_type, project_id, category, description, uploaded_by_person_id, created_at";
const TIME_ENTRY_ROW_SELECT =
  "id, person_id, project_id, assignment_id, date, hours, notes, source";

function toProjectStage(value: string): ProjectStage {
  return isProjectStage(value) ? value : "proposal";
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();

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

function normalizePositiveNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }

  return value;
}

function normalizeNonNegativeNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be 0 or greater.`);
  }

  return value;
}

async function resolveProjectMutationContext(
  projectId: string,
  context: ViewerRequestContext = {},
): Promise<ProjectMutationContext> {
  const status = getDatabaseStatus();

  if (!status.configured) {
    throw new Error(
      "Project updates require a configured database connection.",
    );
  }

  const viewerAccess = await getCurrentViewerAccess(context);

  if (!viewerAccess.viewer) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to continue.");
  }

  const client = createServerSupabaseClient({
    accessToken: context.accessToken,
  });

  if (!client) {
    throw new Error(
      "Project updates require a configured database connection.",
    );
  }

  const normalizedProjectId = normalizeRequiredText(projectId, "Project");
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_ROW_SELECT)
    .eq("id", normalizedProjectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Selected project is unavailable.");
  }

  return {
    client,
    projectRow: data as ProjectRow,
    viewer: viewerAccess.viewer,
  };
}

async function resolveActivePerson(
  personId: string,
  client: ProjectMutationContext["client"],
  fieldName: string,
): Promise<PersonRow> {
  const people = await fetchPeopleRows([normalizeRequiredText(personId, fieldName)], {
    client,
  });
  const person = people[0];

  if (!person) {
    throw new Error(`Selected ${fieldName.toLowerCase()} is unavailable.`);
  }

  if (!person.active) {
    throw new Error(`Selected ${fieldName.toLowerCase()} must be active.`);
  }

  return person;
}

async function resolveAssignmentRow(
  assignmentId: string,
  client: ProjectMutationContext["client"],
): Promise<AssignmentRow> {
  const { data, error } = await client
    .from("assignments")
    .select(ASSIGNMENT_ROW_SELECT)
    .eq("id", normalizeRequiredText(assignmentId, "Assignment"))
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Selected assignment is unavailable.");
  }

  return data as AssignmentRow;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientName: row.client_name,
    description: row.description,
    photoUrl: row.photo_url,
    originatingOfficeId: row.originating_office_id,
    managingOfficeId: row.managing_office_id,
    leadPersonId: row.lead_person_id,
    stage: toProjectStage(row.stage),
    startDate: row.start_date,
    targetCompletionDate: row.target_completion_date,
    active: row.active,
  };
}

function toAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    projectId: row.project_id,
    personId: row.person_id,
    assignedHoursPerWeek: Number(row.assigned_hours_per_week),
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    active: row.active,
  };
}

function toChecklistItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    assignedPersonId: row.assigned_person_id,
    completed: row.completed,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function toResourceDocument(row: ResourceDocumentRow): ResourceDocument {
  return {
    id: row.id,
    name: row.name,
    fileUrl: row.file_url,
    fileType: row.file_type,
    projectId: row.project_id,
    category: row.category,
    description: row.description,
    uploadedByPersonId: row.uploaded_by_person_id,
    createdAt: row.created_at,
  };
}

function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    personId: row.person_id,
    projectId: row.project_id,
    assignmentId: row.assignment_id,
    date: row.date,
    hours: Number(row.hours),
    notes: row.notes,
    source: row.source,
  };
}

function buildProjectListItem(
  row: ProjectRow,
  officesById: Map<string, OfficeRow>,
  peopleById: Map<string, PersonRow>,
  metrics: { plannedHoursPerWeek: number; roughLaborCost: number } | null,
  restrictedToSummary: boolean,
): ProjectListItem {
  const project = toProject(row);

  return {
    ...project,
    clientName: project.clientName ?? null,
    description: project.description ?? null,
    leadPersonName: row.lead_person_id
      ? (peopleById.get(row.lead_person_id)?.full_name ?? null)
      : null,
    leadPersonPhotoUrl: row.lead_person_id
      ? (peopleById.get(row.lead_person_id)?.photo_url ?? null)
      : null,
    managingOfficeName:
      officesById.get(row.managing_office_id)?.name ?? "Unknown office",
    originatingOfficeName:
      officesById.get(row.originating_office_id)?.name ?? "Unknown office",
    plannedHoursPerWeek: restrictedToSummary
      ? null
      : (metrics?.plannedHoursPerWeek ?? 0),
    restrictedToSummary,
    roughLaborCost: restrictedToSummary ? null : (metrics?.roughLaborCost ?? 0),
  };
}

function matchesFilters(row: ProjectRow, filters: ProjectListFilters): boolean {
  const query = filters.query?.trim().toLowerCase();

  if (filters.stage && toProjectStage(row.stage) !== filters.stage) {
    return false;
  }

  if (
    filters.officeId &&
    row.originating_office_id !== filters.officeId &&
    row.managing_office_id !== filters.officeId
  ) {
    return false;
  }

  if (query) {
    const haystacks = [row.name, row.client_name ?? "", row.description ?? ""];
    return haystacks.some((value) => value.toLowerCase().includes(query));
  }

  return true;
}

function emptyTimeSummary(): ProjectTimeSummary {
  return {
    byPerson: [],
    recentEntries: [],
    totalHours: 0,
    totalLaborCost: 0,
  };
}

function toProjectPermissionSubject(row: ProjectRow) {
  return {
    id: row.id,
    leadPersonId: row.lead_person_id,
    managingOfficeId: row.managing_office_id,
  };
}

function emptyProjectListData(
  filters: ProjectListFilters,
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): ProjectListData {
  return {
    accessMessage,
    configured,
    configMessage,
    filters,
    forbidden,
    offices: [],
    projects: [],
    viewerLabel,
  };
}

function emptyProjectRailData(
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): ProjectRailData {
  return {
    accessMessage,
    configured,
    configMessage,
    forbidden,
    offices: [],
    projects: [],
    viewerLabel,
  };
}

function emptyProjectDetailData(
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): ProjectDetailData {
  return {
    accessMessage,
    checklistItems: [],
    configured,
    configMessage,
    documents: [],
    forbidden,
    project: null,
    restrictedToSummary: false,
    staffing: [],
    timeSummary: emptyTimeSummary(),
    viewerLabel,
  };
}

function buildProjectMetrics(
  assignmentRows: Pick<
    AssignmentRow,
    "assigned_hours_per_week" | "project_id"
  >[],
  timeEntryRows: Pick<TimeEntryRow, "hours" | "person_id" | "project_id">[],
  peopleById: Map<string, PersonRow>,
): Map<string, { plannedHoursPerWeek: number; roughLaborCost: number }> {
  const metricsByProjectId = new Map<
    string,
    { plannedHoursPerWeek: number; roughLaborCost: number }
  >();

  for (const assignment of assignmentRows) {
    const existing = metricsByProjectId.get(assignment.project_id) ?? {
      plannedHoursPerWeek: 0,
      roughLaborCost: 0,
    };

    existing.plannedHoursPerWeek += Number(assignment.assigned_hours_per_week);
    metricsByProjectId.set(assignment.project_id, existing);
  }

  for (const timeEntry of timeEntryRows) {
    const person = peopleById.get(timeEntry.person_id);
    const laborCost = person
      ? Number(timeEntry.hours) * deriveHourlyCost(Number(person.annual_salary))
      : 0;
    const existing = metricsByProjectId.get(timeEntry.project_id) ?? {
      plannedHoursPerWeek: 0,
      roughLaborCost: 0,
    };

    existing.roughLaborCost += laborCost;
    metricsByProjectId.set(timeEntry.project_id, existing);
  }

  return metricsByProjectId;
}

function listPreviewProjects(
  filters: ProjectListFilters,
  viewer: NonNullable<CurrentViewerAccess["viewer"]>,
): ProjectListData {
  const filteredProjectRows = [...previewProjects]
    .filter((row) => matchesFilters(row, filters))
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleProjectRows = filteredProjectRows.filter((row) =>
    canViewProjectSummary(viewer, toProjectPermissionSubject(row)),
  );
  const internalProjectIds = new Set(
    visibleProjectRows
      .filter((row) =>
        canViewInternalProject(viewer, toProjectPermissionSubject(row)),
      )
      .map((row) => row.id),
  );
  const assignmentRows = previewAssignments.filter(
    (assignment) =>
      assignment.active && internalProjectIds.has(assignment.project_id),
  );
  const timeEntryRows = previewTimeEntries.filter((entry) =>
    internalProjectIds.has(entry.project_id),
  );
  const leadIds = visibleProjectRows
    .map((row) => row.lead_person_id)
    .filter((value): value is string => Boolean(value));
  const metricPeopleIds = [
    ...new Set(timeEntryRows.map((entry) => entry.person_id)),
  ];
  const officesById = new Map(
    previewOffices.map((office) => [office.id, office]),
  );
  const peopleById = new Map(
    previewPeople
      .filter((person) => [...leadIds, ...metricPeopleIds].includes(person.id))
      .map((person) => [person.id, person]),
  );
  const metricsByProjectId = buildProjectMetrics(
    assignmentRows,
    timeEntryRows,
    peopleById,
  );

  return {
    accessMessage: null,
    configured: false,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    filters,
    forbidden: false,
    offices: previewOffices.map((office) => ({
      id: office.id,
      name: office.name,
    })),
    projects: visibleProjectRows.map((row) =>
      buildProjectListItem(
        row,
        officesById,
        peopleById,
        metricsByProjectId.get(row.id) ?? null,
        !canViewInternalProject(viewer, toProjectPermissionSubject(row)),
      ),
    ),
    viewerLabel: null,
  };
}

function listPreviewProjectRail(
  viewer: NonNullable<CurrentViewerAccess["viewer"]>,
): ProjectRailData {
  const visibleProjectRows = [...previewProjects]
    .filter((row) => canViewProjectSummary(viewer, toProjectPermissionSubject(row)))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    accessMessage: null,
    configured: false,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    forbidden: false,
    offices: previewOffices.map((office) => ({
      id: office.id,
      name: office.name,
    })),
    projects: visibleProjectRows.map((row) => ({
      id: row.id,
      name: row.name,
      photoUrl: row.photo_url ?? null,
    })),
    viewerLabel: null,
  };
}

function getPreviewProjectDetail(projectId: string): ProjectDetailData {
  const row = previewProjects.find((project) => project.id === projectId);

  if (!row) {
    return emptyProjectDetailData(
      false,
      PREVIEW_CONFIG_MESSAGE,
      null,
      null,
      false,
    );
  }

  const offices = previewOffices.filter(
    (office) =>
      office.id === row.originating_office_id ||
      office.id === row.managing_office_id,
  );
  const assignmentRows = previewAssignments
    .filter((assignment) => assignment.project_id === projectId)
    .sort((left, right) =>
      (left.start_date ?? "").localeCompare(right.start_date ?? ""),
    );
  const checklistRows = previewChecklistItems
    .filter((item) => item.project_id === projectId)
    .sort(
      (left, right) =>
        Number(left.completed) - Number(right.completed) ||
        left.created_at.localeCompare(right.created_at),
    );
  const documentRows = previewResourceDocuments
    .filter((document) => document.project_id === projectId)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const timeEntryRows = previewTimeEntries
    .filter((entry) => entry.project_id === projectId)
    .sort((left, right) => right.date.localeCompare(left.date));
  const staffingPeopleIds = assignmentRows.map(
    (assignment) => assignment.person_id,
  );
  const checklistPeopleIds = checklistRows
    .map((item) => item.assigned_person_id)
    .filter((value): value is string => Boolean(value));
  const timePeopleIds = timeEntryRows.map((entry) => entry.person_id);
  const allPeopleIds = [
    ...new Set([
      ...(row.lead_person_id ? [row.lead_person_id] : []),
      ...staffingPeopleIds,
      ...checklistPeopleIds,
      ...timePeopleIds,
      ...documentRows
        .map((document) => document.uploaded_by_person_id)
        .filter((value): value is string => Boolean(value)),
    ]),
  ];
  const allPeople = previewPeople.filter((person) =>
    allPeopleIds.includes(person.id),
  );
  const officesById = new Map(offices.map((office) => [office.id, office]));
  const peopleById = new Map(allPeople.map((person) => [person.id, person]));
  const staffingOfficeIds = [
    ...new Set(
      allPeople
        .map((person) => person.office_id)
        .filter((officeId) => !officesById.has(officeId)),
    ),
  ];

  for (const office of previewOffices.filter((candidate) =>
    staffingOfficeIds.includes(candidate.id),
  )) {
    officesById.set(office.id, office);
  }

  const project = buildProjectListItem(
    row,
    officesById,
    peopleById,
    null,
    false,
  );
  const staffing = assignmentRows.map((assignmentRow) => {
    const assignment = toAssignment(assignmentRow);
    const person = peopleById.get(assignment.personId);

    return {
      ...assignment,
      personName: person?.full_name ?? "Unknown person",
      personOfficeName: person
        ? (officesById.get(person.office_id)?.name ?? null)
        : null,
      personPhotoUrl: person?.photo_url ?? null,
      personTitle: person?.title ?? null,
    };
  });
  const checklistItems = checklistRows.map((checklistRow) => {
    const checklistItem = toChecklistItem(checklistRow);
    const assignedPerson = checklistItem.assignedPersonId
      ? peopleById.get(checklistItem.assignedPersonId)
      : null;

    return {
      ...checklistItem,
      assignedPersonName: assignedPerson?.full_name ?? null,
      assignedPersonPhotoUrl: assignedPerson?.photo_url ?? null,
    };
  });
  const documents = documentRows.map((documentRow) => ({
    ...toResourceDocument(documentRow),
    uploadedByPersonName: documentRow.uploaded_by_person_id
      ? (peopleById.get(documentRow.uploaded_by_person_id)?.full_name ?? null)
      : null,
    uploadedByPersonPhotoUrl: documentRow.uploaded_by_person_id
      ? (peopleById.get(documentRow.uploaded_by_person_id)?.photo_url ?? null)
      : null,
  }));
  const timeEntries = timeEntryRows.map((timeEntryRow) =>
    toTimeEntry(timeEntryRow),
  );
  const byPerson = new Map<
    string,
    {
      hours: number;
      hourlyCost: number | null;
      laborCost: number;
      personId: string;
      personName: string;
      personPhotoUrl: string | null;
      personTitle: string | null;
    }
  >();
  let totalHours = 0;
  let totalLaborCost = 0;

  for (const timeEntry of timeEntries) {
    const person = peopleById.get(timeEntry.personId);
    const personName = person?.full_name ?? "Unknown person";
    const hourlyCost = person
      ? deriveHourlyCost(Number(person.annual_salary))
      : null;
    const laborCost = hourlyCost !== null
      ? timeEntry.hours * hourlyCost
      : 0;
    const existing = byPerson.get(timeEntry.personId);

    totalHours += timeEntry.hours;
    totalLaborCost += laborCost;

    if (existing) {
      existing.hours += timeEntry.hours;
      existing.laborCost += laborCost;
    } else {
      byPerson.set(timeEntry.personId, {
        hours: timeEntry.hours,
        hourlyCost,
        laborCost,
        personId: timeEntry.personId,
        personName,
        personPhotoUrl: person?.photo_url ?? null,
        personTitle: person?.title ?? null,
      });
    }
  }

  return {
    accessMessage: null,
    checklistItems,
    configured: false,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    documents,
    forbidden: false,
    project,
    restrictedToSummary: false,
    staffing,
    timeSummary: {
      byPerson: Array.from(byPerson.values()).sort((left, right) =>
        left.personName.localeCompare(right.personName),
      ),
      recentEntries: timeEntries.slice(0, 5).map((entry) => ({
        ...entry,
        hourlyCost: peopleById.get(entry.personId)
          ? deriveHourlyCost(
              Number(peopleById.get(entry.personId)!.annual_salary),
            )
          : null,
        laborCost: peopleById.get(entry.personId)
          ? entry.hours *
            deriveHourlyCost(Number(peopleById.get(entry.personId)!.annual_salary))
          : 0,
        personName: peopleById.get(entry.personId)?.full_name ?? null,
        personPhotoUrl: peopleById.get(entry.personId)?.photo_url ?? null,
        personTitle: peopleById.get(entry.personId)?.title ?? null,
      })),
      totalHours,
      totalLaborCost,
    },
    viewerLabel: null,
  };
}

export async function listProjects(
  filters: ProjectListFilters = {},
  context: ViewerRequestContext = {},
): Promise<ProjectListData> {
  const cacheKey = getProjectListCacheKey(filters, context);
  const cachedValue = cacheKey ? getCachedValue(projectListCache, cacheKey) : null;

  if (cachedValue) {
    return cachedValue;
  }

  const viewerAccess = await getCurrentViewerAccess(context);
  const viewerLabel = getViewerLabel(viewerAccess.summary);
  const status = getDatabaseStatus();
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null;

  if (!viewerAccess.viewer) {
    return emptyProjectListData(
      filters,
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    );
  }

  if (!client) {
    const previewData = listPreviewProjects(filters, viewerAccess.viewer);

    const previewResult = {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    };

    return cacheKey
      ? setCachedValue(projectListCache, cacheKey, previewResult)
      : previewResult;
  }

  const [{ data: projectData, error: projectError }, offices] =
    await Promise.all([
      client
        .from("projects")
        .select(PROJECT_ROW_SELECT)
        .order("name"),
      fetchOfficeRows(undefined, { client }),
    ]);

  if (projectError) {
    throw projectError;
  }

  const projectRows = ((projectData ?? []) as ProjectRow[]).filter((row) =>
    matchesFilters(row, filters),
  );
  const visibleProjectRows = projectRows.filter((row) =>
    canViewProjectSummary(
      viewerAccess.viewer!,
      toProjectPermissionSubject(row),
    ),
  );
  const internalProjectIds = visibleProjectRows
    .filter((row) =>
      canViewInternalProject(
        viewerAccess.viewer!,
        toProjectPermissionSubject(row),
      ),
    )
    .map((row) => row.id);
  const [
    { data: assignmentData, error: assignmentError },
    { data: timeEntryData, error: timeEntryError },
  ] =
    internalProjectIds.length > 0
      ? await Promise.all([
          client
            .from("assignments")
            .select(ASSIGNMENT_ROW_SELECT)
            .in("project_id", internalProjectIds)
            .eq("active", true),
          client
            .from("time_entries")
            .select(TIME_ENTRY_ROW_SELECT)
            .in("project_id", internalProjectIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (assignmentError) {
    throw assignmentError;
  }

  if (timeEntryError) {
    throw timeEntryError;
  }

  const leadIds = visibleProjectRows
    .map((row) => row.lead_person_id)
    .filter((value): value is string => Boolean(value));
  const metricPeopleIds = ((timeEntryData ?? []) as TimeEntryRow[]).map(
    (entry) => entry.person_id,
  );
  const people = await fetchPeopleRows(
    [...new Set([...leadIds, ...metricPeopleIds])],
    { client },
  );
  const officesById = new Map(offices.map((office) => [office.id, office]));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const metricsByProjectId = buildProjectMetrics(
    (assignmentData ?? []) as AssignmentRow[],
    (timeEntryData ?? []) as TimeEntryRow[],
    peopleById,
  );

  const result = {
    accessMessage: viewerAccess.accessMessage,
    configured: status.configured,
    configMessage: status.message,
    filters,
    forbidden: false,
    offices: offices.map((office) => ({ id: office.id, name: office.name })),
    projects: visibleProjectRows.map((row) =>
      buildProjectListItem(
        row,
        officesById,
        peopleById,
        metricsByProjectId.get(row.id) ?? null,
        !canViewInternalProject(
          viewerAccess.viewer!,
          toProjectPermissionSubject(row),
        ),
      ),
    ),
    viewerLabel,
  };

  return cacheKey ? setCachedValue(projectListCache, cacheKey, result) : result;
}

export async function listProjectRailData(
  context: ViewerRequestContext = {},
): Promise<ProjectRailData> {
  const cacheKey = getProjectRailCacheKey(context);
  const cachedValue = cacheKey ? getCachedValue(projectRailCache, cacheKey) : null;

  if (cachedValue) {
    return cachedValue;
  }

  const viewerAccess = await getCurrentViewerAccess(context);
  const viewerLabel = getViewerLabel(viewerAccess.summary);
  const status = getDatabaseStatus();
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null;

  if (!viewerAccess.viewer) {
    return emptyProjectRailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    );
  }

  if (!client) {
    const previewData = listPreviewProjectRail(viewerAccess.viewer);

    const previewResult = {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    };

    return cacheKey
      ? setCachedValue(projectRailCache, cacheKey, previewResult)
      : previewResult;
  }

  const [{ data: projectData, error: projectError }, offices] = await Promise.all([
    client
      .from("projects")
      .select("id, name, photo_url, managing_office_id, lead_person_id")
      .order("name"),
    fetchOfficeRows(undefined, { client }),
  ]);

  if (projectError) {
    throw projectError;
  }

  const visibleProjectRows = ((projectData ?? []) as Array<{
    id: string;
    lead_person_id: string | null;
    managing_office_id: string;
    name: string;
    photo_url: string | null;
  }>).filter((row) =>
    canViewProjectSummary(viewerAccess.viewer!, {
      id: row.id,
      leadPersonId: row.lead_person_id,
      managingOfficeId: row.managing_office_id,
    }),
  );

  const result = {
    accessMessage: viewerAccess.accessMessage,
    configured: status.configured,
    configMessage: status.message,
    forbidden: false,
    offices: offices.map((office) => ({ id: office.id, name: office.name })),
    projects: visibleProjectRows.map((row) => ({
      id: row.id,
      name: row.name,
      photoUrl: row.photo_url ?? null,
    })),
    viewerLabel,
  };

  return cacheKey ? setCachedValue(projectRailCache, cacheKey, result) : result;
}

export async function createProject(
  input: CreateProjectInput,
  context: ViewerRequestContext = {},
): Promise<Project> {
  const status = getDatabaseStatus();

  if (!status.configured) {
    throw new Error(
      "Project creation requires a configured database connection.",
    );
  }

  const viewerAccess = await getCurrentViewerAccess(context);

  if (!viewerAccess.viewer) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to continue.");
  }

  const name = normalizeRequiredText(input.name, "Project name");
  const originatingOfficeId = normalizeRequiredText(
    input.originatingOfficeId,
    "Originating office",
  );
  const managingOfficeId = normalizeRequiredText(
    input.managingOfficeId,
    "Managing office",
  );

  if (!isProjectStage(input.stage)) {
    throw new Error("Stage is invalid.");
  }

  if (!canCreateOrUpdateProjects(viewerAccess.viewer, managingOfficeId)) {
    throw new Error(
      "You do not have permission to create projects for this office.",
    );
  }

  if (input.startDate && !isIsoDate(input.startDate)) {
    throw new Error("Start date is invalid.");
  }

  if (input.targetCompletionDate && !isIsoDate(input.targetCompletionDate)) {
    throw new Error("Completion date is invalid.");
  }

  if (
    input.startDate &&
    input.targetCompletionDate &&
    input.targetCompletionDate < input.startDate
  ) {
    throw new Error("Completion date cannot be earlier than the start date.");
  }

  const client = createServerSupabaseClient({
    accessToken: context.accessToken,
  });

  if (!client) {
    throw new Error(
      "Project creation requires a configured database connection.",
    );
  }

  const officeIds = [...new Set([originatingOfficeId, managingOfficeId])];
  const [offices, leadPeople] = await Promise.all([
    fetchOfficeRows(officeIds, { client }),
    input.leadPersonId
      ? fetchPeopleRows([input.leadPersonId], { client })
      : Promise.resolve([]),
  ]);

  if (offices.length !== officeIds.length) {
    throw new Error("Selected office is unavailable.");
  }

  if (input.leadPersonId) {
    const leadPerson = leadPeople[0];

    if (!leadPerson) {
      throw new Error("Selected lead is unavailable.");
    }

    if (!leadPerson.active) {
      throw new Error("Selected lead must be active.");
    }
  }

  const { data, error } = await client
    .from("projects")
    .insert({
      active: true,
      client_name: normalizeNullableText(input.clientName),
      description: normalizeNullableText(input.description),
      lead_person_id: normalizeNullableText(input.leadPersonId),
      managing_office_id: managingOfficeId,
      name,
      originating_office_id: originatingOfficeId,
      photo_url: normalizeNullableText(input.photoUrl),
      stage: input.stage,
      start_date: input.startDate ?? null,
      target_completion_date: input.targetCompletionDate ?? null,
    })
    .select(PROJECT_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return toProject(data as ProjectRow);
}

export async function createProjectAssignment(
  input: CreateProjectAssignmentInput,
  context: ViewerRequestContext = {},
): Promise<ProjectAssignmentItem> {
  const { client, projectRow, viewer } = await resolveProjectMutationContext(
    input.projectId,
    context,
  );

  if (!canAssignPeopleToProject(viewer, toProjectPermissionSubject(projectRow))) {
    throw new Error("You do not have permission to staff this project.");
  }

  const assignedHoursPerWeek = normalizePositiveNumber(
    input.assignedHoursPerWeek,
    "Assigned hours per week",
  );

  if (input.startDate && !isIsoDate(input.startDate)) {
    throw new Error("Assignment start date is invalid.");
  }

  if (input.endDate && !isIsoDate(input.endDate)) {
    throw new Error("Assignment end date is invalid.");
  }

  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error("Assignment end date cannot be earlier than the start date.");
  }

  const person = await resolveActivePerson(input.personId, client, "Person");
  const personOffice = (await fetchOfficeRows([person.office_id], { client }))[0] ?? null;
  const { data, error } = await client
    .from("assignments")
    .insert({
      active: true,
      assigned_hours_per_week: assignedHoursPerWeek,
      end_date: input.endDate ?? null,
      notes: normalizeNullableText(input.notes),
      person_id: person.id,
      project_id: projectRow.id,
      start_date: input.startDate ?? null,
    })
    .select(ASSIGNMENT_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...toAssignment(data as AssignmentRow),
    personName: person.full_name,
    personOfficeName: personOffice?.name ?? null,
    personPhotoUrl: person.photo_url,
    personTitle: person.title,
  };
}

export async function createProjectChecklistItem(
  input: CreateProjectChecklistItemInput,
  context: ViewerRequestContext = {},
): Promise<ProjectChecklistItem> {
  const { client, projectRow, viewer } = await resolveProjectMutationContext(
    input.projectId,
    context,
  );

  if (!canAddChecklistItemsToProject(viewer, toProjectPermissionSubject(projectRow))) {
    throw new Error("You do not have permission to add checklist items.");
  }

  const title = normalizeRequiredText(input.title, "Checklist title");
  const assignedPerson = input.assignedPersonId
    ? await resolveActivePerson(input.assignedPersonId, client, "Assigned person")
    : null;
  const { data, error } = await client
    .from("checklist_items")
    .insert({
      assigned_person_id: assignedPerson?.id ?? null,
      completed: false,
      project_id: projectRow.id,
      title,
    })
    .select(CHECKLIST_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...toChecklistItem(data as ChecklistItemRow),
    assignedPersonName: assignedPerson?.full_name ?? null,
    assignedPersonPhotoUrl: assignedPerson?.photo_url ?? null,
  };
}

export async function updateProjectChecklistItem(
  input: UpdateProjectChecklistItemInput,
  context: ViewerRequestContext = {},
): Promise<ProjectChecklistItem> {
  const { client, projectRow, viewer } = await resolveProjectMutationContext(
    input.projectId,
    context,
  );

  if (!canAddChecklistItemsToProject(viewer, toProjectPermissionSubject(projectRow))) {
    throw new Error("You do not have permission to update checklist items.");
  }

  const checklistItemId = normalizeRequiredText(input.checklistItemId, "Checklist item");
  const { data: checklistItemRow, error: checklistItemError } = await client
    .from("checklist_items")
    .select(CHECKLIST_ROW_SELECT)
    .eq("id", checklistItemId)
    .maybeSingle();

  if (checklistItemError) {
    throw checklistItemError;
  }

  if (!checklistItemRow) {
    throw new Error("Selected checklist item is unavailable.");
  }

  if ((checklistItemRow as ChecklistItemRow).project_id !== projectRow.id) {
    throw new Error("Checklist item does not belong to the selected project.");
  }

  const updates: {
    assigned_person_id?: string | null;
    completed?: boolean;
    completed_at?: string | null;
    title?: string;
  } = {};

  if (input.title !== undefined) {
    updates.title = normalizeRequiredText(input.title, "Checklist title");
  }

  if (input.assignedPersonId !== undefined) {
    const assignedPerson = input.assignedPersonId
      ? await resolveActivePerson(input.assignedPersonId, client, "Assigned person")
      : null;
    updates.assigned_person_id = assignedPerson?.id ?? null;
  }

  if (input.completed !== undefined) {
    updates.completed = input.completed;
    updates.completed_at = input.completed ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No checklist changes were provided.");
  }

  const { data, error } = await client
    .from("checklist_items")
    .update(updates)
    .eq("id", checklistItemId)
    .select(CHECKLIST_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const updatedRow = data as ChecklistItemRow;
  const assignedPeople = updatedRow.assigned_person_id
    ? await fetchPeopleRows([updatedRow.assigned_person_id], { client })
    : [];
  const assignedPerson = assignedPeople[0] ?? null;

  return {
    ...toChecklistItem(updatedRow),
    assignedPersonName: assignedPerson?.full_name ?? null,
    assignedPersonPhotoUrl: assignedPerson?.photo_url ?? null,
  };
}

export async function createProjectDocument(
  input: CreateProjectDocumentInput,
  context: ViewerRequestContext = {},
): Promise<ProjectDocumentItem> {
  const { client, projectRow, viewer } = await resolveProjectMutationContext(
    input.projectId,
    context,
  );

  if (!canUploadProjectDocuments(viewer, toProjectPermissionSubject(projectRow))) {
    throw new Error("You do not have permission to add project documents.");
  }

  const name = normalizeRequiredText(input.name, "Document name");
  const fileUrl = normalizeRequiredText(input.fileUrl, "Document file URL");
  const uploader = viewer.personId
    ? (await fetchPeopleRows([viewer.personId], { client }))[0] ?? null
    : null;
  const { data, error } = await client
    .from("resource_documents")
    .insert({
      category: normalizeNullableText(input.category),
      description: normalizeNullableText(input.description),
      file_type: normalizeNullableText(input.fileType),
      file_url: fileUrl,
      name,
      project_id: projectRow.id,
      uploaded_by_person_id: uploader?.id ?? null,
    })
    .select(RESOURCE_DOCUMENT_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...toResourceDocument(data as ResourceDocumentRow),
    uploadedByPersonName: uploader?.full_name ?? null,
    uploadedByPersonPhotoUrl: uploader?.photo_url ?? null,
  };
}

export async function updateProjectTimeEntry(
  input: UpdateProjectTimeEntryInput,
  context: ViewerRequestContext = {},
): Promise<ProjectTimeSummary["recentEntries"][number]> {
  const { client, projectRow, viewer } = await resolveProjectMutationContext(
    input.projectId,
    context,
  );

  const timeEntryId = normalizeRequiredText(input.timeEntryId, "Time entry");
  const { data: timeEntryRow, error: timeEntryError } = await client
    .from("time_entries")
    .select(TIME_ENTRY_ROW_SELECT)
    .eq("id", timeEntryId)
    .maybeSingle();

  if (timeEntryError) {
    throw timeEntryError;
  }

  if (!timeEntryRow) {
    throw new Error("Selected time entry is unavailable.");
  }

  const existingTimeEntry = timeEntryRow as TimeEntryRow;

  if (existingTimeEntry.project_id !== projectRow.id) {
    throw new Error("Time entry does not belong to the selected project.");
  }

  const trackedPerson =
    (await fetchPeopleRows([existingTimeEntry.person_id], { client }))[0] ?? null;
  const canEditAsProjectManager = canEditProjectTime(
    viewer,
    toProjectPermissionSubject(projectRow),
  );
  const canEditAsSupervisor = Boolean(
    viewer.personId &&
      trackedPerson?.supervisor_person_id &&
      trackedPerson.supervisor_person_id === viewer.personId,
  );

  if (!canEditAsProjectManager && !canEditAsSupervisor) {
    throw new Error("You do not have permission to edit project worklog entries.");
  }

  const updates: {
    assignment_id?: string | null;
    date?: string;
    hours?: number;
    notes?: string | null;
    person_id?: string;
  } = {};

  if (input.date !== undefined) {
    if (!isIsoDate(input.date)) {
      throw new Error("Worklog date is invalid.");
    }

    updates.date = input.date;
  }

  if (input.hours !== undefined) {
    updates.hours = normalizeNonNegativeNumber(input.hours, "Worklog hours");
  }

  if (input.notes !== undefined) {
    updates.notes = normalizeNullableText(input.notes);
  }

  if (input.assignmentId !== undefined) {
    if (input.assignmentId) {
      const assignment = await resolveAssignmentRow(input.assignmentId, client);

      if (assignment.project_id !== projectRow.id) {
        throw new Error("Assignment does not belong to the selected project.");
      }

      updates.assignment_id = assignment.id;
      updates.person_id = assignment.person_id;
    } else {
      updates.assignment_id = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No worklog changes were provided.");
  }

  const { data, error } = await client
    .from("time_entries")
    .update(updates)
    .eq("id", timeEntryId)
    .select(TIME_ENTRY_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const updatedEntry = toTimeEntry(data as TimeEntryRow);
  const person = (await fetchPeopleRows([updatedEntry.personId], { client }))[0] ?? null;
  const hourlyCost = person ? deriveHourlyCost(Number(person.annual_salary)) : null;

  return {
    ...updatedEntry,
    hourlyCost,
    laborCost: hourlyCost ? updatedEntry.hours * hourlyCost : 0,
    personName: person?.full_name ?? null,
    personPhotoUrl: person?.photo_url ?? null,
    personTitle: person?.title ?? null,
  };
}

export async function getProjectDetail(
  projectId: string,
  context: ViewerRequestContext = {},
): Promise<ProjectDetailData> {
  const cacheKey = getProjectDetailCacheKey(projectId, context);
  const cachedValue = cacheKey ? getCachedValue(projectDetailCache, cacheKey) : null;

  if (cachedValue) {
    return cachedValue;
  }

  const viewerAccess = await getCurrentViewerAccess(context);
  const viewerLabel = getViewerLabel(viewerAccess.summary);
  const status = getDatabaseStatus();
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null;

  if (!viewerAccess.viewer) {
    return emptyProjectDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    );
  }

  if (!client) {
    const previewData = getPreviewProjectDetail(projectId);

    if (
      previewData.project &&
      !canViewProjectSummary(viewerAccess.viewer, previewData.project)
    ) {
      return emptyProjectDetailData(
        false,
        PREVIEW_CONFIG_MESSAGE,
        viewerAccess.accessMessage ??
          "Current viewer cannot access this project.",
        viewerLabel,
        true,
      );
    }

    const restrictedToSummary =
      previewData.project !== null &&
      !canViewInternalProject(viewerAccess.viewer, previewData.project);

    const previewResult = {
      ...previewData,
      accessMessage: restrictedToSummary
        ? "Client access is currently limited to the project summary."
        : viewerAccess.accessMessage,
      checklistItems: restrictedToSummary ? [] : previewData.checklistItems,
      documents: restrictedToSummary ? [] : previewData.documents,
      restrictedToSummary,
      staffing: restrictedToSummary ? [] : previewData.staffing,
      timeSummary: restrictedToSummary
        ? emptyTimeSummary()
        : previewData.timeSummary,
      viewerLabel,
    };

    return cacheKey
      ? setCachedValue(projectDetailCache, cacheKey, previewResult)
      : previewResult;
  }

  const { data: projectRow, error: projectError } = await client
    .from("projects")
    .select(PROJECT_ROW_SELECT)
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw projectError;
  }

  if (!projectRow) {
    return emptyProjectDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      false,
    );
  }

  const row = projectRow as ProjectRow;

  if (
    !canViewProjectSummary(viewerAccess.viewer, toProjectPermissionSubject(row))
  ) {
    return emptyProjectDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage ??
        "Current viewer cannot access this project.",
      viewerLabel,
      true,
    );
  }

  const [
    offices,
    leadPeople,
    assignmentResponse,
    checklistResponse,
    documentResponse,
    timeEntryResponse,
  ] = await Promise.all([
    fetchOfficeRows([row.originating_office_id, row.managing_office_id], {
      client,
    }),
    row.lead_person_id
      ? fetchPeopleRows([row.lead_person_id], { client })
      : Promise.resolve([]),
    client
      .from("assignments")
      .select(ASSIGNMENT_ROW_SELECT)
      .eq("project_id", projectId)
      .order("start_date", { ascending: true }),
    client
      .from("checklist_items")
      .select(CHECKLIST_ROW_SELECT)
      .eq("project_id", projectId)
      .order("completed", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("resource_documents")
      .select(RESOURCE_DOCUMENT_ROW_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    client
      .from("time_entries")
      .select(TIME_ENTRY_ROW_SELECT)
      .eq("project_id", projectId)
      .order("date", { ascending: false }),
  ]);

  const [assignmentRows, checklistRows, documentRows, timeEntryRows] = [
    (assignmentResponse.data ?? []) as AssignmentRow[],
    (checklistResponse.data ?? []) as ChecklistItemRow[],
    (documentResponse.data ?? []) as ResourceDocumentRow[],
    (timeEntryResponse.data ?? []) as TimeEntryRow[],
  ];

  if (assignmentResponse.error) throw assignmentResponse.error;
  if (checklistResponse.error) throw checklistResponse.error;
  if (documentResponse.error) throw documentResponse.error;
  if (timeEntryResponse.error) throw timeEntryResponse.error;

  const staffingPeopleIds = assignmentRows.map(
    (assignment) => assignment.person_id,
  );
  const checklistPeopleIds = checklistRows
    .map((item) => item.assigned_person_id)
    .filter((value): value is string => Boolean(value));
  const timePeopleIds = timeEntryRows.map((entry) => entry.person_id);
  const allPeopleIds = [
    ...new Set([
      ...leadPeople.map((person) => person.id),
      ...staffingPeopleIds,
      ...checklistPeopleIds,
      ...timePeopleIds,
    ]),
  ];
  const allPeople = await fetchPeopleRows(allPeopleIds, { client });
  const officesById = new Map(offices.map((office) => [office.id, office]));
  const peopleById = new Map(allPeople.map((person) => [person.id, person]));
  const staffingOfficeIds = [
    ...new Set(
      allPeople
        .map((person) => person.office_id)
        .filter((officeId) => !officesById.has(officeId)),
    ),
  ];
  const staffingOffices =
    staffingOfficeIds.length > 0
      ? await fetchOfficeRows(staffingOfficeIds, { client })
      : [];

  for (const office of staffingOffices) {
    officesById.set(office.id, office);
  }

  const project = buildProjectListItem(
    row,
    officesById,
    peopleById,
    null,
    false,
  );
  const restrictedToSummary = !canViewInternalProject(
    viewerAccess.viewer,
    project,
  );

  if (restrictedToSummary) {
    const summaryOnlyResult = {
      accessMessage:
        "Client access is currently limited to the project summary.",
      checklistItems: [],
      configured: status.configured,
      configMessage: status.message,
      documents: [],
      forbidden: false,
      project,
      restrictedToSummary: true,
      staffing: [],
      timeSummary: emptyTimeSummary(),
      viewerLabel,
    };

    return cacheKey
      ? setCachedValue(projectDetailCache, cacheKey, summaryOnlyResult)
      : summaryOnlyResult;
  }

  const staffing = assignmentRows.map((assignmentRow) => {
    const assignment = toAssignment(assignmentRow);
    const person = peopleById.get(assignment.personId);

    return {
      ...assignment,
      personName: person?.full_name ?? "Unknown person",
      personOfficeName: person
        ? (officesById.get(person.office_id)?.name ?? null)
        : null,
      personPhotoUrl: person?.photo_url ?? null,
      personTitle: person?.title ?? null,
    };
  });

  const checklistItems = checklistRows.map((checklistRow) => {
    const checklistItem = toChecklistItem(checklistRow);
    const assignedPerson = checklistItem.assignedPersonId
      ? peopleById.get(checklistItem.assignedPersonId)
      : null;

    return {
      ...checklistItem,
      assignedPersonName: assignedPerson?.full_name ?? null,
      assignedPersonPhotoUrl: assignedPerson?.photo_url ?? null,
    };
  });

  const documents = documentRows.map((documentRow) => ({
    ...toResourceDocument(documentRow),
    uploadedByPersonName: documentRow.uploaded_by_person_id
      ? (peopleById.get(documentRow.uploaded_by_person_id)?.full_name ?? null)
      : null,
    uploadedByPersonPhotoUrl: documentRow.uploaded_by_person_id
      ? (peopleById.get(documentRow.uploaded_by_person_id)?.photo_url ?? null)
      : null,
  }));
  const timeEntries = timeEntryRows.map((timeEntryRow) =>
    toTimeEntry(timeEntryRow),
  );
  const byPerson = new Map<
    string,
    {
      hours: number;
      hourlyCost: number | null;
      laborCost: number;
      personId: string;
      personName: string;
      personPhotoUrl: string | null;
      personTitle: string | null;
    }
  >();

  let totalHours = 0;
  let totalLaborCost = 0;

  for (const timeEntry of timeEntries) {
    const person = peopleById.get(timeEntry.personId);
    const personName = person?.full_name ?? "Unknown person";
    const hourlyCost = person
      ? deriveHourlyCost(Number(person.annual_salary))
      : null;
    const laborCost = hourlyCost !== null
      ? timeEntry.hours * hourlyCost
      : 0;
    const existing = byPerson.get(timeEntry.personId);

    totalHours += timeEntry.hours;
    totalLaborCost += laborCost;

    if (existing) {
      existing.hours += timeEntry.hours;
      existing.laborCost += laborCost;
    } else {
      byPerson.set(timeEntry.personId, {
        hours: timeEntry.hours,
        hourlyCost,
        laborCost,
        personId: timeEntry.personId,
        personName,
        personPhotoUrl: person?.photo_url ?? null,
        personTitle: person?.title ?? null,
      });
    }
  }

  const result = {
    accessMessage: viewerAccess.accessMessage,
    checklistItems,
    configured: status.configured,
    configMessage: status.message,
    documents,
    forbidden: false,
    project,
    restrictedToSummary: false,
    staffing,
    timeSummary: {
      byPerson: Array.from(byPerson.values()).sort((left, right) =>
        left.personName.localeCompare(right.personName),
      ),
      recentEntries: timeEntries.slice(0, 5).map((entry) => ({
        ...entry,
        hourlyCost: peopleById.get(entry.personId)
          ? deriveHourlyCost(
              Number(peopleById.get(entry.personId)!.annual_salary),
            )
          : null,
        laborCost: peopleById.get(entry.personId)
          ? entry.hours *
            deriveHourlyCost(Number(peopleById.get(entry.personId)!.annual_salary))
          : 0,
        personName: peopleById.get(entry.personId)?.full_name ?? null,
        personPhotoUrl: peopleById.get(entry.personId)?.photo_url ?? null,
        personTitle: peopleById.get(entry.personId)?.title ?? null,
      })),
      totalHours,
      totalLaborCost,
    },
    viewerLabel,
  };

  return cacheKey ? setCachedValue(projectDetailCache, cacheKey, result) : result;
}
