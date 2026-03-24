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
  loadLeadOptionsAction: () => Promise<{
    forbidden: boolean;
    people: ProjectCreateLeadOption[];
  }>;
  officeOptions: ProjectCreateOfficeOption[];
  onCreateProjectAction: (
    input: CreateProjectInput,
  ) => Promise<{ projectId: string }>;
}

export function ProjectCreateModal({
  loadLeadOptionsAction,
  officeOptions,
  onCreateProjectAction,
}: ProjectCreateModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [leadOptions, setLeadOptions] = useState<ProjectCreateLeadOption[]>([]);
  const [leadOptionsUnavailable, setLeadOptionsUnavailable] = useState(false);
  const [leadOptionsStatus, setLeadOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
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

  useEffect(() => {
    if (!isOpen || leadOptionsStatus !== "idle") {
      return;
    }

    let isCancelled = false;

    setLeadOptionsStatus("loading");
    void loadLeadOptionsAction()
      .then((result) => {
        if (isCancelled) {
          return;
        }

        setLeadOptions(result.people);
        setLeadOptionsUnavailable(result.forbidden);
        setLeadOptionsStatus("ready");
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setLeadOptions([]);
        setLeadOptionsUnavailable(true);
        setLeadOptionsStatus("error");
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, leadOptionsStatus, loadLeadOptionsAction]);

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
              hasLeadOptionGap={
                leadOptionsUnavailable || leadOptionsStatus === "error"
              }
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
