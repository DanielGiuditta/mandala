import type { RoleAssignment } from "./roleAssignment"

export const EXACT_SUPER_USER_EMAIL = "danielgiuditta@gmail.com"

export const EFFECTIVE_USER_TIERS = [
  "partner",
  "admin",
  "projectLead",
  "employee",
  "client",
] as const

export type EffectiveUserTier = (typeof EFFECTIVE_USER_TIERS)[number]

export interface AuthorizationViewer {
  userAccountId: string
  email: string
  personId?: string | null
  active: boolean
  roleAssignments: RoleAssignment[]
  activeAssignedProjectIds: string[]
  leadProjectIds: string[]
  clientProjectIds: string[]
}

export interface ProjectPermissionSubject {
  id: string
  managingOfficeId: string
  leadPersonId?: string | null
}

export interface PersonPermissionSubject {
  id: string
  officeId: string
}

function getActiveRoleAssignments(viewer: AuthorizationViewer): RoleAssignment[] {
  return viewer.roleAssignments.filter((assignment) => assignment.active)
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function hasExactSuperUserOverride(viewer: AuthorizationViewer): boolean {
  return normalizeEmail(viewer.email) === EXACT_SUPER_USER_EMAIL
}

export function hasPartnerRole(viewer: AuthorizationViewer): boolean {
  return getActiveRoleAssignments(viewer).some((assignment) => assignment.role === "partner")
}

export function hasPartnerPrivileges(viewer: AuthorizationViewer): boolean {
  return hasExactSuperUserOverride(viewer) || hasPartnerRole(viewer)
}

export function hasAdminRole(viewer: AuthorizationViewer): boolean {
  return getActiveRoleAssignments(viewer).some((assignment) => assignment.role === "admin")
}

export function getAdminOfficeIds(viewer: AuthorizationViewer): string[] {
  if (!hasAdminRole(viewer)) {
    return []
  }

  return [
    ...new Set(
      getActiveRoleAssignments(viewer)
        .filter(
          (assignment): assignment is RoleAssignment & { officeId: string } =>
            assignment.role === "admin" && Boolean(assignment.officeId),
        )
        .map((assignment) => assignment.officeId),
    ),
  ]
}

export function isAdminForOffice(
  viewer: AuthorizationViewer,
  officeId: string,
): boolean {
  return Boolean(officeId) && hasAdminRole(viewer)
}

export function isProjectLead(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return Boolean(viewer.personId && project.leadPersonId === viewer.personId)
}

export function isAssignedToProject(
  viewer: AuthorizationViewer,
  projectId: string,
): boolean {
  return viewer.activeAssignedProjectIds.includes(projectId)
}

export function isClientForProject(
  viewer: AuthorizationViewer,
  projectId: string,
): boolean {
  return viewer.clientProjectIds.includes(projectId)
}

export function isInternalViewer(viewer: AuthorizationViewer): boolean {
  return Boolean(viewer.personId)
}

export function hasProjectLeadAccess(viewer: AuthorizationViewer): boolean {
  return viewer.leadProjectIds.length > 0
}

export function canViewFinancialData(viewer: AuthorizationViewer): boolean {
  if (!viewer.active) {
    return false
  }

  return hasPartnerPrivileges(viewer) || hasAdminRole(viewer)
}

export function getViewerBaseTier(
  viewer: AuthorizationViewer,
): EffectiveUserTier | null {
  if (!viewer.active) {
    return null
  }

  if (hasPartnerPrivileges(viewer)) {
    return "partner"
  }

  if (hasAdminRole(viewer)) {
    return "admin"
  }

  if (hasProjectLeadAccess(viewer)) {
    return "projectLead"
  }

  if (isInternalViewer(viewer)) {
    return "employee"
  }

  if (viewer.clientProjectIds.length > 0) {
    return "client"
  }

  return null
}

export function getViewerTierForProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): EffectiveUserTier | null {
  if (!viewer.active) {
    return null
  }

  if (hasPartnerPrivileges(viewer)) {
    return "partner"
  }

  if (hasAdminRole(viewer)) {
    return "admin"
  }

  if (isProjectLead(viewer, project)) {
    return "projectLead"
  }

  if (isAssignedToProject(viewer, project.id)) {
    return "employee"
  }

  if (isClientForProject(viewer, project.id)) {
    return "client"
  }

  return null
}

export function canViewPeopleDirectory(viewer: AuthorizationViewer): boolean {
  if (!viewer.active) {
    return false
  }

  return hasPartnerPrivileges(viewer) || hasAdminRole(viewer) || hasProjectLeadAccess(viewer)
}

export function canViewPerson(
  viewer: AuthorizationViewer,
  person: PersonPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  if (
    hasPartnerPrivileges(viewer) ||
    hasAdminRole(viewer) ||
    hasProjectLeadAccess(viewer)
  ) {
    return true
  }

  return false
}

export function canViewCompensation(
  viewer: AuthorizationViewer,
  person: PersonPermissionSubject,
): boolean {
  if (!canViewPerson(viewer, person)) {
    return false
  }

  return canViewFinancialData(viewer)
}

export function canCreateOrUpdatePeople(
  viewer: AuthorizationViewer,
  officeId: string,
): boolean {
  if (!viewer.active) {
    return false
  }

  return Boolean(officeId) && (hasPartnerPrivileges(viewer) || hasAdminRole(viewer))
}

export function canCreateOrUpdateProjects(
  viewer: AuthorizationViewer,
  managingOfficeId: string,
): boolean {
  if (!viewer.active) {
    return false
  }

  return Boolean(managingOfficeId) && (hasPartnerPrivileges(viewer) || hasAdminRole(viewer))
}

export function canEditProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return (
    hasPartnerPrivileges(viewer) ||
    hasAdminRole(viewer) ||
    isProjectLead(viewer, project)
  )
}

export function canSetProjectLead(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return Boolean(project.managingOfficeId) && (hasPartnerPrivileges(viewer) || hasAdminRole(viewer))
}

export function canAssignPeopleToProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return canEditProject(viewer, project)
}

export function canChangeProjectStage(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return canEditProject(viewer, project)
}

export function canEditProjectTime(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return canEditProject(viewer, project)
}

export function canTrackOwnTimeForProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  if (!canAccessTimeTracker(viewer)) {
    return false
  }

  return (
    hasPartnerPrivileges(viewer) ||
    hasAdminRole(viewer) ||
    isProjectLead(viewer, project) ||
    isAssignedToProject(viewer, project.id)
  )
}

export function canAddChecklistItemsToProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return canEditProject(viewer, project) || isAssignedToProject(viewer, project.id)
}

export function canUploadProjectDocuments(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return canAddChecklistItemsToProject(viewer, project)
}

export function canAssignAdmins(viewer: AuthorizationViewer): boolean {
  if (!viewer.active) {
    return false
  }

  return hasPartnerPrivileges(viewer)
}

export function canViewProjectSummary(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return (
    hasPartnerPrivileges(viewer) ||
    hasAdminRole(viewer) ||
    hasProjectLeadAccess(viewer) ||
    isAssignedToProject(viewer, project.id) ||
    isClientForProject(viewer, project.id)
  )
}

export function canViewInternalProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return canViewProjectSummary(viewer, project) && !isClientForProject(viewer, project.id)
}

export function canViewProjectFinancials(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!canViewInternalProject(viewer, project)) {
    return false
  }

  return canViewFinancialData(viewer)
}

export function canAccessTimeTracker(viewer: AuthorizationViewer): boolean {
  if (!viewer.active) {
    return false
  }

  return isInternalViewer(viewer)
}

export function canViewTimeTrackerWorkspace(viewer: AuthorizationViewer): boolean {
  if (!viewer.active) {
    return false
  }

  return hasPartnerPrivileges(viewer) || hasAdminRole(viewer) || hasProjectLeadAccess(viewer)
}

export function canViewSharedLibrary(viewer: AuthorizationViewer): boolean {
  if (!viewer.active) {
    return false
  }

  return hasPartnerPrivileges(viewer) || hasAdminRole(viewer)
}
