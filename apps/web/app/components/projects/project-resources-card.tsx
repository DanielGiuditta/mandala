"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ProjectDocumentItem } from "@mandala/db";

import { ResourceDocumentIcon } from "../resources/resource-document-icon";
import { ResourceDocumentActions } from "../resources/resource-document-actions";
import { formatDateTime } from "./project-detail-utils";
import { ProjectCardHeader } from "./project-card-header";

interface ProjectResourcesCardProps {
  addResourceAction: (input: {
    category?: string | null;
    description?: string | null;
    fileType?: string | null;
    fileUrl?: string | null;
    name: string;
    projectId: string;
    serverPath?: string | null;
  }) => Promise<{ error: string | null; ok: boolean }>;
  documents: ProjectDocumentItem[];
  canAddResources: boolean;
  projectId: string;
}

export function ProjectResourcesCard({
  addResourceAction,
  canAddResources,
  documents,
  projectId,
}: ProjectResourcesCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const visibleDocuments = showAll ? documents : documents.slice(0, 3);

  return (
    <section className="pd-card">
      <ProjectCardHeader
        addAriaLabel="Add resource"
        addDisabled={!canAddResources}
        onAddClick={canAddResources ? () => setShowAdd((value) => !value) : undefined}
        title="Resources"
      />

      {showAdd ? (
        <form
          className="pd-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const name = String(formData.get("name") ?? "").trim();
            const fileUrl = String(formData.get("fileUrl") ?? "").trim();
            const serverPath = String(formData.get("serverPath") ?? "").trim();
            const fileType = String(formData.get("fileType") ?? "").trim();
            const category = String(formData.get("category") ?? "").trim();
            const description = String(formData.get("description") ?? "").trim();

            if (!name || (Boolean(fileUrl) === Boolean(serverPath))) {
              setFormError("Name and exactly one URL or LAN server path are required.");
              return;
            }

            setFormError(null);
            startTransition(async () => {
              const result = await addResourceAction({
                category: category || null,
                description: description || null,
                fileType: fileType || null,
                fileUrl,
                name,
                projectId,
                serverPath,
              });
              if (!result.ok) {
                setFormError(result.error ?? "Unable to add resource.");
                return;
              }

              setShowAdd(false);
              router.refresh();
            });
          }}
        >
          <input name="name" placeholder="Resource name" required type="text" />
          <input name="fileUrl" placeholder="HTTPS URL (optional)" type="text" />
          <input name="serverPath" placeholder="\\\\Server\\Share\\Folder\\File.ext (optional)" type="text" />
          <input name="fileType" placeholder="File type (optional)" type="text" />
          <input name="category" placeholder="Category (optional)" type="text" />
          <input name="description" placeholder="Description (optional)" type="text" />
          <button className="pd-primary-button" disabled={isPending} type="submit">
            Add resource
          </button>
        </form>
      ) : null}

      {formError ? <p className="pd-form-error">{formError}</p> : null}

      <div className="pd-list">
        {visibleDocuments.length === 0 ? (
          <p className="pd-empty">No resources yet.</p>
        ) : (
          visibleDocuments.map((document) => (
            <article className="pd-list-item" key={document.id}>
              <div className="pd-list-item-main">
                <ResourceDocumentIcon fileType={document.fileType} />
                <div className="pd-list-item-main-column">
                  {document.fileUrl ? (
                    <a className="pd-link" href={document.fileUrl} rel="noreferrer" target="_blank">
                      {document.name}
                    </a>
                  ) : (
                    <span className="pd-link">{document.name}</span>
                  )}
                  <ResourceDocumentActions
                    fileUrl={document.fileUrl}
                    serverPath={document.serverPath}
                  />
                  <p className="pd-meta-text">
                    {document.fileType ?? "Unknown type"} · {document.category ?? "Uncategorized"}
                  </p>
                </div>
              </div>
              <div className="pd-list-item-aside">
                <span className="pd-meta-text">{formatDateTime(document.createdAt)}</span>
              </div>
            </article>
          ))
        )}
      </div>

      {documents.length > 3 ? (
        <button className="pd-text-button" onClick={() => setShowAll((value) => !value)} type="button">
          {showAll ? "Show less" : "See more"}
        </button>
      ) : null}
    </section>
  );
}
