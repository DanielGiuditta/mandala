"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type { LibraryListData } from "@mandala/db"

interface ResourcesListFiltersProps {
  filters: LibraryListData["filters"]
  forbidden: boolean
}

export function ResourcesListFilters({
  filters,
  forbidden,
}: ResourcesListFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(filters.query ?? "")

  useEffect(() => {
    setQuery(filters.query ?? "")
  }, [filters.query])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (query.trim()) {
        params.set("q", query.trim())
      } else {
        params.delete("q")
      }

      params.delete("category")

      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }, 180)

    return () => window.clearTimeout(handle)
  }, [pathname, query, router, searchParams])

  if (forbidden) {
    return null
  }

  return (
    <div className="resources-filter-form">
      <div className="resources-filter-grid">
        <input
          aria-label="Search resources"
          className="resources-search-input"
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by resource, project, category, or description"
          type="search"
          value={query}
        />
      </div>
    </div>
  )
}
