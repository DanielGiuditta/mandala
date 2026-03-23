import type { ViewerRequestContext } from "@mandala/db"
import { getDatabaseStatus } from "@mandala/db"
import { cache } from "react"

import { createWebServerSupabaseClient } from "../supabase/server"

export interface AppSessionState {
  accessToken: string | null
  configured: boolean
  isAuthenticated: boolean
  sessionEmail: string | null
}

export const getAppSessionState = cache(async (): Promise<AppSessionState> => {
  const status = getDatabaseStatus()

  if (!status.configured) {
    return {
      accessToken: null,
      configured: false,
      isAuthenticated: false,
      sessionEmail: null,
    }
  }

  const supabase = await createWebServerSupabaseClient()

  if (!supabase) {
    return {
      accessToken: null,
      configured: true,
      isAuthenticated: false,
      sessionEmail: null,
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const accessToken = session?.access_token ?? null
  const sessionEmail = session?.user.email?.trim().toLowerCase() ?? null

  return {
    accessToken,
    configured: true,
    isAuthenticated: Boolean(accessToken && sessionEmail),
    sessionEmail,
  }
})

export const getViewerRequestContext = cache(
  async (): Promise<ViewerRequestContext> => {
    const session = await getAppSessionState()

    return {
      accessToken: session.accessToken,
      sessionEmail: session.sessionEmail,
    }
  },
)
