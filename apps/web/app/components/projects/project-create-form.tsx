"use client";

import { useId, useMemo, useState } from "react";

import type { ProjectStage } from "@mandala/domain";

import { NativeDateDropdownField, SelectDropdownField } from "../ui/dropdown";
import { ProjectPhotoInput } from "./project-photo-input";
import type {
  CreateProjectFormInput,
  CreateProjectPayload,
  ProjectCreateMode,
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
  initialFormInput?: CreateProjectFormInput;
  leadFieldDisabled?: boolean;
  leadFieldPlaceholder?: string;
  leadOptions: ProjectCreateLeadOption[];
  mode?: ProjectCreateMode;
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

function getInitialFormInput(
  officeOptions: ProjectCreateOfficeOption[],
  initialFormInput?: CreateProjectFormInput,
): CreateProjectFormInput {
  if (initialFormInput) {
    return initialFormInput;
  }

  return {
    ...DEFAULT_FORM_INPUT,
    officeId: officeOptions.length === 1 ? officeOptions[0].id : "",
  };
}

export function ProjectCreateForm({
  hasLeadOptionGap,
  initialFormInput,
  leadFieldDisabled = false,
  leadFieldPlaceholder = "Select lead...",
  leadOptions,
  mode = "create",
  officeOptions,
  onCancel,
  onSave,
}: ProjectCreateFormProps) {
  const nameInputId = useId();
  const clientInputId = useId();
  const descriptionInputId = useId();
  const startDateInputId = useId();
  const completionDateInputId = useId();
  const photoInputId = useId();
  const [form, setForm] = useState<CreateProjectFormInput>(() =>
    getInitialFormInput(officeOptions, initialFormInput),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const officeSelectOptions = useMemo(
    () => officeOptions.map((office) => ({ label: office.name, value: office.id })),
    [officeOptions],
  );
  const leadSelectOptions = useMemo(
    () => leadOptions.map((lead) => ({ label: lead.fullName, value: lead.id })),
    [leadOptions],
  );
  const stageSelectOptions = useMemo(
    () =>
      PROJECT_CREATE_STAGE_OPTIONS.map((stage) => ({
        label: formatProjectStageLabel(stage),
        value: stage,
      })),
    [],
  );

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
            photoUrl={form.photoUrl ?? null}
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

      <div className="project-create-field">
        <span className="project-create-label">Office</span>
        <SelectDropdownField
          ariaLabel="Office"
          options={officeSelectOptions}
          placeholder="Select office..."
          value={form.officeId}
          onValueChange={(nextValue) => updateField("officeId", nextValue)}
        />
      </div>

      <div className="project-create-field">
        <span className="project-create-label">Lead</span>
        <SelectDropdownField
          ariaLabel="Lead"
          disabled={leadFieldDisabled}
          options={leadSelectOptions}
          placeholder={leadFieldPlaceholder}
          value={form.leadPersonId ?? ""}
          onValueChange={(nextValue) => updateField("leadPersonId", nextValue)}
        />
      </div>

      <div className="project-create-dates-stage-row">
        <label className="project-create-field" htmlFor={startDateInputId}>
          <span className="project-create-label">Start Date</span>
          <NativeDateDropdownField
            ariaLabel="Start Date"
            id={startDateInputId}
            onValueChange={(nextValue) => updateField("startDate", nextValue || null)}
            value={form.startDate ?? ""}
          />
        </label>

        <label className="project-create-field" htmlFor={completionDateInputId}>
          <span className="project-create-label">Completion</span>
          <NativeDateDropdownField
            ariaLabel="Completion Date"
            id={completionDateInputId}
            onValueChange={(nextValue) => updateField("targetCompletionDate", nextValue || null)}
            value={form.targetCompletionDate ?? ""}
          />
        </label>

        <div className="project-create-field">
          <span className="project-create-label">Stage</span>
          <SelectDropdownField
            ariaLabel="Stage"
            options={stageSelectOptions}
            placeholder="Select stage..."
            value={form.stage}
            onValueChange={(nextValue) => updateField("stage", nextValue as ProjectStage)}
          />
        </div>
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
          {isSubmitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Save"}
        </button>
      </div>
    </form>
  );
}
