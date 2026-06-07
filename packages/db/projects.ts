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
  canChangeProjectStage,
  canCreateOrUpdateProjects,
  canEditProject,
  canEditProjectTime,
  canSetProjectLead,
  canUploadProjectDocuments,
  canViewInternalProject,
  canViewProjectFinancials,
  canViewProjectSummary,
  deriveHourlyCost,
  isProjectStage,
} from "@mandala/domain";

import {
  getCurrentViewerAccess,
  getViewerLabel,
  invalidateViewerAccessCache,
  type CurrentViewerAccess,
  type ViewerRequestContext,
} from "./auth";
import {
  attachPeopleCompensation,
  fetchOfficeRows,
  fetchPeopleCompensationById,
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
import { createPerfTrace } from "./perf";

const PROJECT_READ_CACHE_TTL_MS = 300_000;

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

interface ProjectListTimeMetricRow {
  project_id: string;
  rough_labor_cost: number | string | null;
  total_hours: number | string;
}

interface ProjectDetailContextResponse {
  found: boolean;
  assignments?: AssignmentRow[];
  checklistItems?: ChecklistItemRow[];
  documents?: ResourceDocumentRow[];
  offices?: OfficeRow[];
  people?: PersonRow[];
  project?: ProjectRow;
  timeEntries?: TimeEntryRow[];
}

interface LoadedProjectDetailContext {
  assignmentRows: AssignmentRow[];
  checklistRows: ChecklistItemRow[];
  documentRows: ResourceDocumentRow[];
  offices: OfficeRow[];
  people: PersonRow[];
  projectRow: ProjectRow | null;
  timeEntryRows: TimeEntryRow[];
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const projectListCache = new Map<string, CacheEntry<ProjectListData>>();
const projectRailCache = new Map<string, CacheEntry<ProjectRailData>>();
const projectDetailCache = new Map<string, CacheEntry<ProjectDetailData>>();
let projectDetailContextFunctionAvailable: boolean | null = null;

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
  canEditLead: boolean;
  canEditProject: boolean;
  canEditStage: boolean;
  canViewFinancials: boolean;
  clientName: string | null;
  description: string | null;
  leadPersonName: string | null;
  leadPersonPhotoUrl: string | null;
  managingOfficeName: string;
  originatingOfficeName: string;
  restrictedToSummary: boolean;
  totalHours: number | null;
  totalLaborCost: number | null;
}

export interface ProjectAssignmentItem extends Assignment {
  personName: string;
  personOfficeName: string | null;
  personPhotoUrl: string | null;
  personTitle: string | null;
}

export interface ProjectStaffPerson {
  hasAssignment: boolean;
  hasTrackedTime: boolean;
  personId: string;
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
    laborCost: number | null;
    personId: string;
    personName: string;
    personPhotoUrl: string | null;
    personTitle: string | null;
  }>;
  recentEntries: Array<
    TimeEntry & {
      hourlyCost: number | null;
      laborCost: number | null;
      personName: string | null;
      personPhotoUrl: string | null;
      personTitle: string | null;
    }
  >;
  totalHours: number;
  totalLaborCost: number | null;
}

export interface ProjectDetailData {
  accessMessage: string | null;
  canAssignPeople: boolean;
  canEdit: boolean;
  canEditChecklistItems: boolean;
  canEditStage: boolean;
  checklistItems: ProjectChecklistItem[];
  configured: boolean;
  configMessage: string | null;
  documents: ProjectDocumentItem[];
  forbidden: boolean;
  project: ProjectListItem | null;
  restrictedToSummary: boolean;
  staffedPeople: ProjectStaffPerson[];
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

export interface UpdateProjectInput extends CreateProjectInput {
  projectId: string;
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

function normalizeDocumentFileUrl(value: string): string {
  const normalized = normalizeRequiredText(value, "Document file URL");
  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Document file URL must be a valid HTTPS URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Document file URL must use HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Document file URL cannot include embedded credentials.");
  }

  return parsed.toString();
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

async function invalidatePersonViewerCaches(
  personIds: Array<string | null | undefined>,
): Promise<void> {
  const normalizedPersonIds = [
    ...new Set(
      personIds
        .map((personId) => personId?.trim() ?? "")
        .filter((personId): personId is string => Boolean(personId)),
    ),
  ]

  if (normalizedPersonIds.length === 0) {
    return
  }

  const serviceClient = createServerSupabaseClient({ useServiceRole: true })

  if (!serviceClient) {
    return
  }

  const [{ data: peopleData }, { data: accountData }] = await Promise.all([
    serviceClient
      .from("people")
      .select("email")
      .in("id", normalizedPersonIds),
    serviceClient
      .from("user_accounts")
      .select("email")
      .in("person_id", normalizedPersonIds),
  ])

  const emails = new Set<string>()

  for (const row of (peopleData ?? []) as Array<{ email?: string | null }>) {
    if (row.email) {
      emails.add(row.email)
    }
  }

  for (const row of (accountData ?? []) as Array<{ email?: string | null }>) {
    if (row.email) {
      emails.add(row.email)
    }
  }

  for (const email of emails) {
    invalidateViewerAccessCache(email)
  }
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
  metrics: { totalHours: number; totalLaborCost: number } | null,
  restrictedToSummary: boolean,
  canEditProject: boolean,
  canEditStage: boolean,
  canEditLead: boolean,
  canViewFinancials: boolean,
): ProjectListItem {
  const project = toProject(row);

  return {
    ...project,
    canEditLead,
    canEditProject,
    canEditStage,
    canViewFinancials,
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
    restrictedToSummary,
    totalHours: restrictedToSummary ? null : (metrics?.totalHours ?? 0),
    totalLaborCost:
      restrictedToSummary || !canViewFinancials
        ? null
        : (metrics?.totalLaborCost ?? 0),
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

function isMissingProjectDetailContextFunction(error: {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
}): boolean {
  if (error.code === "PGRST202") {
    return true;
  }

  const combined = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return combined.includes("get_project_detail_context");
}

async function loadProjectDetailContextFallback(
  projectId: string,
  client: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
): Promise<LoadedProjectDetailContext> {
  const { data: projectData, error: projectError } = await client
    .from("projects")
    .select(PROJECT_ROW_SELECT)
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw projectError;
  }

  if (!projectData) {
    return {
      assignmentRows: [],
      checklistRows: [],
      documentRows: [],
      offices: [],
      people: [],
      projectRow: null,
      timeEntryRows: [],
    };
  }

  const row = projectData as ProjectRow;
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

  if (assignmentResponse.error) {
    throw assignmentResponse.error;
  }

  if (checklistResponse.error) {
    throw checklistResponse.error;
  }

  if (documentResponse.error) {
    throw documentResponse.error;
  }

  if (timeEntryResponse.error) {
    throw timeEntryResponse.error;
  }

  const assignmentRows = (assignmentResponse.data ?? []) as AssignmentRow[];
  const checklistRows = (checklistResponse.data ?? []) as ChecklistItemRow[];
  const documentRows = (documentResponse.data ?? []) as ResourceDocumentRow[];
  const timeEntryRows = (timeEntryResponse.data ?? []) as TimeEntryRow[];
  const allPeopleIds = [
    ...new Set([
      ...leadPeople.map((person) => person.id),
      ...assignmentRows.map((assignment) => assignment.person_id),
      ...checklistRows
        .map((item) => item.assigned_person_id)
        .filter((value): value is string => Boolean(value)),
      ...timeEntryRows.map((entry) => entry.person_id),
      ...documentRows
        .map((document) => document.uploaded_by_person_id)
        .filter((value): value is string => Boolean(value)),
    ]),
  ];
  const allPeople = await fetchPeopleRows(allPeopleIds, { client });
  const officesById = new Map(offices.map((office) => [office.id, office]));
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

  return {
    assignmentRows,
    checklistRows,
    documentRows,
    offices: [...offices, ...staffingOffices],
    people: allPeople,
    projectRow: row,
    timeEntryRows,
  };
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
    canAssignPeople: false,
    canEdit: false,
    canEditChecklistItems: false,
    canEditStage: false,
    checklistItems: [],
    configured,
    configMessage,
    documents: [],
    forbidden,
    project: null,
    restrictedToSummary: false,
    staffedPeople: [],
    staffing: [],
    timeSummary: emptyTimeSummary(),
    viewerLabel,
  };
}

function buildProjectStaffedPeople(
  assignmentRows: Pick<AssignmentRow, "person_id" | "active">[],
  timeEntryRows: Pick<TimeEntryRow, "person_id">[],
  peopleById: Map<string, PersonRow>,
  officesById: Map<string, OfficeRow>,
): ProjectStaffPerson[] {
  const staffedPeopleById = new Map<string, ProjectStaffPerson>();

  function ensureStaffedPerson(personId: string): ProjectStaffPerson {
    const existing = staffedPeopleById.get(personId);

    if (existing) {
      return existing;
    }

    const person = peopleById.get(personId);
    const staffedPerson: ProjectStaffPerson = {
      hasAssignment: false,
      hasTrackedTime: false,
      personId,
      personName: person?.full_name ?? "Unknown person",
      personOfficeName: person
        ? (officesById.get(person.office_id)?.name ?? null)
        : null,
      personPhotoUrl: person?.photo_url ?? null,
      personTitle: person?.title ?? null,
    };

    staffedPeopleById.set(personId, staffedPerson);
    return staffedPerson;
  }

  for (const assignment of assignmentRows) {
    if (assignment.active) {
      ensureStaffedPerson(assignment.person_id).hasAssignment = true;
    }
  }

  for (const timeEntry of timeEntryRows) {
    ensureStaffedPerson(timeEntry.person_id).hasTrackedTime = true;
  }

  return [...staffedPeopleById.values()].sort(
    (left, right) =>
      Number(right.hasAssignment) - Number(left.hasAssignment) ||
      Number(right.hasTrackedTime) - Number(left.hasTrackedTime) ||
      left.personName.localeCompare(right.personName),
  );
}

function getAnnualSalary(row: Pick<PersonRow, "annual_salary">): number | null {
  return row.annual_salary === null ? null : Number(row.annual_salary);
}

function getHourlyCostForPerson(
  canViewFinancials: boolean,
  person: PersonRow | undefined,
): number | null {
  if (!canViewFinancials || !person) {
    return null;
  }

  const annualSalary = getAnnualSalary(person);
  return annualSalary === null ? null : deriveHourlyCost(annualSalary);
}

function buildProjectMetrics(
  timeEntryRows: Pick<TimeEntryRow, "hours" | "person_id" | "project_id">[],
  peopleById: Map<string, PersonRow>,
): Map<string, { totalHours: number; totalLaborCost: number }> {
  const metricsByProjectId = new Map<
    string,
    { totalHours: number; totalLaborCost: number }
  >();

  for (const timeEntry of timeEntryRows) {
    const person = peopleById.get(timeEntry.person_id);
    const annualSalary = person ? getAnnualSalary(person) : null;
    const laborCost = annualSalary === null
      ? 0
      : Number(timeEntry.hours) * deriveHourlyCost(annualSalary);
    const existing = metricsByProjectId.get(timeEntry.project_id) ?? {
      totalHours: 0,
      totalLaborCost: 0,
    };

    existing.totalHours += Number(timeEntry.hours);
    existing.totalLaborCost += laborCost;
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
  const metricsByProjectId = buildProjectMetrics(timeEntryRows, peopleById);

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
        canEditProject(viewer, toProjectPermissionSubject(row)),
        canChangeProjectStage(viewer, toProjectPermissionSubject(row)),
        canSetProjectLead(viewer, toProjectPermissionSubject(row)),
        canViewProjectFinancials(viewer, toProjectPermissionSubject(row)),
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

function getPreviewProjectDetail(
  projectId: string,
  viewer: NonNullable<CurrentViewerAccess["viewer"]>,
): ProjectDetailData {
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

  const projectSubject = toProjectPermissionSubject(row);
  const canEditExistingProject = canEditProject(viewer, projectSubject);
  const canEditLead = canSetProjectLead(viewer, projectSubject);
  const canEditStage = canChangeProjectStage(viewer, projectSubject);
  const canAssignPeople = canAssignPeopleToProject(viewer, projectSubject);
  const canEditChecklistItems = canAddChecklistItemsToProject(viewer, projectSubject);
  const canViewFinancials = canViewProjectFinancials(viewer, projectSubject);

  const project = buildProjectListItem(
    row,
    officesById,
    peopleById,
    null,
    false,
    canEditExistingProject,
    canEditStage,
    canEditLead,
    canViewFinancials,
  );
  const staffedPeople = buildProjectStaffedPeople(
    assignmentRows,
    timeEntryRows,
    peopleById,
    officesById,
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
      laborCost: number | null;
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
    const hourlyCost = getHourlyCostForPerson(canViewFinancials, person);
    const laborCost = hourlyCost !== null
      ? timeEntry.hours * hourlyCost
      : null;
    const existing = byPerson.get(timeEntry.personId);

    totalHours += timeEntry.hours;
    if (laborCost !== null) {
      totalLaborCost += laborCost;
    }

    if (existing) {
      existing.hours += timeEntry.hours;
      existing.laborCost =
        existing.laborCost !== null && laborCost !== null
          ? existing.laborCost + laborCost
          : null;
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
    canAssignPeople,
    canEdit: canEditExistingProject,
    canEditChecklistItems,
    canEditStage,
    checklistItems,
    configured: false,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    documents,
    forbidden: false,
    project,
    restrictedToSummary: false,
    staffedPeople,
    staffing,
    timeSummary: {
      byPerson: Array.from(byPerson.values()).sort((left, right) =>
        left.personName.localeCompare(right.personName),
      ),
      recentEntries: timeEntries.slice(0, 5).map((entry) => ({
        ...entry,
        hourlyCost: getHourlyCostForPerson(
          canViewFinancials,
          peopleById.get(entry.personId),
        ),
        laborCost:
          getHourlyCostForPerson(canViewFinancials, peopleById.get(entry.personId)) !== null
            ? entry.hours *
              getHourlyCostForPerson(canViewFinancials, peopleById.get(entry.personId))!
            : null,
        personName: peopleById.get(entry.personId)?.full_name ?? null,
        personPhotoUrl: peopleById.get(entry.personId)?.photo_url ?? null,
        personTitle: peopleById.get(entry.personId)?.title ?? null,
      })),
      totalHours,
      totalLaborCost: canViewFinancials ? totalLaborCost : null,
    },
    viewerLabel: null,
  };
}

export async function listProjects(
  filters: ProjectListFilters = {},
  context: ViewerRequestContext = {},
): Promise<ProjectListData> {
  const trace = createPerfTrace("listProjects", {
    hasOfficeFilter: Boolean(filters.officeId),
    hasQuery: Boolean(filters.query?.trim()),
    stage: filters.stage ?? null,
  });
  const cacheKey = getProjectListCacheKey(filters, context);
  const cachedValue = cacheKey ? getCachedValue(projectListCache, cacheKey) : null;

  if (cachedValue) {
    trace.finish({
      cacheHit: true,
      projectCount: cachedValue.projects.length,
    });
    return cachedValue;
  }

  const status = getDatabaseStatus();
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null;
  const viewerAccessPromise = trace.measure("getCurrentViewerAccess", () =>
    getCurrentViewerAccess(context),
  );
  const baseQueriesPromise = client
    ? trace
        .measure("baseQueries", async () => {
          let projectQuery = client.from("projects").select(PROJECT_ROW_SELECT).order("name");

          if (filters.stage) {
            projectQuery = projectQuery.eq("stage", filters.stage);
          }

          if (filters.officeId) {
            projectQuery = projectQuery.or(
              `originating_office_id.eq.${filters.officeId},managing_office_id.eq.${filters.officeId}`,
            );
          }

          const [projectResult, offices] = await Promise.all([
            projectQuery,
            fetchOfficeRows(undefined, { client }),
          ]);

          return {
            offices,
            projectData: (projectResult.data ?? []) as ProjectRow[],
            projectError: projectResult.error,
          };
        })
        .then(
          (value) => ({ error: null as null, value }),
          (error: unknown) => ({ error, value: null as null }),
        )
    : null;
  const viewerAccess = await viewerAccessPromise;
  const viewerLabel = getViewerLabel(viewerAccess.summary);

  if (!viewerAccess.viewer) {
    trace.finish({
      cacheHit: false,
      hasViewer: false,
      projectCount: 0,
      result: "forbidden",
    });
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

    trace.finish({
      cacheHit: false,
      preview: true,
      projectCount: previewResult.projects.length,
      result: "preview",
    });

    return cacheKey
      ? setCachedValue(projectListCache, cacheKey, previewResult)
      : previewResult;
  }

  const baseQueriesResult = baseQueriesPromise
    ? await baseQueriesPromise
    : { error: null as null, value: null as null };

  if (baseQueriesResult.error) {
    throw baseQueriesResult.error;
  }

  if (!baseQueriesResult.value) {
    throw new Error("Project list base queries returned no data.");
  }

  const {
    offices,
    projectData,
    projectError,
  } = baseQueriesResult.value;

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
  const leadIds = [
    ...new Set(
      visibleProjectRows
        .map((row) => row.lead_person_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const leadPeoplePromise = leadIds.length > 0
    ? trace.measure("fetchLeadPeopleRows", () =>
        fetchPeopleRows(leadIds, { client }),
      )
    : Promise.resolve([]);
  const metricsPromise = internalProjectIds.length > 0
    ? trace.measure("rpc.getProjectListTimeMetrics", () =>
        client.rpc("get_project_list_time_metrics", {
          input_project_ids: internalProjectIds,
        }),
      )
    : Promise.resolve({ data: [], error: null });

  const [people, metricsResponse] = await Promise.all([
    leadPeoplePromise,
    metricsPromise,
  ]);

  if (metricsResponse.error) {
    throw metricsResponse.error;
  }

  const officesById = new Map(offices.map((office) => [office.id, office]));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const metricsByProjectId = ((metricsResponse.data ?? []) as ProjectListTimeMetricRow[])
    .reduce((map, metric) => {
      map.set(metric.project_id, {
        totalHours: Number(metric.total_hours),
        totalLaborCost:
          metric.rough_labor_cost === null ? 0 : Number(metric.rough_labor_cost),
      });
      return map;
    }, new Map<string, { totalHours: number; totalLaborCost: number }>());

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
        canEditProject(viewerAccess.viewer!, toProjectPermissionSubject(row)),
        canChangeProjectStage(viewerAccess.viewer!, toProjectPermissionSubject(row)),
        canSetProjectLead(viewerAccess.viewer!, toProjectPermissionSubject(row)),
        canViewProjectFinancials(viewerAccess.viewer!, toProjectPermissionSubject(row)),
      ),
    ),
    viewerLabel,
  };

  trace.finish({
    cacheHit: false,
    internalProjectCount: internalProjectIds.length,
    officeCount: offices.length,
    peopleCount: people.length,
    projectCount: result.projects.length,
    result: "live",
    visibleProjectCount: visibleProjectRows.length,
  });

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

  const status = getDatabaseStatus();
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null;
  const viewerAccessPromise = getCurrentViewerAccess(context);
  const railDataPromise = client
    ? Promise.all([
        client
          .from("projects")
          .select("id, name, photo_url, managing_office_id, lead_person_id")
          .order("name"),
        fetchOfficeRows(undefined, { client }),
      ]).then(
        (value) => ({ error: null as null, value }),
        (error: unknown) => ({ error, value: null as null }),
      )
    : null;
  const viewerAccess = await viewerAccessPromise;
  const viewerLabel = getViewerLabel(viewerAccess.summary);

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

  const railDataResult = railDataPromise
    ? await railDataPromise
    : { error: null as null, value: null as null };

  if (railDataResult.error) {
    throw railDataResult.error;
  }

  if (!railDataResult.value) {
    throw new Error("Project rail query returned no data.");
  }

  const [{ data: projectData, error: projectError }, offices] = railDataResult.value;

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
    "Office",
  );
  const managingOfficeId = normalizeRequiredText(
    input.managingOfficeId,
    "Office",
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

  invalidateProjectReadCaches()
  await invalidatePersonViewerCaches([input.leadPersonId])

  return toProject(data as ProjectRow);
}

export async function updateProject(
  input: UpdateProjectInput,
  context: ViewerRequestContext = {},
): Promise<Project> {
  const { client, projectRow, viewer } = await resolveProjectMutationContext(
    input.projectId,
    context,
  );

  const name = normalizeRequiredText(input.name, "Project name");
  const clientName = normalizeNullableText(input.clientName);
  const description = normalizeNullableText(input.description);
  const leadPersonId = normalizeNullableText(input.leadPersonId);
  const originatingOfficeId = normalizeRequiredText(
    input.originatingOfficeId,
    "Office",
  );
  const managingOfficeId = normalizeRequiredText(
    input.managingOfficeId,
    "Office",
  );
  const photoUrl = normalizeNullableText(input.photoUrl);

  if (!isProjectStage(input.stage)) {
    throw new Error("Stage is invalid.");
  }

  const projectSubject = toProjectPermissionSubject(projectRow);

  if (!canEditProject(viewer, projectSubject)) {
    throw new Error("You do not have permission to update this project.");
  }

  if (
    leadPersonId !== (projectRow.lead_person_id ?? null) &&
    !canSetProjectLead(viewer, projectSubject)
  ) {
    throw new Error("Only admins and partners can change the project lead.");
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

  const officeIds = [...new Set([originatingOfficeId, managingOfficeId])];
  const [offices, leadPeople] = await Promise.all([
    fetchOfficeRows(officeIds, { client }),
    leadPersonId
      ? fetchPeopleRows([leadPersonId], { client })
      : Promise.resolve([]),
  ]);

  if (offices.length !== officeIds.length) {
    throw new Error("Selected office is unavailable.");
  }

  if (leadPersonId) {
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
    .update({
      client_name: clientName,
      description,
      lead_person_id: leadPersonId,
      managing_office_id: managingOfficeId,
      name,
      originating_office_id: originatingOfficeId,
      photo_url: photoUrl,
      stage: input.stage,
      start_date: input.startDate ?? null,
      target_completion_date: input.targetCompletionDate ?? null,
    })
    .eq("id", projectRow.id)
    .select(PROJECT_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  invalidateProjectReadCaches()
  await invalidatePersonViewerCaches([
    projectRow.lead_person_id,
    leadPersonId,
  ])

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

  invalidateProjectReadCaches()
  await invalidatePersonViewerCaches([person.id])

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
  const fileUrl = normalizeDocumentFileUrl(input.fileUrl);
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
  const canViewFinancials = canViewProjectFinancials(
    viewer,
    toProjectPermissionSubject(projectRow),
  );
  const personRow = (await fetchPeopleRows([updatedEntry.personId], { client }))[0] ?? null;
  const compensationByPersonId = canViewFinancials
    ? await fetchPeopleCompensationById([updatedEntry.personId], { client })
    : new Map<string, number>();
  const person = personRow
    ? attachPeopleCompensation([personRow], compensationByPersonId)[0]
    : null;
  const hourlyCost = getHourlyCostForPerson(canViewFinancials, person ?? undefined);

  return {
    ...updatedEntry,
    hourlyCost,
    laborCost: hourlyCost !== null ? updatedEntry.hours * hourlyCost : null,
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

  const status = getDatabaseStatus();
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null;
  const viewerAccessPromise = getCurrentViewerAccess(context);
  const detailContextPromise =
    client && projectDetailContextFunctionAvailable !== false
      ? client.rpc("get_project_detail_context", {
          target_project_id: projectId,
        })
      : null;
  const viewerAccess = await viewerAccessPromise;
  const viewerLabel = getViewerLabel(viewerAccess.summary);

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
    const previewData = getPreviewProjectDetail(projectId, viewerAccess.viewer);

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
      canAssignPeople: previewData.project
        ? canAssignPeopleToProject(
            viewerAccess.viewer,
            {
              id: previewData.project.id,
              leadPersonId: previewData.project.leadPersonId,
              managingOfficeId: previewData.project.managingOfficeId,
            },
          )
        : false,
      canEdit: previewData.project
        ? canEditProject(viewerAccess.viewer, {
            id: previewData.project.id,
            leadPersonId: previewData.project.leadPersonId,
            managingOfficeId: previewData.project.managingOfficeId,
          })
        : false,
      canEditChecklistItems: previewData.project
        ? canAddChecklistItemsToProject(
            viewerAccess.viewer,
            {
              id: previewData.project.id,
              leadPersonId: previewData.project.leadPersonId,
              managingOfficeId: previewData.project.managingOfficeId,
            },
          )
        : false,
      canEditStage: previewData.project
        ? canChangeProjectStage(
            viewerAccess.viewer,
            {
              id: previewData.project.id,
              leadPersonId: previewData.project.leadPersonId,
              managingOfficeId: previewData.project.managingOfficeId,
            },
          )
        : false,
      checklistItems: restrictedToSummary ? [] : previewData.checklistItems,
      documents: restrictedToSummary ? [] : previewData.documents,
      restrictedToSummary,
      staffedPeople: restrictedToSummary ? [] : previewData.staffedPeople,
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

  let detailContext: LoadedProjectDetailContext;

  if (detailContextPromise) {
    const { data, error } = await detailContextPromise;

    if (error) {
      if (isMissingProjectDetailContextFunction(error)) {
        projectDetailContextFunctionAvailable = false;
        detailContext = await loadProjectDetailContextFallback(projectId, client);
      } else {
        throw error;
      }
    } else {
      projectDetailContextFunctionAvailable = true;

      const response = (data ?? null) as ProjectDetailContextResponse | null;

      detailContext = {
        assignmentRows: (response?.assignments ?? []) as AssignmentRow[],
        checklistRows: (response?.checklistItems ?? []) as ChecklistItemRow[],
        documentRows: (response?.documents ?? []) as ResourceDocumentRow[],
        offices: (response?.offices ?? []) as OfficeRow[],
        people: (response?.people ?? []) as PersonRow[],
        projectRow: response?.found && response.project ? (response.project as ProjectRow) : null,
        timeEntryRows: (response?.timeEntries ?? []) as TimeEntryRow[],
      };
    }
  } else {
    detailContext = await loadProjectDetailContextFallback(projectId, client);
  }

  const row = detailContext.projectRow;

  if (!row) {
    return emptyProjectDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      false,
    );
  }

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

  const assignmentRows = detailContext.assignmentRows;
  const checklistRows = detailContext.checklistRows;
  const documentRows = detailContext.documentRows;
  const timeEntryRows = detailContext.timeEntryRows;
  const offices = detailContext.offices;
  const projectSubject = toProjectPermissionSubject(row);
  const canViewFinancials = canViewProjectFinancials(
    viewerAccess.viewer,
    projectSubject,
  );
  const compensationByPersonId =
    canViewFinancials && detailContext.people.length > 0
      ? await fetchPeopleCompensationById(
          detailContext.people.map((person) => person.id),
          { client },
        )
      : new Map<string, number>();
  const allPeople = attachPeopleCompensation(
    detailContext.people,
    compensationByPersonId,
  );
  const officesById = new Map(offices.map((office) => [office.id, office]));
  const peopleById = new Map(allPeople.map((person) => [person.id, person]));

  const project = buildProjectListItem(
    row,
    officesById,
    peopleById,
    null,
    false,
    canEditProject(viewerAccess.viewer, projectSubject),
    canChangeProjectStage(viewerAccess.viewer, projectSubject),
    canSetProjectLead(viewerAccess.viewer, projectSubject),
    canViewFinancials,
  );
  const restrictedToSummary = !canViewInternalProject(
    viewerAccess.viewer,
    project,
  );

  if (restrictedToSummary) {
    const summaryOnlyResult = {
      accessMessage:
        "Client access is currently limited to the project summary.",
      canAssignPeople: false,
      canEdit: false,
      canEditChecklistItems: false,
      canEditStage: false,
      checklistItems: [],
      configured: status.configured,
      configMessage: status.message,
      documents: [],
      forbidden: false,
      project,
      restrictedToSummary: true,
      staffedPeople: [],
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
  const staffedPeople = buildProjectStaffedPeople(
    assignmentRows,
    timeEntryRows,
    peopleById,
    officesById,
  );

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
      laborCost: number | null;
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
    const hourlyCost = getHourlyCostForPerson(canViewFinancials, person);
    const laborCost = hourlyCost !== null
      ? timeEntry.hours * hourlyCost
      : null;
    const existing = byPerson.get(timeEntry.personId);

    totalHours += timeEntry.hours;
    if (laborCost !== null) {
      totalLaborCost += laborCost;
    }

    if (existing) {
      existing.hours += timeEntry.hours;
      existing.laborCost =
        existing.laborCost !== null && laborCost !== null
          ? existing.laborCost + laborCost
          : null;
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
    canAssignPeople: canAssignPeopleToProject(
      viewerAccess.viewer,
      toProjectPermissionSubject(row),
    ),
    canEdit: canEditProject(
      viewerAccess.viewer,
      toProjectPermissionSubject(row),
    ),
    canEditChecklistItems: canAddChecklistItemsToProject(
      viewerAccess.viewer,
      toProjectPermissionSubject(row),
    ),
    canEditStage: canChangeProjectStage(
      viewerAccess.viewer,
      toProjectPermissionSubject(row),
    ),
    checklistItems,
    configured: status.configured,
    configMessage: status.message,
    documents,
    forbidden: false,
    project,
    restrictedToSummary: false,
    staffedPeople,
    staffing,
    timeSummary: {
      byPerson: Array.from(byPerson.values()).sort((left, right) =>
        left.personName.localeCompare(right.personName),
      ),
      recentEntries: timeEntries.slice(0, 5).map((entry) => ({
        ...entry,
        hourlyCost: getHourlyCostForPerson(
          canViewFinancials,
          peopleById.get(entry.personId),
        ),
        laborCost:
          getHourlyCostForPerson(canViewFinancials, peopleById.get(entry.personId)) !== null
            ? entry.hours *
              getHourlyCostForPerson(canViewFinancials, peopleById.get(entry.personId))!
            : null,
        personName: peopleById.get(entry.personId)?.full_name ?? null,
        personPhotoUrl: peopleById.get(entry.personId)?.photo_url ?? null,
        personTitle: peopleById.get(entry.personId)?.title ?? null,
      })),
      totalHours,
      totalLaborCost: canViewFinancials ? totalLaborCost : null,
    },
    viewerLabel,
  };

  return cacheKey ? setCachedValue(projectDetailCache, cacheKey, result) : result;
}
