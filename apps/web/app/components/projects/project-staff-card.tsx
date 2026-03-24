"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { ProjectAssignmentItem } from "@mandala/db";

import { Avatar } from "./project-detail-utils";
import { ProjectCardHeader } from "./project-card-header";

interface ProjectStaffCardProps {
  addStaffAction: (input: {
    assignedHoursPerWeek: number;
    endDate?: string | null;
    notes?: string | null;
    personId: string;
    projectId: string;
    startDate?: string | null;
  }) => Promise<{ error: string | null; ok: boolean }>;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  projectId: string;
  staffing: ProjectAssignmentItem[];
}

export function ProjectStaffCard({
  addStaffAction,
  loadPeopleOptionsAction,
  projectId,
  staffing,
}: ProjectStaffCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [peopleOptions, setPeopleOptions] = useState<Array<{ fullName: string; id: string }>>([]);
  const [peopleOptionsStatus, setPeopleOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const sortedStaffing = useMemo(
    () =>
      [...staffing].sort(
        (left, right) => Number(right.active) - Number(left.active) || left.personName.localeCompare(right.personName),
      ),
    [staffing],
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
        addAriaLabel="Add staff assignment"
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
            const assignedHoursPerWeek = Number(formData.get("assignedHoursPerWeek") ?? "");
            const startDate = String(formData.get("startDate") ?? "");
            const endDate = String(formData.get("endDate") ?? "");
            const notes = String(formData.get("notes") ?? "").trim();

            if (!personId || !Number.isFinite(assignedHoursPerWeek) || assignedHoursPerWeek <= 0) {
              setFormError("Select a person and assign positive weekly hours.");
              return;
            }

            setFormError(null);
            startTransition(async () => {
              const result = await addStaffAction({
                assignedHoursPerWeek,
                endDate: endDate || null,
                notes: notes || null,
                personId,
                projectId,
                startDate: startDate || null,
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
          <select
            aria-label="Person"
            disabled={peopleOptionsStatus !== "ready"}
            name="personId"
            required
          >
            <option value="">Select person</option>
            {peopleOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </select>
          <input min={0.1} name="assignedHoursPerWeek" placeholder="Hours/week" required step={0.1} type="number" />
          <input name="startDate" type="date" />
          <input name="endDate" type="date" />
          <input name="notes" placeholder="Notes (optional)" type="text" />
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

      {sortedStaffing.length === 0 ? <p className="pd-empty">No staffing assignments yet.</p> : null}
      <div className="pd-pill-wrap">
        {sortedStaffing.map((assignment) => (
          <article className="pd-staff-pill" key={assignment.id}>
            <Avatar
              fallbackKey={assignment.personId}
              label={assignment.personName}
              photoUrl={assignment.personPhotoUrl}
            />
            <strong>{assignment.personTitle ?? "Staff"}:</strong>
            <span>{assignment.personName}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
