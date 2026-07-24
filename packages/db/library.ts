import type { ResourceDocument } from "@mandala/domain"
import { canViewInternalProject } from "@mandala/domain"

import {
  canViewerSeeLibrary,
  getCurrentViewerAccess,
  getViewerLabel,
  type ViewerRequestContext,
} from "./auth"
import { fetchPeopleRows, fetchProjectRows } from "./lookups"
import {
  PREVIEW_CONFIG_MESSAGE,
  previewPeople,
  previewProjects,
  previewResourceDocuments,
} from "./previewData"
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer"

interface ResourceDocumentRow {
  id: string
  name: string
  file_url: string | null
  server_path?: string | null
  file_type: string | null
  project_id: string | null
  category: string | null
  description: string | null
  uploaded_by_person_id: string | null
  created_at: string
}

export interface LibraryListFilters {
  query?: string
}

export interface LibraryDocumentListItem extends ResourceDocument {
  projectName: string | null
  projectPhotoUrl: string | null
  uploadedByPersonName: string | null
}

export interface LibraryListData {
  accessMessage: string | null
  configMessage: string | null
  configured: boolean
  documents: LibraryDocumentListItem[]
  filters: LibraryListFilters
  forbidden: boolean
  viewerLabel: string | null
}

function toResourceDocument(row: ResourceDocumentRow): ResourceDocument {
  return {
    id: row.id,
    name: row.name,
    fileUrl: row.file_url,
    serverPath: row.server_path,
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
  projectName?: string | null,
): boolean {
  const query = filters.query?.trim().toLowerCase()

  if (query) {
    const haystacks = [
      row.name,
      row.category ?? "",
      row.description ?? "",
      row.file_type ?? "",
      row.server_path ?? "",
      projectName ?? "",
    ]
    return haystacks.some((value) => value.toLowerCase().includes(query))
  }

  return true
}

function canViewerSeeResourceDocument(
  row: ResourceDocumentRow,
  projectsById: Map<string, { id: string; lead_person_id: string | null; managing_office_id: string }>,
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentViewerAccess>>["viewer"]>,
): boolean {
  if (!row.project_id) {
    return true
  }

  const project = projectsById.get(row.project_id)

  if (!project) {
    return false
  }

  return canViewInternalProject(viewer, {
    id: project.id,
    leadPersonId: project.lead_person_id,
    managingOfficeId: project.managing_office_id,
  })
}

function listPreviewLibraryDocuments(
  filters: LibraryListFilters,
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentViewerAccess>>["viewer"]>,
): LibraryListData {
  const previewProjectsById = new Map(
    previewProjects.map((project) => [project.id, project]),
  )
  const rows = previewResourceDocuments
    .filter((row) => canViewerSeeResourceDocument(row, previewProjectsById, viewer))
    .filter((row) =>
      matchesFilters(
        row,
        filters,
        row.project_id ? previewProjectsById.get(row.project_id)?.name ?? null : null,
      ),
    )
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
  const uploadersById = new Map(previewPeople.map((person) => [person.id, person]))

  return {
    accessMessage: null,
    configMessage: PREVIEW_CONFIG_MESSAGE,
    configured: false,
    documents: rows.map((row) => ({
      ...toResourceDocument(row),
      projectName: row.project_id ? previewProjectsById.get(row.project_id)?.name ?? null : null,
      projectPhotoUrl: row.project_id
        ? previewProjectsById.get(row.project_id)?.photo_url ?? null
        : null,
      uploadedByPersonName: row.uploaded_by_person_id
        ? uploadersById.get(row.uploaded_by_person_id)?.full_name ?? null
        : null,
    })),
    filters,
    forbidden: false,
    viewerLabel: null,
  }
}

export async function listLibraryDocuments(
  filters: LibraryListFilters = {},
  context: ViewerRequestContext = {},
): Promise<LibraryListData> {
  const viewerAccess = await getCurrentViewerAccess(context)
  const viewerLabel = getViewerLabel(viewerAccess.summary)
  const status = getDatabaseStatus()
  const client = status.configured
    ? createServerSupabaseClient({ accessToken: context.accessToken })
    : null

  if (!viewerAccess.viewer || !canViewerSeeLibrary(viewerAccess.viewer)) {
    return {
      accessMessage:
        viewerAccess.accessMessage ?? "Current viewer cannot access resources.",
      configMessage: status.message,
      configured: status.configured,
      documents: [],
      filters,
      forbidden: true,
      viewerLabel,
    }
  }

  const viewer = viewerAccess.viewer

  if (!client) {
    const previewData = listPreviewLibraryDocuments(filters, viewer)

    return {
      ...previewData,
      accessMessage: viewerAccess.accessMessage,
      viewerLabel,
    }
  }

  const { data, error } = await client
    .from("resource_documents")
    .select(
      "id, name, file_url, server_path, file_type, project_id, category, description, uploaded_by_person_id, created_at",
    )
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  const allRows = (data ?? []) as ResourceDocumentRow[]
  const projectIds = allRows
    .map((row) => row.project_id)
    .filter((value): value is string => Boolean(value))
  const projects = await fetchProjectRows([...new Set(projectIds)], { client })
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const rows = allRows
    .filter((row) => canViewerSeeResourceDocument(row, projectsById, viewer))
    .filter((row) =>
      matchesFilters(
        row,
        filters,
        row.project_id ? projectsById.get(row.project_id)?.name ?? null : null,
      ),
    )
  const uploaderIds = rows
    .map((row) => row.uploaded_by_person_id)
    .filter((value): value is string => Boolean(value))
  const uploaders = await fetchPeopleRows([...new Set(uploaderIds)], { client })
  const uploadersById = new Map(uploaders.map((person) => [person.id, person]))

  return {
    accessMessage: viewerAccess.accessMessage,
    configMessage: status.message,
    configured: status.configured,
    documents: rows.map((row) => ({
      ...toResourceDocument(row),
      projectName: row.project_id ? projectsById.get(row.project_id)?.name ?? null : null,
      projectPhotoUrl: row.project_id
        ? projectsById.get(row.project_id)?.photo_url ?? null
        : null,
      uploadedByPersonName: row.uploaded_by_person_id
        ? uploadersById.get(row.uploaded_by_person_id)?.full_name ?? null
        : null,
    })),
    filters,
    forbidden: false,
    viewerLabel,
  }
}
