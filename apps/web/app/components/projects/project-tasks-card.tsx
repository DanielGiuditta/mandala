"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { PeopleOptionRow, ProjectChecklistItem } from "@mandala/db";

import { personPickToSelectOption } from "../people/person-pick-select-option";
import { EditableEntityPill } from "../editable-entity-pill";
import { EntityReturnLink } from "../entity-return-link";
import { SelectDropdownField } from "../ui/dropdown";
import { Avatar } from "./project-detail-utils";
import { ProjectCardHeader } from "./project-card-header";

interface ProjectTasksCardProps {
  addTaskAction: (input: {
    assignedPersonId?: string | null;
    projectId: string;
    title: string;
  }) => Promise<{ error: string | null; ok: boolean }>;
  canEditChecklistItems: boolean;
  checklistItems: ProjectChecklistItem[];
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PeopleOptionRow[];
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
  canEditChecklistItems,
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
  const [peopleOptions, setPeopleOptions] = useState<PeopleOptionRow[]>([]);
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
        onAddClick={
          canEditChecklistItems
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
        title="Tasks"
      />

      {showAdd && canEditChecklistItems ? (
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
          <SelectDropdownField
            ariaLabel="Task assignee"
            disabled={peopleOptionsStatus === "loading"}
            name="assignedPersonId"
            options={[
              { label: "Unassigned", value: "" },
              ...peopleOptions.map((person) => personPickToSelectOption(person)),
            ]}
            placeholder="Unassigned"
          />
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
                    <SelectDropdownField
                      ariaLabel="Task assignee"
                      defaultValue={item.assignedPersonId ?? ""}
                      disabled={peopleOptionsStatus === "loading"}
                      name="assignedPersonId"
                      options={[
                        { label: "Unassigned", value: "" },
                        ...peopleOptions.map((person) => personPickToSelectOption(person)),
                      ]}
                      placeholder="Unassigned"
                    />
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
                      {canEditChecklistItems ? (
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
                      ) : (
                        <span
                          aria-hidden
                          className={`pd-check pd-check-static ${item.completed ? "pd-check-complete" : ""}`}
                        />
                      )}
                      <div>
                        <h4 className={item.completed ? "pd-list-item-title-complete" : ""}>{item.title}</h4>
                        <p className="pd-meta-text">
                          {item.assignedPersonId && item.assignedPersonName ? (
                            <EntityReturnLink
                              className="entity-inline-text-link"
                              href={`/people/${item.assignedPersonId}`}
                              scope="people"
                            >
                              {item.assignedPersonName}
                            </EntityReturnLink>
                          ) : (
                            "Unassigned"
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="pd-list-item-aside">
                      {canEditChecklistItems ? (
                        <EditableEntityPill
                          ariaLabel={`Change assignee for ${item.title}`}
                          onCommit={async (nextValue) => {
                            const result = await updateTaskAction({
                              assignedPersonId: nextValue || null,
                              checklistItemId: item.id,
                              projectId,
                            });

                            if (!result.ok) {
                              throw new Error(result.error ?? "Unable to update task.");
                            }
                          }}
                          onOpenRequested={ensurePeopleOptions}
                          options={[
                            { label: "Unassigned", value: "" },
                            ...peopleOptions.map((person) => personPickToSelectOption(person)),
                          ]}
                          value={item.assignedPersonId ?? ""}
                          renderTrigger={({ toggleButton }) => {
                            const assigneeContent = (
                              <>
                                <Avatar
                                  fallbackKey={item.assignedPersonId ?? item.id}
                                  label={item.assignedPersonName ?? "Unassigned"}
                                  photoUrl={item.assignedPersonPhotoUrl}
                                />
                                <span className="entity-content-link-label">
                                  {item.assignedPersonName ?? "Unassigned"}
                                </span>
                              </>
                            );

                            return (
                              <span className="pd-person-chip">
                                {item.assignedPersonId ? (
                                  <EntityReturnLink
                                    className="entity-content-link entity-content-link-grow"
                                    href={`/people/${item.assignedPersonId}`}
                                    scope="people"
                                  >
                                    {assigneeContent}
                                  </EntityReturnLink>
                                ) : (
                                  assigneeContent
                                )}
                                {toggleButton}
                              </span>
                            );
                          }}
                        />
                      ) : item.assignedPersonId && item.assignedPersonName ? (
                        <EntityReturnLink
                          className="pd-person-chip entity-content-link"
                          href={`/people/${item.assignedPersonId}`}
                          scope="people"
                        >
                          <Avatar
                            fallbackKey={item.assignedPersonId ?? item.id}
                            label={item.assignedPersonName}
                            photoUrl={item.assignedPersonPhotoUrl}
                          />
                          <span className="entity-content-link-label">
                            {item.assignedPersonName}
                          </span>
                        </EntityReturnLink>
                      ) : null}
                      {canEditChecklistItems ? (
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
                      ) : null}
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
