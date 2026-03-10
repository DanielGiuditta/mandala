import type {
  Assignment,
  ChecklistItem,
  Project,
  ProjectStage,
  ResourceDocument,
  TimeEntry,
} from "@mandala/domain"
import { deriveHourlyCost, isProjectStage } from "@mandala/domain"

import { fetchOfficeRows, fetchPeopleRows, type OfficeRow, type PersonRow } from "./lookups"
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer"

interface ProjectRow {
  id: string
  name: string
  client_name: string | null
  description: string | null
  originating_office_id: string
  managing_office_id: string
  lead_person_id: string | null
  stage: string
  start_date: string | null
  target_completion_date: string | null
  active: boolean
}

interface AssignmentRow {
  id: string
  project_id: string
  person_id: string
  assigned_hours_per_week: number | string
  start_date: string | null
  end_date: string | null
  notes: string | null
  active: boolean
}

interface ChecklistItemRow {
  id: string
  project_id: string
  title: string
  assigned_person_id: string | null
  completed: boolean
  created_at: string
  completed_at: string | null
}

interface ResourceDocumentRow {
  id: string
  name: string
  file_url: string
  file_type: string | null
  project_id: string | null
  category: string | null
  description: string | null
  uploaded_by_person_id: string | null
  created_at: string
}

interface TimeEntryRow {
  id: string
  person_id: string
  project_id: string
  assignment_id: string | null
  date: string
  hours: number | string
  notes: string | null
  source: string | null
}

export interface ProjectOfficeFilter {
  id: string
  name: string
}

export interface ProjectListFilters {
  officeId?: string
  query?: string
  stage?: ProjectStage
}

export interface ProjectListItem extends Project {
  clientName: string | null
  description: string | null
  leadPersonName: string | null
  managingOfficeName: string
  originatingOfficeName: string
}

export interface ProjectAssignmentItem extends Assignment {
  personName: string
  personOfficeName: string | null
  personTitle: string | null
}

export interface ProjectChecklistItem extends ChecklistItem {
  assignedPersonName: string | null
}

export interface ProjectTimeSummary {
  byPerson: Array<{
    hours: number
    laborCost: number
    personId: string
    personName: string
  }>
  recentEntries: Array<TimeEntry & { personName: string | null }>
  totalHours: number
  totalLaborCost: number
}

export interface ProjectDetailData {
  checklistItems: ProjectChecklistItem[]
  configured: boolean
  configMessage: string | null
  documents: ResourceDocument[]
  project: ProjectListItem | null
  staffing: ProjectAssignmentItem[]
  timeSummary: ProjectTimeSummary
}

export interface ProjectListData {
  configured: boolean
  configMessage: string | null
  filters: ProjectListFilters
  offices: ProjectOfficeFilter[]
  projects: ProjectListItem[]
}

function toProjectStage(value: string): ProjectStage {
  return isProjectStage(value) ? value : "proposal"
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientName: row.client_name,
    description: row.description,
    originatingOfficeId: row.originating_office_id,
    managingOfficeId: row.managing_office_id,
    leadPersonId: row.lead_person_id,
    stage: toProjectStage(row.stage),
    startDate: row.start_date,
    targetCompletionDate: row.target_completion_date,
    active: row.active,
  }
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
  }
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
  }
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
  }
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
  }
}

function buildProjectListItem(
  row: ProjectRow,
  officesById: Map<string, OfficeRow>,
  peopleById: Map<string, PersonRow>,
): ProjectListItem {
  const project = toProject(row)

  return {
    ...project,
    clientName: project.clientName ?? null,
    description: project.description ?? null,
    leadPersonName: row.lead_person_id
      ? peopleById.get(row.lead_person_id)?.full_name ?? null
      : null,
    managingOfficeName: officesById.get(row.managing_office_id)?.name ?? "Unknown office",
    originatingOfficeName:
      officesById.get(row.originating_office_id)?.name ?? "Unknown office",
  }
}

function matchesFilters(row: ProjectRow, filters: ProjectListFilters): boolean {
  const query = filters.query?.trim().toLowerCase()

  if (filters.stage && toProjectStage(row.stage) !== filters.stage) {
    return false
  }

  if (
    filters.officeId &&
    row.originating_office_id !== filters.officeId &&
    row.managing_office_id !== filters.officeId
  ) {
    return false
  }

  if (query) {
    const haystacks = [row.name, row.client_name ?? "", row.description ?? ""]
    return haystacks.some((value) => value.toLowerCase().includes(query))
  }

  return true
}

function emptyTimeSummary(): ProjectTimeSummary {
  return {
    byPerson: [],
    recentEntries: [],
    totalHours: 0,
    totalLaborCost: 0,
  }
}

export async function listProjects(filters: ProjectListFilters = {}): Promise<ProjectListData> {
  const status = getDatabaseStatus()
  const client = createServerSupabaseClient()

  if (!client) {
    return {
      configured: status.configured,
      configMessage: status.message,
      filters,
      offices: [],
      projects: [],
    }
  }

  const [{ data: projectData, error: projectError }, offices] = await Promise.all([
    client
      .from("projects")
      .select(
        "id, name, client_name, description, originating_office_id, managing_office_id, lead_person_id, stage, start_date, target_completion_date, active",
      )
      .order("name"),
    fetchOfficeRows(),
  ])

  if (projectError) {
    throw projectError
  }

  const projectRows = ((projectData ?? []) as ProjectRow[]).filter((row) =>
    matchesFilters(row, filters),
  )
  const leadIds = projectRows
    .map((row) => row.lead_person_id)
    .filter((value): value is string => Boolean(value))
  const people = await fetchPeopleRows([...new Set(leadIds)])
  const officesById = new Map(offices.map((office) => [office.id, office]))
  const peopleById = new Map(people.map((person) => [person.id, person]))

  return {
    configured: status.configured,
    configMessage: status.message,
    filters,
    offices: offices.map((office) => ({ id: office.id, name: office.name })),
    projects: projectRows.map((row) => buildProjectListItem(row, officesById, peopleById)),
  }
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetailData> {
  const status = getDatabaseStatus()
  const client = createServerSupabaseClient()

  if (!client) {
    return {
      checklistItems: [],
      configured: status.configured,
      configMessage: status.message,
      documents: [],
      project: null,
      staffing: [],
      timeSummary: emptyTimeSummary(),
    }
  }

  const { data: projectRow, error: projectError } = await client
    .from("projects")
    .select(
      "id, name, client_name, description, originating_office_id, managing_office_id, lead_person_id, stage, start_date, target_completion_date, active",
    )
    .eq("id", projectId)
    .maybeSingle()

  if (projectError) {
    throw projectError
  }

  if (!projectRow) {
    return {
      checklistItems: [],
      configured: status.configured,
      configMessage: status.message,
      documents: [],
      project: null,
      staffing: [],
      timeSummary: emptyTimeSummary(),
    }
  }

  const row = projectRow as ProjectRow

  const [
    offices,
    leadPeople,
    assignmentResponse,
    checklistResponse,
    documentResponse,
    timeEntryResponse,
  ] = await Promise.all([
    fetchOfficeRows([row.originating_office_id, row.managing_office_id]),
    row.lead_person_id ? fetchPeopleRows([row.lead_person_id]) : Promise.resolve([]),
    client
      .from("assignments")
      .select(
        "id, project_id, person_id, assigned_hours_per_week, start_date, end_date, notes, active",
      )
      .eq("project_id", projectId)
      .order("start_date", { ascending: true }),
    client
      .from("checklist_items")
      .select(
        "id, project_id, title, assigned_person_id, completed, created_at, completed_at",
      )
      .eq("project_id", projectId)
      .order("completed", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("resource_documents")
      .select(
        "id, name, file_url, file_type, project_id, category, description, uploaded_by_person_id, created_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    client
      .from("time_entries")
      .select("id, person_id, project_id, assignment_id, date, hours, notes, source")
      .eq("project_id", projectId)
      .order("date", { ascending: false }),
  ])

  const [
    assignmentRows,
    checklistRows,
    documentRows,
    timeEntryRows,
  ] = [
    (assignmentResponse.data ?? []) as AssignmentRow[],
    (checklistResponse.data ?? []) as ChecklistItemRow[],
    (documentResponse.data ?? []) as ResourceDocumentRow[],
    (timeEntryResponse.data ?? []) as TimeEntryRow[],
  ]

  if (assignmentResponse.error) throw assignmentResponse.error
  if (checklistResponse.error) throw checklistResponse.error
  if (documentResponse.error) throw documentResponse.error
  if (timeEntryResponse.error) throw timeEntryResponse.error

  const staffingPeopleIds = assignmentRows.map((assignment) => assignment.person_id)
  const checklistPeopleIds = checklistRows
    .map((item) => item.assigned_person_id)
    .filter((value): value is string => Boolean(value))
  const timePeopleIds = timeEntryRows.map((entry) => entry.person_id)
  const allPeopleIds = [
    ...new Set([
      ...leadPeople.map((person) => person.id),
      ...staffingPeopleIds,
      ...checklistPeopleIds,
      ...timePeopleIds,
    ]),
  ]
  const allPeople = await fetchPeopleRows(allPeopleIds)
  const officesById = new Map(offices.map((office) => [office.id, office]))
  const peopleById = new Map(allPeople.map((person) => [person.id, person]))
  const staffingOfficeIds = [
    ...new Set(
      allPeople
        .map((person) => person.office_id)
        .filter((officeId) => !officesById.has(officeId)),
    ),
  ]
  const staffingOffices =
    staffingOfficeIds.length > 0 ? await fetchOfficeRows(staffingOfficeIds) : []

  for (const office of staffingOffices) {
    officesById.set(office.id, office)
  }

  const project = buildProjectListItem(row, officesById, peopleById)

  const staffing = assignmentRows.map((assignmentRow) => {
    const assignment = toAssignment(assignmentRow)
    const person = peopleById.get(assignment.personId)

    return {
      ...assignment,
      personName: person?.full_name ?? "Unknown person",
      personOfficeName: person ? officesById.get(person.office_id)?.name ?? null : null,
      personTitle: person?.title ?? null,
    }
  })

  const checklistItems = checklistRows.map((checklistRow) => {
    const checklistItem = toChecklistItem(checklistRow)
    const assignedPerson = checklistItem.assignedPersonId
      ? peopleById.get(checklistItem.assignedPersonId)
      : null

    return {
      ...checklistItem,
      assignedPersonName: assignedPerson?.full_name ?? null,
    }
  })

  const documents = documentRows.map((documentRow) => toResourceDocument(documentRow))
  const timeEntries = timeEntryRows.map((timeEntryRow) => toTimeEntry(timeEntryRow))
  const byPerson = new Map<
    string,
    { hours: number; laborCost: number; personId: string; personName: string }
  >()

  let totalHours = 0
  let totalLaborCost = 0

  for (const timeEntry of timeEntries) {
    const person = peopleById.get(timeEntry.personId)
    const personName = person?.full_name ?? "Unknown person"
    const laborCost =
      person ? timeEntry.hours * deriveHourlyCost(Number(person.annual_salary)) : 0
    const existing = byPerson.get(timeEntry.personId)

    totalHours += timeEntry.hours
    totalLaborCost += laborCost

    if (existing) {
      existing.hours += timeEntry.hours
      existing.laborCost += laborCost
    } else {
      byPerson.set(timeEntry.personId, {
        hours: timeEntry.hours,
        laborCost,
        personId: timeEntry.personId,
        personName,
      })
    }
  }

  return {
    checklistItems,
    configured: status.configured,
    configMessage: status.message,
    documents,
    project,
    staffing,
    timeSummary: {
      byPerson: Array.from(byPerson.values()).sort((left, right) =>
        left.personName.localeCompare(right.personName),
      ),
      recentEntries: timeEntries.slice(0, 5).map((entry) => ({
        ...entry,
        personName: peopleById.get(entry.personId)?.full_name ?? null,
      })),
      totalHours,
      totalLaborCost,
    },
  }
}
