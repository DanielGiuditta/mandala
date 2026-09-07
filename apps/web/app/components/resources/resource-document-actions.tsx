"use client"

import { useState } from "react"
import { isApprovedLanFilePath } from "../../../lib/lan-file-links"

interface ResourceDocumentActionsProps {
  resourceId?: string
  fileUrl?: string | null
  serverPath?: string | null
}

function serverPathToFileUrl(serverPath: string): string {
  const parts = serverPath.replace(/^\\\\/, "").split("\\")
  const server = parts.shift() ?? ""
  return `file://${server}/${parts.map((part) => encodeURIComponent(part)).join("/")}`
}

export function ResourceDocumentActions({
  resourceId,
  fileUrl,
  serverPath,
}: ResourceDocumentActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  if (serverPath) {
    const originalAllowed = process.env.NEXT_PUBLIC_LAN_PREVIEWS_ENABLED !== "true" || isApprovedLanFilePath(serverPath)
    return (
      <span className="resource-document-actions">
        {resourceId && process.env.NEXT_PUBLIC_LAN_PREVIEWS_ENABLED === "true" ? (
          <a className="resource-document-action" href={`/resources/${resourceId}/preview`} rel="noreferrer" target="_blank">
            Preview
          </a>
        ) : null}
        {originalAllowed ? <><a
          className="resource-document-action"
          href={serverPathToFileUrl(serverPath)}
          rel="noreferrer"
          target="_blank"
        >
          Open file
        </a>
        <button
          className="resource-document-action resource-document-action-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(serverPath)
              setCopyState("copied")
            } catch {
              setCopyState("failed")
            }
          }}
          type="button"
        >
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy path"}
        </button></> : <span className="pd-meta-text">Original file location needs IT approval.</span>}
      </span>
    )
  }

  return fileUrl ? (
    <a className="resource-document-action" href={fileUrl} rel="noreferrer" target="_blank">
      Open resource
    </a>
  ) : null
}
