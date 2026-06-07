export interface PersonMutationActionResult {
  error: string | null
  ok: boolean
  personId: string
}

export interface PersonAccountEmailActionResult {
  error: string | null
  message: string
  ok: boolean
}

export function assertPersonMutationSucceeded(
  result: PersonMutationActionResult,
  fallback: string,
): string {
  if (!result.ok) {
    throw new Error(result.error ?? fallback)
  }

  return result.personId
}

export function assertPersonAccountEmailSucceeded(
  result: PersonAccountEmailActionResult,
  fallback: string,
): string {
  if (!result.ok) {
    throw new Error(result.error ?? fallback)
  }

  return result.message
}
