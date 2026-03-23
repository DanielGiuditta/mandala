"use client";

import { useId, useMemo, useState } from "react";

import type { ProjectStage } from "@mandala/domain";

import { ProjectPhotoInput } from "./project-photo-input";
import type {
  CreateProjectFormInput,
  CreateProjectPayload,
  ProjectCreateLeadOption,
  ProjectCreateOfficeOption,
} from "./project-create-types";
import {
  formatProjectStageLabel,
  mapCreateProjectPayload,
  PROJECT_CREATE_STAGE_OPTIONS,
  readFileAsDataUrl,
} from "./project-create-utils";

interface ProjectCreateFormProps {
  hasLeadOptionGap: boolean;
  leadOptions: ProjectCreateLeadOption[];
  officeOptions: ProjectCreateOfficeOption[];
  onCancel: () => void;
  onSave: (submission: {
    formInput: CreateProjectFormInput;
    payload: CreateProjectPayload;
  }) => Promise<void> | void;
}

const DEFAULT_FORM_INPUT: CreateProjectFormInput = {
  clientName: "",
  description: "",
  leadPersonId: "",
  name: "",
  officeId: "",
  photoFile: null,
  photoUrl: null,
  stage: "proposal",
  startDate: null,
  targetCompletionDate: null,
};

export function ProjectCreateForm({
  hasLeadOptionGap,
  leadOptions,
  officeOptions,
  onCancel,
  onSave,
}: ProjectCreateFormProps) {
  const nameInputId = useId();
  const clientInputId = useId();
  const descriptionInputId = useId();
  const officeInputId = useId();
  const leadInputId = useId();
  const startDateInputId = useId();
  const completionDateInputId = useId();
  const stageInputId = useId();
  const photoInputId = useId();
  const [form, setForm] = useState<CreateProjectFormInput>(DEFAULT_FORM_INPUT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const requiredFieldMessage = useMemo(() => {
    const errors: string[] = [];

    if (!form.name.trim()) {
      errors.push("Name is required.");
    }

    if (!form.officeId) {
      errors.push("Office is required.");
    }

    return errors.length > 0 ? errors.join(" ") : null;
  }, [form.name, form.officeId]);

  function updateField<K extends keyof CreateProjectFormInput>(
    key: K,
    value: CreateProjectFormInput[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage(null);

    if (requiredFieldMessage) {
      return;
    }

    const nextInput: CreateProjectFormInput = {
      ...form,
      name: form.name.trim(),
    };

    try {
      setIsSubmitting(true);

      if (nextInput.photoFile) {
        nextInput.photoUrl = await readFileAsDataUrl(nextInput.photoFile);
      }

      const payload = mapCreateProjectPayload(nextInput);
      await onSave({ formInput: nextInput, payload });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save project. Please try again.";
      setSubmitMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="project-create-form" onSubmit={handleSubmit}>
      <div className="project-create-name-photo-row">
        <label className="project-create-field">
          <span className="project-create-label">Name</span>
          <input
            autoFocus
            className="project-create-text-input"
            id={nameInputId}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Add a comment..."
            required
            type="text"
            value={form.name}
          />
        </label>
        <div className="project-create-photo-block">
          <label className="project-create-label" htmlFor={photoInputId}>
            Photo
          </label>
          <ProjectPhotoInput
            inputId={photoInputId}
            onPhotoChange={(file) => updateField("photoFile", file)}
            photoFile={form.photoFile ?? null}
            projectName={form.name}
          />
        </div>
      </div>

      <label className="project-create-field" htmlFor={clientInputId}>
        <span className="project-create-label">Client</span>
        <input
          className="project-create-text-input"
          id={clientInputId}
          onChange={(event) => updateField("clientName", event.target.value)}
          placeholder="Add a comment..."
          type="text"
          value={form.clientName ?? ""}
        />
      </label>

      <label className="project-create-field" htmlFor={descriptionInputId}>
        <span className="project-create-label">Description</span>
        <textarea
          className="project-create-textarea-input"
          id={descriptionInputId}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Add a comment..."
          rows={2}
          value={form.description ?? ""}
        />
      </label>

      <label className="project-create-field" htmlFor={officeInputId}>
        <span className="project-create-label">Office</span>
        <span className="project-create-select-wrap">
          <select
            className="project-create-select-input"
            id={officeInputId}
            onChange={(event) => updateField("officeId", event.target.value)}
            required
            value={form.officeId}
          >
            <option value="">Select office...</option>
            {officeOptions.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
          <span aria-hidden className="project-create-select-chevron">
            v
          </span>
        </span>
      </label>

      <label className="project-create-field" htmlFor={leadInputId}>
        <span className="project-create-label">Lead</span>
        <span className="project-create-select-wrap">
          <select
            className="project-create-select-input"
            id={leadInputId}
            onChange={(event) =>
              updateField("leadPersonId", event.target.value)
            }
            value={form.leadPersonId ?? ""}
          >
            <option value="">Select lead...</option>
            {leadOptions.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.fullName}
              </option>
            ))}
          </select>
          <span aria-hidden className="project-create-select-chevron">
            v
          </span>
        </span>
      </label>

      <div className="project-create-dates-stage-row">
        <label className="project-create-field" htmlFor={startDateInputId}>
          <span className="project-create-label">Start Date</span>
          <span className="project-create-pill-field">
            <input
              className="project-create-date-input"
              id={startDateInputId}
              onChange={(event) =>
                updateField("startDate", event.target.value || null)
              }
              type="date"
              value={form.startDate ?? ""}
            />
            <span aria-hidden className="project-create-pill-icon">
              v
            </span>
          </span>
        </label>

        <label className="project-create-field" htmlFor={completionDateInputId}>
          <span className="project-create-label">Completion</span>
          <span className="project-create-pill-field">
            <input
              className="project-create-date-input"
              id={completionDateInputId}
              onChange={(event) =>
                updateField("targetCompletionDate", event.target.value || null)
              }
              type="date"
              value={form.targetCompletionDate ?? ""}
            />
            <span aria-hidden className="project-create-pill-icon">
              v
            </span>
          </span>
        </label>

        <label className="project-create-field" htmlFor={stageInputId}>
          <span className="project-create-label">Stage</span>
          <span className="project-create-pill-field project-create-stage-pill">
            <select
              className="project-create-stage-select"
              id={stageInputId}
              onChange={(event) =>
                updateField("stage", event.target.value as ProjectStage)
              }
              value={form.stage}
            >
              {PROJECT_CREATE_STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {formatProjectStageLabel(stage)}
                </option>
              ))}
            </select>
            <span aria-hidden className="project-create-pill-icon">
              v
            </span>
          </span>
        </label>
      </div>

      {requiredFieldMessage ? (
        <p className="project-create-message project-create-message-error">
          {requiredFieldMessage}
        </p>
      ) : null}

      {hasLeadOptionGap ? (
        <p className="project-create-message">
          Lead options are unavailable for the current viewer/data contract on
          this route.
        </p>
      ) : null}

      {submitMessage ? (
        <p className="project-create-message">{submitMessage}</p>
      ) : null}

      <div className="project-create-actions">
        <button
          className="project-create-cancel-button"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="project-create-save-button"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
