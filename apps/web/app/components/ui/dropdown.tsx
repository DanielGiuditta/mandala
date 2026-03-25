"use client"

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

type Align = "start" | "end"
type VisualShape = "square" | "circle"

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function useControllableState<T>({
  controlledValue,
  defaultValue,
  onChange,
}: {
  controlledValue: T | undefined
  defaultValue: T
  onChange?: (nextValue: T) => void
}) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const value = controlledValue === undefined ? internalValue : controlledValue

  function setValue(nextValue: T) {
    if (controlledValue === undefined) {
      setInternalValue(nextValue)
    }
    onChange?.(nextValue)
  }

  return [value, setValue] as const
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
  )
}

export function DropdownLabelStack({
  description,
  label,
  placeholder = false,
  tone = "row",
}: {
  description?: string
  label: string
  placeholder?: boolean
  tone?: "row" | "trigger"
}) {
  return (
    <span className="dropdown-label-stack">
      <span
        className={cx(
          tone === "trigger" ? "dropdown-trigger-label" : "dropdown-row-label",
          placeholder ? "dropdown-label-placeholder" : "",
        )}
      >
        {label}
      </span>
      {description ? <span className="dropdown-row-meta">{description}</span> : null}
    </span>
  )
}

export function DropdownLeadingVisual({
  children,
  shape = "square",
}: {
  children?: ReactNode
  shape?: VisualShape
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "dropdown-leading-visual",
        shape === "circle" ? "dropdown-leading-visual-circle" : "dropdown-leading-visual-square",
      )}
    >
      {children}
    </span>
  )
}

export function DropdownSelectedIndicator({ visible }: { visible: boolean }) {
  return (
    <span
      aria-hidden
      className={cx("dropdown-selected-indicator", visible ? "dropdown-selected-indicator-visible" : "")}
    >
      ✓
    </span>
  )
}

export const DropdownRow = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function DropdownRow({ children, className, ...props }, ref) {
  return (
    <button className={cx("dropdown-row", className)} ref={ref} type="button" {...props}>
      {children}
    </button>
  )
})

export function DropdownSurface({
  align = "start",
  children,
  className,
  matchTriggerWidth = true,
  minWidth,
}: {
  align?: Align
  children: ReactNode
  className?: string
  matchTriggerWidth?: boolean
  minWidth?: number
}) {
  const style: CSSProperties = {}
  if (matchTriggerWidth) {
    style.minWidth = "100%"
  } else if (minWidth) {
    style.minWidth = `${minWidth}px`
  }

  return (
    <div
      className={cx(
        "dropdown-surface",
        align === "end" ? "dropdown-surface-align-end" : "",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  )
}

export interface SelectDropdownOption {
  description?: string
  disabled?: boolean
  label: string
  leadingVisual?: ReactNode
  leadingVisualShape?: VisualShape
  value: string
}

interface SelectDropdownFieldProps {
  align?: Align
  ariaLabel?: string
  className?: string
  defaultOpen?: boolean
  defaultValue?: string
  disabled?: boolean
  menuClassName?: string
  menuMaxHeight?: number
  name?: string
  onOpenChange?: (nextOpen: boolean) => void
  onValueChange?: (nextValue: string) => void
  open?: boolean
  options: SelectDropdownOption[]
  placeholder: string
  value?: string
}

// Public API: listbox-style dropdown field for form selection.
export function SelectDropdownField({
  align = "start",
  ariaLabel,
  className,
  defaultOpen = false,
  defaultValue = "",
  disabled = false,
  menuClassName,
  menuMaxHeight = 240,
  name,
  onOpenChange,
  onValueChange,
  open,
  options,
  placeholder,
  value,
}: SelectDropdownFieldProps) {
  const [selectedValue, setSelectedValue] = useControllableState({
    controlledValue: value,
    defaultValue,
    onChange: onValueChange,
  })
  const [isOpen, setIsOpen] = useControllableState({
    controlledValue: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue],
  )

  const enabledIndices = useMemo(
    () => options.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0),
    [options],
  )

  useEffect(() => {
    if (!isOpen || disabled) {
      return
    }

    function handleOutsidePointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    window.addEventListener("mousedown", handleOutsidePointer)
    window.addEventListener("keydown", handleEscape)
    return () => {
      window.removeEventListener("mousedown", handleOutsidePointer)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [disabled, isOpen, setIsOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled)
    if (selectedIndex >= 0) {
      setActiveIndex(selectedIndex)
      return
    }

    setActiveIndex(enabledIndices[0] ?? -1)
  }, [enabledIndices, isOpen, options, selectedValue])

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return
    }
    optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, isOpen])

  function closeAndFocusTrigger() {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function commitValue(nextValue: string) {
    setSelectedValue(nextValue)
    closeAndFocusTrigger()
  }

  function openFromKeyboard(preferred: "first" | "last") {
    if (disabled) {
      return
    }

    if (!isOpen) {
      setIsOpen(true)
      if (preferred === "last") {
        const lastIndex = enabledIndices[enabledIndices.length - 1] ?? -1
        setActiveIndex(lastIndex)
      } else {
        const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled)
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndices[0] ?? -1))
      }
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      openFromKeyboard("first")
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      openFromKeyboard("last")
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setIsOpen(!isOpen)
    } else if (event.key === "Escape") {
      setIsOpen(false)
    }
  }

  function handleListboxKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!enabledIndices.length) {
      return
    }

    const currentPos = enabledIndices.indexOf(activeIndex)

    if (event.key === "ArrowDown") {
      event.preventDefault()
      const nextPos = currentPos < 0 ? 0 : Math.min(enabledIndices.length - 1, currentPos + 1)
      setActiveIndex(enabledIndices[nextPos] ?? -1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      const nextPos = currentPos < 0 ? enabledIndices.length - 1 : Math.max(0, currentPos - 1)
      setActiveIndex(enabledIndices[nextPos] ?? -1)
    } else if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(enabledIndices[0] ?? -1)
    } else if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? -1)
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const option = options[activeIndex]
      if (option && !option.disabled) {
        commitValue(option.value)
      }
    } else if (event.key === "Tab") {
      setIsOpen(false)
    } else if (event.key === "Escape") {
      event.preventDefault()
      closeAndFocusTrigger()
    }
  }

  return (
    <div className={cx("dropdown-root", className)} ref={rootRef}>
      {name ? <input name={name} type="hidden" value={selectedValue} /> : null}
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cx("dropdown-trigger", disabled ? "dropdown-trigger-disabled" : "")}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <DropdownLabelStack
          label={selectedOption?.label ?? placeholder}
          placeholder={!selectedOption}
          tone="trigger"
        />
        <span className={cx("dropdown-trigger-chevron", isOpen ? "dropdown-trigger-chevron-open" : "")}>
          <ChevronIcon />
        </span>
      </button>

      {isOpen ? (
        <DropdownSurface align={align} className={menuClassName} matchTriggerWidth>
          <div
            className="dropdown-list"
            id={listboxId}
            onKeyDown={handleListboxKeyDown}
            role="listbox"
            style={{ maxHeight: `${menuMaxHeight}px` }}
            tabIndex={-1}
          >
            {options.map((option, index) => {
              const isActive = index === activeIndex
              const isSelected = option.value === selectedValue

              return (
                <DropdownRow
                  aria-selected={isSelected}
                  className={cx(
                    isActive ? "dropdown-row-active" : "",
                    option.disabled ? "dropdown-row-disabled" : "",
                  )}
                  disabled={option.disabled}
                  key={option.value}
                  onClick={() => {
                    if (!option.disabled) {
                      commitValue(option.value)
                    }
                  }}
                  onFocus={() => setActiveIndex(index)}
                  ref={(element: HTMLButtonElement | null) => {
                    optionRefs.current[index] = element
                  }}
                  role="option"
                  tabIndex={isActive ? 0 : -1}
                >
                  {option.leadingVisual ? (
                    <DropdownLeadingVisual shape={option.leadingVisualShape}>
                      {option.leadingVisual}
                    </DropdownLeadingVisual>
                  ) : null}
                  <DropdownLabelStack description={option.description} label={option.label} />
                  <DropdownSelectedIndicator visible={isSelected} />
                </DropdownRow>
              )
            })}
          </div>
        </DropdownSurface>
      ) : null}
    </div>
  )
}

interface SuggestionDropdownFieldProps {
  align?: Align
  ariaLabel?: string
  className?: string
  defaultOpen?: boolean
  defaultValue?: string
  disabled?: boolean
  id?: string
  menuClassName?: string
  menuMaxHeight?: number
  name?: string
  onOpenChange?: (nextOpen: boolean) => void
  onValueChange?: (nextValue: string) => void
  open?: boolean
  options: SelectDropdownOption[]
  placeholder: string
  value?: string
}

// Public API: combobox-style dropdown field for freeform text with shared dropdown suggestions.
export function SuggestionDropdownField({
  align = "start",
  ariaLabel,
  className,
  defaultOpen = false,
  defaultValue = "",
  disabled = false,
  id,
  menuClassName,
  menuMaxHeight = 240,
  name,
  onOpenChange,
  onValueChange,
  open,
  options,
  placeholder,
  value,
}: SuggestionDropdownFieldProps) {
  const [inputValue, setInputValue] = useControllableState({
    controlledValue: value,
    defaultValue,
    onChange: onValueChange,
  })
  const [isOpen, setIsOpen] = useControllableState({
    controlledValue: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = useId()

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase()
    if (!query) {
      return options
    }

    return options.filter((option) => {
      const label = option.label.toLowerCase()
      const candidateValue = option.value.toLowerCase()
      return label.includes(query) || candidateValue.includes(query)
    })
  }, [inputValue, options])

  const enabledIndices = useMemo(
    () =>
      filteredOptions
        .map((option, index) => (option.disabled ? -1 : index))
        .filter((index) => index >= 0),
    [filteredOptions],
  )

  useEffect(() => {
    if (!isOpen || disabled) {
      return
    }

    function handleOutsidePointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
        inputRef.current?.focus()
      }
    }

    window.addEventListener("mousedown", handleOutsidePointer)
    window.addEventListener("keydown", handleEscape)
    return () => {
      window.removeEventListener("mousedown", handleOutsidePointer)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [disabled, isOpen, setIsOpen])

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1)
      return
    }

    setActiveIndex((current) => {
      if (enabledIndices.includes(current)) {
        return current
      }
      return enabledIndices[0] ?? -1
    })
  }, [enabledIndices, isOpen])

  function optionId(index: number) {
    return `${listboxId}-option-${index}`
  }

  function commitValue(nextValue: string) {
    setInputValue(nextValue)
    setIsOpen(false)
    inputRef.current?.focus()
  }

  function moveActive(direction: "next" | "previous") {
    if (!enabledIndices.length) {
      setIsOpen(true)
      setActiveIndex(-1)
      return
    }

    setIsOpen(true)
    setActiveIndex((current) => {
      const currentPos = enabledIndices.indexOf(current)
      if (direction === "next") {
        const nextPos = currentPos < 0 ? 0 : Math.min(enabledIndices.length - 1, currentPos + 1)
        return enabledIndices[nextPos] ?? -1
      }

      const nextPos = currentPos < 0 ? enabledIndices.length - 1 : Math.max(0, currentPos - 1)
      return enabledIndices[nextPos] ?? -1
    })
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveActive("next")
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      moveActive("previous")
    } else if (event.key === "Home") {
      if (!enabledIndices.length) {
        return
      }
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex(enabledIndices[0] ?? -1)
    } else if (event.key === "End") {
      if (!enabledIndices.length) {
        return
      }
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? -1)
    } else if (event.key === "Enter") {
      if (!isOpen || activeIndex < 0) {
        return
      }

      const option = filteredOptions[activeIndex]
      if (!option || option.disabled) {
        return
      }

      event.preventDefault()
      commitValue(option.value)
    } else if (event.key === "Escape") {
      if (!isOpen) {
        return
      }
      event.preventDefault()
      setIsOpen(false)
    } else if (event.key === "Tab") {
      setIsOpen(false)
    }
  }

  return (
    <div className={cx("dropdown-root", className)} ref={rootRef}>
      {name ? <input name={name} type="hidden" value={inputValue} /> : null}
      <div
        className={cx("dropdown-trigger dropdown-combobox-shell", disabled ? "dropdown-trigger-disabled" : "")}
      >
        <input
          aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          className="dropdown-combobox-input"
          disabled={disabled}
          id={id}
          onChange={(event) => {
            setInputValue(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (!disabled) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          type="text"
          value={inputValue}
        />
        <button
          aria-label={isOpen ? "Close suggestions" : "Open suggestions"}
          className="dropdown-combobox-toggle"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return
            }

            setIsOpen(!isOpen)
            inputRef.current?.focus()
          }}
          onMouseDown={(event) => event.preventDefault()}
          tabIndex={-1}
          type="button"
        >
          <span className={cx("dropdown-trigger-chevron", isOpen ? "dropdown-trigger-chevron-open" : "")}>
            <ChevronIcon />
          </span>
        </button>
      </div>

      {isOpen && filteredOptions.length > 0 ? (
        <DropdownSurface align={align} className={menuClassName} matchTriggerWidth>
          <div
            className="dropdown-list"
            id={listboxId}
            role="listbox"
            style={{ maxHeight: `${menuMaxHeight}px` }}
          >
            {filteredOptions.map((option, index) => {
              const isActive = index === activeIndex
              const isSelected = option.value === inputValue

              return (
                <DropdownRow
                  aria-selected={isSelected}
                  className={cx(
                    isActive ? "dropdown-row-active" : "",
                    option.disabled ? "dropdown-row-disabled" : "",
                  )}
                  disabled={option.disabled}
                  id={optionId(index)}
                  key={`${option.value}-${index}`}
                  onClick={() => {
                    if (!option.disabled) {
                      commitValue(option.value)
                    }
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  tabIndex={-1}
                >
                  {option.leadingVisual ? (
                    <DropdownLeadingVisual shape={option.leadingVisualShape}>
                      {option.leadingVisual}
                    </DropdownLeadingVisual>
                  ) : null}
                  <DropdownLabelStack description={option.description} label={option.label} />
                  <DropdownSelectedIndicator visible={isSelected} />
                </DropdownRow>
              )
            })}
          </div>
        </DropdownSurface>
      ) : null}
    </div>
  )
}

interface NativeDateDropdownFieldProps {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  onValueChange?: (nextValue: string) => void
  required?: boolean
  value?: string
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) {
    return null
  }

  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatTriggerDate(value: string): string {
  const date = parseIsoDate(value)
  if (!date) {
    return "mm/dd/yyyy"
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

// Public API: custom calendar date picker in dropdown visual language.
export function NativeDateDropdownField({
  ariaLabel,
  className,
  disabled = false,
  id,
  name,
  onValueChange,
  required = false,
  value = "",
}: NativeDateDropdownFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const selectedDate = useMemo(() => parseIsoDate(value), [value])
  const today = useMemo(() => new Date(), [])
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const base = selectedDate ?? today
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  useEffect(() => {
    if (!selectedDate) {
      return
    }
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [selectedDate])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function updatePosition() {
      const trigger = triggerRef.current
      if (!trigger) {
        return
      }

      const rect = trigger.getBoundingClientRect()
      const estimatedPanelHeight = 360
      const gap = 8
      const shouldOpenAbove =
        window.innerHeight - rect.bottom < estimatedPanelHeight &&
        rect.top > estimatedPanelHeight

      setPanelStyle({
        left: rect.left,
        position: "fixed",
        top: shouldOpenAbove ? rect.top - gap : rect.bottom + gap,
        transform: shouldOpenAbove ? "translateY(-100%)" : undefined,
        width: rect.width,
        zIndex: 120,
      })
    }

    function handleOutsidePointer(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      if (rootRef.current && !rootRef.current.contains(target)) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    updatePosition()
    window.addEventListener("mousedown", handleOutsidePointer)
    window.addEventListener("keydown", handleEscape)
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("mousedown", handleOutsidePointer)
      window.removeEventListener("keydown", handleEscape)
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [isOpen])

  const days = useMemo(() => {
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const offset = start.getDay()
    const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - offset)

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
      const iso = formatIsoDate(date)
      return {
        date,
        inMonth: date.getMonth() === visibleMonth.getMonth(),
        iso,
      }
    })
  }, [visibleMonth])

  function commit(nextValue: string) {
    onValueChange?.(nextValue)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className={cx("dropdown-root", className)} ref={rootRef}>
      {name ? <input name={name} required={required} type="hidden" value={value} /> : null}
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={cx("dropdown-trigger", disabled ? "dropdown-trigger-disabled" : "")}
        disabled={disabled}
        id={id}
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className={cx("dropdown-trigger-label", value ? "" : "dropdown-label-placeholder")}>
          {formatTriggerDate(value)}
        </span>
        <span className={cx("dropdown-trigger-chevron", isOpen ? "dropdown-trigger-chevron-open" : "")}>
          <ChevronIcon />
        </span>
      </button>
      {isOpen && panelStyle
        ? createPortal(
            <div className="dropdown-calendar-floating" ref={panelRef} style={panelStyle}>
              <div className="dropdown-calendar" role="dialog">
                <div className="dropdown-calendar-header">
                  <strong className="dropdown-calendar-title">{formatMonthLabel(visibleMonth)}</strong>
                  <div className="dropdown-calendar-actions">
                    <button
                      aria-label="Previous month"
                      className="dropdown-calendar-nav"
                      onClick={() =>
                        setVisibleMonth(
                          (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                        )
                      }
                      type="button"
                    >
                      ←
                    </button>
                    <button
                      aria-label="Next month"
                      className="dropdown-calendar-nav"
                      onClick={() =>
                        setVisibleMonth(
                          (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                        )
                      }
                      type="button"
                    >
                      →
                    </button>
                  </div>
                </div>
                <div className="dropdown-calendar-weekdays">
                  {WEEKDAY_LABELS.map((label) => (
                    <span className="dropdown-calendar-weekday" key={label}>
                      {label}
                    </span>
                  ))}
                </div>
                <div className="dropdown-calendar-grid">
                  {days.map((day) => {
                    const isSelected = value === day.iso
                    const isToday = isSameCalendarDay(day.date, today)
                    return (
                      <button
                        className={cx(
                          "dropdown-calendar-day",
                          !day.inMonth ? "dropdown-calendar-day-outside" : "",
                          isToday ? "dropdown-calendar-day-today" : "",
                          isSelected ? "dropdown-calendar-day-selected" : "",
                        )}
                        key={day.iso}
                        onClick={() => commit(day.iso)}
                        type="button"
                      >
                        {day.date.getDate()}
                      </button>
                    )
                  })}
                </div>
                <div className="dropdown-calendar-footer">
                  <button className="dropdown-calendar-link" onClick={() => commit("")} type="button">
                    Clear
                  </button>
                  <button
                    className="dropdown-calendar-link"
                    onClick={() => commit(formatIsoDate(new Date()))}
                    type="button"
                  >
                    Today
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export interface DropdownActionItem {
  description?: string
  disabled?: boolean
  id: string
  label: string
  leadingVisual?: ReactNode
  leadingVisualShape?: VisualShape
  onSelect: () => void
  selected?: boolean
}

interface DropdownActionMenuProps {
  align?: Align
  className?: string
  defaultOpen?: boolean
  disabled?: boolean
  menuClassName?: string
  menuMinWidth?: number
  onOpenChange?: (nextOpen: boolean) => void
  open?: boolean
  trigger: ReactNode
  triggerAriaLabel: string
  triggerClassName?: string
  items: DropdownActionItem[]
}

// Public API: dropdown button/menu for action flyouts.
export function DropdownActionMenu({
  align = "start",
  className,
  defaultOpen = false,
  disabled = false,
  items,
  menuClassName,
  menuMinWidth = 314,
  onOpenChange,
  open,
  trigger,
  triggerAriaLabel,
  triggerClassName,
}: DropdownActionMenuProps) {
  const [isOpen, setIsOpen] = useControllableState({
    controlledValue: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()
  const enabledIndices = useMemo(
    () => items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0),
    [items],
  )

  useEffect(() => {
    if (!isOpen || disabled) {
      return
    }

    function handleOutsidePointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    window.addEventListener("mousedown", handleOutsidePointer)
    window.addEventListener("keydown", handleEscape)
    return () => {
      window.removeEventListener("mousedown", handleOutsidePointer)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [disabled, isOpen, setIsOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setActiveIndex(enabledIndices[0] ?? -1)
  }, [enabledIndices, isOpen])

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return
    }
    itemRefs.current[activeIndex]?.focus()
  }, [activeIndex, isOpen])

  function closeAndFocusTrigger() {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!enabledIndices.length) {
      return
    }

    const currentPos = enabledIndices.indexOf(activeIndex)

    if (event.key === "ArrowDown") {
      event.preventDefault()
      const nextPos = currentPos < 0 ? 0 : Math.min(enabledIndices.length - 1, currentPos + 1)
      setActiveIndex(enabledIndices[nextPos] ?? -1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      const nextPos = currentPos < 0 ? enabledIndices.length - 1 : Math.max(0, currentPos - 1)
      setActiveIndex(enabledIndices[nextPos] ?? -1)
    } else if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(enabledIndices[0] ?? -1)
    } else if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? -1)
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const item = items[activeIndex]
      if (item && !item.disabled) {
        item.onSelect()
        closeAndFocusTrigger()
      }
    } else if (event.key === "Tab") {
      setIsOpen(false)
    } else if (event.key === "Escape") {
      event.preventDefault()
      closeAndFocusTrigger()
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex(enabledIndices[0] ?? -1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? -1)
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setIsOpen(!isOpen)
    } else if (event.key === "Escape") {
      setIsOpen(false)
    }
  }

  return (
    <div className={cx("dropdown-root dropdown-root-inline", className)} ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={triggerAriaLabel}
        className={cx("dropdown-trigger", triggerClassName, disabled ? "dropdown-trigger-disabled" : "")}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="dropdown-trigger-custom-content">{trigger}</span>
        <span className={cx("dropdown-trigger-chevron", isOpen ? "dropdown-trigger-chevron-open" : "")}>
          <ChevronIcon />
        </span>
      </button>
      {isOpen ? (
        <DropdownSurface
          align={align}
          className={menuClassName}
          matchTriggerWidth={false}
          minWidth={menuMinWidth}
        >
          <div className="dropdown-list" id={menuId} onKeyDown={handleMenuKeyDown} role="menu">
            {items.map((item, index) => {
              const isActive = index === activeIndex
              const itemRole = item.selected !== undefined ? "menuitemcheckbox" : "menuitem"

              return (
                <DropdownRow
                  aria-checked={item.selected}
                  className={cx(
                    isActive ? "dropdown-row-active" : "",
                    item.disabled ? "dropdown-row-disabled" : "",
                  )}
                  disabled={item.disabled}
                  key={item.id}
                  onClick={() => {
                    if (item.disabled) {
                      return
                    }
                    item.onSelect()
                    closeAndFocusTrigger()
                  }}
                  onFocus={() => setActiveIndex(index)}
                  ref={(element: HTMLButtonElement | null) => {
                    itemRefs.current[index] = element
                  }}
                  role={itemRole}
                  tabIndex={isActive ? 0 : -1}
                >
                  {item.leadingVisual ? (
                    <DropdownLeadingVisual shape={item.leadingVisualShape}>
                      {item.leadingVisual}
                    </DropdownLeadingVisual>
                  ) : null}
                  <DropdownLabelStack description={item.description} label={item.label} />
                  <DropdownSelectedIndicator visible={Boolean(item.selected)} />
                </DropdownRow>
              )
            })}
          </div>
        </DropdownSurface>
      ) : null}
    </div>
  )
}
