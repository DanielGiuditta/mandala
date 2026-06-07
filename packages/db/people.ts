import type { Person } from "@mandala/domain"
import {
  EXACT_SUPER_USER_EMAIL,
  canCreateOrUpdatePeople,
  canViewFinancialData,
  canViewCompensation,
  canViewPeopleDirectory,
  canViewPerson,
  deriveAssignedHours,
  deriveHourlyCost,
  derivePersonAllocationPercent,
  deriveRemainingCapacity,
  deriveUtilizationPercent,
  hasExactSuperUserOverride,
  hasPartnerPrivileges,
} from "@mandala/domain"

import {
  getCurrentViewerAccess,
  getViewerLabel,
  invalidateViewerAccessCache,
  type CurrentViewerAccess,
  type ViewerRequestContext,
} from "./auth"
import {
  attachPeopleCompensation,
  fetchOfficeRows,
  fetchPeopleCompensationById,
  fetchPeopleRows,
  PERSON_PUBLIC_SELECT,
  type OfficeRow,
  type PersonRow,
} from "./lookups"
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
import { createPerfTrace } from "./perf"

const PEOPLE_READ_CACHE_TTL_MS = 300_000
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
  email?: string | null
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

interface PersonDetailContextResponse {
  found: boolean
  person: PersonRow | null
  office: OfficeRow | null
  supervisor: PersonRow | null
  assignments: AssignmentRow[]
  timeEntries: TimeEntryRow[]
  checklistItems: ChecklistItemRow[]
  projects: ProjectRow[]
  managingOffices: OfficeRow[]
  userAccount: UserAccountListRow | null
  roleAssignments: RoleAssignmentListRow[]
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

const peopleOfficeOptionsCache = new Map<
  string,
  CacheEntry<PeopleOfficeOptionsData>
>()
const peopleOptionsCache = new Map<string, CacheEntry<PeopleOptionsData>>()
const peopleRailCache = new Map<string, CacheEntry<PeopleRailData>>()

export function invalidatePeopleReadCaches(): void {
  peopleOfficeOptionsCache.clear()
  peopleOptionsCache.clear()
  peopleRailCache.clear()
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

function getPeopleReadCacheKey(context: ViewerRequestContext): string | null {
  const sessionEmail = context.sessionEmail?.trim().toLowerCase()
  return sessionEmail || null
}

function getPeopleOptionsCacheKey(context: ViewerRequestContext): string | null {
  return getPeopleReadCacheKey(context)
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
  annualSalary: number | null
  canEdit: boolean
  canEditPermission: boolean
  canViewCompensation: boolean
  email?: string | null
  effectivePermission: CreatePersonPermission
  effectivePermissionLabel: string | null
  fullName: string
  hoursThisWeek: number
  id: string
  isCurrentViewer: boolean
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

export interface PersonRailItem {
  fullName: string
  id: string
  photoUrl?: string | null
  title?: string | null
}

export interface PersonDetailPerson extends PersonListItem {
  allocationPercent: number
  assignedHours: number
  availabilityHoursPerWeek: number
  hourlyCost: number | null
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

export interface PeopleOptionRow {
  id: string
  fullName: string
  photoUrl: string | null
  title: string | null
}

export interface PeopleOptionsData {
  accessMessage: string | null
  forbidden: boolean
  configMessage: string | null
  configured: boolean
  people: PeopleOptionRow[]
  viewerLabel: string | null
}

export interface PeopleOfficeOptionsData {
  accessMessage: string | null
  forbidden: boolean
  configMessage: string | null
  configured: boolean
  offices: PeopleOfficeFilter[]
  viewerLabel: string | null
}

export interface PeopleRailData {
  accessMessage: string | null
  forbidden: boolean
  configMessage: string | null
  configured: boolean
  people: PersonRailItem[]
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
  laborCost: number | null
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

export interface UpdatePersonInput extends CreatePersonInput {
  personId: string
}

export interface RemovePersonInput {
  personId: string
}

export interface ResendPersonAccountEmailInput {
  personId: string
}

export interface ResendPersonAccountEmailResult {
  delivery: "invite" | "passwordReset"
  email: string
}

export interface PersonDetailData {
  accessMessage: string | null
  assignments: PersonDetailAssignmentItem[]
  canEdit: boolean
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
    totalLaborCost: number | null
    byProject: PersonDetailProjectTimeItem[]
  }
  viewerLabel: string | null
}

function getAnnualSalary(row: Pick<PersonRow, "annual_salary">): number | null {
  return row.annual_salary === null ? null : Number(row.annual_salary)
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    photoUrl: row.photo_url,
    officeId: row.office_id,
    supervisorPersonId: row.supervisor_person_id,
    annualSalary: getAnnualSalary(row) ?? 0,
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

function buildEffectivePermissionValue(
  userAccount: UserAccountListRow | null,
  roleAssignments: RoleAssignmentListRow[],
): CreatePersonPermission {
  if (!userAccount || !userAccount.active) {
    return "noAccount"
  }

  if (roleAssignments.some((assignment) => assignment.active && assignment.role === "partner")) {
    return "partner"
  }

  if (roleAssignments.some((assignment) => assignment.active && assignment.role === "admin")) {
    return "admin"
  }

  return "employee"
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

function normalizeStoredEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

function normalizeAnnualSalary(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Salary is invalid.")
  }

  return Number(value)
}

function getErrorMessage(error: unknown, fallback = "Unexpected error."): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message
  }

  return fallback
}

function toError(error: unknown, fallback = "Unexpected error."): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error, fallback))
}

function isSupabaseApiKeyError(error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes("unregistered api key")
}

function isAuthUserAlreadyRegisteredError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes("already registered")
}

function createTemporaryPassword(): string {
  return `Mandala-${crypto.randomUUID()}-Aa1!`
}

async function isServiceRoleClientUsable(
  serviceClient: NonNullable<ReturnType<typeof createServerSupabaseClient>> | null,
): Promise<boolean> {
  if (!serviceClient) {
    return false
  }

  const { error } = await serviceClient.from("offices").select("id").limit(1)

  if (!error) {
    return true
  }

  if (isSupabaseApiKeyError(error)) {
    return false
  }

  throw toError(error, "Unable to verify Supabase service-role access.")
}

async function inviteAuthUserByEmail(
  email: string,
  fullName: string,
  redirectTo: string | null,
  serviceClient: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
): Promise<string | null> {
  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: {
      fullName,
    },
    redirectTo: redirectTo ?? undefined,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data.user?.id ?? null
}

async function ensureAuthUserByEmail(
  email: string,
  fullName: string,
  redirectTo: string | null,
  client: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
): Promise<"created" | "existing"> {
  const { error } = await client.auth.signUp({
    email,
    password: createTemporaryPassword(),
    options: {
      data: {
        fullName,
      },
      emailRedirectTo: redirectTo ?? undefined,
    },
  })

  if (error && !isAuthUserAlreadyRegisteredError(error)) {
    throw toError(error, "Unable to create the auth user.")
  }

  return error ? "existing" : "created"
}

async function sendPasswordRecoveryEmail(
  email: string,
  redirectTo: string | null,
  client: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo ?? undefined,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function findAuthUserByEmail(
  email: string,
  serviceClient: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
): Promise<{ id: string; userMetadata: Record<string, unknown> | null } | null> {
  let page = 1

  while (true) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) {
      throw new Error(error.message)
    }

    const match = data.users.find((user) => user.email?.trim().toLowerCase() === email)

    if (match) {
      return {
        id: match.id,
        userMetadata:
          match.user_metadata && typeof match.user_metadata === "object"
            ? (match.user_metadata as Record<string, unknown>)
            : null,
      }
    }

    if (!data.nextPage) {
      return null
    }

    page = data.nextPage
  }
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
  permissionValueByPersonId: Map<string, CreatePersonPermission>,
  canEdit: boolean,
  canEditPermission: boolean,
  canViewCompensationValue: boolean,
  isCurrentViewer: boolean,
): PersonListItem {
  const person = toPerson(row)
  const annualSalary = getAnnualSalary(row)
  const { supervisorName, supervisorPhotoUrl } = getSupervisorSummary(
    row.supervisor_person_id,
    peopleById,
  )

  return {
    active: person.active,
    annualSalary: canViewCompensationValue ? annualSalary : null,
    canEdit,
    canEditPermission,
    canViewCompensation: canViewCompensationValue,
    email: person.email,
    effectivePermission: permissionValueByPersonId.get(person.id) ?? "noAccount",
    effectivePermissionLabel: permissionLabelByPersonId.get(person.id) ?? null,
    fullName: person.fullName,
    hoursThisWeek: hoursThisWeekByPersonId.get(person.id) ?? 0,
    id: person.id,
    isCurrentViewer,
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

function buildPersonRailItem(
  row: Pick<PersonRow, "full_name" | "id" | "photo_url" | "title">,
): PersonRailItem {
  return {
    fullName: row.full_name,
    id: row.id,
    photoUrl: row.photo_url,
    title: row.title,
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
  effectivePermission: CreatePersonPermission,
  canEdit: boolean,
  canEditPermission: boolean,
  canViewCompensationValue: boolean,
  isCurrentViewer: boolean,
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
    new Map([[row.id, effectivePermission]]),
    canEdit,
    canEditPermission,
    canViewCompensationValue,
    isCurrentViewer,
  )

  return {
    ...listItem,
    allocationPercent: derivePersonAllocationPercent(
      assignedHours,
      person.availabilityHoursPerWeek,
    ),
    assignedHours,
    availabilityHoursPerWeek: person.availabilityHoursPerWeek,
    effectivePermission,
    hourlyCost: canViewCompensationValue && getAnnualSalary(row) !== null
      ? deriveHourlyCost(getAnnualSalary(row)!)
      : null,
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
    totalLaborCost: null,
    byProject: [],
  }
}

function isElevatedPermission(permission: CreatePersonPermission): boolean {
  return permission === "admin" || permission === "partner"
}

function canEditPersonPermission(
  viewer: NonNullable<CurrentViewerAccess["viewer"]>,
  row: Pick<PersonRow, "id" | "office_id">,
): boolean {
  return canCreateOrUpdatePeople(viewer, row.office_id)
}

function isCurrentViewerPerson(
  viewer: NonNullable<CurrentViewerAccess["viewer"]>,
  personId: string,
): boolean {
  return viewer.personId === personId
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

function emptyPeopleOfficeOptionsData(
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): PeopleOfficeOptionsData {
  return {
    accessMessage,
    configMessage,
    configured,
    forbidden,
    offices: [],
    viewerLabel,
  }
}

function emptyPeopleRailData(
  configured: boolean,
  configMessage: string | null,
  accessMessage: string | null,
  viewerLabel: string | null,
  forbidden: boolean,
): PeopleRailData {
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
    canEdit: false,
    checklistItems: [],
    configMessage,
    configured,
    forbidden,
    person: null,
    timeSummary: emptyPersonTimeSummary(),
    viewerLabel,
  }
}

function listPreviewPeople(
  filters: PeopleListFilters,
  viewer: NonNullable<CurrentViewerAccess["viewer"]>,
): PeopleListData {
  const filteredPeople = previewPeople.filter((row) => row.active && matchesFilters(row, filters))
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
  const permissionValueByPersonId = new Map(
    previewPeople.map((person) => {
      const userAccount = userAccountsByPersonId.get(person.id) ?? null
      const roleAssignments = userAccount
        ? roleAssignmentsByUserAccountId.get(userAccount.id) ?? []
        : []

      return [
        person.id,
        buildEffectivePermissionValue(
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
        permissionValueByPersonId,
        canCreateOrUpdatePeople(viewer, row.office_id),
        canEditPersonPermission(viewer, row),
        canViewCompensation(viewer, {
          id: row.id,
          officeId: row.office_id,
        }),
        isCurrentViewerPerson(viewer, row.id),
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
        photoUrl: person.photo_url ?? null,
        title: person.title ?? null,
      })),
    viewerLabel: null,
  }
}

function listPreviewPeopleOfficeOptions(): PeopleOfficeOptionsData {
  return {
    accessMessage: null,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    configured: false,
    forbidden: false,
    offices: previewOffices.map((office) => ({ id: office.id, name: office.name })),
    viewerLabel: null,
  }
}

function listPreviewPeopleRailData(): PeopleRailData {
  return {
    accessMessage: null,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    configured: false,
    forbidden: false,
    people: previewPeople
      .filter((person) => person.active)
      .sort((left, right) => left.full_name.localeCompare(right.full_name))
      .map((person) => buildPersonRailItem(person)),
    viewerLabel: null,
  }
}

function getPreviewPersonDetail(
  personId: string,
  viewer: NonNullable<CurrentViewerAccess["viewer"]>,
): PersonDetailData {
  const person = previewPeople.find((candidate) => candidate.id === personId)

  if (!person || !person.active) {
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
  const projectsById = new Map(projectRows.map((project) => [project.id, project]))
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
  const effectivePermission = buildEffectivePermissionValue(
    previewUserAccount
      ? {
          active: previewUserAccount.active,
          email: previewUserAccount.email,
          id: previewUserAccount.id,
          person_id: previewUserAccount.person_id,
        }
      : null,
    previewRoleAssignmentsForPerson,
  )
  const personListItem = buildPersonDetailPerson(
    person,
    assignmentsByPersonId,
    officesById,
    peopleById,
    staffedProjectsByPersonId,
    hoursThisWeekByPersonId,
    permissionLabelByPersonId,
    effectivePermission,
    false,
    false,
    canViewCompensation(viewer, {
      id: person.id,
      officeId: person.office_id,
    }),
    false,
  )
  const canViewPersonCompensation = personListItem.canViewCompensation
  const hourlyCost = personListItem.hourlyCost ?? 0
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
    const laborCost = canViewPersonCompensation ? hours * hourlyCost : null
    const projectName = projectsById.get(entry.project_id)?.name ?? "Unknown project"
    const existing = byProject.get(entry.project_id)

    totalHours += hours
    if (laborCost !== null) {
      totalLaborCost += laborCost
    }

    if (latestTrackedWeekStart) {
      const entryDate = new Date(`${entry.date}T00:00:00Z`)
      if (entryDate >= latestTrackedWeekStart) {
        latestTrackedWeekHours += hours
      }
    }

    if (existing) {
      existing.hours += hours
      existing.laborCost =
        existing.laborCost !== null && laborCost !== null
          ? existing.laborCost + laborCost
          : null
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
    canEdit: false,
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
      totalLaborCost: canViewPersonCompensation ? totalLaborCost : null,
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
  const trace = createPerfTrace("listPeople", {
    hasOfficeFilter: Boolean(filters.officeId),
    hasQuery: Boolean(filters.query?.trim()),
  })
  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null
  const viewerAccessPromise = trace.measure("getCurrentViewerAccess", () =>
    getCurrentViewerAccess(context),
  )
  const baseQueriesPromise = client
    ? trace
        .measure("baseQueries", () =>
          Promise.all([
            client
              .from("people")
              .select(PERSON_PUBLIC_SELECT)
              .eq("active", true)
              .order("full_name"),
            fetchOfficeRows(undefined, { client }),
          ]),
        )
        .then(
          (value) => ({ error: null as null, value }),
          (error: unknown) => ({ error, value: null as null }),
        )
    : null
  const viewerAccess = await viewerAccessPromise
  const viewerLabel = getViewerLabel(viewerAccess.summary)

  if (!viewerAccess.viewer) {
    trace.finish({
      hasViewer: false,
      personCount: 0,
      result: "forbidden",
    })
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
    trace.finish({
      hasViewer: true,
      personCount: 0,
      result: "no-directory-access",
    })
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
    const previewData = listPreviewPeople(filters, viewerAccess.viewer)
    trace.finish({
      personCount: previewData.people.length,
      preview: true,
      result: "preview",
    })

    return {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }
  }

  const baseQueriesResult = baseQueriesPromise
    ? await baseQueriesPromise
    : { error: null as null, value: null as null }

  if (baseQueriesResult.error) {
    throw baseQueriesResult.error
  }

  if (!baseQueriesResult.value) {
    throw new Error("People list base queries returned no data.")
  }

  const [{ data: peopleData, error: peopleError }, offices] = baseQueriesResult.value

  if (peopleError) {
    throw peopleError
  }

  const peopleRows = ((peopleData ?? []) as Array<Omit<PersonRow, "annual_salary">>).map(
    (row) => ({
      ...row,
      annual_salary: null,
    }),
  )
  const filteredPeople = peopleRows.filter((row) =>
    matchesFilters(row, filters),
  )
  const canViewPeopleCompensation = canViewFinancialData(viewerAccess.viewer)
  const compensationByPersonId = canViewPeopleCompensation
    ? await trace.measure("fetchPeopleCompensation", () =>
        fetchPeopleCompensationById(
          filteredPeople.map((row) => row.id),
          { client },
        ),
      )
    : new Map<string, number>()
  const filteredPeopleWithCompensation = attachPeopleCompensation(
    filteredPeople,
    compensationByPersonId,
  )
  const peopleById = new Map(peopleRows.map((row) => [row.id, row]))
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
  let permissionValueByPersonId = new Map<string, CreatePersonPermission>()

  if (peopleIds.length > 0) {
    const { startDate: currentWeekStart, endDate: currentWeekEnd } = getCurrentWeekDateRange()
    const [
      { data: assignmentData, error: assignmentError },
      { data: timeEntryData, error: timeEntryError },
      { data: userAccountData, error: userAccountError },
    ] = await trace.measure("assignmentsTimeEntriesAndUserAccounts", () =>
      Promise.all([
        client
          .from("assignments")
          .select("person_id, project_id")
          .in("person_id", peopleIds)
          .eq("active", true),
        client
          .from("time_entries")
          .select("person_id, date, hours")
          .in("person_id", peopleIds)
          .gte("date", currentWeekStart)
          .lte("date", currentWeekEnd),
        client
          .from("user_accounts")
          .select("id, person_id, active")
          .in("person_id", peopleIds),
      ]),
    )

    if (assignmentError) {
      throw assignmentError
    }

    if (timeEntryError) {
      throw timeEntryError
    }

    if (userAccountError) {
      throw userAccountError
    }

    const assignmentRows = (assignmentData ?? []) as Array<{
      person_id: string
      project_id: string
    }>
    const timeEntryRows = (timeEntryData ?? []) as Array<{
      person_id: string
      date: string
      hours: number | string
    }>
    hoursThisWeekByPersonId = timeEntryRows.reduce((map, entry) => {
      map.set(entry.person_id, (map.get(entry.person_id) ?? 0) + Number(entry.hours))
      return map
    }, new Map<string, number>())
    const projectIds = [...new Set(assignmentRows.map((entry) => entry.project_id))]
    const userAccounts = (userAccountData ?? []) as UserAccountListRow[]
    const userAccountsByPersonId = new Map(
      userAccounts
        .filter((account) => account.person_id)
        .map((account) => [account.person_id as string, account]),
    )
    const userAccountIds = userAccounts.map((account) => account.id)

    const [
      { data: projectData, error: projectError },
      { data: roleAssignmentData, error: roleAssignmentError },
    ] = await trace.measure("projectsAndRoleAssignments", () =>
      Promise.all([
        projectIds.length > 0
          ? client
              .from("projects")
              .select("id, name, photo_url, active")
              .in("id", projectIds)
              .eq("active", true)
          : Promise.resolve({ data: [], error: null }),
        userAccountIds.length > 0
          ? client
              .from("role_assignments")
              .select("user_account_id, role, active")
              .in("user_account_id", userAccountIds)
          : Promise.resolve({ data: [], error: null }),
      ]),
    )

    if (projectError) {
      throw projectError
    }

    if (roleAssignmentError) {
      throw roleAssignmentError
    }

    const projectsById = new Map(
      (
        (projectData ?? []) as Array<{
          active: boolean
          id: string
          name: string
          photo_url: string | null
        }>
      ).map((project) => [project.id, project]),
    )

    staffedProjectsByPersonId = assignmentRows.reduce(
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

    const roleAssignmentsByUserAccountId = ((roleAssignmentData ?? []) as RoleAssignmentListRow[]).reduce(
      (map, assignment) => {
        const current = map.get(assignment.user_account_id) ?? []
        current.push(assignment)
        map.set(assignment.user_account_id, current)
        return map
      },
      new Map<string, RoleAssignmentListRow[]>(),
    )

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
    permissionValueByPersonId = new Map(
      filteredPeople.map((person) => {
        const userAccount = userAccountsByPersonId.get(person.id) ?? null
        const roleAssignments = userAccount
          ? roleAssignmentsByUserAccountId.get(userAccount.id) ?? []
          : []

        return [
          person.id,
          buildEffectivePermissionValue(userAccount, roleAssignments),
        ] as const
      }),
    )
  }

  trace.finish({
    filteredPeopleCount: filteredPeople.length,
    officeCount: offices.length,
    peopleIdsCount: peopleIds.length,
    personCount: filteredPeople.length,
    result: "live",
  })

  return {
    accessMessage: viewerAccess.accessMessage,
    configMessage: status.message,
    configured: status.configured,
    filters,
    forbidden: false,
    offices: offices.map((office) => ({ id: office.id, name: office.name })),
    people: filteredPeopleWithCompensation.map((row) =>
      buildPersonListItem(
        row,
        officesById,
        peopleById,
        staffedProjectsByPersonId,
        hoursThisWeekByPersonId,
        permissionLabelByPersonId,
        permissionValueByPersonId,
        canCreateOrUpdatePeople(viewerAccess.viewer!, row.office_id),
        canEditPersonPermission(viewerAccess.viewer!, row),
        canViewCompensation(viewerAccess.viewer!, {
          id: row.id,
          officeId: row.office_id,
        }),
        isCurrentViewerPerson(viewerAccess.viewer!, row.id),
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

  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null
  const viewerAccessPromise = getCurrentViewerAccess(context)
  const peopleOptionsPromise = client
    ? (async () =>
        await client
          .from("people")
          .select("id, full_name, title, photo_url")
          .eq("active", true)
          .order("full_name"))()
        .then(
          (value) => ({ error: null as null, value }),
          (error: unknown) => ({ error, value: null as null }),
        )
    : null
  const viewerAccess = await viewerAccessPromise
  const viewerLabel = getViewerLabel(viewerAccess.summary)

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

  const peopleOptionsResult = peopleOptionsPromise
    ? await peopleOptionsPromise
    : { error: null as null, value: null as null }

  if (peopleOptionsResult.error) {
    throw peopleOptionsResult.error
  }

  if (!peopleOptionsResult.value) {
    throw new Error("People options query returned no data.")
  }

  const { data, error } = peopleOptionsResult.value

  if (error) {
    throw error
  }

  const result = {
    accessMessage: viewerAccess.accessMessage,
    configMessage: status.message,
    configured: status.configured,
    forbidden: false,
    people: (
      (data ?? []) as Array<{
        id: string
        full_name: string
        photo_url: string | null
        title: string | null
      }>
    ).map((person) => ({
      fullName: person.full_name,
      id: person.id,
      photoUrl: person.photo_url ?? null,
      title: person.title ?? null,
    })),
    viewerLabel,
  }

  return cacheKey ? setCachedValue(peopleOptionsCache, cacheKey, result) : result
}

export async function listPeopleOfficeOptions(
  context: ViewerRequestContext = {},
): Promise<PeopleOfficeOptionsData> {
  const cacheKey = getPeopleReadCacheKey(context)
  const cachedValue = cacheKey
    ? getCachedValue(peopleOfficeOptionsCache, cacheKey)
    : null

  if (cachedValue) {
    return cachedValue
  }

  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null
  const viewerAccessPromise = getCurrentViewerAccess(context)
  const officesPromise = client
    ? fetchOfficeRows(undefined, { client }).then(
        (value) => ({ error: null as null, value }),
        (error: unknown) => ({ error, value: null as null }),
      )
    : null
  const viewerAccess = await viewerAccessPromise
  const viewerLabel = getViewerLabel(viewerAccess.summary)

  if (!viewerAccess.viewer) {
    return emptyPeopleOfficeOptionsData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    )
  }

  if (!canViewPeopleDirectory(viewerAccess.viewer)) {
    return emptyPeopleOfficeOptionsData(
      status.configured,
      status.message,
      viewerAccess.accessMessage ?? "Current viewer cannot access the people directory.",
      viewerLabel,
      true,
    )
  }

  if (!client) {
    const previewData = listPreviewPeopleOfficeOptions()
    const previewResult = {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }

    return cacheKey
      ? setCachedValue(peopleOfficeOptionsCache, cacheKey, previewResult)
      : previewResult
  }

  const officesResult = officesPromise
    ? await officesPromise
    : { error: null as null, value: null as null }

  if (officesResult.error) {
    throw officesResult.error
  }

  if (!officesResult.value) {
    throw new Error("People office options query returned no data.")
  }

  const offices = officesResult.value
  const result = {
    accessMessage: viewerAccess.accessMessage,
    configMessage: status.message,
    configured: status.configured,
    forbidden: false,
    offices: offices.map((office) => ({ id: office.id, name: office.name })),
    viewerLabel,
  }

  return cacheKey
    ? setCachedValue(peopleOfficeOptionsCache, cacheKey, result)
    : result
}

export async function listPeopleRailData(
  context: ViewerRequestContext = {},
): Promise<PeopleRailData> {
  const cacheKey = getPeopleReadCacheKey(context)
  const cachedValue = cacheKey ? getCachedValue(peopleRailCache, cacheKey) : null

  if (cachedValue) {
    return cachedValue
  }

  const trace = createPerfTrace("listPeopleRailData")
  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null
  const viewerAccessPromise = trace.measure("getCurrentViewerAccess", () =>
    getCurrentViewerAccess(context),
  )
  const activePeoplePromise = client
    ? trace
        .measure("fetchActivePeople", async () =>
          await client
            .from("people")
            .select("id, full_name, photo_url, title")
            .eq("active", true)
            .order("full_name"),
        )
        .then(
          (value) => ({ error: null as null, value }),
          (error: unknown) => ({ error, value: null as null }),
        )
    : null
  const viewerAccess = await viewerAccessPromise
  const viewerLabel = getViewerLabel(viewerAccess.summary)

  if (!viewerAccess.viewer) {
    trace.finish({
      hasViewer: false,
      personCount: 0,
      result: "forbidden",
    })
    return emptyPeopleRailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    )
  }

  if (!canViewPeopleDirectory(viewerAccess.viewer)) {
    trace.finish({
      hasViewer: true,
      personCount: 0,
      result: "no-directory-access",
    })
    return emptyPeopleRailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage ?? "Current viewer cannot access the people directory.",
      viewerLabel,
      true,
    )
  }

  if (!client) {
    const previewData = listPreviewPeopleRailData()
    const previewResult = {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }

    trace.finish({
      personCount: previewResult.people.length,
      preview: true,
      result: "preview",
    })

    return cacheKey ? setCachedValue(peopleRailCache, cacheKey, previewResult) : previewResult
  }

  const activePeopleResult = activePeoplePromise
    ? await activePeoplePromise
    : { error: null as null, value: null as null }

  if (activePeopleResult.error) {
    throw activePeopleResult.error
  }

  if (!activePeopleResult.value) {
    throw new Error("People rail query returned no data.")
  }

  const { data, error } = activePeopleResult.value

  if (error) {
    throw error
  }

  const result = {
    accessMessage: viewerAccess.accessMessage,
    configMessage: status.message,
    configured: status.configured,
    forbidden: false,
    people: (
      (data ?? []) as Array<{
        full_name: string
        id: string
        photo_url: string | null
        title: string | null
      }>
    ).map((person) => buildPersonRailItem(person)),
    viewerLabel,
  }

  trace.finish({
    personCount: result.people.length,
    result: "live",
  })

  return cacheKey ? setCachedValue(peopleRailCache, cacheKey, result) : result
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

  if (isElevatedPermission(input.permission) && !hasPartnerPrivileges(viewerAccess.viewer)) {
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

  const rawServiceClient =
    input.permission === "noAccount" ? null : createServerSupabaseClient({ useServiceRole: true })
  const recoveryClient =
    input.permission === "noAccount" ? null : createServerSupabaseClient()
  const serviceClient = (await isServiceRoleClientUsable(rawServiceClient))
    ? rawServiceClient
    : null

  if (input.permission !== "noAccount" && !serviceClient && !recoveryClient) {
    throw new Error(
      "Account-backed people creation requires a working Supabase auth configuration.",
    )
  }

  if (serviceClient && email) {
    const { data: existingAccount, error: existingAccountError } = await serviceClient
      .from("user_accounts")
      .select("id")
      .ilike("email", email)
      .maybeSingle()

    if (existingAccountError) {
      throw toError(existingAccountError)
    }

    if (existingAccount) {
      throw new Error("A user account with that email already exists.")
    }
  }
  let createdPersonId: string | null = null
  let createdAuthUserId: string | null = null
  const inviteRedirectTo = context.appOrigin ? `${context.appOrigin}/join` : null

  try {
    if (serviceClient && email) {
      createdAuthUserId = await inviteAuthUserByEmail(
        email,
        fullName,
        inviteRedirectTo,
        serviceClient,
      )
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
      .select(PERSON_PUBLIC_SELECT)
      .single()

    if (personError) {
      throw toError(personError)
    }

    const createdPerson = {
      ...(personData as Omit<PersonRow, "annual_salary">),
      annual_salary: annualSalary,
    }
    createdPersonId = createdPerson.id

    if (input.permission === "noAccount" || !email) {
      return toPerson(createdPerson)
    }

    const accountClient = serviceClient ?? client
    const { data: userAccountData, error: userAccountError } = await accountClient
      .from("user_accounts")
      .insert({
        active: true,
        email,
        person_id: createdPerson.id,
      })
      .select("id")
      .single()

    if (userAccountError) {
      throw toError(userAccountError)
    }

    if (input.permission === "admin" || input.permission === "partner") {
      const { error: roleAssignmentError } = await accountClient
        .from("role_assignments")
        .insert({
          active: true,
          assigned_by_user_account_id: viewerAccess.viewer.userAccountId,
          office_id: null,
          role: input.permission,
          user_account_id: (userAccountData as { id: string }).id,
        })

      if (roleAssignmentError) {
        throw toError(roleAssignmentError)
      }
    }

    if (!serviceClient && recoveryClient) {
      const authUserState = await ensureAuthUserByEmail(
        email,
        fullName,
        inviteRedirectTo,
        recoveryClient,
      )

      try {
        await sendPasswordRecoveryEmail(email, inviteRedirectTo, recoveryClient)
      } catch (error) {
        if (authUserState === "existing") {
          throw error
        }
      }
    }

    if (email) {
      invalidateViewerAccessCache(email)
    }
    return toPerson(createdPerson)
  } catch (error) {
    if (serviceClient && createdPersonId) {
      await serviceClient.from("user_accounts").delete().eq("person_id", createdPersonId)
      await serviceClient.from("people").delete().eq("id", createdPersonId)
    }

    if (serviceClient && createdAuthUserId) {
      await serviceClient.auth.admin.deleteUser(createdAuthUserId)
    }

    throw toError(error, "Unable to create person.")
  }
}

export async function updatePerson(
  input: UpdatePersonInput,
  context: ViewerRequestContext = {},
): Promise<Person> {
  const status = getDatabaseStatus()

  if (!status.configured) {
    throw new Error("People updates require a configured database connection.")
  }

  const viewerAccess = await getCurrentViewerAccess(context)

  if (!viewerAccess.viewer) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to continue.")
  }

  const personId = normalizeRequiredText(input.personId, "Person")
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

  if (input.permission !== "noAccount" && !email) {
    throw new Error("Email is required when creating an account.")
  }

  const client = createServerSupabaseClient({ accessToken: context.accessToken })

  if (!client) {
    throw new Error("People updates require a configured database connection.")
  }

  const { data: existingPersonData, error: existingPersonError } = await client
    .from("people")
    .select(PERSON_PUBLIC_SELECT)
    .eq("id", personId)
    .maybeSingle()

  if (existingPersonError) {
    throw existingPersonError
  }

  if (!existingPersonData) {
    throw new Error("Selected person is unavailable.")
  }

  const existingPerson = existingPersonData as PersonRow

  if (
    !canCreateOrUpdatePeople(viewerAccess.viewer, existingPerson.office_id) ||
    !canCreateOrUpdatePeople(viewerAccess.viewer, officeId)
  ) {
    throw new Error("You do not have permission to update this person.")
  }

  if (
    viewerAccess.viewer.personId === personId &&
    canViewPeopleDirectory(viewerAccess.viewer) &&
    input.permission !== "admin" &&
    input.permission !== "partner"
  ) {
    throw new Error(
      "Ask another partner or admin to change your own permission.",
    )
  }

  const [offices, supervisors, userAccountResponse] = await Promise.all([
    fetchOfficeRows([officeId], { client }),
    supervisorPersonId
      ? fetchPeopleRows([supervisorPersonId], { client })
      : Promise.resolve([]),
    client
      .from("user_accounts")
      .select("id, person_id, email, active")
      .eq("person_id", personId)
      .maybeSingle(),
  ])

  if (userAccountResponse.error) {
    throw userAccountResponse.error
  }

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

  const currentUserAccount = (userAccountResponse.data ?? null) as UserAccountListRow | null
  const currentRoleAssignmentsResponse = currentUserAccount
    ? await client
        .from("role_assignments")
        .select("user_account_id, role, active")
        .eq("user_account_id", currentUserAccount.id)
    : null

  if (currentRoleAssignmentsResponse?.error) {
    throw currentRoleAssignmentsResponse.error
  }

  const currentRoleAssignments = currentUserAccount
    ? ((currentRoleAssignmentsResponse?.data ?? []) as RoleAssignmentListRow[])
    : []
  const currentPermission = buildEffectivePermissionValue(
    currentUserAccount,
    currentRoleAssignments,
  )
  const isPermissionChange = input.permission !== currentPermission

  if (
    isPermissionChange &&
    (isElevatedPermission(currentPermission) || isElevatedPermission(input.permission)) &&
    !hasPartnerPrivileges(viewerAccess.viewer)
  ) {
    throw new Error("Only partners can change elevated permissions.")
  }
  const requiresServiceRole = Boolean(currentUserAccount) || input.permission !== "noAccount"
  const serviceClient = requiresServiceRole
    ? createServerSupabaseClient({ useServiceRole: true })
    : null

  if (requiresServiceRole && !serviceClient) {
    throw new Error("Account-backed people updates require SUPABASE_SERVICE_ROLE_KEY.")
  }

  if (serviceClient && email) {
    const { data: duplicateAccount, error: duplicateAccountError } = await serviceClient
      .from("user_accounts")
      .select("id")
      .ilike("email", email)
      .maybeSingle()

    if (duplicateAccountError) {
      throw duplicateAccountError
    }

    if (duplicateAccount && (duplicateAccount as { id: string }).id !== currentUserAccount?.id) {
      throw new Error("A user account with that email already exists.")
    }
  }

  const { data: updatedPersonData, error: updatedPersonError } = await client
    .from("people")
    .update({
      annual_salary: annualSalary,
      email,
      full_name: fullName,
      office_id: officeId,
      photo_url: photoUrl,
      supervisor_person_id: supervisorPersonId,
      title,
    })
    .eq("id", personId)
    .select(PERSON_PUBLIC_SELECT)
    .single()

  if (updatedPersonError) {
    throw updatedPersonError
  }

  if (serviceClient) {
    const authUser = currentUserAccount?.email
      ? await findAuthUserByEmail(currentUserAccount.email.trim().toLowerCase(), serviceClient)
      : null

    if (input.permission === "noAccount") {
      if (currentUserAccount) {
        const { error: deleteRolesError } = await serviceClient
          .from("role_assignments")
          .delete()
          .eq("user_account_id", currentUserAccount.id)

        if (deleteRolesError) {
          throw deleteRolesError
        }

        const { error: deleteAccountError } = await serviceClient
          .from("user_accounts")
          .delete()
          .eq("id", currentUserAccount.id)

        if (deleteAccountError) {
          throw deleteAccountError
        }

        if (authUser) {
          const { error: deleteAuthUserError } = await serviceClient.auth.admin.deleteUser(authUser.id)

          if (deleteAuthUserError) {
            throw new Error(deleteAuthUserError.message)
          }
        }
      }
    } else if (email) {
      let authUserId = authUser?.id ?? null

      if (authUser) {
        const metadataName =
          typeof authUser.userMetadata?.fullName === "string"
            ? authUser.userMetadata.fullName
            : null
        const shouldUpdateAuth =
          currentUserAccount?.email?.trim().toLowerCase() !== email || metadataName !== fullName

        if (shouldUpdateAuth) {
          const { error: updateAuthUserError } = await serviceClient.auth.admin.updateUserById(
            authUser.id,
            {
              email,
              email_confirm: true,
              user_metadata: {
                fullName,
              },
            },
          )

          if (updateAuthUserError) {
            throw new Error(updateAuthUserError.message)
          }
        }
      } else {
        authUserId = await inviteAuthUserByEmail(
          email,
          fullName,
          context.appOrigin ? `${context.appOrigin}/join` : null,
          serviceClient,
        )
      }

      let userAccountId = currentUserAccount?.id ?? null

      if (currentUserAccount) {
        const { error: updateUserAccountError } = await serviceClient
          .from("user_accounts")
          .update({
            active: true,
            email,
            person_id: personId,
          })
          .eq("id", currentUserAccount.id)

        if (updateUserAccountError) {
          throw updateUserAccountError
        }
      } else {
        const { data: userAccountData, error: insertUserAccountError } = await serviceClient
          .from("user_accounts")
          .insert({
            active: true,
            email,
            person_id: personId,
          })
          .select("id")
          .single()

        if (insertUserAccountError) {
          if (authUserId) {
            await serviceClient.auth.admin.deleteUser(authUserId)
          }

          throw insertUserAccountError
        }

        userAccountId = (userAccountData as { id: string }).id
      }

      if (userAccountId) {
        const { error: deleteRolesError } = await serviceClient
          .from("role_assignments")
          .delete()
          .eq("user_account_id", userAccountId)

        if (deleteRolesError) {
          throw deleteRolesError
        }

        if (input.permission === "admin" || input.permission === "partner") {
          const { error: insertRoleAssignmentError } = await serviceClient
            .from("role_assignments")
            .insert({
              active: true,
              assigned_by_user_account_id: viewerAccess.viewer.userAccountId,
              office_id: null,
              role: input.permission,
              user_account_id: userAccountId,
            })

          if (insertRoleAssignmentError) {
            throw insertRoleAssignmentError
          }
        }
      }
    }
  }

  if (currentUserAccount?.email) {
    invalidateViewerAccessCache(currentUserAccount.email)
  }

  if (email) {
    invalidateViewerAccessCache(email)
  }
  return toPerson({
    ...(updatedPersonData as Omit<PersonRow, "annual_salary">),
    annual_salary: annualSalary,
  })
}

export async function removePerson(
  input: RemovePersonInput,
  context: ViewerRequestContext = {},
): Promise<Person> {
  const status = getDatabaseStatus()

  if (!status.configured) {
    throw new Error("Person removal requires a configured database connection.")
  }

  const viewerAccess = await getCurrentViewerAccess(context)

  if (!viewerAccess.viewer) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to continue.")
  }

  const personId = normalizeRequiredText(input.personId, "Person")
  const client = createServerSupabaseClient({ accessToken: context.accessToken })

  if (!client) {
    throw new Error("Person removal requires a configured database connection.")
  }

  const [{ data: personData, error: personError }, { data: userAccountData, error: userAccountError }] =
    await Promise.all([
      client
        .from("people")
        .select(PERSON_PUBLIC_SELECT)
        .eq("id", personId)
        .maybeSingle(),
      client
        .from("user_accounts")
        .select("id, person_id, email, active")
        .eq("person_id", personId)
        .maybeSingle(),
    ])

  if (personError) {
    throw personError
  }

  if (userAccountError) {
    throw userAccountError
  }

  if (!personData) {
    throw new Error("Selected person is unavailable.")
  }

  const existingPerson = personData as PersonRow

  if (!existingPerson.active) {
    throw new Error("Selected person has already been removed.")
  }

  if (!canCreateOrUpdatePeople(viewerAccess.viewer, existingPerson.office_id)) {
    throw new Error("You do not have permission to remove this person.")
  }

  if (viewerAccess.viewer.personId === personId) {
    throw new Error("Ask another partner or admin to remove your own person record.")
  }

  const currentUserAccount = (userAccountData ?? null) as UserAccountListRow | null
  const currentRoleAssignmentsResponse = currentUserAccount
    ? await client
        .from("role_assignments")
        .select("user_account_id, role, active")
        .eq("user_account_id", currentUserAccount.id)
    : null

  if (currentRoleAssignmentsResponse?.error) {
    throw currentRoleAssignmentsResponse.error
  }

  const currentRoleAssignments = currentUserAccount
    ? ((currentRoleAssignmentsResponse?.data ?? []) as RoleAssignmentListRow[])
    : []
  const currentPermission = buildEffectivePermissionValue(
    currentUserAccount,
    currentRoleAssignments,
  )

  if (isElevatedPermission(currentPermission) && !hasPartnerPrivileges(viewerAccess.viewer)) {
    throw new Error("Only partners can remove people with elevated permissions.")
  }

  const targetEmail =
    normalizeStoredEmail(currentUserAccount?.email) ?? normalizeStoredEmail(existingPerson.email)

  if (
    targetEmail === EXACT_SUPER_USER_EMAIL &&
    !hasExactSuperUserOverride(viewerAccess.viewer)
  ) {
    throw new Error("Only the bootstrap super user can remove that bootstrap account.")
  }

  const rawServiceClient = createServerSupabaseClient({ useServiceRole: true })
  const serviceClient = (await isServiceRoleClientUsable(rawServiceClient))
    ? rawServiceClient
    : null

  if (!serviceClient) {
    throw new Error("Person removal requires SUPABASE_SERVICE_ROLE_KEY.")
  }

  const authUser = currentUserAccount?.email
    ? await findAuthUserByEmail(currentUserAccount.email.trim().toLowerCase(), serviceClient)
    : null

  if (currentUserAccount) {
    const { error: deactivateRoleAssignmentsError } = await serviceClient
      .from("role_assignments")
      .update({ active: false })
      .eq("user_account_id", currentUserAccount.id)

    if (deactivateRoleAssignmentsError) {
      throw deactivateRoleAssignmentsError
    }

    const { error: deactivateClientAccessError } = await serviceClient
      .from("client_project_access")
      .update({ active: false })
      .eq("user_account_id", currentUserAccount.id)

    if (deactivateClientAccessError) {
      throw deactivateClientAccessError
    }

    const { error: deactivateAccountError } = await serviceClient
      .from("user_accounts")
      .update({ active: false })
      .eq("id", currentUserAccount.id)

    if (deactivateAccountError) {
      throw deactivateAccountError
    }
  }

  const [
    deactivateAssignmentsResponse,
    clearProjectLeadsResponse,
    clearOfficePartnersResponse,
    clearSupervisorsResponse,
    clearChecklistAssignmentsResponse,
  ] = await Promise.all([
    serviceClient
      .from("assignments")
      .update({ active: false })
      .eq("person_id", personId)
      .eq("active", true),
    serviceClient
      .from("projects")
      .update({ lead_person_id: null })
      .eq("lead_person_id", personId),
    serviceClient
      .from("offices")
      .update({ partner_person_id: null })
      .eq("partner_person_id", personId),
    serviceClient
      .from("people")
      .update({ supervisor_person_id: null })
      .eq("supervisor_person_id", personId),
    serviceClient
      .from("checklist_items")
      .update({ assigned_person_id: null })
      .eq("assigned_person_id", personId),
  ])

  const cleanupError =
    deactivateAssignmentsResponse.error ??
    clearProjectLeadsResponse.error ??
    clearOfficePartnersResponse.error ??
    clearSupervisorsResponse.error ??
    clearChecklistAssignmentsResponse.error

  if (cleanupError) {
    throw cleanupError
  }

  const { data: updatedPersonData, error: updatePersonError } = await serviceClient
    .from("people")
    .update({
      active: false,
    })
    .eq("id", personId)
    .select(PERSON_PUBLIC_SELECT)
    .single()

  if (updatePersonError) {
    throw updatePersonError
  }

  if (authUser) {
    const { error: deleteAuthUserError } = await serviceClient.auth.admin.deleteUser(authUser.id)

    if (deleteAuthUserError) {
      throw new Error(deleteAuthUserError.message)
    }
  }

  invalidatePeopleReadCaches()

  if (existingPerson.email) {
    invalidateViewerAccessCache(existingPerson.email)
  }

  if (currentUserAccount?.email) {
    invalidateViewerAccessCache(currentUserAccount.email)
  }

  return toPerson({
    ...(updatedPersonData as Omit<PersonRow, "annual_salary">),
    annual_salary: null,
  })
}

export async function resendPersonAccountEmail(
  input: ResendPersonAccountEmailInput,
  context: ViewerRequestContext = {},
): Promise<ResendPersonAccountEmailResult> {
  const status = getDatabaseStatus()

  if (!status.configured) {
    throw new Error("Resending account emails requires a configured database connection.")
  }

  const viewerAccess = await getCurrentViewerAccess(context)

  if (!viewerAccess.viewer) {
    throw new Error(viewerAccess.accessMessage ?? "Sign in to continue.")
  }

  const personId = normalizeRequiredText(input.personId, "Person")
  const client = createServerSupabaseClient({ accessToken: context.accessToken })
  const rawServiceClient = createServerSupabaseClient({ useServiceRole: true })
  const recoveryClient = createServerSupabaseClient()

  if (!client || !recoveryClient) {
    throw new Error("Resending account emails requires live Supabase auth to be configured.")
  }

  const serviceClient = (await isServiceRoleClientUsable(rawServiceClient))
    ? rawServiceClient
    : null

  const [{ data: personData, error: personError }, { data: userAccountData, error: userAccountError }] =
    await Promise.all([
      client
        .from("people")
        .select(PERSON_PUBLIC_SELECT)
        .eq("id", personId)
        .maybeSingle(),
      client
        .from("user_accounts")
        .select("id, person_id, email, active")
        .eq("person_id", personId)
        .maybeSingle(),
    ])

  if (personError) {
    throw toError(personError)
  }

  if (userAccountError) {
    throw toError(userAccountError)
  }

  if (!personData) {
    throw new Error("Selected person is unavailable.")
  }

  const person = personData as PersonRow

  if (!canCreateOrUpdatePeople(viewerAccess.viewer, person.office_id)) {
    throw new Error("You do not have permission to update this person.")
  }

  const userAccount = (userAccountData ?? null) as UserAccountListRow | null

  if (!userAccount || !userAccount.active) {
    throw new Error("This person does not currently have an account-backed login.")
  }

  const email = normalizeEmail(userAccount.email)

  if (!email) {
    throw new Error("This account does not have a valid email address.")
  }

  const redirectTo = context.appOrigin ? `${context.appOrigin}/join` : null

  if (!serviceClient) {
    await sendPasswordRecoveryEmail(email, redirectTo, recoveryClient)

    return {
      delivery: "passwordReset",
      email,
    }
  }

  const authUser = await findAuthUserByEmail(email, serviceClient)

  if (authUser) {
    const metadataName =
      typeof authUser.userMetadata?.fullName === "string"
        ? authUser.userMetadata.fullName
        : null

    if (metadataName !== person.full_name) {
      const { error: updateAuthUserError } = await serviceClient.auth.admin.updateUserById(
        authUser.id,
        {
          user_metadata: {
            fullName: person.full_name,
          },
        },
      )

      if (updateAuthUserError) {
        throw new Error(updateAuthUserError.message)
      }
    }

    await sendPasswordRecoveryEmail(email, redirectTo, recoveryClient)

    return {
      delivery: "passwordReset",
      email,
    }
  }

  await inviteAuthUserByEmail(email, person.full_name, redirectTo, serviceClient)

  return {
    delivery: "invite",
    email,
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
    .select(PERSON_PUBLIC_SELECT)
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
    .select(PERSON_PUBLIC_SELECT)
    .single()

  if (error) {
    throw error
  }

  const compensationByPersonId = await fetchPeopleCompensationById([personId], { client })

  return toPerson(
    attachPeopleCompensation(
      [
        {
          ...(data as Omit<PersonRow, "annual_salary">),
          annual_salary: null,
        },
      ],
      compensationByPersonId,
    )[0],
  )
}

export async function getPersonDetail(
  personId: string,
  context: ViewerRequestContext = {},
): Promise<PersonDetailData> {
  const trace = createPerfTrace("getPersonDetail")
  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null
  const viewerAccessPromise = trace.measure("getCurrentViewerAccess", () =>
    getCurrentViewerAccess(context),
  )
  const detailContextPromise = client
    ? trace
        .measure("rpc.get_person_detail_context", async () =>
          await client.rpc("get_person_detail_context", {
            target_person_id: personId,
          }),
        )
        .then(
          (value) => ({ error: null as null, value }),
          (error: unknown) => ({ error, value: null as null }),
        )
    : null
  const viewerAccess = await viewerAccessPromise
  const viewerLabel = getViewerLabel(viewerAccess.summary)

  if (!viewerAccess.viewer) {
    trace.finish({
      hasViewer: false,
      personId,
      result: "forbidden",
    })
    return emptyPersonDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      true,
    )
  }

  if (!client) {
    const previewData = getPreviewPersonDetail(personId, viewerAccess.viewer)

    if (
      previewData.person &&
      !canViewPerson(viewerAccess.viewer, {
        id: previewData.person.id,
        officeId: previewData.person.officeId,
      })
    ) {
      trace.finish({
        hasViewer: true,
        personId,
        result: "preview-forbidden",
      })
      return emptyPersonDetailData(
        false,
        PREVIEW_CONFIG_MESSAGE,
        viewerAccess.accessMessage ?? "Current viewer cannot access this person.",
        viewerLabel,
        true,
      )
    }

    trace.finish({
      hasViewer: true,
      personId,
      preview: true,
      result: "preview",
    })
    return {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }
  }

  const detailContextResult = detailContextPromise
    ? await detailContextPromise
    : { error: null as null, value: null as null }

  if (detailContextResult.error) {
    throw detailContextResult.error
  }

  if (!detailContextResult.value) {
    throw new Error("Person detail query returned no data.")
  }

  const { data: detailContextData, error: detailContextError } = detailContextResult.value

  if (detailContextError) {
    throw detailContextError
  }

  const detailContext = (detailContextData ?? null) as PersonDetailContextResponse | null

  if (!detailContext?.found || !detailContext.person) {
    trace.finish({
      hasViewer: true,
      personId,
      result: "missing-person",
    })
    return emptyPersonDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      false,
    )
  }

  const person = detailContext.person

  if (!person.active) {
    trace.finish({
      hasViewer: true,
      personId,
      result: "removed-person",
    })
    return emptyPersonDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage,
      viewerLabel,
      false,
    )
  }

  if (
    !canViewPerson(viewerAccess.viewer, {
      id: person.id,
      officeId: person.office_id,
    })
  ) {
    trace.finish({
      hasViewer: true,
      officeId: person.office_id,
      personId,
      result: "no-person-access",
    })
    return emptyPersonDetailData(
      status.configured,
      status.message,
      viewerAccess.accessMessage ?? "Current viewer cannot access this person.",
      viewerLabel,
      true,
    )
  }

  const canViewPersonCompensation = canViewCompensation(viewerAccess.viewer, {
    id: person.id,
    officeId: person.office_id,
  })
  const compensationByPersonId = canViewPersonCompensation
    ? await trace.measure("fetchPersonCompensation", () =>
        fetchPeopleCompensationById([person.id], { client }),
      )
    : new Map<string, number>()
  const personWithCompensation =
    attachPeopleCompensation([person], compensationByPersonId)[0] ?? person
  const supervisorWithCompensation = detailContext.supervisor
    ? attachPeopleCompensation([detailContext.supervisor], compensationByPersonId)[0]
    : null
  const assignmentRows = detailContext.assignments ?? []
  const timeEntryRows = detailContext.timeEntries ?? []
  const checklistRows = detailContext.checklistItems ?? []
  const projectRows = detailContext.projects ?? []
  const userAccount = detailContext.userAccount ?? null
  const managingOffices = detailContext.managingOffices ?? []
  const officesById = new Map(
    [detailContext.office, ...managingOffices]
      .filter((office): office is OfficeRow => Boolean(office))
      .map((office) => [office.id, office]),
  )
  const peopleById = new Map(
    [personWithCompensation, supervisorWithCompensation]
      .filter((row): row is PersonRow => Boolean(row))
      .map((row) => [row.id, row]),
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
  const { startDate: currentWeekStart, endDate: currentWeekEnd } = getCurrentWeekDateRange()
  const hoursThisWeekByPersonId = timeEntryRows.reduce((map, entry) => {
    if (entry.date < currentWeekStart || entry.date > currentWeekEnd) {
      return map
    }

    map.set(entry.person_id, (map.get(entry.person_id) ?? 0) + Number(entry.hours))
    return map
  }, new Map<string, number>())
  const staffedProjectsByPersonId = assignmentRows.reduce(
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
  const roleAssignmentsForPerson = detailContext.roleAssignments ?? []

  const permissionLabelByPersonId = new Map<string, string | null>([
    [personId, buildEffectivePermissionLabel(userAccount, roleAssignmentsForPerson)],
  ])
  const effectivePermission = buildEffectivePermissionValue(
    userAccount,
    roleAssignmentsForPerson,
  )

  const personListItem = buildPersonDetailPerson(
    personWithCompensation,
    assignmentsByPersonId,
    officesById,
    peopleById,
    staffedProjectsByPersonId,
    hoursThisWeekByPersonId,
    permissionLabelByPersonId,
    effectivePermission,
    canCreateOrUpdatePeople(viewerAccess.viewer, person.office_id),
    canEditPersonPermission(viewerAccess.viewer, person),
    canViewPersonCompensation,
    isCurrentViewerPerson(viewerAccess.viewer, person.id),
  )
  const hourlyCost = personListItem.hourlyCost ?? 0

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
    const laborCost = canViewPersonCompensation ? hours * hourlyCost : null
    const projectName = projectsById.get(entry.project_id)?.name ?? "Unknown project"
    const existing = byProject.get(entry.project_id)

    totalHours += hours
    if (laborCost !== null) {
      totalLaborCost += laborCost
    }

    if (latestTrackedWeekStart) {
      const entryDate = new Date(`${entry.date}T00:00:00Z`)
      if (entryDate >= latestTrackedWeekStart) {
        latestTrackedWeekHours += hours
      }
    }

    if (existing) {
      existing.hours += hours
      existing.laborCost =
        existing.laborCost !== null && laborCost !== null
          ? existing.laborCost + laborCost
          : null
    } else {
      byProject.set(entry.project_id, {
        hours,
        laborCost,
        projectId: entry.project_id,
        projectName,
      })
    }
  }

  trace.finish({
    assignmentCount: assignmentRows.length,
    checklistCount: checklistItems.length,
    personId,
    projectCount: projectRows.length,
    recentEntryCount: recentEntries.length,
    result: "live",
    timeEntryCount: timeEntryRows.length,
  })

  return {
    accessMessage: viewerAccess.accessMessage,
    assignments,
    canEdit: canCreateOrUpdatePeople(viewerAccess.viewer, person.office_id),
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
      totalLaborCost: canViewPersonCompensation ? totalLaborCost : null,
      byProject: Array.from(byProject.values()).sort((left, right) =>
        right.hours - left.hours || left.projectName.localeCompare(right.projectName),
      ),
    },
    viewerLabel,
  }
}
