import type { PersonListItem } from "@mandala/db";

import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
  getProjectFallbackAvatarStyle,
} from "../projects/project-avatar-utils";
import { EntityReturnLink } from "../entity-return-link";
import {
  formatAnnualSalaryCompact,
  formatHoursThisWeek,
  getInitialsFromName,
  getPersonInitials,
} from "./people-list-formatters";

interface PeopleListRowProps {
  person: PersonListItem;
  rowIndex: number;
}

export function PeopleListRow({ person, rowIndex }: PeopleListRowProps) {
  const visibleStaffedProjects = person.staffedProjects.slice(0, 2);
  const remainingStaffedProjects = Math.max(0, person.staffedProjects.length - visibleStaffedProjects.length);

  return (
    <article
      className={`people-list-row ${rowIndex % 2 === 0 ? "people-list-row-light" : "people-list-row-base"}`}
    >
      <div className="people-cell people-cell-name">
        {person.photoUrl ? (
          <img
            alt=""
            aria-hidden
            className="people-avatar-image"
            loading="lazy"
            src={person.photoUrl}
          />
        ) : (
          <span
            aria-hidden
            className="people-avatar-fallback"
            style={getPersonFallbackAvatarStyle(person.fullName, person.id)}
          >
            {getPersonInitials(person)}
          </span>
        )}
        <EntityReturnLink
          className="people-name-link"
          href={`/people/${person.id}`}
          scope="people"
        >
          {person.fullName}
        </EntityReturnLink>
      </div>

      <div className="people-cell">
        {person.staffedProjects.length > 0 ? (
          <div className="people-project-chips" title={person.staffedProjects.map((project) => project.projectName).join(", ")}>
            {visibleStaffedProjects.map((project) => (
              <span className="people-project-chip" key={project.projectId}>
                {project.projectPhotoUrl ? (
                  <img
                    alt=""
                    aria-hidden
                    className="people-project-chip-avatar"
                    loading="lazy"
                    src={project.projectPhotoUrl}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="people-project-chip-fallback"
                    style={getProjectFallbackAvatarStyle(project.projectName, project.projectId)}
                  >
                    {getFallbackAvatarInitial(project.projectName)}
                  </span>
                )}
                <span className="people-cell-value">{project.projectName}</span>
              </span>
            ))}
            {remainingStaffedProjects > 0 ? (
              <span className="people-project-overflow">+{remainingStaffedProjects}</span>
            ) : null}
          </div>
        ) : (
          <span className="people-reference-empty">No active projects</span>
        )}
      </div>

      <div className="people-cell">
        <span className="people-cell-value">{person.officeName}</span>
      </div>

      <div className="people-cell">
        {person.supervisorName ? (
          <span className="people-reference-pill">
            {person.supervisorPhotoUrl ? (
              <img
                alt=""
                aria-hidden
                className="people-reference-avatar"
                loading="lazy"
                src={person.supervisorPhotoUrl}
              />
            ) : (
              <span
                aria-hidden
                className="people-reference-fallback"
                style={getPersonFallbackAvatarStyle(
                  person.supervisorName,
                  person.supervisorPersonId ?? person.id,
                )}
              >
                {getInitialsFromName(person.supervisorName)}
              </span>
            )}
            <span className="people-cell-value">{person.supervisorName}</span>
          </span>
        ) : (
          <span className="people-reference-empty">No supervisor</span>
        )}
      </div>

      <div className="people-cell people-cell-metric">
        <span className="people-cell-value">{formatHoursThisWeek(person.hoursThisWeek)}</span>
      </div>

      <div className="people-cell">
        <span className="people-cell-value">
          {person.effectivePermissionLabel ?? "No account"}
        </span>
      </div>

      <div className="people-cell">
        <span className="people-cell-value">{person.title ?? "Not set"}</span>
      </div>

      <div className="people-cell people-cell-metric">
        <span className="people-cell-value">{formatAnnualSalaryCompact(person.annualSalary)}</span>
      </div>
    </article>
  );
}
