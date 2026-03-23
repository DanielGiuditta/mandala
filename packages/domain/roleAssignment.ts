export const AUTHORIZATION_ROLES = ["partner", "admin"] as const

export type AuthorizationRole = (typeof AUTHORIZATION_ROLES)[number]

export interface RoleAssignment {
  id: string
  userAccountId: string
  role: AuthorizationRole
  officeId?: string | null
  assignedByUserAccountId: string
  active: boolean
}

export function isAuthorizationRole(value: string): value is AuthorizationRole {
  return (AUTHORIZATION_ROLES as readonly string[]).includes(value)
}
