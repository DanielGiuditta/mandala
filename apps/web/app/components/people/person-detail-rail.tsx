import Link from "next/link";

import type { PersonListItem } from "@mandala/db";

import { EntityHeader } from "../entity-header";
import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
} from "../projects/project-avatar-utils";

interface PersonDetailRailProps {
  activePersonId: string;
  configured: boolean;
  forbidden: boolean;
  people: PersonListItem[];
}

export function PersonDetailRail({
  activePersonId,
  configured,
  forbidden,
  people,
}: PersonDetailRailProps) {
  return (
    <aside className="pd-rail">
      <EntityHeader className="pd-rail-header" title="People" />
      <div className="projects-list-collapsed">
        {forbidden ? (
          <div className="projects-list-empty">No people access for the current viewer.</div>
        ) : people.length === 0 ? (
          <div className="projects-list-empty">
            {configured ? "No people are available." : "Configure the database connection to load people."}
          </div>
        ) : (
          people.map((person) => {
            const isActive = person.id === activePersonId;
            return (
              <Link
                className={`projects-collapsed-row ${isActive ? "projects-collapsed-row-active" : ""}`}
                href={`/people/${person.id}`}
                key={person.id}
                prefetch
              >
                {person.photoUrl ? (
                  <img alt="" aria-hidden className="people-avatar-image" loading="lazy" src={person.photoUrl} />
                ) : (
                  <span
                    aria-hidden
                    className="people-avatar-fallback"
                    style={getPersonFallbackAvatarStyle(person.fullName, person.id)}
                  >
                    {getFallbackAvatarInitial(person.fullName, "P")}
                  </span>
                )}
                <span className="projects-collapsed-row-text">{person.fullName}</span>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
