import {
  listLibraryDocuments,
  type LibraryListData,
  type LibraryListFilters,
  type ViewerRequestContext,
} from "@mandala/db"
import { unstable_cache } from "next/cache"

const LIBRARY_TAG = "library"
const LIBRARY_REVALIDATE_SECONDS = 300

function filterLibraryDocuments(
  data: LibraryListData,
  filters: LibraryListFilters,
): LibraryListData {
  const query = filters.query?.trim().toLowerCase()

  return {
    ...data,
    filters,
    documents: data.documents.filter((document) =>
      !query || [
        document.name,
        document.category ?? "",
        document.description ?? "",
        document.fileType ?? "",
        document.serverPath ?? "",
        document.projectName ?? "",
      ].some((value) => value.toLowerCase().includes(query)),
    ),
  }
}

function getViewerCacheKey(context: ViewerRequestContext): string {
  return context.sessionEmail?.trim().toLowerCase() ?? "anonymous"
}

export function getLibraryTag(): string {
  return LIBRARY_TAG
}

export async function getCachedLibraryDocuments(
  filters: LibraryListFilters,
  context: ViewerRequestContext,
): Promise<LibraryListData> {
  const data = await unstable_cache(
    async () => listLibraryDocuments({}, context),
    ["library-list", getViewerCacheKey(context)],
    {
      revalidate: LIBRARY_REVALIDATE_SECONDS,
      tags: [LIBRARY_TAG],
    },
  )()

  return filterLibraryDocuments(data, filters)
}
