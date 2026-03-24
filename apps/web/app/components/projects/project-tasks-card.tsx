"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { ProjectChecklistItem } from "@mandala/db";

import { Avatar } from "./project-detail-utils";
import { ProjectCardHeader } from "./project-card-header";

interface ProjectTasksCardProps {
  addTaskAction: (input: {
    assignedPersonId?: string | null;
    projectId: string;
    title: string;
  }) => Promise<{ error: string | null; ok: boolean }>;
  checklistItems: ProjectChecklistItem[];
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  projectId: string;
  updateTaskAction: (input: {
    assignedPersonId?: string | null;
    checklistItemId: string;
    completed?: boolean;
    projectId: string;
    title?: string;
  }) => Promise<{ error: string | null; ok: boolean }>;
}

export function ProjectTasksCard({
  addTaskAction,
  checklistItems,
  loadPeopleOptionsAction,
  projectId,
  updateTaskAction,
}: ProjectTasksCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [peopleOptions, setPeopleOptions] = useState<Array<{ fullName: string; id: string }>>([]);
  const [peopleOptionsStatus, setPeopleOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");

  const sortedItems = useMemo(
    () =>
      [...checklistItems].sort(
        (left, right) =>
          Number(left.completed) - Number(right.completed) ||
          left.createdAt.localeCompare(right.createdAt),
      ),
    [checklistItems],
  );
  const visibleItems = showAll ? sortedItems : sortedItems.slice(0, 2);

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

  function runAction(action: () => Promise<{ error: string | null; ok: boolean }>) {
    setFormError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFormError(result.error ?? "Unable to save task.");
        return;
      }

      setShowAdd(false);
      setEditingItemId(null);
      router.refresh();
    });
  }

  return (
    <section className="pd-card">
      <ProjectCardHeader
        addAriaLabel="Add task"
        onAddClick={() => {
          setShowAdd((value) => {
            const nextValue = !value;

            if (nextValue) {
              void ensurePeopleOptions();
            }

            return nextValue;
          });
        }}
        title="Tasks"
      />

      {showAdd ? (
        <form
          className="pd-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const title = String(formData.get("title") ?? "").trim();
            const assignedPersonId = String(formData.get("assignedPersonId") ?? "");

            if (!title) {
              setFormError("Task title is required.");
              return;
            }

            runAction(() =>
              addTaskAction({
                assignedPersonId: assignedPersonId || null,
                projectId,
                title,
              }),
            );
          }}
        >
          <input aria-label="Task title" name="title" placeholder="Task title" required type="text" />
          <select
            aria-label="Task assignee"
            disabled={peopleOptionsStatus === "loading"}
            name="assignedPersonId"
          >
            <option value="">Unassigned</option>
            {peopleOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </select>
          <button className="pd-primary-button" disabled={isPending} type="submit">
            Add task
          </button>
        </form>
      ) : null}

      {formError ? <p className="pd-form-error">{formError}</p> : null}

      <div className="pd-list">
        {visibleItems.length === 0 ? (
          <p className="pd-empty">No checklist items yet.</p>
        ) : (
          visibleItems.map((item) => {
            const isEditing = editingItemId === item.id;

            return (
              <article className="pd-list-item" key={item.id}>
                {isEditing ? (
                  <form
                    className="pd-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const title = String(formData.get("title") ?? "").trim();
                      const assignedPersonId = String(formData.get("assignedPersonId") ?? "");
                      const completed = Boolean(formData.get("completed"));

                      if (!title) {
                        setFormError("Task title is required.");
                        return;
                      }

                      runAction(() =>
                        updateTaskAction({
                          assignedPersonId: assignedPersonId || null,
                          checklistItemId: item.id,
                          completed,
                          projectId,
                          title,
                        }),
                      );
                    }}
                  >
                      <input defaultValue={item.title} name="title" required type="text" />
                    <select
                      defaultValue={item.assignedPersonId ?? ""}
                      disabled={peopleOptionsStatus === "loading"}
                      name="assignedPersonId"
                    >
                      <option value="">Unassigned</option>
                      {peopleOptions.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                    </select>
                    <label className="pd-check-label">
                      <input defaultChecked={item.completed} name="completed" type="checkbox" />
                      Completed
                    </label>
                    <div className="pd-inline-form-actions">
                      <button className="pd-primary-button" disabled={isPending} type="submit">
                        Save
                      </button>
                      <button className="pd-secondary-button" onClick={() => setEditingItemId(null)} type="button">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="pd-list-item-main">
                      <button
                        aria-label={item.completed ? "Mark task incomplete" : "Mark task complete"}
                        className={`pd-check ${item.completed ? "pd-check-complete" : ""}`}
                        onClick={() =>
                          runAction(() =>
                            updateTaskAction({
                              checklistItemId: item.id,
                              completed: !item.completed,
                              projectId,
                            }),
                          )
                        }
                        type="button"
                      />
                      <div>
                        <h4 className={item.completed ? "pd-list-item-title-complete" : ""}>{item.title}</h4>
                        <p className="pd-meta-text">
                          {item.assignedPersonName ?? "Unassigned"}
                        </p>
                      </div>
                    </div>
                    <div className="pd-list-item-aside">
                      {item.assignedPersonName ? (
                        <span className="pd-person-chip">
                          <Avatar
                            fallbackKey={item.assignedPersonId ?? item.id}
                            label={item.assignedPersonName}
                            photoUrl={item.assignedPersonPhotoUrl}
                          />
                          <span>{item.assignedPersonName}</span>
                        </span>
                      ) : null}
                      <button
                        className="pd-text-button"
                        onClick={() => {
                          void ensurePeopleOptions();
                          setEditingItemId(item.id);
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })
        )}
      </div>

      {sortedItems.length > 2 ? (
        <button className="pd-text-button" onClick={() => setShowAll((value) => !value)} type="button">
          {showAll ? "Show less" : "See more"}
        </button>
      ) : null}
    </section>
  );
}
