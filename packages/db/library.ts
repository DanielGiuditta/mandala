import type { ResourceDocument } from "@mandala/domain"

import { fetchPeopleRows } from "./lookups"
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer"

interface ResourceDocumentRow {
  id: string
  name: string
  file_url: string
  file_type: string | null
  project_id: string | null
  category: string | null
  description: string | null
  uploaded_by_person_id: string | null
  created_at: string
}

export interface LibraryListFilters {
  category?: string
  query?: string
}

export interface LibraryDocumentListItem extends ResourceDocument {
  uploadedByPersonName: string | null
}

export interface LibraryListData {
  categories: string[]
  configMessage: string | null
  configured: boolean
  documents: LibraryDocumentListItem[]
  filters: LibraryListFilters
}

function toResourceDocument(row: ResourceDocumentRow): ResourceDocument {
  return {
    id: row.id,
    name: row.name,
    fileUrl: row.file_url,
    fileType: row.file_type,
    projectId: row.project_id,
    category: row.category,
    description: row.description,
    uploadedByPersonId: row.uploaded_by_person_id,
    createdAt: row.created_at,
  }
}

function matchesFilters(
  row: ResourceDocumentRow,
  filters: LibraryListFilters,
): boolean {
  const query = filters.query?.trim().toLowerCase()

  if (filters.category && row.category !== filters.category) {
    return false
  }

  if (query) {
    const haystacks = [row.name, row.category ?? "", row.description ?? ""]
    return haystacks.some((value) => value.toLowerCase().includes(query))
  }

  return true
}

export async function listLibraryDocuments(
  filters: LibraryListFilters = {},
): Promise<LibraryListData> {
  const status = getDatabaseStatus()
  const client = createServerSupabaseClient()

  if (!client) {
    return {
      categories: [],
      configMessage: status.message,
      configured: status.configured,
      documents: [],
      filters,
    }
  }

  const { data, error } = await client
    .from("resource_documents")
    .select(
      "id, name, file_url, file_type, project_id, category, description, uploaded_by_person_id, created_at",
    )
    .is("project_id", null)
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  const rows = ((data ?? []) as ResourceDocumentRow[]).filter((row) =>
    matchesFilters(row, filters),
  )
  const categories = Array.from(
    new Set(
      ((data ?? []) as ResourceDocumentRow[])
        .map((row) => row.category)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right))
  const uploaderIds = rows
    .map((row) => row.uploaded_by_person_id)
    .filter((value): value is string => Boolean(value))
  const uploaders = await fetchPeopleRows([...new Set(uploaderIds)])
  const uploadersById = new Map(uploaders.map((person) => [person.id, person]))

  return {
    categories,
    configMessage: status.message,
    configured: status.configured,
    documents: rows.map((row) => ({
      ...toResourceDocument(row),
      uploadedByPersonName: row.uploaded_by_person_id
        ? uploadersById.get(row.uploaded_by_person_id)?.full_name ?? null
        : null,
    })),
    filters,
  }
}
