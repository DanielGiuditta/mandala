"use client";

import { SelectDropdownField } from "../components/ui/dropdown";

interface LibraryFiltersFormProps {
  categories: string[];
  category: string;
  query: string;
}

export function LibraryFiltersForm({
  categories,
  category,
  query,
}: LibraryFiltersFormProps) {
  return (
    <form className="stack" method="get">
      <div className="filters">
        <label>
          Search
          <input
            defaultValue={query}
            name="q"
            placeholder="Document name or category"
            type="search"
          />
        </label>

        <label>
          Category
          <SelectDropdownField
            ariaLabel="Category"
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

      <div className="button-row">
        <button type="submit">Apply filters</button>
        <a className="secondary" href="/library">
          Reset
        </a>
      </div>
    </form>
  );
}
