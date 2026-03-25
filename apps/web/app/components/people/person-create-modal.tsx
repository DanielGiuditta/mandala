"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import type { CreatePersonInput, UpdatePersonInput } from "@mandala/db";

import { CloseButtonIcon } from "../close-button-icon";
import { EntityEditButton } from "../entity-edit-button";
import { PeopleAddButton } from "./people-add-button";
import { PersonCreateForm } from "./person-create-form";
import type {
  PersonCreateFormInput,
  PersonCreateMode,
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";

interface PersonCreateModalProps {
  disabled?: boolean;
  disabledReason?: string;
  initialFormInput?: PersonCreateFormInput;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  mode?: PersonCreateMode;
  officeOptions: PersonCreateOfficeOption[];
  onCreatePersonAction?: (
    input: CreatePersonInput,
  ) => Promise<{ personId: string }>;
  onResendPersonAccountEmailAction?: (
    input: { personId: string },
  ) => Promise<{ message: string }>;
  onUpdatePersonAction?: (
    input: UpdatePersonInput,
  ) => Promise<{ personId: string }>;
  personId?: string;
  titleSuggestions: string[];
  trigger?: "add" | "edit";
}

export function PersonCreateModal({
  disabled = false,
  disabledReason,
  initialFormInput,
  loadSupervisorOptionsAction,
  mode = "create",
  officeOptions,
  onCreatePersonAction,
  onResendPersonAccountEmailAction,
  onUpdatePersonAction,
  personId,
  titleSuggestions,
  trigger = "add",
}: PersonCreateModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [supervisorOptions, setSupervisorOptions] = useState<
    PersonCreateSupervisorOption[]
  >([]);
  const [supervisorOptionsUnavailable, setSupervisorOptionsUnavailable] =
    useState(false);
  const [supervisorOptionsStatus, setSupervisorOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const router = useRouter();
  const titleId = useId();
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
    if (!isOpen || supervisorOptionsStatus !== "idle") {
      return;
    }

    let isCancelled = false;

    setSupervisorOptionsStatus("loading");
    void loadSupervisorOptionsAction()
      .then((result) => {
        if (isCancelled) {
          return;
        }

        setSupervisorOptions(result.people);
        setSupervisorOptionsUnavailable(result.forbidden);
        setSupervisorOptionsStatus("ready");
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setSupervisorOptions([]);
        setSupervisorOptionsUnavailable(true);
        setSupervisorOptionsStatus("error");
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, supervisorOptionsStatus, loadSupervisorOptionsAction]);

  return (
    <>
      {trigger === "edit" ? (
        <EntityEditButton
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          title={disabledReason}
        />
      ) : (
        <PeopleAddButton
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
              <h3 id={titleId}>{isEditMode ? "Edit Person" : "Add Person"}</h3>
              <button
                aria-label={isEditMode ? "Close edit person modal" : "Close add person modal"}
                className="app-close-button"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <CloseButtonIcon />
              </button>
            </header>

            <PersonCreateForm
              hasSupervisorOptionGap={
                supervisorOptionsUnavailable ||
                supervisorOptionsStatus === "error"
              }
              initialFormInput={initialFormInput}
              mode={mode}
              officeOptions={officeOptions}
              onCancel={() => setIsOpen(false)}
              onResendAccountEmail={
                isEditMode && personId && onResendPersonAccountEmailAction
                  ? async () => onResendPersonAccountEmailAction({ personId })
                  : undefined
              }
              onSave={async ({ payload }) => {
                if (isEditMode) {
                  if (!personId || !onUpdatePersonAction) {
                    throw new Error("Person edit is unavailable on this route.");
                  }

                  await onUpdatePersonAction({
                    personId,
                    ...payload,
                  });
                } else {
                  if (!onCreatePersonAction) {
                    throw new Error("Person create is unavailable on this route.");
                  }

                  await onCreatePersonAction(payload);
                }

                setIsOpen(false);
                router.refresh();
              }}
              supervisorOptions={supervisorOptions}
              titleSuggestions={titleSuggestions}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
