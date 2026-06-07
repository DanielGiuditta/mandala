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
  supervisor_person_id: string | null
  annual_salary: number | string | null
  availability_hours_per_week: number | string
  email: string | null
  active: boolean
}

type PersonPublicRow = Omit<PersonRow, "annual_salary">

interface PersonCompensationRow {
  annual_salary: number | string | null
  person_id: string
}

export interface ProjectLookupRow {
  id: string
  name: string
  photo_url: string | null
  managing_office_id: string
  lead_person_id: string | null
  active: boolean
}

export interface LookupQueryOptions {
  accessToken?: string | null
  client?: SupabaseClient
}

function resolveLookupClient(options: LookupQueryOptions = {}): SupabaseClient | null {
  return options.client ?? createServerSupabaseClient({ accessToken: options.accessToken })
}

export const PERSON_PUBLIC_SELECT =
  "id, full_name, title, photo_url, office_id, supervisor_person_id, availability_hours_per_week, email, active"

export function attachPeopleCompensation(
  rows: PersonRow[],
  compensationByPersonId: Map<string, number>,
): PersonRow[] {
  if (compensationByPersonId.size === 0) {
    return rows
  }

  return rows.map((row) => ({
    ...row,
    annual_salary: compensationByPersonId.get(row.id) ?? row.annual_salary,
  }))
}

export async function fetchPeopleCompensationById(
  ids?: string[],
  options: LookupQueryOptions = {},
): Promise<Map<string, number>> {
  if (ids && ids.length === 0) {
    return new Map()
  }

  const client = resolveLookupClient(options)

  if (!client) {
    return new Map()
  }

  const { data, error } = await client.rpc("list_people_compensation", {
    target_person_ids: ids && ids.length > 0 ? ids : null,
  })

  if (error) {
    throw error
  }

  return ((data ?? []) as PersonCompensationRow[]).reduce((map, row) => {
    if (row.annual_salary !== null) {
      map.set(row.person_id, Number(row.annual_salary))
    }

    return map
  }, new Map<string, number>())
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
    .select(PERSON_PUBLIC_SELECT)
    .order("full_name")

  if (ids && ids.length > 0) {
    query = query.in("id", ids)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return ((data ?? []) as PersonPublicRow[]).map((row) => ({
    ...row,
    annual_salary: null,
  }))
}

export async function fetchProjectRows(
  ids?: string[],
  options: LookupQueryOptions = {},
): Promise<ProjectLookupRow[]> {
  if (ids && ids.length === 0) {
    return []
  }

  const client = resolveLookupClient(options)

  if (!client) {
    return []
  }

  let query = client
    .from("projects")
    .select("id, name, photo_url, managing_office_id, lead_person_id, active")
    .order("name")

  if (ids && ids.length > 0) {
    query = query.in("id", ids)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []) as ProjectLookupRow[]
}
