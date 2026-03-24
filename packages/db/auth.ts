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

import { fetchOfficeRows, fetchPeopleRows, type OfficeRow, type PersonRow } from "./lookups"
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

interface AssignmentProjectRow {
  project_id: string
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

async function findLiveUserAccount(
  sessionEmail: string,
  accessToken: string,
): Promise<UserAccountRow | null> {
  const client = createServerSupabaseClient({ accessToken })

  if (!client) {
    return null
  }

  const { data, error } = await client
    .from("user_accounts")
    .select("id, person_id, email, active")
    .ilike("email", sessionEmail)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as UserAccountRow | null) ?? null
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

    const client = createServerSupabaseClient({ accessToken })

    if (!client) {
      return {
        accessMessage: SIGN_IN_REQUIRED_MESSAGE,
        summary: null,
        viewer: null,
      }
    }

    const accountRow = await findLiveUserAccount(sessionEmail, accessToken)

    if (!accountRow) {
      return {
        accessMessage: `No kolam user account matches ${sessionEmail}.`,
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

    const [roleAssignmentResponse, clientProjectAccessResponse, people, assignmentResponse] =
      await Promise.all([
        client
          .from("role_assignments")
          .select("id, user_account_id, role, office_id, assigned_by_user_account_id, active")
          .eq("user_account_id", userAccount.id)
          .eq("active", true),
        client
          .from("client_project_access")
          .select("id, user_account_id, project_id, active")
          .eq("user_account_id", userAccount.id)
          .eq("active", true),
        userAccount.personId
          ? fetchPeopleRows([userAccount.personId], { client })
          : Promise.resolve([]),
        userAccount.personId
          ? client
              .from("assignments")
              .select("project_id")
              .eq("person_id", userAccount.personId)
              .eq("active", true)
          : Promise.resolve({ data: [], error: null }),
      ])

    if (roleAssignmentResponse.error) throw roleAssignmentResponse.error
    if (clientProjectAccessResponse.error) throw clientProjectAccessResponse.error
    if (assignmentResponse.error) throw assignmentResponse.error

    const roleAssignments = ((roleAssignmentResponse.data ?? []) as RoleAssignmentRow[])
      .map((assignment) => toRoleAssignment(assignment))
      .filter((assignment): assignment is RoleAssignment => Boolean(assignment))
    const clientProjectAccess = (
      (clientProjectAccessResponse.data ?? []) as ClientProjectAccessRow[]
    ).map((access) => toClientProjectAccess(access))
    const person = people[0] ?? null
    const offices = person ? await fetchOfficeRows([person.office_id], { client }) : []
    const office = offices[0] ?? null
    const activeAssignedProjectIds = ((assignmentResponse.data ?? []) as AssignmentProjectRow[]).map(
      (assignment) => assignment.project_id,
    )
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
