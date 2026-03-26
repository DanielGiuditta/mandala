"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import {
  DropdownLabelStack,
  DropdownLeadingVisual,
  DropdownRow,
  DropdownSelectedIndicator,
  type SelectDropdownOption,
} from "./ui/dropdown";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden
      className="dropdown-trigger-chevron-icon"
      viewBox="0 0 20 20"
    >
      <path
        d="M5.7 7.7a1 1 0 0 1 1.4 0L10 10.58l2.9-2.88a1 1 0 0 1 1.4 1.42l-3.6 3.58a1 1 0 0 1-1.4 0L5.7 9.12a1 1 0 0 1 0-1.42Z"
        fill="currentColor"
      />
    </svg>
  );
}

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
  menuMaxHeight = 240,
  minMenuWidth = 220,
  onCommit,
  onOpenRequested,
  options,
  renderTrigger,
  value,
}: EditableEntityPillProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [isSaving, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const enabledIndices = useMemo(
    () =>
      options
        .map((option, index) => (option.disabled ? -1 : index))
        .filter((index) => index >= 0),
    [options],
  );
  const triggerDisabled = disabled || isPreparing || isSaving;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePosition() {
      const anchor = rootRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const estimatedPanelHeight = 320;
      const gap = 8;
      const panelWidth = Math.max(rect.width, minMenuWidth);
      const shouldOpenAbove =
        window.innerHeight - rect.bottom < estimatedPanelHeight &&
        rect.top > estimatedPanelHeight;

      setPanelStyle({
        left: align === "end" ? rect.right - panelWidth : rect.left,
        marginTop: 0,
        position: "fixed",
        top: shouldOpenAbove ? rect.top - gap : rect.bottom + gap,
        transform: shouldOpenAbove ? "translateY(-100%)" : undefined,
        width: panelWidth,
        zIndex: 120,
      });
    }

    function handleOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      if (rootRef.current && !rootRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    updatePosition();
    window.addEventListener("mousedown", handleOutsidePointer);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("mousedown", handleOutsidePointer);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, isOpen, minMenuWidth]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }

    const selectedIndex = options.findIndex(
      (option) => option.value === value && !option.disabled,
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndices[0] ?? -1));
  }, [enabledIndices, isOpen, options, value]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  async function openPicker() {
    if (triggerDisabled) {
      return;
    }

    setError(null);
    setIsPreparing(true);

    try {
      await onOpenRequested?.();
      setIsOpen(true);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load options.",
      );
    } finally {
      setIsPreparing(false);
    }
  }

  function closeAndFocusTrigger() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function commitValue(nextValue: string) {
    if (nextValue === value) {
      closeAndFocusTrigger();
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await onCommit(nextValue);
        setIsOpen(false);
        router.refresh();
        triggerRef.current?.focus();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to save changes.",
        );
      }
    });
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (triggerDisabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        void openPicker();
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) {
        setIsOpen(false);
        return;
      }

      void openPicker();
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  function handleListboxKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!enabledIndices.length) {
      return;
    }

    const currentPos = enabledIndices.indexOf(activeIndex);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextPos =
        currentPos < 0 ? 0 : Math.min(enabledIndices.length - 1, currentPos + 1);
      setActiveIndex(enabledIndices[nextPos] ?? -1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextPos =
        currentPos < 0 ? enabledIndices.length - 1 : Math.max(0, currentPos - 1);
      setActiveIndex(enabledIndices[nextPos] ?? -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(enabledIndices[0] ?? -1);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option && !option.disabled) {
        commitValue(option.value);
      }
    } else if (event.key === "Tab") {
      setIsOpen(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
    }
  }

  const toggleButton = (
    <button
      aria-controls={listboxId}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-label={ariaLabel}
      className="editable-entity-pill-toggle"
      disabled={triggerDisabled}
      onClick={() => {
        if (isOpen) {
          setIsOpen(false);
          return;
        }

        void openPicker();
      }}
      onKeyDown={handleTriggerKeyDown}
      ref={triggerRef}
      type="button"
    >
      <span
        className={cx(
          "dropdown-trigger-chevron",
          isOpen ? "dropdown-trigger-chevron-open" : "",
        )}
      >
        <ChevronIcon />
      </span>
    </button>
  );

  return (
    <div className="editable-entity-pill" ref={rootRef}>
      {renderTrigger({
        disabled: triggerDisabled,
        isOpen,
        isPreparing,
        isSaving,
        selectedOption,
        toggleButton,
      })}

      {isOpen && panelStyle
        ? createPortal(
            <div className="dropdown-surface" ref={panelRef} style={panelStyle}>
              <div
                className="dropdown-list"
                id={listboxId}
                onKeyDown={handleListboxKeyDown}
                role="listbox"
                style={{ maxHeight: `${menuMaxHeight}px` }}
                tabIndex={-1}
              >
                {options.length === 0 ? (
                  <p className="editable-entity-pill-empty">{emptyStateLabel}</p>
                ) : (
                  options.map((option, index) => {
                    const isActive = index === activeIndex;
                    const isSelected = option.value === value;

                    return (
                      <DropdownRow
                        aria-selected={isSelected}
                        className={cx(
                          isActive ? "dropdown-row-active" : "",
                          option.disabled ? "dropdown-row-disabled" : "",
                        )}
                        disabled={option.disabled || isSaving}
                        key={option.value}
                        onClick={() => {
                          if (!option.disabled) {
                            commitValue(option.value);
                          }
                        }}
                        onFocus={() => setActiveIndex(index)}
                        ref={(element: HTMLButtonElement | null) => {
                          optionRefs.current[index] = element;
                        }}
                        role="option"
                        tabIndex={isActive ? 0 : -1}
                      >
                        {option.leadingVisual ? (
                          <DropdownLeadingVisual shape={option.leadingVisualShape}>
                            {option.leadingVisual}
                          </DropdownLeadingVisual>
                        ) : null}
                        <DropdownLabelStack
                          description={option.description}
                          label={option.label}
                        />
                        <DropdownSelectedIndicator visible={isSelected} />
                      </DropdownRow>
                    );
                  })
                )}

                {error ? <p className="editable-entity-pill-error">{error}</p> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
