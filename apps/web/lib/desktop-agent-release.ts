import { createServiceRoleSupabaseClient } from "@mandala/db"

export const DESKTOP_AGENT_BUCKET = "desktop-agent-releases"
export const DESKTOP_AGENT_PRODUCTION_PROJECT_REF = "nzlajptokbcgeaifgnoq"

export type DesktopAgentRelease = {
  version: string
  filename: string
  objectPath: string
  sha256: string
  size: number
  backendProjectRef: string
  publishedAt: string
}

function getConfiguredProjectRef() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0]
  } catch {
    return null
  }
}

function isDesktopAgentRelease(value: unknown): value is DesktopAgentRelease {
  if (!value || typeof value !== "object") {
    return false
  }

  const release = value as Partial<DesktopAgentRelease>
  if (
    typeof release.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(release.version) ||
    typeof release.filename !== "string" ||
    typeof release.objectPath !== "string" ||
    typeof release.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(release.sha256) ||
    typeof release.size !== "number" ||
    !Number.isSafeInteger(release.size) ||
    release.size < 10_000_000 ||
    typeof release.publishedAt !== "string" ||
    Number.isNaN(Date.parse(release.publishedAt)) ||
    release.backendProjectRef !== DESKTOP_AGENT_PRODUCTION_PROJECT_REF
  ) {
    return false
  }

  const expectedFilename = `MandalaAgentSetup-${release.version}.exe`
  return (
    release.filename === expectedFilename &&
    release.objectPath === `latest/${expectedFilename}`
  )
}

export async function getDesktopAgentRelease(): Promise<DesktopAgentRelease | null> {
  if (getConfiguredProjectRef() !== DESKTOP_AGENT_PRODUCTION_PROJECT_REF) {
    return null
  }

  const client = createServiceRoleSupabaseClient()
  if (!client) {
    return null
  }

  const { data, error } = await client.storage
    .from(DESKTOP_AGENT_BUCKET)
    .download("latest/release.json")

  if (error || !data) {
    return null
  }

  try {
    const manifest: unknown = JSON.parse(await data.text())
    return isDesktopAgentRelease(manifest) ? manifest : null
  } catch {
    return null
  }
}
