"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import type { CreateProjectInput } from "@mandala/db";

import type {
  ProjectCreateLeadOption,
  ProjectCreateOfficeOption,
} from "./project-create-types";
import { ProjectAddButton } from "./project-add-button";
import { ProjectCreateForm } from "./project-create-form";

interface ProjectCreateModalProps {
  leadOptions: ProjectCreateLeadOption[];
  leadOptionsUnavailable: boolean;
  officeOptions: ProjectCreateOfficeOption[];
  onCreateProjectAction: (
    input: CreateProjectInput,
  ) => Promise<{ projectId: string }>;
}

export function ProjectCreateModal({
  leadOptions,
  leadOptionsUnavailable,
  officeOptions,
  onCreateProjectAction,
}: ProjectCreateModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <ProjectAddButton onClick={() => setIsOpen(true)} />

      {isOpen ? (
        <div
          className="project-create-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="project-create-modal"
            role="dialog"
          >
            <header className="project-create-modal-header">
              <h3 id={titleId}>Add Project</h3>
              <button
                aria-label="Close add project modal"
                className="project-create-close-button"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                x
              </button>
            </header>

            <ProjectCreateForm
              hasLeadOptionGap={leadOptionsUnavailable}
              leadOptions={leadOptions}
              officeOptions={officeOptions}
              onCancel={() => setIsOpen(false)}
              onSave={async ({ payload }) => {
                await onCreateProjectAction(payload);
                setIsOpen(false);
                router.refresh();
              }}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
