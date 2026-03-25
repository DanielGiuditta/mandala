"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface AppMenuSelectOption {
  description?: string;
  value: string;
  label: string;
}

interface AppMenuSelectProps {
  ariaLabel?: string;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  onValueChange?: (nextValue: string) => void;
  options: AppMenuSelectOption[];
  placeholder: string;
  value?: string;
}

export function AppMenuSelect({
  ariaLabel,
  defaultValue,
  disabled = false,
  name,
  onValueChange,
  options,
  placeholder,
  value,
}: AppMenuSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? "");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selectedValue = value ?? internalValue;

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (value === undefined && defaultValue !== undefined) {
      setInternalValue(defaultValue);
    }
  }, [defaultValue, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue],
  );

  function commitValue(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
    setIsOpen(false);
  }

  return (
    <div className="app-menu-select" ref={rootRef}>
      {name ? <input name={name} type="hidden" value={selectedValue} /> : null}
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="app-menu-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="app-menu-select-trigger-text">
          {selectedOption ? (
            <>
              <span className="app-menu-select-label">{selectedOption.label}</span>
              {selectedOption.description ? (
                <span className="app-menu-select-meta">{selectedOption.description}</span>
              ) : null}
            </>
          ) : (
            <span className="app-menu-select-placeholder">{placeholder}</span>
          )}
        </span>
        <span aria-hidden className={`app-menu-select-chevron ${isOpen ? "app-menu-select-chevron-open" : ""}`}>
          ˅
        </span>
      </button>

      {isOpen ? (
        <div className="app-menu-select-popover" id={listId} role="listbox">
          {options.map((option) => {
            const isSelected = option.value === selectedValue;
            return (
              <button
                aria-selected={isSelected}
                className="app-menu-select-option"
                key={option.value}
                onClick={() => commitValue(option.value)}
                role="option"
                type="button"
              >
                <span className="app-menu-select-option-text">
                  <span className="app-menu-select-label">{option.label}</span>
                  {option.description ? (
                    <span className="app-menu-select-meta">{option.description}</span>
                  ) : null}
                </span>
                <span className="app-menu-select-check">{isSelected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
