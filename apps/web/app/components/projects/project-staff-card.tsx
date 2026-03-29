"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { PeopleOptionRow, ProjectStaffPerson } from "@mandala/db";

import { personPickToSelectOption } from "../people/person-pick-select-option";
import { EntityReturnLink } from "../entity-return-link";
import { SelectDropdownField } from "../ui/dropdown";
import { Avatar } from "./project-detail-utils";
import { ProjectCardHeader } from "./project-card-header";

interface ProjectStaffCardProps {
  addStaffAction: (input: {
    personId: string;
    projectId: string;
  }) => Promise<{ error: string | null; ok: boolean }>;
  canAssignPeople: boolean;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PeopleOptionRow[];
  }>;
  projectId: string;
  staffedPeople: ProjectStaffPerson[];
}

export function ProjectStaffCard({
  addStaffAction,
  canAssignPeople,
  loadPeopleOptionsAction,
  projectId,
  staffedPeople,
}: ProjectStaffCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [peopleOptions, setPeopleOptions] = useState<PeopleOptionRow[]>([]);
  const [peopleOptionsStatus, setPeopleOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const sortedStaffedPeople = useMemo(
    () =>
      [...staffedPeople].sort(
        (left, right) =>
          Number(right.hasAssignment) - Number(left.hasAssignment) ||
          Number(right.hasTrackedTime) - Number(left.hasTrackedTime) ||
          left.personName.localeCompare(right.personName),
      ),
    [staffedPeople],
  );

  async function ensurePeopleOptions() {
    if (peopleOptionsStatus === "ready" || peopleOptionsStatus === "loading") {
      return;
    }

    setPeopleOptionsStatus("loading");

    try {
      const result = await loadPeopleOptionsAction();
      setPeopleOptions(result.people);
      setPeopleOptionsStatus(
        result.forbidden ? "unavailable" : "ready",
      );
    } catch {
      setPeopleOptionsStatus("error");
    }
  }

  return (
    <section className="pd-card">
      <ProjectCardHeader
        addAriaLabel="Add staff"
        onAddClick={
          canAssignPeople
            ? () => {
                setShowAdd((value) => {
                  const nextValue = !value;

                  if (nextValue) {
                    void ensurePeopleOptions();
                  }

                  return nextValue;
                });
              }
            : undefined
        }
        title="Staff"
      />

      {showAdd && canAssignPeople ? (
        <form
          className="pd-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const personId = String(formData.get("personId") ?? "");

            if (!personId) {
              setFormError("Select a person to add.");
              return;
            }

            setFormError(null);
            startTransition(async () => {
              const result = await addStaffAction({
                personId,
                projectId,
              });
              if (!result.ok) {
                setFormError(result.error ?? "Unable to add staff.");
                return;
              }

              setShowAdd(false);
              router.refresh();
            });
          }}
        >
          <SelectDropdownField
            ariaLabel="Person"
            disabled={peopleOptionsStatus !== "ready"}
            name="personId"
            options={peopleOptions.map((person) => personPickToSelectOption(person))}
            placeholder="Select person"
          />
          <button
            className="pd-primary-button"
            disabled={isPending || peopleOptionsStatus !== "ready"}
            type="submit"
          >
            Add staff
          </button>
        </form>
      ) : null}

      {formError ? <p className="pd-form-error">{formError}</p> : null}

      {sortedStaffedPeople.length === 0 ? <p className="pd-empty">No staffed people yet.</p> : null}
      <div className="pd-pill-wrap">
        {sortedStaffedPeople.map((staffedPerson) => (
          <EntityReturnLink
            className="pd-staff-pill entity-content-link"
            href={`/people/${staffedPerson.personId}`}
            key={staffedPerson.personId}
            scope="people"
          >
            <Avatar
              fallbackKey={staffedPerson.personId}
              label={staffedPerson.personName}
              photoUrl={staffedPerson.personPhotoUrl}
            />
            <strong>{staffedPerson.personTitle ?? "Staff"}:</strong>
            <span className="entity-content-link-label">{staffedPerson.personName}</span>
          </EntityReturnLink>
        ))}
      </div>
    </section>
  );
}
