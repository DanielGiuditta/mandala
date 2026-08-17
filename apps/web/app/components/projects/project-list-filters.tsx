"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type { ProjectListData } from "@mandala/db"

interface ProjectListFiltersProps {
  forbidden: boolean
  filters: ProjectListData["filters"]
}

export function ProjectListFilters({ forbidden, filters }: ProjectListFiltersProps) {
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

      const next = params.toString()
      if (next === searchParams.toString()) {
        return
      }
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }, 180)

    return () => window.clearTimeout(handle)
  }, [pathname, query, router, searchParams])

  if (forbidden) {
    return null
  }

  return (
    <div className="projects-filter-form">
      <div className="projects-filter-grid">
        <input
          aria-label="Search projects"
          className="projects-search-input"
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          type="search"
          value={query}
        />
      </div>
    </div>
  )
}
