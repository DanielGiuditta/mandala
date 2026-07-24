"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import type { CreateProjectInput, UpdateProjectInput } from "@mandala/db";

import { CloseButtonIcon } from "../close-button-icon";
import { EntityEditButton } from "../entity-edit-button";
import { ProjectAddButton } from "./project-add-button";
import { ProjectCreateForm } from "./project-create-form";
import type {
  CreateProjectFormInput,
  ProjectCreateLeadOption,
  ProjectCreateMode,
  ProjectCreateOfficeOption,
} from "./project-create-types";

interface ProjectCreateModalProps {
  canEditLead?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  initialFormInput?: CreateProjectFormInput;
  loadLeadOptionsAction: () => Promise<{
    forbidden: boolean;
    people: ProjectCreateLeadOption[];
  }>;
  mode?: ProjectCreateMode;
  officeOptions: ProjectCreateOfficeOption[];
  onCreateProjectAction?: (
    input: CreateProjectInput,
  ) => Promise<{ projectId: string }>;
  onUpdateProjectAction?: (
    input: UpdateProjectInput,
  ) => Promise<{ projectId: string }>;
  projectId?: string;
  trigger?: "add" | "edit";
}

export function ProjectCreateModal({
  canEditLead = true,
  disabled = false,
  disabledReason,
  initialFormInput,
  loadLeadOptionsAction,
  mode = "create",
  officeOptions,
  onCreateProjectAction,
  onUpdateProjectAction,
  projectId,
  trigger = "add",
}: ProjectCreateModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [leadOptions, setLeadOptions] = useState<ProjectCreateLeadOption[]>([]);
  const [leadOptionsUnavailable, setLeadOptionsUnavailable] = useState(false);
  const [leadOptionsStatus, setLeadOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const titleId = useId();
  const router = useRouter();
  const isEditMode = mode === "edit";

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
    if (isOpen) {
      return;
    }

    setLeadOptions([]);
    setLeadOptionsUnavailable(false);
    setLeadOptionsStatus("idle");
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
        setLeadOptionsStatus(result.forbidden ? "unavailable" : "ready");
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
      {trigger === "edit" ? (
        <EntityEditButton
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          title={disabledReason}
        />
      ) : (
        <ProjectAddButton
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          title={disabledReason}
        />
      )}

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
              <h3 id={titleId}>{isEditMode ? "Edit Project" : "Add Project"}</h3>
              <button
                aria-label={isEditMode ? "Close edit project modal" : "Close add project modal"}
                className="app-close-button"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <CloseButtonIcon />
              </button>
            </header>

            <ProjectCreateForm
              leadFieldDisabled={!canEditLead || leadOptionsStatus !== "ready"}
              leadFieldPlaceholder={
                !canEditLead
                  ? "Only admins and partners can change the lead"
                  : leadOptionsStatus === "loading" || leadOptionsStatus === "idle"
                  ? "Loading leads..."
                  : "Lead options unavailable"
              }
              hasLeadOptionGap={
                canEditLead &&
                (leadOptionsUnavailable ||
                leadOptionsStatus === "unavailable" ||
                leadOptionsStatus === "error")
              }
              initialFormInput={initialFormInput}
              leadOptions={leadOptions}
              mode={mode}
              officeOptions={officeOptions}
              onCancel={() => setIsOpen(false)}
              onSave={async ({ payload }) => {
                if (isEditMode) {
                  if (!projectId || !onUpdateProjectAction) {
                    throw new Error("Project edit is unavailable on this route.");
                  }

                  await onUpdateProjectAction({
                    projectId,
                    ...payload,
                  });
                } else {
                  if (!onCreateProjectAction) {
                    throw new Error("Project create is unavailable on this route.");
                  }

                  await onCreateProjectAction(payload);
                }

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
