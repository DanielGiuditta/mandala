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
  hasPartnerRole,
} from "@mandala/domain"

import { getCurrentViewerAccess, getViewerLabel, type ViewerRequestContext } from "./auth"
import { fetchOfficeRows, fetchPeopleRows, type OfficeRow, type PersonRow } from "./lookups"
import {
  PREVIEW_CONFIG_MESSAGE,
  previewAssignments,
  previewChecklistItems,
  previewOffices,
  previewPeople,
  previewProjects,
  previewRoleAssignments,
  previewTimeEntries,
  previewUserAccounts,
} from "./previewData"
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer"

const PEOPLE_READ_CACHE_TTL_MS = 15_000
const DEFAULT_PERSON_AVAILABILITY_HOURS_PER_WEEK = 40
export const CREATE_PERSON_PERMISSIONS = ["noAccount", "employee", "admin", "partner"] as const

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
  active: boolean
  id: string
  name: string
  photo_url: string | null
  stage: string
  managing_office_id: string
}

interface UserAccountListRow {
  id: string
  person_id: string | null
  active: boolean
}

interface RoleAssignmentListRow {
  user_account_id: string
  role: string
  active: boolean
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

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

const peopleOptionsCache = new Map<string, CacheEntry<PeopleOptionsData>>()

export function invalidatePeopleReadCaches(): void {
  peopleOptionsCache.clear()
}

function getCachedValue<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key)

  if (!entry) {
    return null
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(key)
    return null
  }

  return entry.value
}

function setCachedValue<T>(store: Map<string, CacheEntry<T>>, key: string, value: T): T {
  store.set(key, {
    expiresAt: Date.now() + PEOPLE_READ_CACHE_TTL_MS,
    value,
  })

  return value
}

function getPeopleOptionsCacheKey(context: ViewerRequestContext): string | null {
  const sessionEmail = context.sessionEmail?.trim().toLowerCase()
  return sessionEmail || null
}

interface ChecklistItemRow {
  id: string
  project_id: string
  title: string
  completed: boolean
  created_at: string
  completed_at: string | null
}

export type CreatePersonPermission = (typeof CREATE_PERSON_PERMISSIONS)[number]

export interface PeopleOfficeFilter {
  id: string
  name: string
}

export interface PeopleListFilters {
  officeId?: string
  query?: string
}

export interface PersonListItem {
  active: boolean
  annualSalary: number
  email?: string | null
  effectivePermissionLabel: string | null
  fullName: string
  hoursThisWeek: number
  id: string
  officeId: string
  officeName: string
  photoUrl?: string | null
  staffedProjects: Array<{
    projectId: string
    projectName: string
    projectPhotoUrl: string | null
  }>
  supervisorName: string | null
  supervisorPersonId?: string | null
  supervisorPhotoUrl: string | null
  title?: string | null
}

export interface PersonDetailPerson extends PersonListItem {
  allocationPercent: number
  assignedHours: number
  availabilityHoursPerWeek: number
  hourlyCost: number
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

export interface CreatePersonInput {
  annualSalary: number
  email?: string | null
  fullName: string
  officeId: string
  permission: CreatePersonPermission
  photoUrl?: string | null
  supervisorPersonId?: string | null
  title?: string | null
}

export interface PersonDetailData {
  accessMessage: string | null
  assignments: PersonDetailAssignmentItem[]
  checklistItems: PersonDetailChecklistItem[]
  configMessage: string | null
  configured: boolean
  forbidden: boolean
  person: PersonDetailPerson | null
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
    supervisorPersonId: row.supervisor_person_id,
    annualSalary: Number(row.annual_salary),
    availabilityHoursPerWeek: Number(row.availability_hours_per_week),
    email: row.email,
    active: row.active,
  }
}

function getSupervisorSummary(
  supervisorPersonId: string | null,
  peopleById: Map<string, PersonRow>,
): {
  supervisorName: string | null
  supervisorPhotoUrl: string | null
} {
  if (!supervisorPersonId) {
    return {
      supervisorName: null,
      supervisorPhotoUrl: null,
    }
  }

  const supervisor = peopleById.get(supervisorPersonId)

  return {
    supervisorName: supervisor?.full_name ?? null,
    supervisorPhotoUrl: supervisor?.photo_url ?? null,
  }
}

function buildEffectivePermissionLabel(
  userAccount: UserAccountListRow | null,
  roleAssignments: RoleAssignmentListRow[],
): string | null {
  if (!userAccount) {
    return "No account"
  }

  if (!userAccount.active) {
    return "Inactive account"
  }

  if (roleAssignments.some((assignment) => assignment.active && assignment.role === "partner")) {
    return "Partner"
  }

  if (roleAssignments.some((assignment) => assignment.active && assignment.role === "admin")) {
    return "Admin"
  }

  return "Employee"
}

function isCreatePersonPermission(value: string): value is CreatePersonPermission {
  return (CREATE_PERSON_PERMISSIONS as readonly string[]).includes(value)
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`${label} is required.`)
  }

  return normalized
}

function normalizeNullableText(value?: string | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? ""

  if (!normalized) {
    return null
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Email is invalid.")
  }

  return normalized
}

function normalizeAnnualSalary(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Salary is invalid.")
  }

  return Number(value)
}

function toIsoDateString(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function getCurrentWeekDateRange(today: Date = new Date()): {
  startDate: string
  endDate: string
} {
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  const currentDay = todayUtc.getUTCDay()
  const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1
  const weekStart = new Date(todayUtc)

  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday)

  return {
    endDate: toIsoDateString(todayUtc),
    startDate: toIsoDateString(weekStart),
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
  officesById: Map<string, OfficeRow>,
  peopleById: Map<string, PersonRow>,
  staffedProjectsByPersonId: Map<
    string,
    Array<{
      projectId: string
      projectName: string
      projectPhotoUrl: string | null
    }>
  >,
  hoursThisWeekByPersonId: Map<string, number>,
  permissionLabelByPersonId: Map<string, string | null>,
): PersonListItem {
  const person = toPerson(row)
  const { supervisorName, supervisorPhotoUrl } = getSupervisorSummary(
    row.supervisor_person_id,
    peopleById,
  )

  return {
    active: person.active,
    annualSalary: person.annualSalary,
    email: person.email,
    effectivePermissionLabel: permissionLabelByPersonId.get(person.id) ?? null,
    fullName: person.fullName,
    hoursThisWeek: hoursThisWeekByPersonId.get(person.id) ?? 0,
    id: person.id,
    officeId: person.officeId,
    officeName: officesById.get(person.officeId)?.name ?? "Unknown office",
    photoUrl: person.photoUrl,
    staffedProjects: staffedProjectsByPersonId.get(person.id) ?? [],
    supervisorName,
    supervisorPersonId: person.supervisorPersonId,
    supervisorPhotoUrl,
    title: person.title,
  }
}

function buildPersonDetailPerson(
  row: PersonRow,
  assignmentsByPersonId: Map<string, number>,
  officesById: Map<string, OfficeRow>,
  peopleById: Map<string, PersonRow>,
  staffedProjectsByPersonId: Map<
    string,
    Array<{
      projectId: string
      projectName: string
      projectPhotoUrl: string | null
    }>
  >,
  hoursThisWeekByPersonId: Map<string, number>,
  permissionLabelByPersonId: Map<string, string | null>,
): PersonDetailPerson {
  const person = toPerson(row)
  const assignedHours = deriveAssignedHours([assignmentsByPersonId.get(row.id) ?? 0])
  const listItem = buildPersonListItem(
    row,
    officesById,
    peopleById,
    staffedProjectsByPersonId,
    hoursThisWeekByPersonId,
    permissionLabelByPersonId,
  )

  return {
    ...listItem,
    allocationPercent: derivePersonAllocationPercent(
      assignedHours,
      person.availabilityHoursPerWeek,
    ),
    assignedHours,
    availabilityHoursPerWeek: person.availabilityHoursPerWeek,
    hourlyCost: deriveHourlyCost(person.annualSalary),
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
  const peopleById = new Map(previewPeople.map((person) => [person.id, person]))
  const projectsById = new Map(previewProjects.map((project) => [project.id, project]))
  const staffedProjectsByPersonId = previewTimeEntries.reduce(
    (map, timeEntry) => {
      const project = projectsById.get(timeEntry.project_id)

      if (!project || !project.active) {
        return map
      }

      const current = map.get(timeEntry.person_id) ?? []

      if (!current.some((item) => item.projectId === project.id)) {
        current.push({
          projectId: project.id,
          projectName: project.name,
          projectPhotoUrl: project.photo_url ?? null,
        })
        current.sort((left, right) => left.projectName.localeCompare(right.projectName))
        map.set(timeEntry.person_id, current)
      }

      return map
    },
    new Map<
      string,
      Array<{
        projectId: string
        projectName: string
        projectPhotoUrl: string | null
      }>
    >(),
  )
  const { startDate: currentWeekStart, endDate: currentWeekEnd } = getCurrentWeekDateRange()
  const hoursThisWeekByPersonId = previewTimeEntries.reduce((map, timeEntry) => {
    if (timeEntry.date < currentWeekStart || timeEntry.date > currentWeekEnd) {
      return map
    }

    map.set(timeEntry.person_id, (map.get(timeEntry.person_id) ?? 0) + Number(timeEntry.hours))
    return map
  }, new Map<string, number>())
  const userAccountsByPersonId = new Map(
    previewUserAccounts
      .filter((account) => account.person_id)
      .map((account) => [account.person_id as string, account]),
  )
  const roleAssignmentsByUserAccountId = previewRoleAssignments.reduce((map, assignment) => {
    const current = map.get(assignment.user_account_id) ?? []
    current.push({
      user_account_id: assignment.user_account_id,
      role: assignment.role,
      active: assignment.active,
    })
    map.set(assignment.user_account_id, current)
    return map
  }, new Map<string, RoleAssignmentListRow[]>())
  const permissionLabelByPersonId = new Map(
    previewPeople.map((person) => {
      const userAccount = userAccountsByPersonId.get(person.id) ?? null
      const roleAssignments = userAccount
        ? roleAssignmentsByUserAccountId.get(userAccount.id) ?? []
        : []

      return [
        person.id,
        buildEffectivePermissionLabel(
          userAccount
            ? {
                active: userAccount.active,
                id: userAccount.id,
                person_id: userAccount.person_id,
              }
            : null,
          roleAssignments,
        ),
      ] as const
    }),
  )

  return {
    accessMessage: null,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    configured: false,
    filters,
    forbidden: false,
    offices: previewOffices.map((office) => ({ id: office.id, name: office.name })),
    people: filteredPeople.map((row) =>
      buildPersonListItem(
        row,
        officesById,
        peopleById,
        staffedProjectsByPersonId,
        hoursThisWeekByPersonId,
        permissionLabelByPersonId,
      ),
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
  const peopleById = new Map(previewPeople.map((candidate) => [candidate.id, candidate]))
  const staffedProjectsByPersonId = timeEntryRows.reduce(
    (map, entry) => {
      const project = projectsById.get(entry.project_id)

      if (!project || !project.active) {
        return map
      }

      const current = map.get(entry.person_id) ?? []

      if (!current.some((item) => item.projectId === project.id)) {
        current.push({
          projectId: project.id,
          projectName: project.name,
          projectPhotoUrl: project.photo_url,
        })
        current.sort((left, right) => left.projectName.localeCompare(right.projectName))
        map.set(entry.person_id, current)
      }

      return map
    },
    new Map<
      string,
      Array<{
        projectId: string
        projectName: string
        projectPhotoUrl: string | null
      }>
    >(),
  )
  const { startDate: currentWeekStart, endDate: currentWeekEnd } = getCurrentWeekDateRange()
  const hoursThisWeekByPersonId = timeEntryRows.reduce((map, entry) => {
    if (entry.date < currentWeekStart || entry.date > currentWeekEnd) {
      return map
    }

    map.set(entry.person_id, (map.get(entry.person_id) ?? 0) + Number(entry.hours))
    return map
  }, new Map<string, number>())
  const previewUserAccount = previewUserAccounts.find((account) => account.person_id === personId) ?? null
  const previewRoleAssignmentsForPerson = previewUserAccount
    ? previewRoleAssignments
        .filter((assignment) => assignment.user_account_id === previewUserAccount.id)
        .map((assignment) => ({
          active: assignment.active,
          role: assignment.role,
          user_account_id: assignment.user_account_id,
        }))
    : []
  const permissionLabelByPersonId = new Map<string, string | null>([
    [
      personId,
      buildEffectivePermissionLabel(
        previewUserAccount
          ? {
              active: previewUserAccount.active,
              id: previewUserAccount.id,
              person_id: previewUserAccount.person_id,
            }
          : null,
        previewRoleAssignmentsForPerson,
      ),
    ],
  ])
  const personListItem = buildPersonDetailPerson(
    person,
    assignmentsByPersonId,
    officesById,
    peopleById,
    staffedProjectsByPersonId,
    hoursThisWeekByPersonId,
    permissionLabelByPersonId,
  )
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
        "id, full_name, title, photo_url, office_id, supervisor_person_id, annual_salary, availability_hours_per_week, email, active",
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
  const peopleById = new Map(((peopleData ?? []) as PersonRow[]).map((row) => [row.id, row]))
  const officesById = new Map(offices.map((office) => [office.id, office]))
  const peopleIds = filteredPeople.map((person) => person.id)

  let staffedProjectsByPersonId = new Map<
    string,
    Array<{
      projectId: string
      projectName: string
      projectPhotoUrl: string | null
    }>
  >()
  let hoursThisWeekByPersonId = new Map<string, number>()
  let permissionLabelByPersonId = new Map<string, string | null>()

  if (peopleIds.length > 0) {
    const { startDate: currentWeekStart, endDate: currentWeekEnd } = getCurrentWeekDateRange()
    const [{ data: timeEntryData, error: timeEntryError }, { data: userAccountData, error: userAccountError }] =
      await Promise.all([
        client
          .from("time_entries")
          .select("person_id, project_id, date, hours")
          .in("person_id", peopleIds)
          .not("project_id", "is", null),
        client
          .from("user_accounts")
          .select("id, person_id, active")
          .in("person_id", peopleIds),
      ])

    if (timeEntryError) {
      throw timeEntryError
    }

    if (userAccountError) {
      throw userAccountError
    }

    const timeEntryRows = (timeEntryData ?? []) as Array<{
      person_id: string
      project_id: string
      date: string
      hours: number | string
    }>
    hoursThisWeekByPersonId = timeEntryRows.reduce((map, entry) => {
      if (entry.date < currentWeekStart || entry.date > currentWeekEnd) {
        return map
      }

      map.set(entry.person_id, (map.get(entry.person_id) ?? 0) + Number(entry.hours))
      return map
    }, new Map<string, number>())
    const projectIds = [...new Set(timeEntryRows.map((entry) => entry.project_id))]

    let projectsById = new Map<
      string,
      { active: boolean; id: string; name: string; photo_url: string | null }
    >()

    if (projectIds.length > 0) {
      const { data: projectData, error: projectError } = await client
        .from("projects")
        .select("id, name, photo_url, active")
        .in("id", projectIds)
        .eq("active", true)

      if (projectError) {
        throw projectError
      }

      projectsById = new Map(
        (
          (projectData ?? []) as Array<{
            active: boolean
            id: string
            name: string
            photo_url: string | null
          }>
        ).map((project) => [project.id, project]),
      )
    }

    staffedProjectsByPersonId = timeEntryRows.reduce(
      (map, entry) => {
        const project = projectsById.get(entry.project_id)

        if (!project) {
          return map
        }

        const current = map.get(entry.person_id) ?? []

        if (!current.some((item) => item.projectId === project.id)) {
          current.push({
            projectId: project.id,
            projectName: project.name,
            projectPhotoUrl: project.photo_url,
          })
          current.sort((left, right) => left.projectName.localeCompare(right.projectName))
          map.set(entry.person_id, current)
        }

        return map
      },
      new Map<
        string,
        Array<{
          projectId: string
          projectName: string
          projectPhotoUrl: string | null
        }>
      >(),
    )

    const userAccounts = (userAccountData ?? []) as UserAccountListRow[]
    const userAccountsByPersonId = new Map(
      userAccounts
        .filter((account) => account.person_id)
        .map((account) => [account.person_id as string, account]),
    )
    const userAccountIds = userAccounts.map((account) => account.id)
    let roleAssignmentsByUserAccountId = new Map<string, RoleAssignmentListRow[]>()

    if (userAccountIds.length > 0) {
      const { data: roleAssignmentData, error: roleAssignmentError } = await client
        .from("role_assignments")
        .select("user_account_id, role, active")
        .in("user_account_id", userAccountIds)

      if (roleAssignmentError) {
        throw roleAssignmentError
      }

      roleAssignmentsByUserAccountId = ((roleAssignmentData ?? []) as RoleAssignmentListRow[]).reduce(
        (map, assignment) => {
          const current = map.get(assignment.user_account_id) ?? []
          current.push(assignment)
          map.set(assignment.user_account_id, current)
          return map
        },
        new Map<string, RoleAssignmentListRow[]>(),
      )
    }

    permissionLabelByPersonId = new Map(
      filteredPeople.map((person) => {
        const userAccount = userAccountsByPersonId.get(person.id) ?? null
        const roleAssignments = userAccount
          ? roleAssignmentsByUserAccountId.get(userAccount.id) ?? []
          : []

        return [
          person.id,
          buildEffectivePermissionLabel(userAccount, roleAssignments),
        ] as const
      }),
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
      buildPersonListItem(
        row,
        officesById,
        peopleById,
        staffedProjectsByPersonId,
        hoursThisWeekByPersonId,
        permissionLabelByPersonId,
      ),
    ),
    viewerLabel,
  }
}

export async function listPeopleOptions(
  context: ViewerRequestContext = {},
): Promise<PeopleOptionsData> {
  const cacheKey = getPeopleOptionsCacheKey(context)
  const cachedValue = cacheKey ? getCachedValue(peopleOptionsCache, cacheKey) : null

  if (cachedValue) {
    return cachedValue
  }

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

    const previewResult = {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }

    return cacheKey ? setCachedValue(peopleOptionsCache, cacheKey, previewResult) : previewResult
  }

  const { data, error } = await client
    .from("people")
    .select("id, full_name")
    .eq("active", true)
    .order("full_name")

  if (error) {
    throw error
  }

  const result = {
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

  return cacheKey ? setCachedValue(peopleOptionsCache, cacheKey, result) : result
}

export async function createPerson(
  input: CreatePersonInput,
  context: ViewerRequestContext = {},
): Promise<Person> {
  const status = getDatabaseStatus()

  if (!status.configured) {
    throw new Error("People creation requires a configured database connection.")
  }

  const viewerAccess = await getCurrentViewerAccess(context)

  if (!viewerAccess.viewer) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to continue.")
  }

  const fullName = normalizeRequiredText(input.fullName, "Name")
  const officeId = normalizeRequiredText(input.officeId, "Office")
  const title = normalizeNullableText(input.title)
  const photoUrl = normalizeNullableText(input.photoUrl)
  const email = normalizeEmail(input.email)
  const supervisorPersonId = normalizeNullableText(input.supervisorPersonId)
  const annualSalary = normalizeAnnualSalary(input.annualSalary)

  if (!isCreatePersonPermission(input.permission)) {
    throw new Error("Permission is invalid.")
  }

  if (!canCreateOrUpdatePeople(viewerAccess.viewer, officeId)) {
    throw new Error("You do not have permission to create people for this office.")
  }

  if ((input.permission === "admin" || input.permission === "partner") && !hasPartnerRole(viewerAccess.viewer)) {
    throw new Error("Only partners can assign elevated permissions.")
  }

  if (input.permission !== "noAccount" && !email) {
    throw new Error("Email is required when creating an account.")
  }

  const client = createServerSupabaseClient({ accessToken: context.accessToken })

  if (!client) {
    throw new Error("People creation requires a configured database connection.")
  }

  const [offices, supervisors] = await Promise.all([
    fetchOfficeRows([officeId], { client }),
    supervisorPersonId
      ? fetchPeopleRows([supervisorPersonId], { client })
      : Promise.resolve([]),
  ])

  if (offices.length !== 1) {
    throw new Error("Selected office is unavailable.")
  }

  if (supervisorPersonId) {
    const supervisor = supervisors[0]

    if (!supervisor) {
      throw new Error("Selected supervisor is unavailable.")
    }

    if (!supervisor.active) {
      throw new Error("Selected supervisor must be active.")
    }
  }

  const serviceClient =
    input.permission === "noAccount" ? null : createServerSupabaseClient({ useServiceRole: true })

  if (input.permission !== "noAccount" && !serviceClient) {
    throw new Error(
      "Account-backed people creation requires SUPABASE_SERVICE_ROLE_KEY.",
    )
  }

  if (serviceClient && email) {
    const { data: existingAccount, error: existingAccountError } = await serviceClient
      .from("user_accounts")
      .select("id")
      .ilike("email", email)
      .maybeSingle()

    if (existingAccountError) {
      throw existingAccountError
    }

    if (existingAccount) {
      throw new Error("A user account with that email already exists.")
    }
  }

  const { data: personData, error: personError } = await client
    .from("people")
    .insert({
      active: true,
      annual_salary: annualSalary,
      availability_hours_per_week: DEFAULT_PERSON_AVAILABILITY_HOURS_PER_WEEK,
      email,
      full_name: fullName,
      office_id: officeId,
      photo_url: photoUrl,
      supervisor_person_id: supervisorPersonId,
      title,
    })
    .select(
      "id, full_name, title, photo_url, office_id, supervisor_person_id, annual_salary, availability_hours_per_week, email, active",
    )
    .single()

  if (personError) {
    throw personError
  }

  const createdPerson = personData as PersonRow

  if (!serviceClient || !email) {
    return toPerson(createdPerson)
  }

  try {
    const { data: userAccountData, error: userAccountError } = await serviceClient
      .from("user_accounts")
      .insert({
        active: true,
        email,
        person_id: createdPerson.id,
      })
      .select("id")
      .single()

    if (userAccountError) {
      throw userAccountError
    }

    if (input.permission === "admin" || input.permission === "partner") {
      const { error: roleAssignmentError } = await serviceClient
        .from("role_assignments")
        .insert({
          active: true,
          assigned_by_user_account_id: viewerAccess.viewer.userAccountId,
          office_id: input.permission === "admin" ? officeId : null,
          role: input.permission,
          user_account_id: (userAccountData as { id: string }).id,
        })

      if (roleAssignmentError) {
        throw roleAssignmentError
      }
    }
  } catch (error) {
    await serviceClient.from("user_accounts").delete().eq("person_id", createdPerson.id)
    await serviceClient.from("people").delete().eq("id", createdPerson.id)
    throw error
  }

  return toPerson(createdPerson)
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
      "id, full_name, title, photo_url, office_id, supervisor_person_id, annual_salary, availability_hours_per_week, email, active",
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
      "id, full_name, title, photo_url, office_id, supervisor_person_id, annual_salary, availability_hours_per_week, email, active",
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
      "id, full_name, title, photo_url, office_id, supervisor_person_id, annual_salary, availability_hours_per_week, email, active",
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
    supervisorRows,
    assignmentResponse,
    timeEntryResponse,
    checklistResponse,
    userAccountResponse,
  ] = await Promise.all([
    fetchOfficeRows([person.office_id], { client }),
    person.supervisor_person_id
      ? fetchPeopleRows([person.supervisor_person_id], { client })
      : Promise.resolve([]),
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
    client
      .from("user_accounts")
      .select("id, person_id, active")
      .eq("person_id", personId)
      .maybeSingle(),
  ])

  if (assignmentResponse.error) throw assignmentResponse.error
  if (timeEntryResponse.error) throw timeEntryResponse.error
  if (checklistResponse.error) throw checklistResponse.error
  if (userAccountResponse.error) throw userAccountResponse.error

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
      .select("id, name, photo_url, stage, managing_office_id, active")
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
  const peopleById = new Map([person, ...supervisorRows].map((row) => [row.id, row]))
  const projectsById = new Map(projectRows.map((project) => [project.id, project]))
  const assignmentsByPersonId = assignmentRows.reduce((totals, assignment) => {
    const currentTotal = totals.get(assignment.person_id) ?? 0
    totals.set(
      assignment.person_id,
      currentTotal + Number(assignment.assigned_hours_per_week),
    )
    return totals
  }, new Map<string, number>())
  const { startDate: currentWeekStart, endDate: currentWeekEnd } = getCurrentWeekDateRange()
  const hoursThisWeekByPersonId = timeEntryRows.reduce((map, entry) => {
    if (entry.date < currentWeekStart || entry.date > currentWeekEnd) {
      return map
    }

    map.set(entry.person_id, (map.get(entry.person_id) ?? 0) + Number(entry.hours))
    return map
  }, new Map<string, number>())
  const staffedProjectsByPersonId = timeEntryRows.reduce(
    (map, entry) => {
      const project = projectsById.get(entry.project_id)

      if (!project || !project.active) {
        return map
      }

      const current = map.get(entry.person_id) ?? []

      if (!current.some((item) => item.projectId === project.id)) {
        current.push({
          projectId: project.id,
          projectName: project.name,
          projectPhotoUrl: project.photo_url,
        })
        current.sort((left, right) => left.projectName.localeCompare(right.projectName))
        map.set(entry.person_id, current)
      }

      return map
    },
    new Map<
      string,
      Array<{
        projectId: string
        projectName: string
        projectPhotoUrl: string | null
      }>
    >(),
  )
  const userAccount = (userAccountResponse.data ?? null) as UserAccountListRow | null
  let roleAssignmentsForPerson: RoleAssignmentListRow[] = []

  if (userAccount) {
    const { data: roleAssignmentData, error: roleAssignmentError } = await client
      .from("role_assignments")
      .select("user_account_id, role, active")
      .eq("user_account_id", userAccount.id)

    if (roleAssignmentError) {
      throw roleAssignmentError
    }

    roleAssignmentsForPerson = (roleAssignmentData ?? []) as RoleAssignmentListRow[]
  }

  const permissionLabelByPersonId = new Map<string, string | null>([
    [personId, buildEffectivePermissionLabel(userAccount, roleAssignmentsForPerson)],
  ])

  const personListItem = buildPersonDetailPerson(
    person,
    assignmentsByPersonId,
    officesById,
    peopleById,
    staffedProjectsByPersonId,
    hoursThisWeekByPersonId,
    permissionLabelByPersonId,
  )
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
