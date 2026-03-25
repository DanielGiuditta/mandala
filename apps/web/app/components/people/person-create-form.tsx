"use client";

import { useId, useMemo, useState } from "react";

import { readFileAsDataUrl } from "../projects/project-create-utils";
import { PersonPhotoInput } from "./person-photo-input";
import type {
  PersonCreateFormInput,
  PersonCreateOfficeOption,
  PersonCreatePayload,
  PersonCreateSupervisorOption,
} from "./person-create-types";
import {
  formatCreatePersonPermissionLabel,
  mapCreatePersonPayload,
  PERSON_CREATE_PERMISSION_OPTIONS,
} from "./person-create-utils";

interface PersonCreateFormProps {
  hasSupervisorOptionGap: boolean;
  officeOptions: PersonCreateOfficeOption[];
  onCancel: () => void;
  onSave: (submission: {
    formInput: PersonCreateFormInput;
    payload: PersonCreatePayload;
  }) => Promise<void> | void;
  supervisorOptions: PersonCreateSupervisorOption[];
  titleSuggestions: string[];
}

export function PersonCreateForm({
  hasSupervisorOptionGap,
  officeOptions,
  onCancel,
  onSave,
  supervisorOptions,
  titleSuggestions,
}: PersonCreateFormProps) {
  const nameInputId = useId();
  const emailInputId = useId();
  const salaryInputId = useId();
  const supervisorInputId = useId();
  const permissionInputId = useId();
  const roleInputId = useId();
  const officeInputId = useId();
  const photoInputId = useId();
  const roleSuggestionsId = useId();
  const [form, setForm] = useState<PersonCreateFormInput>({
    annualSalary: "",
    email: "",
    fullName: "",
    officeId: officeOptions.length === 1 ? officeOptions[0].id : "",
    permission: "employee",
    photoFile: null,
    photoUrl: null,
    supervisorPersonId: "",
    title: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const requiredFieldMessage = useMemo(() => {
    const errors: string[] = [];
    const salaryNumber = Number(form.annualSalary);

    if (!form.fullName.trim()) {
      errors.push("Name is required.");
    }

    if (!form.officeId) {
      errors.push("Office is required.");
    }

    if (!form.annualSalary.trim()) {
      errors.push("Salary per year is required.");
    } else if (!Number.isFinite(salaryNumber) || salaryNumber < 0) {
      errors.push("Salary per year must be a valid amount.");
    }

    if (form.permission !== "noAccount" && !form.email.trim()) {
      errors.push("Email is required when creating an account.");
    }

    return errors.length > 0 ? errors.join(" ") : null;
  }, [form.annualSalary, form.email, form.fullName, form.officeId, form.permission]);

  function updateField<K extends keyof PersonCreateFormInput>(
    key: K,
    value: PersonCreateFormInput[K],
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

    const nextInput: PersonCreateFormInput = {
      ...form,
      email: form.email.trim(),
      fullName: form.fullName.trim(),
      title: form.title.trim(),
    };

    try {
      setIsSubmitting(true);

      if (nextInput.photoFile) {
        nextInput.photoUrl = await readFileAsDataUrl(nextInput.photoFile);
      }

      const payload = mapCreatePersonPayload(nextInput);
      await onSave({ formInput: nextInput, payload });
    } catch (error) {
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : "Unable to save person. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="project-create-form" onSubmit={handleSubmit}>
      <div className="project-create-name-photo-row">
        <label className="project-create-field" htmlFor={nameInputId}>
          <span className="project-create-label">Name</span>
          <input
            autoFocus
            className="project-create-text-input"
            id={nameInputId}
            onChange={(event) => updateField("fullName", event.target.value)}
            placeholder="Add a comment..."
            required
            type="text"
            value={form.fullName}
          />
        </label>

        <div className="project-create-photo-block">
          <label className="project-create-label" htmlFor={photoInputId}>
            Photo
          </label>
          <PersonPhotoInput
            inputId={photoInputId}
            onPhotoChange={(file) => updateField("photoFile", file)}
            personName={form.fullName}
            photoFile={form.photoFile}
          />
        </div>
      </div>

      <label className="project-create-field" htmlFor={emailInputId}>
        <span className="project-create-label">Email</span>
        <input
          className="project-create-text-input"
          id={emailInputId}
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="Add a comment..."
          type="email"
          value={form.email}
        />
      </label>

      <label className="project-create-field" htmlFor={salaryInputId}>
        <span className="project-create-label">Salary per year</span>
        <input
          className="project-create-text-input"
          id={salaryInputId}
          inputMode="decimal"
          min="0"
          onChange={(event) => updateField("annualSalary", event.target.value)}
          placeholder="Add a comment..."
          required
          step="0.01"
          type="number"
          value={form.annualSalary}
        />
      </label>

      <label className="project-create-field" htmlFor={supervisorInputId}>
        <span className="project-create-label">Supervisor</span>
        <span className="project-create-select-wrap">
          <select
            className="project-create-select-input"
            id={supervisorInputId}
            onChange={(event) =>
              updateField("supervisorPersonId", event.target.value)
            }
            value={form.supervisorPersonId}
          >
            <option value="">Select supervisor...</option>
            {supervisorOptions.map((supervisor) => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.fullName}
              </option>
            ))}
          </select>
          <span aria-hidden className="project-create-select-chevron">
            v
          </span>
        </span>
      </label>

      <div className="project-create-dates-stage-row">
        <label className="project-create-field" htmlFor={permissionInputId}>
          <span className="project-create-label">Permission</span>
          <span className="project-create-pill-field project-create-stage-pill">
            <select
              className="project-create-stage-select"
              id={permissionInputId}
              onChange={(event) =>
                updateField("permission", event.target.value as PersonCreateFormInput["permission"])
              }
              value={form.permission}
            >
              {PERSON_CREATE_PERMISSION_OPTIONS.map((permission) => (
                <option key={permission.value} value={permission.value}>
                  {permission.label}
                </option>
              ))}
            </select>
            <span aria-hidden className="project-create-pill-icon">
              v
            </span>
          </span>
        </label>

        <label className="project-create-field" htmlFor={roleInputId}>
          <span className="project-create-label">Role</span>
          <span className="project-create-select-wrap">
            <input
              className="project-create-select-input"
              id={roleInputId}
              list={roleSuggestionsId}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Architect"
              type="text"
              value={form.title}
            />
            <span aria-hidden className="project-create-select-chevron">
              v
            </span>
          </span>
          {titleSuggestions.length > 0 ? (
            <datalist id={roleSuggestionsId}>
              {titleSuggestions.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
          ) : null}
        </label>

        <label className="project-create-field" htmlFor={officeInputId}>
          <span className="project-create-label">Office</span>
          <span className="project-create-pill-field project-create-stage-pill">
            <select
              className="project-create-stage-select"
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

      {hasSupervisorOptionGap ? (
        <p className="project-create-message">
          Supervisor options are unavailable for the current viewer/data contract on this route.
        </p>
      ) : null}

      {form.permission !== "noAccount" ? (
        <p className="project-create-message">
          {formatCreatePersonPermissionLabel(form.permission)} creates a login-linked app account record. Supabase auth invite/onboarding is still separate.
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
