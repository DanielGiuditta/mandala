"use client";

import { useId, useMemo, useState } from "react";

import { SelectDropdownField } from "../ui/dropdown";
import { readFileAsDataUrl } from "../projects/project-create-utils";
import { PersonPhotoInput } from "./person-photo-input";
import type {
  PersonCreateFormInput,
  PersonCreateMode,
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
  initialFormInput?: PersonCreateFormInput;
  mode?: PersonCreateMode;
  officeOptions: PersonCreateOfficeOption[];
  onCancel: () => void;
  onSave: (submission: {
    formInput: PersonCreateFormInput;
    payload: PersonCreatePayload;
  }) => Promise<void> | void;
  supervisorOptions: PersonCreateSupervisorOption[];
  titleSuggestions: string[];
}

function getDefaultFormInput(
  officeOptions: PersonCreateOfficeOption[],
  initialFormInput?: PersonCreateFormInput,
): PersonCreateFormInput {
  if (initialFormInput) {
    return initialFormInput;
  }

  return {
    annualSalary: "",
    email: "",
    fullName: "",
    officeId: officeOptions.length === 1 ? officeOptions[0].id : "",
    permission: "employee",
    photoFile: null,
    photoUrl: null,
    supervisorPersonId: "",
    title: "",
  };
}

export function PersonCreateForm({
  hasSupervisorOptionGap,
  initialFormInput,
  mode = "create",
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
  const [form, setForm] = useState<PersonCreateFormInput>(() =>
    getDefaultFormInput(officeOptions, initialFormInput),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const permissionOptions = useMemo(
    () =>
      PERSON_CREATE_PERMISSION_OPTIONS.map((permission) => ({
        description:
          permission.value === "partner"
            ? "Full power over the entire system"
            : permission.value === "admin"
              ? "Admin power over scoped offices"
              : permission.value === "employee"
                ? "Can add tasks and resources on assigned projects"
                : "Person record only, without app login",
        label: permission.label,
        value: permission.value,
      })),
    [],
  );
  const supervisorSelectOptions = useMemo(
    () => supervisorOptions.map((supervisor) => ({ label: supervisor.fullName, value: supervisor.id })),
    [supervisorOptions],
  );
  const officeSelectOptions = useMemo(
    () => officeOptions.map((office) => ({ label: office.name, value: office.id })),
    [officeOptions],
  );

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
            photoUrl={form.photoUrl}
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
        <SelectDropdownField
          ariaLabel="Supervisor"
          options={supervisorSelectOptions}
          placeholder="Select supervisor..."
          value={form.supervisorPersonId}
          onValueChange={(nextValue) => updateField("supervisorPersonId", nextValue)}
        />
      </label>

      <div className="project-create-dates-stage-row">
        <label className="project-create-field" htmlFor={permissionInputId}>
          <span className="project-create-label">Permission</span>
          <SelectDropdownField
            ariaLabel="Permission"
            options={permissionOptions}
            placeholder="Select permission..."
            value={form.permission}
            onValueChange={(nextValue) =>
              updateField("permission", nextValue as PersonCreateFormInput["permission"])
            }
          />
        </label>

        <label className="project-create-field" htmlFor={roleInputId}>
          <span className="project-create-label">Role</span>
          <span className="app-native-input-wrap">
            <input
              className="app-native-text-input"
              id={roleInputId}
              list={roleSuggestionsId}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Architect"
              type="text"
              value={form.title}
            />
            <span aria-hidden className="app-native-input-chevron">
              ˅
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
          <SelectDropdownField
            ariaLabel="Office"
            options={officeSelectOptions}
            placeholder="Select office..."
            value={form.officeId}
            onValueChange={(nextValue) => updateField("officeId", nextValue)}
          />
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
          {formatCreatePersonPermissionLabel(form.permission)} sends an invite email so the person
          can set a password and join with this record.
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
