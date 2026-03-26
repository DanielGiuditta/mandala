"use client"

import Link from "next/link"

import { SelectDropdownField } from "../components/ui/dropdown"

interface LibraryFiltersFormProps {
  categories: string[]
  category: string
  query: string
}

export function LibraryFiltersForm({
  categories,
  category,
  query,
}: LibraryFiltersFormProps) {
  return (
    <form className="ui-stack" method="get">
      <div className="ui-filter-grid">
        <label className="ui-field">
          <span className="ui-label">Search</span>
          <input
            className="ui-input"
            defaultValue={query}
            name="q"
            placeholder="Document name or category"
            type="search"
          />
        </label>

        <label className="ui-field">
          <span className="ui-label">Category</span>
          <SelectDropdownField
            ariaLabel="Category"
            className="ui-select-field"
            defaultValue={category}
            name="category"
            options={[
              { label: "All categories", value: "" },
              ...categories.map((entry) => ({ label: entry, value: entry })),
            ]}
            placeholder="All categories"
          />
        </label>
      </div>

      <div className="ui-actions">
        <button className="ui-button ui-button-primary" type="submit">
          Apply filters
        </button>
        <Link className="ui-button ui-button-secondary" href="/library">
          Reset
        </Link>
      </div>
    </form>
  )
}
