import { createHash, sign } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createWebServerSupabaseClient } from "../../../../../lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function unavailable(message: string, status: number) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } })
}

export async function GET(_request: Request, context: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId)) {
    return unavailable("Preview unavailable.", 404)
  }
  if (process.env.NEXT_PUBLIC_LAN_PREVIEWS_ENABLED !== "true" || !process.env.LAN_PREVIEW_ORIGIN || !process.env.LAN_PREVIEW_SIGNING_KEY_FILE) {
    return unavailable("File previews are available through the office Mandala address after IT enables them.", 503)
  }
  try {
    const client = await createWebServerSupabaseClient()
    if (!client) return unavailable("Sign in to view this document.", 401)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return unavailable("Sign in to view this document.", 401)
    // Uncached, authenticated permission check on every request; never a service key.
    const { data: document, error } = await client.rpc("authorize_resource_preview", { resource_id: resourceId }).maybeSingle<{ id: string; server_path: string }>()
    if (error || !document?.server_path) return unavailable("Document unavailable or access denied.", 404)
    const origin = new URL(process.env.LAN_PREVIEW_ORIGIN)
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("Invalid preview origin")
    }
    const payload = Buffer.from(JSON.stringify({
      aud: "mandala-lan-preview", sub: user.id, resourceId,
      sourceHash: createHash("sha256").update(document.server_path).digest("hex"),
      exp: Math.floor(Date.now() / 1000) + 30,
    })).toString("base64url")
    const signature = sign(null, Buffer.from(payload), await readFile(process.env.LAN_PREVIEW_SIGNING_KEY_FILE)).toString("base64url")
    const upstream = await fetch(new URL(`/previews/${resourceId}`, origin), {
      headers: { Authorization: `Bearer ${payload}.${signature}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    })
    if (!upstream.ok) return unavailable("No current preview is available for your account. Ask IT to publish an approved preview; you can still use Open file or Copy path.", 404)
    const contentType = upstream.headers.get("content-type")
    const maxBytes = 25 * 1024 * 1024
    if (!contentType || !["application/pdf", "image/png", "image/jpeg"].includes(contentType)) throw new Error("Unsupported preview")
    const reader = upstream.body?.getReader()
    if (!reader) throw new Error("Empty preview")
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        total += value.length
        if (total > maxBytes) throw new Error("Preview too large")
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    const bytes = Buffer.concat(chunks)
    return new Response(bytes, { headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="preview.${contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg"}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'self'",
    } })
  } catch {
    return unavailable("The office preview service is unavailable. Use Open file or Copy path, or contact IT.", 503)
  }
}
