const DEFAULT_APP_PATH = "/projects"

export function getSafeNextPath(
  value: string | null | undefined,
  fallback = DEFAULT_APP_PATH,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback
  }

  return value
}
