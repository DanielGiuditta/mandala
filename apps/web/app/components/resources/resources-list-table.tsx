"use client"

import { useMemo, useState } from "react"

import type { LibraryDocumentListItem } from "@mandala/db"

import { EntityReturnLink } from "../entity-return-link"
import { TokenIcon } from "../ui/token-icon"
import {
  getFallbackAvatarInitial,
  getProjectFallbackAvatarStyle,
} from "../projects/project-avatar-utils"
import { ResourceDocumentIcon } from "./resource-document-icon"
import { ResourceDocumentActions } from "./resource-document-actions"

interface ResourcesListTableProps {
  configured: boolean
  documents: LibraryDocumentListItem[]
  forbidden: boolean
}

type SortKey = "resource" | "project" | "category" | "type" | "uploadedBy" | "created"
type SortDirection = "asc" | "desc"

const RESOURCE_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "resource", label: "Resource" },
  { key: "project", label: "Project" },
  { key: "category", label: "Category" },
  { key: "type", label: "Type" },
  { key: "uploadedBy", label: "Uploaded by" },
  { key: "created", label: "Created" },
]

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value))
}

function formatProjectLabel(document: LibraryDocumentListItem): string {
  return document.projectName ?? "Shared library"
}

export function ResourcesListTable({
  configured,
  documents,
  forbidden,
}: ResourcesListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("created")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [hasUserSorted, setHasUserSorted] = useState(false)

  function toggleSort(nextKey: SortKey) {
    setHasUserSorted(true)

    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(nextKey)
    setSortDirection(nextKey === "created" ? "desc" : "asc")
  }

  function HeaderLabel({ label, value }: { label: string; value: SortKey }) {
    const isActive = hasUserSorted && sortKey === value
    const directionLabel =
      (sortKey === value ? sortDirection : value === "created" ? "desc" : "asc") === "desc"
        ? "descending"
        : "ascending"
    const iconClassName = `resources-sort-icon ${
      isActive
        ? sortDirection === "desc"
          ? "resources-sort-icon-desc"
          : "resources-sort-icon-asc"
        : ""
    }`

    return (
      <button
        aria-label={`Sort by ${label}, ${directionLabel}`}
        className="resources-column-button"
        onClick={() => toggleSort(value)}
        type="button"
      >
        <span className="resources-column-label">{label}</span>
        <TokenIcon className={iconClassName} src="/figma/projects/sort-icon.svg" />
      </button>
    )
  }

  const sortedDocuments = useMemo(() => {
    const items = [...documents]
    const direction = sortDirection === "asc" ? 1 : -1

    function compareText(left: string, right: string): number {
      return left.localeCompare(right, undefined, { sensitivity: "base" })
    }

    function compareDate(left: string, right: string): number {
      return new Date(left).getTime() - new Date(right).getTime()
    }

    items.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case "resource":
          result = compareText(left.name, right.name)
          break
        case "project":
          result = compareText(formatProjectLabel(left), formatProjectLabel(right))
          break
        case "category":
          result = compareText(left.category ?? "", right.category ?? "")
          break
        case "type":
          result = compareText(left.fileType ?? "", right.fileType ?? "")
          break
        case "uploadedBy":
          result = compareText(
            left.uploadedByPersonName ?? "",
            right.uploadedByPersonName ?? "",
          )
          break
        case "created":
          result = compareDate(left.createdAt, right.createdAt)
          break
      }

      if (result !== 0) {
        return result * direction
      }

      return compareText(left.name, right.name) * direction
    })

    return items
  }, [documents, sortDirection, sortKey])

  return (
    <div className="resources-list">
      {!forbidden ? (
        <div className="resources-list-columns">
          {RESOURCE_COLUMNS.map((column) => (
            <div className="resources-column-cell" key={column.key}>
              <HeaderLabel label={column.label} value={column.key} />
            </div>
          ))}
        </div>
      ) : null}

      {forbidden ? (
        <div className="resources-list-empty">
          Resources are available to internal users only.
        </div>
      ) : documents.length === 0 ? (
        <div className="resources-list-empty">
          {configured
            ? "No resources match the current filters."
            : "Configure the database connection to load resources."}
        </div>
      ) : (
        sortedDocuments.map((document, index) => (
          <article
            className={`resources-list-row ${index % 2 === 0 ? "resources-list-row-light" : "resources-list-row-base"}`}
            key={document.id}
          >
            <div className="resources-cell resources-cell-document">
              <div className="resources-document-link">
                <ResourceDocumentIcon fileType={document.fileType} />
                <span className="resources-document-copy">
                  <span className="resources-cell-value resources-document-name">
                    {document.name}
                  </span>
                  {document.description ? (
                    <span className="resources-document-description">
                      {document.description}
                    </span>
                  ) : null}
                </span>
                <ResourceDocumentActions
                  fileUrl={document.fileUrl}
                  serverPath={document.serverPath}
                />
              </div>
            </div>

            <div className="resources-cell resources-cell-project">
              {document.projectId && document.projectName ? (
                <EntityReturnLink
                  className="people-project-chip entity-content-link"
                  href={`/projects/${document.projectId}`}
                  scope="projects"
                >
                  {document.projectPhotoUrl ? (
                    <img
                      alt=""
                      aria-hidden
                      className="people-project-chip-avatar"
                      loading="lazy"
                      src={document.projectPhotoUrl}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="people-project-chip-fallback"
                      style={getProjectFallbackAvatarStyle(
                        document.projectName,
                        document.projectId,
                      )}
                    >
                      {getFallbackAvatarInitial(document.projectName)}
                    </span>
                  )}
                  <span className="people-cell-value entity-content-link-label">
                    {document.projectName}
                  </span>
                </EntityReturnLink>
              ) : (
                <span className="resources-library-pill">
                  <span className="resources-cell-value">Shared library</span>
                </span>
              )}
            </div>

            <div className="resources-cell">
              <span className="resources-value-pill">
                <span className="resources-cell-value">
                  {document.category ?? "Uncategorized"}
                </span>
              </span>
            </div>

            <div className="resources-cell">
              <span className="resources-value-pill">
                <span className="resources-cell-value">
                  {document.fileType ?? "Unknown type"}
                </span>
              </span>
            </div>

            <div className="resources-cell">
              <span className="resources-cell-value">
                {document.uploadedByPersonName ?? "Unknown uploader"}
              </span>
            </div>

            <div className="resources-cell resources-cell-created">
              <span className="resources-cell-value resources-created-at">
                {formatCreatedAt(document.createdAt)}
              </span>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
