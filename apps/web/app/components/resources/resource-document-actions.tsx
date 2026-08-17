"use client"

import { useState } from "react"

interface ResourceDocumentActionsProps {
  fileUrl?: string | null
  serverPath?: string | null
}

function serverPathToFileUrl(serverPath: string): string {
  const parts = serverPath.replace(/^\\\\/, "").split("\\")
  const server = parts.shift() ?? ""
  return `file://${server}/${parts.map((part) => encodeURIComponent(part)).join("/")}`
}

export function ResourceDocumentActions({
  fileUrl,
  serverPath,
}: ResourceDocumentActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  if (serverPath) {
    return (
      <span className="resource-document-actions">
        <a
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
        </button>
      </span>
    )
  }

  return fileUrl ? (
    <a className="resource-document-action" href={fileUrl} rel="noreferrer" target="_blank">
      Open resource
    </a>
  ) : null
}
