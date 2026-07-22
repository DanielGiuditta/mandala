"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { ProjectAssignmentItem, ProjectTimeSummary } from "@mandala/db";

import { EntityReturnLink } from "../entity-return-link";
import { SelectDropdownField } from "../ui/dropdown";
import {
  Avatar,
  formatDate,
  formatCostMetric,
  formatHoursMetric,
} from "./project-detail-utils";

interface ProjectWorklogCardProps {
  canEditWorklog: boolean;
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
  canEditWorklog,
  projectId,
  staffing,
  timeSummary,
}: ProjectWorklogCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showRowEditControls, setShowRowEditControls] = useState(false);
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
      <div className="pd-card-header">
        <h3 className="pd-card-title">Work log</h3>
        {canEditWorklog ? <button
          aria-label={showRowEditControls ? "Hide row edit controls" : "Show row edit controls"}
          className={`pd-icon-button pd-icon-button-edit${showRowEditControls ? " pd-icon-button-edit-active" : ""}`}
          onClick={() => {
            setShowRowEditControls((current) => {
              const next = !current;
              if (!next) {
                setEditingEntryId(null);
              }
              return next;
            });
          }}
          type="button"
        >
          <svg aria-hidden className="pd-icon-button-edit-icon" viewBox="0 0 24 24">
            <path
              d="M15.77 3.3a2.06 2.06 0 0 1 2.92 0l2 2a2.06 2.06 0 0 1 0 2.92l-9.9 9.9a1 1 0 0 1-.43.25l-4 1.07a1 1 0 0 1-1.22-1.23l1.07-4a1 1 0 0 1 .25-.42l9.31-9.31Zm1.5 1.41L8.1 13.9l-.72 2.68 2.68-.72 9.22-9.22a.06.06 0 0 0 0-.09l-2-2a.06.06 0 0 0-.09 0Z"
              fill="currentColor"
            />
          </svg>
        </button> : null}
      </div>

      <div className="pd-log-summary">
        <div>
          <span className="pd-meta-label">Total hours</span>
          <strong>{`${formatHoursMetric(timeSummary.totalHours)}h`}</strong>
        </div>
        <div>
          <span className="pd-meta-label">Total labor cost</span>
          <strong>{formatCostMetric(timeSummary.totalLaborCost)}</strong>
        </div>
      </div>

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
                    <div className="pd-list-item-main">
                      {entry.personId ? (
                        <EntityReturnLink
                          className="pd-person-chip entity-content-link"
                          href={`/people/${entry.personId}`}
                          scope="people"
                        >
                          <Avatar
                            fallbackKey={entry.personId}
                            label={entry.personName ?? "Unknown person"}
                            photoUrl={entry.personPhotoUrl}
                          />
                          <span className="entity-content-link-label">
                            {entry.personName ?? "Unknown person"}
                          </span>
                        </EntityReturnLink>
                      ) : (
                        <span className="pd-person-chip">
                          <Avatar
                            fallbackKey={entry.personId}
                            label={entry.personName ?? "Unknown person"}
                            photoUrl={entry.personPhotoUrl}
                          />
                          <span>{entry.personName ?? "Unknown person"}</span>
                        </span>
                      )}
                    </div>
                    <div className="pd-list-item-aside">
                      <p className="pd-meta-text">
                        {formatDate(entry.date)} · {`${formatHoursMetric(entry.hours)}h`} · {formatCostMetric(entry.laborCost)}
                      </p>
                      {canEditWorklog && showRowEditControls ? (
                        <button className="pd-text-button" onClick={() => setEditingEntryId(entry.id)} type="button">
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {formError ? <p className="pd-form-error">{formError}</p> : null}
    </section>
  );
}
