import type { SupabaseClient } from "@supabase/supabase-js"

import { createServerSupabaseClient } from "./supabaseServer"

export interface OfficeRow {
  id: string
  name: string
}

export interface PersonRow {
  id: string
  full_name: string
  title: string | null
  photo_url: string | null
  office_id: string
  annual_salary: number | string
  availability_hours_per_week: number | string
  email: string | null
  active: boolean
}

export interface LookupQueryOptions {
  accessToken?: string | null
  client?: SupabaseClient
}

function resolveLookupClient(options: LookupQueryOptions = {}): SupabaseClient | null {
  return options.client ?? createServerSupabaseClient({ accessToken: options.accessToken })
}

export async function fetchOfficeRows(
  ids?: string[],
  options: LookupQueryOptions = {},
): Promise<OfficeRow[]> {
  if (ids && ids.length === 0) {
    return []
  }

  const client = resolveLookupClient(options)

  if (!client) {
    return []
  }

  let query = client.from("offices").select("id, name").order("name")

  if (ids && ids.length > 0) {
    query = query.in("id", ids)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []) as OfficeRow[]
}

export async function fetchPeopleRows(
  ids?: string[],
  options: LookupQueryOptions = {},
): Promise<PersonRow[]> {
  if (ids && ids.length === 0) {
    return []
  }

  const client = resolveLookupClient(options)

  if (!client) {
    return []
  }

  let query = client
    .from("people")
    .select(
      "id, full_name, title, photo_url, office_id, annual_salary, availability_hours_per_week, email, active",
    )
    .order("full_name")

  if (ids && ids.length > 0) {
    query = query.in("id", ids)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []) as PersonRow[]
}
