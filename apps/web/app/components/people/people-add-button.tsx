export function PeopleAddButton() {
  return (
    <button
      aria-label="Create person unavailable"
      className="people-add-button"
      disabled
      title="Create person UI is not wired yet."
      type="button"
    >
      <img alt="" aria-hidden className="people-add-icon" src="/figma/projects/add-icon.svg" />
    </button>
  );
}
