import {
  listLibraryDocuments,
  type LibraryListData,
  type LibraryListFilters,
  type ViewerRequestContext,
} from "@mandala/db"
import { unstable_cache } from "next/cache"

const LIBRARY_TAG = "library"
const LIBRARY_REVALIDATE_SECONDS = 15

function normalizeFilterValue(value?: string | null): string {
  return value?.trim().toLowerCase() ?? ""
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
  return unstable_cache(
    async () => listLibraryDocuments(filters, context),
    [
      "library-list",
      getViewerCacheKey(context),
      normalizeFilterValue(filters.query),
    ],
    {
      revalidate: LIBRARY_REVALIDATE_SECONDS,
      tags: [LIBRARY_TAG],
    },
  )()
}
