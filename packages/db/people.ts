import type { Person } from "@mandala/domain"
import {
  canCreateOrUpdatePeople,
  canViewPeopleDirectory,
  canViewPerson,
  deriveAssignedHours,
  deriveHourlyCost,
  derivePersonAllocationPercent,
  deriveRemainingCapacity,
  deriveUtilizationPercent,
} from "@mandala/domain"

import { getCurrentViewerAccess, getViewerLabel, type ViewerRequestContext } from "./auth"
import { fetchOfficeRows, type OfficeRow, type PersonRow } from "./lookups"
import {
  PREVIEW_CONFIG_MESSAGE,
  previewAssignments,
  previewChecklistItems,
  previewOffices,
  previewPeople,
  previewProjects,
  previewTimeEntries,
} from "./previewData"
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer"

interface AssignmentRow {
  id: string
  person_id: string
  project_id: string
  assigned_hours_per_week: number | string
  start_date: string | null
  end_date: string | null
  notes: string | null
  active: boolean
}

interface ProjectRow {
  id: string
  name: string
  stage: string
  managing_office_id: string
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

interface ChecklistItemRow {
  id: string
  project_id: string
  title: string
  completed: boolean
  created_at: string
  completed_at: string | null
}

export interface PeopleOfficeFilter {
  id: string
  name: string
}

export interface PeopleListFilters {
  officeId?: string
  query?: string
}

export interface PersonListItem extends Person {
  allocationPercent: number
  assignedHours: number
  hourlyCost: number
  officeName: string
  remainingCapacity: number
}

export interface PeopleListData {
  accessMessage: string | null
  forbidden: boolean
  configMessage: string | null
  configured: boolean
  filters: PeopleListFilters
  offices: PeopleOfficeFilter[]
  people: PersonListItem[]
  viewerLabel: string | null
}

export interface PeopleOptionsData {
  accessMessage: string | null
  forbidden: boolean
  configMessage: string | null
  configured: boolean
  people: Array<{
    id: string
    fullName: string
  }>
  viewerLabel: string | null
}

export interface PersonDetailAssignmentItem {
  active: boolean
  endDate: string | null
  id: string
  managingOfficeName: string | null
  notes: string | null
  projectId: string
  projectName: string
  projectStage: string
  startDate: string | null
  assignedHoursPerWeek: number
}

export interface PersonDetailChecklistItem {
  completed: boolean
  completedAt: string | null
  createdAt: string
  id: string
  projectId: string
  projectName: string
  title: string
}

export interface PersonDetailTimeEntry {
  date: string
  hours: number
  id: string
  notes: string | null
  projectId: string
  projectName: string
  source: string | null
}

export interface PersonDetailProjectTimeItem {
  hours: number
  laborCost: number
  projectId: string
  projectName: string
}

export interface UpdatePersonPhotoInput {
  personId: string
  photoUrl?: string | null
}

export interface PersonDetailData {
  accessMessage: string | null
  assignments: PersonDetailAssignmentItem[]
  checklistItems: PersonDetailChecklistItem[]
  configMessage: string | null
  configured: boolean
  forbidden: boolean
  person: PersonListItem | null
  timeSummary: {
    latestTrackedWeekHours: number
    latestTrackedWeekUtilizationPercent: number
    recentEntries: PersonDetailTimeEntry[]
    totalHours: number
    totalLaborCost: number
    byProject: PersonDetailProjectTimeItem[]
  }
  viewerLabel: string | null
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    photoUrl: row.photo_url,
    officeId: row.office_id,
    annualSalary: Number(row.annual_salary),
    availabilityHoursPerWeek: Number(row.availability_hours_per_week),
    email: row.email,
    active: row.active,
  }
}

function matchesFilters(row: PersonRow, filters: PeopleListFilters): boolean {
  const query = filters.query?.trim().toLowerCase()

  if (filters.officeId && row.office_id !== filters.officeId) {
    return false
  }

  if (query) {
    const haystacks = [row.full_name, row.title ?? "", row.email ?? ""]
    return haystacks.some((value) => value.toLowerCase().includes(query))
  }

  return true
}

function buildPersonListItem(
  row: PersonRow,
  assignmentsByPersonId: Map<string, number>,
  officesById: Map<string, OfficeRow>,
): PersonListItem {
  const person = toPerson(row)
  const assignedHours = deriveAssignedHours([assignmentsByPersonId.get(row.id) ?? 0])

  return {
    ...person,
    allocationPercent: derivePersonAllocationPercent(
      assignedHours,
      person.availabilityHoursPerWeek,
    ),
    assignedHours,
    hourlyCost: deriveHourlyCost(person.annualSalary),
    officeName: officesById.get(person.officeId)?.name ?? "Unknown office",
    remainingCapacity: deriveRemainingCapacity(
      person.availabilityHoursPerWeek,
      assignedHours,
    ),
  }
}

function emptyPersonTimeSummary(): PersonDetailData["timeSummary"] {
  return {
    latestTrackedWeekHours: 0,
    latestTrackedWeekUtilizationPercent: 0,
    recentEntries: [],
    totalHours: 0,
    totalLaborCost: 0,
    byProject: [],
  }
}

function emptyPeopleListData(
  filters: PeopleListFilters,
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): PeopleListData {
  return {
    accessMessage,
    configMessage,
    configured,
    filters,
    forbidden,
    offices: [],
    people: [],
    viewerLabel,
  }
}

function emptyPeopleOptionsData(
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): PeopleOptionsData {
  return {
    accessMessage,
    configMessage,
    configured,
    forbidden,
    people: [],
    viewerLabel,
  }
}

function emptyPersonDetailData(
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): PersonDetailData {
  return {
    accessMessage,
    assignments: [],
    checklistItems: [],
    configMessage,
    configured,
    forbidden,
    person: null,
    timeSummary: emptyPersonTimeSummary(),
    viewerLabel,
  }
}

function listPreviewPeople(filters: PeopleListFilters): PeopleListData {
  const filteredPeople = previewPeople.filter((row) => matchesFilters(row, filters))
  const officesById = new Map(previewOffices.map((office) => [office.id, office]))
  const assignmentsByPersonId = previewAssignments.reduce((totals, assignment) => {
    if (!assignment.active) {
      return totals
    }

    const currentTotal = totals.get(assignment.person_id) ?? 0
    totals.set(assignment.person_id, currentTotal + Number(assignment.assigned_hours_per_week))
    return totals
  }, new Map<string, number>())

  return {
    accessMessage: null,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    configured: false,
    filters,
    forbidden: false,
    offices: previewOffices.map((office) => ({ id: office.id, name: office.name })),
    people: filteredPeople.map((row) =>
      buildPersonListItem(row, assignmentsByPersonId, officesById),
    ),
    viewerLabel: null,
  }
}

function listPreviewPeopleOptions(): PeopleOptionsData {
  return {
    accessMessage: null,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    configured: false,
    forbidden: false,
    people: previewPeople
      .filter((person) => person.active)
      .sort((left, right) => left.full_name.localeCompare(right.full_name))
      .map((person) => ({
        fullName: person.full_name,
        id: person.id,
      })),
    viewerLabel: null,
  }
}

function getPreviewPersonDetail(personId: string): PersonDetailData {
  const person = previewPeople.find((candidate) => candidate.id === personId)

  if (!person) {
    return emptyPersonDetailData(false, PREVIEW_CONFIG_MESSAGE, null, null, false)
  }

  const officesById = new Map(previewOffices.map((office) => [office.id, office]))
  const assignmentRows = previewAssignments
    .filter((assignment) => assignment.person_id === personId)
    .sort(
      (left, right) =>
        Number(right.active) - Number(left.active) ||
        (left.start_date ?? "").localeCompare(right.start_date ?? ""),
    )
  const timeEntryRows = previewTimeEntries
    .filter((entry) => entry.person_id === personId)
    .sort((left, right) => right.date.localeCompare(left.date))
  const checklistRows = previewChecklistItems
    .filter((item) => item.assigned_person_id === personId)
    .sort(
      (left, right) =>
        Number(left.completed) - Number(right.completed) ||
        right.created_at.localeCompare(left.created_at),
    )
  const projectRows = previewProjects.filter((project) =>
    [
      ...assignmentRows.map((assignment) => assignment.project_id),
      ...timeEntryRows.map((entry) => entry.project_id),
      ...checklistRows.map((item) => item.project_id),
    ].includes(project.id),
  )
  const assignmentsByPersonId = assignmentRows.reduce((totals, assignment) => {
    const currentTotal = totals.get(assignment.person_id) ?? 0
    totals.set(
      assignment.person_id,
      currentTotal + Number(assignment.assigned_hours_per_week),
    )
    return totals
  }, new Map<string, number>())
  const personListItem = buildPersonListItem(person, assignmentsByPersonId, officesById)
  const hourlyCost = deriveHourlyCost(personListItem.annualSalary)
  const projectsById = new Map(projectRows.map((project) => [project.id, project]))
  const byProject = new Map<string, PersonDetailProjectTimeItem>()
  let totalHours = 0
  let totalLaborCost = 0
  let latestTrackedWeekHours = 0
  const latestTrackedDate = timeEntryRows[0]?.date ?? null
  const latestTrackedWeekStart = latestTrackedDate
    ? new Date(`${latestTrackedDate}T00:00:00Z`)
    : null

  if (latestTrackedWeekStart) {
    latestTrackedWeekStart.setUTCDate(latestTrackedWeekStart.getUTCDate() - 6)
  }

  for (const entry of timeEntryRows) {
    const hours = Number(entry.hours)
    const laborCost = hours * hourlyCost
    const projectName = projectsById.get(entry.project_id)?.name ?? "Unknown project"
    const existing = byProject.get(entry.project_id)

    totalHours += hours
    totalLaborCost += laborCost

    if (latestTrackedWeekStart) {
      const entryDate = new Date(`${entry.date}T00:00:00Z`)
      if (entryDate >= latestTrackedWeekStart) {
        latestTrackedWeekHours += hours
      }
    }

    if (existing) {
      existing.hours += hours
      existing.laborCost += laborCost
    } else {
      byProject.set(entry.project_id, {
        hours,
        laborCost,
        projectId: entry.project_id,
        projectName,
      })
    }
  }

  return {
    accessMessage: null,
    assignments: assignmentRows.map((assignment) => {
      const project = projectsById.get(assignment.project_id)

      return {
        active: assignment.active,
        endDate: assignment.end_date,
        id: assignment.id,
        managingOfficeName: project
          ? officesById.get(project.managing_office_id)?.name ?? null
          : null,
        notes: assignment.notes,
        projectId: assignment.project_id,
        projectName: project?.name ?? "Unknown project",
        projectStage: project?.stage ?? "unknown",
        startDate: assignment.start_date,
        assignedHoursPerWeek: Number(assignment.assigned_hours_per_week),
      }
    }),
    checklistItems: checklistRows.map((item) => ({
      completed: item.completed,
      completedAt: item.completed_at,
      createdAt: item.created_at,
      id: item.id,
      projectId: item.project_id,
      projectName: projectsById.get(item.project_id)?.name ?? "Unknown project",
      title: item.title,
    })),
    configMessage: PREVIEW_CONFIG_MESSAGE,
    configured: false,
    forbidden: false,
    person: personListItem,
    timeSummary: {
      latestTrackedWeekHours,
      latestTrackedWeekUtilizationPercent: deriveUtilizationPercent(
        latestTrackedWeekHours,
        personListItem.availabilityHoursPerWeek,
      ),
      recentEntries: timeEntryRows.slice(0, 8).map((entry) => ({
        date: entry.date,
        hours: Number(entry.hours),
        id: entry.id,
        notes: entry.notes,
        projectId: entry.project_id,
        projectName: projectsById.get(entry.project_id)?.name ?? "Unknown project",
        source: entry.source,
      })),
      totalHours,
      totalLaborCost,
      byProject: Array.from(byProject.values()).sort((left, right) =>
        right.hours - left.hours || left.projectName.localeCompare(right.projectName),
      ),
    },
    viewerLabel: null,
  }
}

export async function listPeople(
  filters: PeopleListFilters = {},
  context: ViewerRequestContext = {},
): Promise<PeopleListData> {
  const viewerAccess = await getCurrentViewerAccess(context)
  const viewerLabel = getViewerLabel(viewerAccess.summary)
  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null

  if (!viewerAccess.viewer) {
    return emptyPeopleListData(
      filters,
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    )
  }

  if (!canViewPeopleDirectory(viewerAccess.viewer)) {
    return emptyPeopleListData(
      filters,
      status.configured,
      status.message,
      viewerAccess.accessMessage ?? "Current viewer cannot access the people directory.",
      viewerLabel,
      true,
    )
  }

  if (!client) {
    const previewData = listPreviewPeople(filters)

    return {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }
  }

  const [{ data: peopleData, error: peopleError }, offices] = await Promise.all([
    client
      .from("people")
      .select(
        "id, full_name, title, photo_url, office_id, annual_salary, availability_hours_per_week, email, active",
      )
      .order("full_name"),
    fetchOfficeRows(undefined, { client }),
  ])

  if (peopleError) {
    throw peopleError
  }

  const filteredPeople = ((peopleData ?? []) as PersonRow[]).filter((row) =>
    matchesFilters(row, filters),
  )
  const peopleIds = filteredPeople.map((person) => person.id)
  const officesById = new Map(offices.map((office) => [office.id, office]))

  let assignmentsByPersonId = new Map<string, number>()

  if (peopleIds.length > 0) {
    const { data: assignmentData, error: assignmentError } = await client
      .from("assignments")
      .select("person_id, assigned_hours_per_week, active")
      .in("person_id", peopleIds)
      .eq("active", true)

    if (assignmentError) {
      throw assignmentError
    }

    assignmentsByPersonId = ((assignmentData ?? []) as AssignmentRow[]).reduce(
      (totals, assignment) => {
        const currentTotal = totals.get(assignment.person_id) ?? 0
        totals.set(
          assignment.person_id,
          currentTotal + Number(assignment.assigned_hours_per_week),
        )
        return totals
      },
      new Map<string, number>(),
    )
  }

  return {
    accessMessage: viewerAccess.accessMessage,
    configMessage: status.message,
    configured: status.configured,
    filters,
    forbidden: false,
    offices: offices.map((office) => ({ id: office.id, name: office.name })),
    people: filteredPeople.map((row) =>
      buildPersonListItem(row, assignmentsByPersonId, officesById),
    ),
    viewerLabel,
  }
}

export async function listPeopleOptions(
  context: ViewerRequestContext = {},
): Promise<PeopleOptionsData> {
  const viewerAccess = await getCurrentViewerAccess(context)
  const viewerLabel = getViewerLabel(viewerAccess.summary)
  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null

  if (!viewerAccess.viewer) {
    return emptyPeopleOptionsData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    )
  }

  if (!canViewPeopleDirectory(viewerAccess.viewer)) {
    return emptyPeopleOptionsData(
      status.configured,
      status.message,
      viewerAccess.accessMessage ?? "Current viewer cannot access the people directory.",
      viewerLabel,
      true,
    )
  }

  if (!client) {
    const previewData = listPreviewPeopleOptions()

    return {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }
  }

  const { data, error } = await client
    .from("people")
    .select("id, full_name")
    .eq("active", true)
    .order("full_name")

  if (error) {
    throw error
  }

  return {
    accessMessage: viewerAccess.accessMessage,
    configMessage: status.message,
    configured: status.configured,
    forbidden: false,
    people: ((data ?? []) as Array<{ id: string; full_name: string }>).map((person) => ({
      fullName: person.full_name,
      id: person.id,
    })),
    viewerLabel,
  }
}

export async function updatePersonPhoto(
  input: UpdatePersonPhotoInput,
  context: ViewerRequestContext = {},
): Promise<Person> {
  const status = getDatabaseStatus()

  if (!status.configured) {
    throw new Error("People photo updates require a configured database connection.")
  }

  const viewerAccess = await getCurrentViewerAccess(context)

  if (!viewerAccess.viewer) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to continue.")
  }

  const client = createServerSupabaseClient({ accessToken: context.accessToken })

  if (!client) {
    throw new Error("People photo updates require a configured database connection.")
  }

  const personId = input.personId.trim()

  if (!personId) {
    throw new Error("Person is required.")
  }

  const { data: personRow, error: personError } = await client
    .from("people")
    .select(
      "id, full_name, title, photo_url, office_id, annual_salary, availability_hours_per_week, email, active",
    )
    .eq("id", personId)
    .maybeSingle()

  if (personError) {
    throw personError
  }

  if (!personRow) {
    throw new Error("Selected person is unavailable.")
  }

  const person = personRow as PersonRow

  if (!canCreateOrUpdatePeople(viewerAccess.viewer, person.office_id)) {
    throw new Error("You do not have permission to update this person.")
  }

  const photoUrl = input.photoUrl?.trim()

  const { data, error } = await client
    .from("people")
    .update({
      photo_url: photoUrl ? photoUrl : null,
    })
    .eq("id", personId)
    .select(
      "id, full_name, title, photo_url, office_id, annual_salary, availability_hours_per_week, email, active",
    )
    .single()

  if (error) {
    throw error
  }

  return toPerson(data as PersonRow)
}

export async function getPersonDetail(
  personId: string,
  context: ViewerRequestContext = {},
): Promise<PersonDetailData> {
  const viewerAccess = await getCurrentViewerAccess(context)
  const viewerLabel = getViewerLabel(viewerAccess.summary)
  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null

  if (!viewerAccess.viewer) {
    return emptyPersonDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    )
  }

  if (!client) {
    const previewData = getPreviewPersonDetail(personId)

    if (
      previewData.person &&
      !canViewPerson(viewerAccess.viewer, {
        id: previewData.person.id,
        officeId: previewData.person.officeId,
      })
    ) {
      return emptyPersonDetailData(
        false,
        PREVIEW_CONFIG_MESSAGE,
        viewerAccess.accessMessage ?? "Current viewer cannot access this person.",
        viewerLabel,
        true,
      )
    }

    return {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }
  }

  const { data: personRow, error: personError } = await client
    .from("people")
    .select(
      "id, full_name, title, photo_url, office_id, annual_salary, availability_hours_per_week, email, active",
    )
    .eq("id", personId)
    .maybeSingle()

  if (personError) {
    throw personError
  }

  if (!personRow) {
    return emptyPersonDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      false,
    )
  }

  const person = personRow as PersonRow

  if (
    !canViewPerson(viewerAccess.viewer, {
      id: person.id,
      officeId: person.office_id,
    })
  ) {
    return emptyPersonDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage ?? "Current viewer cannot access this person.",
      viewerLabel,
      true,
    )
  }

  const [
    offices,
    assignmentResponse,
    timeEntryResponse,
    checklistResponse,
  ] = await Promise.all([
    fetchOfficeRows([person.office_id], { client }),
    client
      .from("assignments")
      .select(
        "id, person_id, project_id, assigned_hours_per_week, start_date, end_date, notes, active",
      )
      .eq("person_id", personId)
      .order("active", { ascending: false })
      .order("start_date", { ascending: true }),
    client
      .from("time_entries")
      .select("id, person_id, project_id, assignment_id, date, hours, notes, source")
      .eq("person_id", personId)
      .order("date", { ascending: false }),
    client
      .from("checklist_items")
      .select("id, project_id, title, completed, created_at, completed_at")
      .eq("assigned_person_id", personId)
      .order("completed", { ascending: true })
      .order("created_at", { ascending: false }),
  ])

  if (assignmentResponse.error) throw assignmentResponse.error
  if (timeEntryResponse.error) throw timeEntryResponse.error
  if (checklistResponse.error) throw checklistResponse.error

  const assignmentRows = (assignmentResponse.data ?? []) as AssignmentRow[]
  const timeEntryRows = (timeEntryResponse.data ?? []) as TimeEntryRow[]
  const checklistRows = (checklistResponse.data ?? []) as ChecklistItemRow[]

  const projectIds = [
    ...new Set([
      ...assignmentRows.map((assignment) => assignment.project_id),
      ...timeEntryRows.map((entry) => entry.project_id),
      ...checklistRows.map((item) => item.project_id),
    ]),
  ]

  let projectRows: ProjectRow[] = []

  if (projectIds.length > 0) {
    const { data: projectsData, error: projectsError } = await client
      .from("projects")
      .select("id, name, stage, managing_office_id")
      .in("id", projectIds)

    if (projectsError) {
      throw projectsError
    }

    projectRows = (projectsData ?? []) as ProjectRow[]
  }

  const managingOfficeIds = [
    ...new Set(projectRows.map((project) => project.managing_office_id)),
  ]
  const managingOffices =
    managingOfficeIds.length > 0
      ? await fetchOfficeRows(managingOfficeIds, { client })
      : []
  const officesById = new Map(
    [...offices, ...managingOffices].map((office) => [office.id, office]),
  )
  const projectsById = new Map(projectRows.map((project) => [project.id, project]))
  const assignmentsByPersonId = assignmentRows.reduce((totals, assignment) => {
    const currentTotal = totals.get(assignment.person_id) ?? 0
    totals.set(
      assignment.person_id,
      currentTotal + Number(assignment.assigned_hours_per_week),
    )
    return totals
  }, new Map<string, number>())

  const personListItem = buildPersonListItem(person, assignmentsByPersonId, officesById)
  const hourlyCost = deriveHourlyCost(personListItem.annualSalary)

  const assignments = assignmentRows.map((assignment) => {
    const project = projectsById.get(assignment.project_id)

    return {
      active: assignment.active,
      endDate: assignment.end_date,
      id: assignment.id,
      managingOfficeName: project
        ? officesById.get(project.managing_office_id)?.name ?? null
        : null,
      notes: assignment.notes,
      projectId: assignment.project_id,
      projectName: project?.name ?? "Unknown project",
      projectStage: project?.stage ?? "unknown",
      startDate: assignment.start_date,
      assignedHoursPerWeek: Number(assignment.assigned_hours_per_week),
    }
  })

  const checklistItems = checklistRows.map((item) => ({
    completed: item.completed,
    completedAt: item.completed_at,
    createdAt: item.created_at,
    id: item.id,
    projectId: item.project_id,
    projectName: projectsById.get(item.project_id)?.name ?? "Unknown project",
    title: item.title,
  }))

  let totalHours = 0
  let totalLaborCost = 0
  let latestTrackedWeekHours = 0
  const byProject = new Map<string, PersonDetailProjectTimeItem>()

  const latestTrackedDate = timeEntryRows[0]?.date ?? null
  const latestTrackedWeekStart = latestTrackedDate
    ? new Date(`${latestTrackedDate}T00:00:00Z`)
    : null

  if (latestTrackedWeekStart) {
    latestTrackedWeekStart.setUTCDate(latestTrackedWeekStart.getUTCDate() - 6)
  }

  const recentEntries = timeEntryRows.slice(0, 8).map((entry) => ({
    date: entry.date,
    hours: Number(entry.hours),
    id: entry.id,
    notes: entry.notes,
    projectId: entry.project_id,
    projectName: projectsById.get(entry.project_id)?.name ?? "Unknown project",
    source: entry.source,
  }))

  for (const entry of timeEntryRows) {
    const hours = Number(entry.hours)
    const laborCost = hours * hourlyCost
    const projectName = projectsById.get(entry.project_id)?.name ?? "Unknown project"
    const existing = byProject.get(entry.project_id)

    totalHours += hours
    totalLaborCost += laborCost

    if (latestTrackedWeekStart) {
      const entryDate = new Date(`${entry.date}T00:00:00Z`)
      if (entryDate >= latestTrackedWeekStart) {
        latestTrackedWeekHours += hours
      }
    }

    if (existing) {
      existing.hours += hours
      existing.laborCost += laborCost
    } else {
      byProject.set(entry.project_id, {
        hours,
        laborCost,
        projectId: entry.project_id,
        projectName,
      })
    }
  }

  return {
    accessMessage: viewerAccess.accessMessage,
    assignments,
    checklistItems,
    configMessage: status.message,
    configured: status.configured,
    forbidden: false,
    person: personListItem,
    timeSummary: {
      latestTrackedWeekHours,
      latestTrackedWeekUtilizationPercent: deriveUtilizationPercent(
        latestTrackedWeekHours,
        personListItem.availabilityHoursPerWeek,
      ),
      recentEntries,
      totalHours,
      totalLaborCost,
      byProject: Array.from(byProject.values()).sort((left, right) =>
        right.hours - left.hours || left.projectName.localeCompare(right.projectName),
      ),
    },
    viewerLabel,
  }
}
