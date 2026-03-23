export interface UserAccount {
  id: string
  personId?: string | null
  email: string
  active: boolean
}

export function isInternalUserAccount(account: UserAccount): boolean {
  return Boolean(account.personId)
}
