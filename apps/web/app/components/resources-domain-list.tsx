import type { LibraryListData } from "@mandala/db"

import { EntityHeader } from "./entity-header"
import { ResourcesListFilters } from "./resources/resources-list-filters"
import { ResourcesListTable } from "./resources/resources-list-table"

interface ResourcesDomainListProps {
  data: LibraryListData
}

export function ResourcesDomainList({ data }: ResourcesDomainListProps) {
  return (
    <section className="resources-domain">
      <EntityHeader className="resources-domain-header" title="Resources" />

      <ResourcesListFilters
        filters={data.filters}
        forbidden={data.forbidden}
      />

      <ResourcesListTable
        configured={data.configured}
        documents={data.documents}
        forbidden={data.forbidden}
      />

      {!data.configured && data.configMessage ? (
        <div className="resources-notice-dock">
          <div className="notice">{data.configMessage}</div>
          {data.accessMessage ? <div className="notice">{data.accessMessage}</div> : null}
        </div>
      ) : data.accessMessage ? (
        <div className="resources-notice-dock">
          <div className="notice">{data.accessMessage}</div>
        </div>
      ) : null}
    </section>
  )
}
