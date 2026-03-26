"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { ProjectStaffPerson } from "@mandala/db";

import { SelectDropdownField } from "../ui/dropdown";
import { Avatar } from "./project-detail-utils";
import { ProjectCardHeader } from "./project-card-header";

interface ProjectStaffCardProps {
  addStaffAction: (input: {
    personId: string;
    projectId: string;
  }) => Promise<{ error: string | null; ok: boolean }>;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  projectId: string;
  staffedPeople: ProjectStaffPerson[];
}

export function ProjectStaffCard({
  addStaffAction,
  loadPeopleOptionsAction,
  projectId,
  staffedPeople,
}: ProjectStaffCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [peopleOptions, setPeopleOptions] = useState<Array<{ fullName: string; id: string }>>([]);
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
        onAddClick={() => {
          setShowAdd((value) => {
            const nextValue = !value;

            if (nextValue) {
              void ensurePeopleOptions();
            }

            return nextValue;
          });
        }}
        title="Staff"
      />

      {showAdd ? (
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
            options={peopleOptions.map((person) => ({ label: person.fullName, value: person.id }))}
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
          <article className="pd-staff-pill" key={staffedPerson.personId}>
            <Avatar
              fallbackKey={staffedPerson.personId}
              label={staffedPerson.personName}
              photoUrl={staffedPerson.personPhotoUrl}
            />
            <strong>{staffedPerson.personTitle ?? "Staff"}:</strong>
            <span>{staffedPerson.personName}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
