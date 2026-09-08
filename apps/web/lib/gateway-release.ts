import { createServiceRoleSupabaseClient } from "@mandala/db"

export const GATEWAY_RELEASE_BUCKET = "desktop-agent-releases"
export const GATEWAY_PRODUCTION_PROJECT_REF = "nzlajptokbcgeaifgnoq"

export type GatewayRelease = {
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

function isGatewayRelease(value: unknown): value is GatewayRelease {
  if (!value || typeof value !== "object") {
    return false
  }

  const release = value as Partial<GatewayRelease>
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
    release.backendProjectRef !== GATEWAY_PRODUCTION_PROJECT_REF
  ) {
    return false
  }

  const expectedFilename = `MandalaGatewaySetup-${release.version}.exe`
  return (
    release.filename === expectedFilename &&
    release.objectPath === `gateway/${expectedFilename}`
  )
}

export async function getGatewayRelease(): Promise<GatewayRelease | null> {
  if (getConfiguredProjectRef() !== GATEWAY_PRODUCTION_PROJECT_REF) {
    return null
  }

  const client = createServiceRoleSupabaseClient()
  if (!client) {
    return null
  }

  const { data, error } = await client.storage
    .from(GATEWAY_RELEASE_BUCKET)
    .download("gateway/release.json")

  if (error || !data) {
    return null
  }

  try {
    const manifest: unknown = JSON.parse(await data.text())
    return isGatewayRelease(manifest) ? manifest : null
  } catch {
    return null
  }
}
