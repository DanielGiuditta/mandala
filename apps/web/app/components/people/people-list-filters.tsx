"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { PeopleListData } from "@mandala/db";

interface PeopleListFiltersProps {
  filters: PeopleListData["filters"];
  forbidden: boolean;
}

export function PeopleListFilters({
  filters,
  forbidden,
}: PeopleListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(filters.query ?? "");
  useEffect(() => {
    setQuery(filters.query ?? "");
  }, [filters.query]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (query.trim()) {
        params.set("q", query.trim());
      } else {
        params.delete("q");
      }

      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }, 180);

    return () => window.clearTimeout(handle);
  }, [pathname, query, router, searchParams]);

  if (forbidden) {
    return null;
  }

  return (
    <div className="people-filter-form">
      <div className="people-filter-grid">
        <label className="people-filter-field">
          <input
            aria-label="Search people"
            className="people-search-input"
            name="q"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, title, or email"
            type="search"
            value={query}
          />
        </label>
      </div>
    </div>
  );
}
