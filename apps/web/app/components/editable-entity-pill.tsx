"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";

import {
  EntitySelectDropdown,
  type SelectDropdownOption,
} from "./ui/dropdown";

interface EditableEntityPillProps {
  align?: "start" | "end";
  ariaLabel: string;
  disabled?: boolean;
  emptyStateLabel?: string;
  menuMaxHeight?: number;
  minMenuWidth?: number;
  onCommit: (nextValue: string) => Promise<void>;
  onOpenRequested?: () => Promise<void> | void;
  options: SelectDropdownOption[];
  renderTrigger: (args: {
    disabled: boolean;
    isOpen: boolean;
    isPreparing: boolean;
    isSaving: boolean;
    selectedOption: SelectDropdownOption | null;
    toggleButton: ReactNode;
  }) => ReactNode;
  value: string;
}

export function EditableEntityPill({
  align = "start",
  ariaLabel,
  disabled = false,
  emptyStateLabel = "No options available.",
  menuMaxHeight = 280,
  minMenuWidth = 314,
  onCommit,
  onOpenRequested,
  options,
  renderTrigger,
  value,
}: EditableEntityPillProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  async function handleOpenRequested() {
    setError(null);

    try {
      await onOpenRequested?.();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to load options.",
      );
      throw nextError;
    }
  }

  async function handleSelect(nextValue: string) {
    if (nextValue === value) {
      return;
    }

    setError(null);

    await new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          await onCommit(nextValue);
          router.refresh();
          resolve();
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to save changes.",
          );
          reject(nextError);
        }
      });
    });
  }

  return (
    <EntitySelectDropdown
      align={align}
      ariaLabel={ariaLabel}
      disabled={disabled || isSaving}
      emptyStateLabel={emptyStateLabel}
      error={error}
      menuMaxHeight={menuMaxHeight}
      minMenuWidth={minMenuWidth}
      onOpenRequested={handleOpenRequested}
      onSelect={handleSelect}
      options={options}
      renderTrigger={({ disabled: triggerDisabled, isOpen, isPreparing, toggleButton }) =>
        renderTrigger({
          disabled: triggerDisabled,
          isOpen,
          isPreparing,
          isSaving,
          selectedOption,
          toggleButton,
        })
      }
      value={value}
    />
  );
}
