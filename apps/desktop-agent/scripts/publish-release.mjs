import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { basename } from "node:path"

const [installerPath, requestedDestination] = process.argv.slice(2)
const version = process.env.MANDALA_AGENT_VERSION?.trim()
const expectedProjectRef = "nzlajptokbcgeaifgnoq"
const destination = requestedDestination ||
  (version ? `latest/MandalaAgentSetup-${version}.exe` : "latest/MandalaAgentSetup.exe")
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!installerPath || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node publish-release.mjs <installer-path> [storage-path]",
  )
}

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("MANDALA_AGENT_VERSION must use major.minor.patch format.")
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
if (projectRef !== expectedProjectRef) {
  throw new Error(
    `Release target ${projectRef} does not match production ${expectedProjectRef}.`,
  )
}

const expectedFilename = `MandalaAgentSetup-${version}.exe`
if (basename(installerPath) !== expectedFilename || basename(destination) !== expectedFilename) {
  throw new Error(
    `Installer and destination must both use the approved filename ${expectedFilename}.`,
  )
}

const content = await readFile(installerPath)
if (content.length < 10_000_000 || content[0] !== 0x4d || content[1] !== 0x5a) {
  throw new Error("The release file is not a plausible Windows PE installer.")
}

const sha256 = createHash("sha256").update(content).digest("hex")
const objectPath = destination.split("/").map(encodeURIComponent).join("/")
const response = await fetch(`${supabaseUrl}/storage/v1/object/desktop-agent-releases/${objectPath}`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/vnd.microsoft.portable-executable",
    "x-upsert": "true",
  },
  body: content,
})

if (!response.ok) {
  throw new Error(`Release upload failed: ${await response.text()}`)
}

const manifest = {
  version,
  filename: expectedFilename,
  objectPath: destination,
  sha256,
  size: content.length,
  backendProjectRef: projectRef,
  publishedAt: new Date().toISOString(),
}
const manifestResponse = await fetch(
  `${supabaseUrl}/storage/v1/object/desktop-agent-releases/latest/release.json`,
  {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify(manifest, null, 2),
  },
)

if (!manifestResponse.ok) {
  throw new Error(`Release manifest upload failed: ${await manifestResponse.text()}`)
}

console.log(
  `Published ${expectedFilename} (${content.length} bytes, sha256 ${sha256}) to desktop-agent-releases/${destination}`,
)
console.log("Published verified release manifest to desktop-agent-releases/latest/release.json")
