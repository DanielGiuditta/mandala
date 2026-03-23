import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface DatabaseStatus {
  configured: boolean
  message: string | null
}

export interface ServerSupabaseClientOptions {
  accessToken?: string | null
  useServiceRole?: boolean
}

const MISSING_CONFIG_MESSAGE =
  "Set NEXT_PUBLIC_SUPABASE_URL plus NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live auth-backed data. Keep SUPABASE_SERVICE_ROLE_KEY for admin scripts only."

export function getDatabaseStatus(): DatabaseStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return {
      configured: false,
      message: MISSING_CONFIG_MESSAGE,
    }
  }

  return {
    configured: true,
    message: null,
  }
}

export function createServerSupabaseClient(
  options: ServerSupabaseClientOptions = {},
): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = options.useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  const headers: Record<string, string> = {}

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers,
    },
  })
}

export function createServiceRoleSupabaseClient(): SupabaseClient | null {
  return createServerSupabaseClient({ useServiceRole: true })
}
