import type { RoleAssignment } from "./roleAssignment"

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
  personId?: string | null
  active: boolean
  roleAssignments: RoleAssignment[]
  activeAssignedProjectIds: string[]
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

export function hasPartnerRole(viewer: AuthorizationViewer): boolean {
  return getActiveRoleAssignments(viewer).some((assignment) => assignment.role === "partner")
}

export function getAdminOfficeIds(viewer: AuthorizationViewer): string[] {
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
  return getAdminOfficeIds(viewer).includes(officeId)
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

export function getViewerBaseTier(
  viewer: AuthorizationViewer,
): Exclude<EffectiveUserTier, "projectLead"> | null {
  if (!viewer.active) {
    return null
  }

  if (hasPartnerRole(viewer)) {
    return "partner"
  }

  if (getAdminOfficeIds(viewer).length > 0) {
    return "admin"
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

  if (hasPartnerRole(viewer)) {
    return "partner"
  }

  if (isAdminForOffice(viewer, project.managingOfficeId)) {
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

  return hasPartnerRole(viewer) || getAdminOfficeIds(viewer).length > 0
}

export function canViewPerson(
  viewer: AuthorizationViewer,
  person: PersonPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  if (hasPartnerRole(viewer) || isAdminForOffice(viewer, person.officeId)) {
    return true
  }

  return viewer.personId === person.id
}

export function canViewCompensation(
  viewer: AuthorizationViewer,
  person: PersonPermissionSubject,
): boolean {
  return canViewPerson(viewer, person)
}

export function canCreateOrUpdatePeople(
  viewer: AuthorizationViewer,
  officeId: string,
): boolean {
  if (!viewer.active) {
    return false
  }

  return hasPartnerRole(viewer) || isAdminForOffice(viewer, officeId)
}

export function canCreateOrUpdateProjects(
  viewer: AuthorizationViewer,
  managingOfficeId: string,
): boolean {
  if (!viewer.active) {
    return false
  }

  return hasPartnerRole(viewer) || isAdminForOffice(viewer, managingOfficeId)
}

export function canSetProjectLead(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return canCreateOrUpdateProjects(viewer, project.managingOfficeId)
}

export function canAssignPeopleToProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return (
    hasPartnerRole(viewer) ||
    isAdminForOffice(viewer, project.managingOfficeId) ||
    isProjectLead(viewer, project)
  )
}

export function canChangeProjectStage(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return canAssignPeopleToProject(viewer, project)
}

export function canEditProjectTime(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  return canAssignPeopleToProject(viewer, project)
}

export function canAddChecklistItemsToProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return (
    hasPartnerRole(viewer) ||
    isAdminForOffice(viewer, project.managingOfficeId) ||
    isProjectLead(viewer, project) ||
    isAssignedToProject(viewer, project.id)
  )
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

  return hasPartnerRole(viewer)
}

export function canViewProjectSummary(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  if (!viewer.active) {
    return false
  }

  return getViewerTierForProject(viewer, project) !== null
}

export function canViewInternalProject(
  viewer: AuthorizationViewer,
  project: ProjectPermissionSubject,
): boolean {
  const tier = getViewerTierForProject(viewer, project)

  return tier !== null && tier !== "client"
}

export function canViewSharedLibrary(viewer: AuthorizationViewer): boolean {
  if (!viewer.active) {
    return false
  }

  return isInternalViewer(viewer)
}
