import { readFile } from "node:fs/promises"
import { basename } from "node:path"

const [installerPath, requestedDestination] = process.argv.slice(2)
const version = process.env.MANDALA_AGENT_VERSION?.trim()
const destination = requestedDestination ||
  (version ? `latest/MandalaAgentSetup-${version}.exe` : "latest/MandalaAgentSetup.exe")
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!installerPath || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node publish-release.mjs <installer-path> [storage-path]",
  )
}

const content = await readFile(installerPath)
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

console.log(`Published ${basename(installerPath)} to desktop-agent-releases/${destination}`)
