"use client";

import { useId, useMemo, useState } from "react";

import { SelectDropdownField, SuggestionDropdownField } from "../ui/dropdown";
import { readFileAsDataUrl } from "../projects/project-create-utils";
import { PersonPhotoInput } from "./person-photo-input";
import type {
  PersonCreateFormInput,
  PersonCreateMode,
  PersonCreateOfficeOption,
  PersonCreatePayload,
  PersonCreateSupervisorOption,
} from "./person-create-types";
import { personPickToSelectOption } from "./person-pick-select-option";
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
  onRemove?: () => Promise<void> | void;
  onResendAccountEmail?: () => Promise<{ message?: string } | void> | void;
  onSave: (submission: {
    formInput: PersonCreateFormInput;
    payload: PersonCreatePayload;
  }) => Promise<void> | void;
  removeDisabledReason?: string;
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
  onRemove,
  onResendAccountEmail,
  onSave,
  removeDisabledReason,
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
  const [form, setForm] = useState<PersonCreateFormInput>(() =>
    getDefaultFormInput(officeOptions, initialFormInput),
  );
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingAccountEmail, setIsResendingAccountEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendMessageTone, setResendMessageTone] = useState<"default" | "error">(
    "default",
  );
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const isEditMode = mode === "edit";
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
    () => [
      { label: "No supervisor", value: "" },
      ...supervisorOptions.map((supervisor) => personPickToSelectOption(supervisor)),
    ],
    [supervisorOptions],
  );
  const officeSelectOptions = useMemo(
    () => officeOptions.map((office) => ({ label: office.name, value: office.id })),
    [officeOptions],
  );
  const titleSuggestionOptions = useMemo(
    () => titleSuggestions.map((title) => ({ label: title, value: title })),
    [titleSuggestions],
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
  const canResendAccountEmail = Boolean(
    isEditMode && onResendAccountEmail && form.permission !== "noAccount" && form.email.trim(),
  );
  const canRemove = Boolean(isEditMode && onRemove);
  const isRemoveDisabled = Boolean(removeDisabledReason) || isSubmitting || isRemoving;
  const hasUnsavedAccountInviteChanges = Boolean(
    canResendAccountEmail &&
      initialFormInput &&
      (form.email.trim().toLowerCase() !== initialFormInput.email.trim().toLowerCase() ||
        form.fullName.trim() !== initialFormInput.fullName.trim() ||
        form.permission !== initialFormInput.permission),
  );

  function updateField<K extends keyof PersonCreateFormInput>(
    key: K,
    value: PersonCreateFormInput[K],
  ) {
    setIsConfirmingRemove(false);
    setResendMessage(null);
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleResendAccountEmail() {
    setResendMessage(null);

    if (!onResendAccountEmail || !canResendAccountEmail) {
      return;
    }

    if (hasUnsavedAccountInviteChanges) {
      setResendMessageTone("error");
      setResendMessage("Save name, email, or permission changes before resending the email.");
      return;
    }

    try {
      setIsResendingAccountEmail(true);
      const result = await onResendAccountEmail();

      setResendMessageTone("default");
      setResendMessage(result?.message ?? "Email sent.");
    } catch (error) {
      setResendMessageTone("error");
      setResendMessage(
        error instanceof Error
          ? error.message
          : "Unable to resend the account email. Please try again.",
      );
    } finally {
      setIsResendingAccountEmail(false);
    }
  }

  async function handleRemove() {
    setSubmitMessage(null);

    if (!onRemove) {
      return;
    }

    if (removeDisabledReason) {
      setSubmitMessage(removeDisabledReason);
      return;
    }

    if (!isConfirmingRemove) {
      setIsConfirmingRemove(true);
      setSubmitMessage(
        "Removing this person will disable their account and hide them from active people views. Click Confirm Remove to continue.",
      );
      return;
    }

    try {
      setIsRemoving(true);
      await onRemove();
    } catch (error) {
      setIsConfirmingRemove(false);
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove person. Please try again.",
      );
    } finally {
      setIsRemoving(false);
    }
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
        nextInput.photoUrl = await readFileAsDataUrl(nextInput.photoFile, {
          maxBytes: 80 * 1024,
          maxDimension: 320,
        });
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
        <div className="project-create-inline-input-row">
          <input
            className="project-create-text-input"
            id={emailInputId}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="Add a comment..."
            type="email"
            value={form.email}
          />
          {isEditMode && onResendAccountEmail ? (
            <button
              className="project-create-inline-button"
              disabled={!canResendAccountEmail || hasUnsavedAccountInviteChanges || isSubmitting || isResendingAccountEmail}
              onClick={() => void handleResendAccountEmail()}
              type="button"
            >
              {isResendingAccountEmail ? "Sending..." : "Resend email"}
            </button>
          ) : null}
        </div>
      </label>

      {resendMessage ? (
        <p
          className={`project-create-message${resendMessageTone === "error" ? " project-create-message-error" : ""}`}
        >
          {resendMessage}
        </p>
      ) : null}

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
          id={supervisorInputId}
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
            id={permissionInputId}
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
          <SuggestionDropdownField
            ariaLabel="Role"
            id={roleInputId}
            options={titleSuggestionOptions}
            placeholder="Architect"
            value={form.title}
            onValueChange={(nextValue) => updateField("title", nextValue)}
          />
        </label>

        <label className="project-create-field" htmlFor={officeInputId}>
          <span className="project-create-label">Office</span>
          <SelectDropdownField
            ariaLabel="Office"
            id={officeInputId}
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
          {formatCreatePersonPermissionLabel(form.permission)} sends an account setup email so the
          person can set a password and join with this record.
          {isEditMode && onResendAccountEmail
            ? " Use Resend email to send another setup email to the saved account address."
            : null}
        </p>
      ) : null}

      {submitMessage ? (
        <p className="project-create-message">{submitMessage}</p>
      ) : null}

      <div
        className={`project-create-actions${canRemove ? " project-create-actions-with-danger" : ""}`}
      >
        {canRemove ? (
          <button
            className="project-create-danger-button"
            disabled={isRemoveDisabled}
            onClick={() => void handleRemove()}
            title={removeDisabledReason}
            type="button"
          >
            {isRemoving ? "Removing..." : isConfirmingRemove ? "Confirm Remove" : "Remove"}
          </button>
        ) : null}
        <button
          className="project-create-cancel-button"
          onClick={() => {
            setIsConfirmingRemove(false);
            onCancel();
          }}
          type="button"
        >
          Cancel
        </button>
        <button
          className="project-create-save-button"
          disabled={isSubmitting || isRemoving}
          type="submit"
        >
          {isSubmitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Save"}
        </button>
      </div>
    </form>
  );
}
