interface PeopleAddButtonProps {
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}

export function PeopleAddButton({
  disabled = false,
  onClick,
  title,
}: PeopleAddButtonProps) {
  return (
    <button
      aria-label={disabled ? "Create person unavailable" : "Add person"}
      className="people-add-button"
      disabled={disabled}
      onClick={onClick}
      style={disabled ? undefined : { cursor: "pointer", opacity: 1 }}
      title={title}
      type="button"
    >
      <img alt="" aria-hidden className="people-add-icon" src="/figma/projects/add-icon.svg" />
    </button>
  );
}
