import type {
  AuthorizationViewer,
  ClientProjectAccess,
  EffectiveUserTier,
  RoleAssignment,
  UserAccount,
} from "@mandala/domain"
import {
  canViewSharedLibrary,
  getViewerBaseTier,
  isAuthorizationRole,
} from "@mandala/domain"
import { cache } from "react"

import type { OfficeRow, PersonRow } from "./lookups"
import {
  previewAssignments,
  previewClientProjectAccess,
  previewOffices,
  previewPeople,
  previewRoleAssignments,
  previewUserAccounts,
} from "./previewData"
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer"

const DEFAULT_PREVIEW_VIEWER_EMAIL = "anjali.menon@kolam.local"
const PREVIEW_VIEWER_MESSAGE =
  "Set KOLAM_VIEWER_EMAIL or KOLAM_VIEWER_USER_ACCOUNT_ID to evaluate permissions in preview mode."
const SIGN_IN_REQUIRED_MESSAGE = "Sign in to continue."
const LIVE_VIEWER_CACHE_TTL_MS = 15_000

interface UserAccountRow {
  id: string
  person_id: string | null
  email: string
  active: boolean
}

interface RoleAssignmentRow {
  id: string
  user_account_id: string
  role: string
  office_id: string | null
  assigned_by_user_account_id: string
  active: boolean
}

interface ClientProjectAccessRow {
  id: string
  user_account_id: string
  project_id: string
  active: boolean
}

// Response shape from get_viewer_access_context DB function
interface ViewerAccessContextResponse {
  found: boolean
  userAccount?: {
    id: string
    personId: string | null
    email: string
    active: boolean
  }
  roleAssignments?: Array<{
    id: string
    userAccountId: string
    role: string
    officeId: string | null
    assignedByUserAccountId: string
    active: boolean
  }>
  clientProjectAccess?: Array<{
    id: string
    userAccountId: string
    projectId: string
    active: boolean
  }>
  person?: {
    id: string
    fullName: string
    title: string | null
    photoUrl: string | null
    officeId: string
    annualSalary: number | string
    availabilityHoursPerWeek: number | string
    email: string | null
    active: boolean
  }
  office?: {
    id: string
    name: string
  }
  activeAssignedProjectIds?: string[]
}

export interface ViewerSummary {
  displayName: string
  email: string
  officeName: string | null
  primaryTier: EffectiveUserTier | null
}

export interface CurrentViewerAccess {
  accessMessage: string | null
  viewer: AuthorizationViewer | null
  summary: ViewerSummary | null
}

export interface ViewerRequestContext {
  accessToken?: string | null
  sessionEmail?: string | null
}

interface ViewerSelection {
  userAccountId: string | null
  email: string | null
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

const liveViewerAccessCache = new Map<string, CacheEntry<CurrentViewerAccess>>()

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
    expiresAt: Date.now() + LIVE_VIEWER_CACHE_TTL_MS,
    value,
  })

  return value
}

function getViewerSelection(): ViewerSelection {
  return {
    userAccountId:
      process.env.KOLAM_VIEWER_USER_ACCOUNT_ID?.trim() ||
      process.env.MANDALA_VIEWER_USER_ACCOUNT_ID?.trim() ||
      null,
    email: normalizeEmail(process.env.KOLAM_VIEWER_EMAIL ?? process.env.MANDALA_VIEWER_EMAIL),
  }
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

function toUserAccount(row: UserAccountRow): UserAccount {
  return {
    id: row.id,
    personId: row.person_id,
    email: row.email,
    active: row.active,
  }
}

function toRoleAssignment(row: RoleAssignmentRow): RoleAssignment | null {
  if (!isAuthorizationRole(row.role)) {
    return null
  }

  return {
    id: row.id,
    userAccountId: row.user_account_id,
    role: row.role,
    officeId: row.office_id,
    assignedByUserAccountId: row.assigned_by_user_account_id,
    active: row.active,
  }
}

function toClientProjectAccess(row: ClientProjectAccessRow): ClientProjectAccess {
  return {
    id: row.id,
    userAccountId: row.user_account_id,
    projectId: row.project_id,
    active: row.active,
  }
}

function buildAuthorizationViewer(
  userAccount: UserAccount,
  roleAssignments: RoleAssignment[],
  clientProjectAccess: ClientProjectAccess[],
  activeAssignedProjectIds: string[],
): AuthorizationViewer {
  return {
    active: userAccount.active,
    activeAssignedProjectIds: [...new Set(activeAssignedProjectIds)],
    clientProjectIds: [
      ...new Set(
        clientProjectAccess
          .filter((access) => access.active)
          .map((access) => access.projectId),
      ),
    ],
    personId: userAccount.personId,
    roleAssignments: roleAssignments.filter((assignment) => assignment.active),
    userAccountId: userAccount.id,
  }
}

function buildViewerSummary(
  viewer: AuthorizationViewer,
  userAccount: UserAccount,
  person: PersonRow | null,
  office: OfficeRow | null,
): ViewerSummary {
  return {
    displayName: person?.full_name ?? userAccount.email,
    email: userAccount.email,
    officeName: office?.name ?? null,
    primaryTier: getViewerBaseTier(viewer),
  }
}

function findPreviewUserAccount(selection: ViewerSelection): UserAccountRow | null {
  if (selection.userAccountId) {
    return (
      previewUserAccounts.find((account) => account.id === selection.userAccountId) ?? null
    )
  }

  if (selection.email) {
    return (
      previewUserAccounts.find(
        (account) => normalizeEmail(account.email) === selection.email,
      ) ?? null
    )
  }

  return (
    previewUserAccounts.find(
      (account) => normalizeEmail(account.email) === DEFAULT_PREVIEW_VIEWER_EMAIL,
    ) ?? null
  )
}

function buildMissingViewerMessage(selection: ViewerSelection): string {
  if (selection.userAccountId || selection.email) {
    const identifier = selection.email ?? selection.userAccountId
    return `No viewer account matches ${identifier}.`
  }

  return PREVIEW_VIEWER_MESSAGE
}

function getPreviewViewerAccess(selection: ViewerSelection): CurrentViewerAccess {
  const accountRow = findPreviewUserAccount(selection)

  if (!accountRow) {
    return {
      accessMessage: buildMissingViewerMessage(selection),
      summary: null,
      viewer: null,
    }
  }

  const userAccount = toUserAccount(accountRow)

  if (!userAccount.active) {
    return {
      accessMessage: `Viewer account ${userAccount.email} is inactive.`,
      summary: null,
      viewer: null,
    }
  }

  const roleAssignments = previewRoleAssignments
    .filter((assignment) => assignment.user_account_id === userAccount.id)
    .map((assignment) => toRoleAssignment(assignment))
    .filter((assignment): assignment is RoleAssignment => Boolean(assignment))
  const clientProjectAccess = previewClientProjectAccess
    .filter((access) => access.user_account_id === userAccount.id)
    .map((access) => toClientProjectAccess(access))
  const person = userAccount.personId
    ? previewPeople.find((candidate) => candidate.id === userAccount.personId) ?? null
    : null
  const office = person
    ? previewOffices.find((candidate) => candidate.id === person.office_id) ?? null
    : null
  const activeAssignedProjectIds = userAccount.personId
    ? previewAssignments
        .filter(
          (assignment) =>
            assignment.person_id === userAccount.personId && Boolean(assignment.active),
        )
        .map((assignment) => assignment.project_id)
    : []
  const viewer = buildAuthorizationViewer(
    userAccount,
    roleAssignments,
    clientProjectAccess,
    activeAssignedProjectIds,
  )
  const summary = buildViewerSummary(viewer, userAccount, person, office)

  return {
    accessMessage:
      !selection.userAccountId && !selection.email
        ? `Previewing access as ${summary.displayName} (${summary.primaryTier ?? "unknown"}). Set KOLAM_VIEWER_EMAIL to impersonate another seeded user.`
        : `Previewing access as ${summary.displayName} (${summary.primaryTier ?? "unknown"}).`,
    summary,
    viewer,
  }
}

function buildViewerAccessFromDbResponse(
  response: ViewerAccessContextResponse,
  sessionEmail: string,
): CurrentViewerAccess {
  if (!response.found || !response.userAccount) {
    return {
      accessMessage: `No kolam user account matches ${sessionEmail}.`,
      summary: null,
      viewer: null,
    }
  }

  const userAccount: UserAccount = {
    id: response.userAccount.id,
    personId: response.userAccount.personId,
    email: response.userAccount.email,
    active: response.userAccount.active,
  }

  if (!userAccount.active) {
    return {
      accessMessage: `Viewer account ${userAccount.email} is inactive.`,
      summary: null,
      viewer: null,
    }
  }

  const roleAssignments: RoleAssignment[] = (response.roleAssignments ?? [])
    .filter((ra) => isAuthorizationRole(ra.role))
    .map((ra) => ({
      id: ra.id,
      userAccountId: ra.userAccountId,
      role: ra.role as RoleAssignment["role"],
      officeId: ra.officeId,
      assignedByUserAccountId: ra.assignedByUserAccountId,
      active: ra.active,
    }))

  const clientProjectAccess: ClientProjectAccess[] = (response.clientProjectAccess ?? []).map(
    (cpa) => ({
      id: cpa.id,
      userAccountId: cpa.userAccountId,
      projectId: cpa.projectId,
      active: cpa.active,
    }),
  )

  const person: PersonRow | null = response.person
    ? {
        id: response.person.id,
        full_name: response.person.fullName,
        title: response.person.title,
        photo_url: response.person.photoUrl,
        office_id: response.person.officeId,
        annual_salary: response.person.annualSalary,
        availability_hours_per_week: response.person.availabilityHoursPerWeek,
        email: response.person.email,
        active: response.person.active,
      }
    : null

  const office: OfficeRow | null = response.office
    ? {
        id: response.office.id,
        name: response.office.name,
      }
    : null

  const activeAssignedProjectIds = response.activeAssignedProjectIds ?? []

  const viewer = buildAuthorizationViewer(
    userAccount,
    roleAssignments,
    clientProjectAccess,
    activeAssignedProjectIds,
  )
  const summary = buildViewerSummary(viewer, userAccount, person, office)

  return {
    accessMessage: null,
    summary,
    viewer,
  }
}

const getLiveViewerAccess = cache(
  async (
    sessionEmail: string | null,
    accessToken: string | null,
  ): Promise<CurrentViewerAccess> => {
    if (!sessionEmail || !accessToken) {
      return {
        accessMessage: SIGN_IN_REQUIRED_MESSAGE,
        summary: null,
        viewer: null,
      }
    }

    const cachedAccess = getCachedValue(liveViewerAccessCache, sessionEmail)

    if (cachedAccess) {
      return cachedAccess
    }

    const client = createServerSupabaseClient({ accessToken })

    if (!client) {
      return {
        accessMessage: SIGN_IN_REQUIRED_MESSAGE,
        summary: null,
        viewer: null,
      }
    }

    // Single consolidated DB call instead of 6 separate queries
    const { data, error } = await client.rpc("get_viewer_access_context")

    if (error) {
      throw error
    }

    const response = data as ViewerAccessContextResponse
    const result = buildViewerAccessFromDbResponse(response, sessionEmail)

    return setCachedValue(liveViewerAccessCache, sessionEmail, result)
  },
)

export async function getCurrentViewerAccess(
  context: ViewerRequestContext = {},
): Promise<CurrentViewerAccess> {
  const status = getDatabaseStatus()

  if (!status.configured) {
    const selection = getViewerSelection()
    return getPreviewViewerAccess(selection)
  }

  const sessionEmail = normalizeEmail(context.sessionEmail)
  const accessToken = context.accessToken?.trim() || null

  const liveAccess = await getLiveViewerAccess(sessionEmail, accessToken)

  if (liveAccess.viewer || liveAccess.accessMessage !== SIGN_IN_REQUIRED_MESSAGE) {
    return liveAccess
  }

  return {
    accessMessage: status.message ?? SIGN_IN_REQUIRED_MESSAGE,
    summary: null,
    viewer: null,
  }
}

export function getViewerLabel(summary: ViewerSummary | null): string | null {
  if (!summary) {
    return null
  }

  const parts = [summary.displayName]

  if (summary.primaryTier) {
    parts.push(summary.primaryTier)
  }

  if (summary.officeName) {
    parts.push(summary.officeName)
  }

  return parts.join(" · ")
}

export function canViewerSeeLibrary(viewer: AuthorizationViewer | null): boolean {
  return viewer ? canViewSharedLibrary(viewer) : false
}
