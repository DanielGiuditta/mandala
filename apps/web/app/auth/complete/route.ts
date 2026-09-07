import { createWebServerSupabaseClient } from "../../../lib/supabase/server"

export async function POST(request: Request) {
  // Complete invite/recovery authentication at the LAN web server so the browser
  // never needs a direct connection to Supabase. Reject cross-origin submissions.
  if (request.headers.get("origin") !== (process.env.MANDALA_WEB_ORIGIN ?? new URL(request.url).origin)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 })
  }
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error("Missing body")
    let bytes = 0
    const chunks: Uint8Array[] = []
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > 32768) throw new Error("Invalid request")
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (typeof input.accessToken !== "string" || typeof input.refreshToken !== "string") throw new Error("Invalid session")
    const client = await createWebServerSupabaseClient()
    if (!client) throw new Error("Authentication unavailable")
    const { error } = await client.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken })
    if (error) return Response.json({ error: "The sign-in link is invalid or expired." }, { status: 401, headers: { "Cache-Control": "no-store" } })
    return Response.json({ error: null }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Unable to complete sign-in. Try a new sign-in link." }, { status: 400 })
  }
}
