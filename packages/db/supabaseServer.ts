import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface DatabaseStatus {
  configured: boolean
  message: string | null
}

const MISSING_CONFIG_MESSAGE =
  "Set NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY with authenticated requests) to load live project data."

export function getDatabaseStatus(): DatabaseStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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

export function createServerSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
