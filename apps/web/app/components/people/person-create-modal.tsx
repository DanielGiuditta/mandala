"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import type { CreatePersonInput } from "@mandala/db";

import { PeopleAddButton } from "./people-add-button";
import { PersonCreateForm } from "./person-create-form";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";

interface PersonCreateModalProps {
  disabled?: boolean;
  disabledReason?: string;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  officeOptions: PersonCreateOfficeOption[];
  onCreatePersonAction: (
    input: CreatePersonInput,
  ) => Promise<{ personId: string }>;
  titleSuggestions: string[];
}

export function PersonCreateModal({
  disabled = false,
  disabledReason,
  loadSupervisorOptionsAction,
  officeOptions,
  onCreatePersonAction,
  titleSuggestions,
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
      <PeopleAddButton
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        title={disabledReason}
      />

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
              <h3 id={titleId}>Add Person</h3>
              <button
                aria-label="Close add person modal"
                className="project-create-close-button"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                x
              </button>
            </header>

            <PersonCreateForm
              hasSupervisorOptionGap={
                supervisorOptionsUnavailable ||
                supervisorOptionsStatus === "error"
              }
              officeOptions={officeOptions}
              onCancel={() => setIsOpen(false)}
              onSave={async ({ payload }) => {
                await onCreatePersonAction(payload);
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
