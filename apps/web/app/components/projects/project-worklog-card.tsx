"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { ProjectAssignmentItem, ProjectTimeSummary } from "@mandala/db";

import { SelectDropdownField } from "../ui/dropdown";
import {
  Avatar,
  formatCostMetric,
  formatHoursMetric,
} from "./project-detail-utils";
import { ProjectCardHeader } from "./project-card-header";

interface ProjectWorklogCardProps {
  editWorklogAction: (input: {
    assignmentId?: string | null;
    date?: string;
    hours?: number;
    notes?: string | null;
    projectId: string;
    timeEntryId: string;
  }) => Promise<{ error: string | null; ok: boolean }>;
  projectId: string;
  staffing: ProjectAssignmentItem[];
  timeSummary: ProjectTimeSummary;
}

export function ProjectWorklogCard({
  editWorklogAction,
  projectId,
  staffing,
  timeSummary,
}: ProjectWorklogCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const assignmentOptions = useMemo(
    () =>
      [...staffing].sort(
        (left, right) =>
          Number(right.active) - Number(left.active) ||
          left.personName.localeCompare(right.personName),
      ),
    [staffing],
  );

  return (
    <section className="pd-card">
      <ProjectCardHeader title="Log" />

      {timeSummary.recentEntries.length === 0 ? (
        <p className="pd-empty">No worklog entries yet.</p>
      ) : (
        <div className="pd-list">
          {timeSummary.recentEntries.map((entry) => {
            const isEditing = editingEntryId === entry.id;

            return (
              <article className="pd-list-item" key={entry.id}>
                {isEditing ? (
                  <form
                    className="pd-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const date = String(formData.get("date") ?? "");
                      const hours = Number(formData.get("hours") ?? "");
                      const notes = String(formData.get("notes") ?? "").trim();
                      const assignmentId = String(formData.get("assignmentId") ?? "");

                      if (!Number.isFinite(hours) || hours < 0) {
                        setFormError("Hours must be 0 or greater.");
                        return;
                      }

                      setFormError(null);
                      startTransition(async () => {
                        const result = await editWorklogAction({
                          assignmentId: assignmentId || null,
                          date: date || undefined,
                          hours,
                          notes: notes || null,
                          projectId,
                          timeEntryId: entry.id,
                        });
                        if (!result.ok) {
                          setFormError(result.error ?? "Unable to update entry.");
                          return;
                        }

                        setEditingEntryId(null);
                        router.refresh();
                      });
                    }}
                  >
                    <span className="app-native-input-wrap">
                      <input className="app-date-input" defaultValue={entry.date} name="date" required type="date" />
                      <span aria-hidden className="app-native-input-chevron">
                        ˅
                      </span>
                    </span>
                    <input defaultValue={entry.hours} min={0} name="hours" required step={0.1} type="number" />
                    <input defaultValue={entry.notes ?? ""} name="notes" placeholder="Notes" type="text" />
                    <SelectDropdownField
                      ariaLabel="Assignment"
                      defaultValue={entry.assignmentId ?? ""}
                      name="assignmentId"
                      options={[
                        { label: "No assignment", value: "" },
                        ...assignmentOptions.map((assignment) => ({
                          label: assignment.personName,
                          description: `${assignment.personTitle ? `${assignment.personTitle} · ` : ""}${formatHoursMetric(assignment.assignedHoursPerWeek)} hrs/week`,
                          value: assignment.id,
                        })),
                      ]}
                      placeholder="No assignment"
                    />
                    <div className="pd-inline-form-actions">
                      <button className="pd-primary-button" disabled={isPending} type="submit">
                        Save
                      </button>
                      <button className="pd-secondary-button" onClick={() => setEditingEntryId(null)} type="button">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="pd-list-item-main pd-list-item-main-column">
                      <p>
                        Total Cost: <strong>{formatCostMetric(entry.laborCost)}</strong> Hours:{" "}
                        <strong>{formatHoursMetric(entry.hours)}</strong>
                      </p>
                    </div>
                    <div className="pd-list-item-aside">
                      <span className="pd-person-chip">
                        <Avatar
                          fallbackKey={entry.personId}
                          label={entry.personName ?? "Unknown person"}
                          photoUrl={entry.personPhotoUrl}
                        />
                        <span>
                          {entry.personTitle
                            ? `${entry.personTitle}: ${entry.personName ?? "Unknown person"}`
                            : (entry.personName ?? "Unknown person")}
                        </span>
                      </span>
                      <button className="pd-text-button" onClick={() => setEditingEntryId(entry.id)} type="button">
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
          <article className="pd-list-item pd-log-total-row">
            <p>
              Total Cost: <strong>{formatCostMetric(timeSummary.totalLaborCost)}</strong> Total Hours:{" "}
              <strong>{formatHoursMetric(timeSummary.totalHours)}</strong>
            </p>
          </article>
        </div>
      )}

      {formError ? <p className="pd-form-error">{formError}</p> : null}
    </section>
  );
}
