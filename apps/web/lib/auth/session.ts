import type { ViewerRequestContext } from "@mandala/db"
import { createPerfTrace, getDatabaseStatus } from "@mandala/db"
import { headers } from "next/headers"
import { cache } from "react"

import { createWebServerSupabaseClient } from "../supabase/server"

export interface AppSessionState {
  accessToken: string | null
  appOrigin: string | null
  configured: boolean
  isAuthenticated: boolean
  sessionEmail: string | null
}

async function getAppOrigin(): Promise<string | null> {
  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")

  if (!host) {
    return null
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https")

  return `${protocol}://${host}`
}

export const getAppSessionState = cache(async (): Promise<AppSessionState> => {
  const trace = createPerfTrace("getAppSessionState")
  const status = getDatabaseStatus()
  const appOrigin = await getAppOrigin()

  if (!status.configured) {
    trace.finish({
      configured: false,
      isAuthenticated: false,
      result: "preview",
    })
    return {
      accessToken: null,
      appOrigin,
      configured: false,
      isAuthenticated: false,
      sessionEmail: null,
    }
  }

  const supabase = await createWebServerSupabaseClient()

  if (!supabase) {
    trace.finish({
      configured: true,
      isAuthenticated: false,
      result: "missing-client",
    })
    return {
      accessToken: null,
      appOrigin,
      configured: true,
      isAuthenticated: false,
      sessionEmail: null,
    }
  }

  const {
    data: { session },
  } = await trace.measure("supabase.auth.getSession", () =>
    supabase.auth.getSession(),
  )

  const accessToken = session?.access_token ?? null
  const sessionEmail = session?.user.email?.trim().toLowerCase() ?? null
  const result = {
    accessToken,
    appOrigin,
    configured: true,
    isAuthenticated: Boolean(accessToken && sessionEmail),
    sessionEmail,
  }

  trace.finish({
    configured: true,
    hasSessionEmail: Boolean(sessionEmail),
    isAuthenticated: result.isAuthenticated,
    result: result.isAuthenticated ? "authenticated" : "anonymous",
  })

  return result
})

export const getViewerRequestContext = cache(
  async (): Promise<ViewerRequestContext> => {
    const session = await getAppSessionState()

    return {
      accessToken: session.accessToken,
      appOrigin: session.appOrigin,
      sessionEmail: session.sessionEmail,
    }
  },
)
