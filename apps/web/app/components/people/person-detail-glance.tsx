import type { PersonDetailData } from "@mandala/db";

import { Avatar, formatHoursWithUnit, formatInrMetric } from "./person-detail-utils";

interface PersonDetailGlanceProps {
  person: NonNullable<PersonDetailData["person"]>;
}

export function PersonDetailGlance({ person }: PersonDetailGlanceProps) {
  const sourcedProject = person.staffedProjects[0] ?? null;
  const additionalProjectCount = Math.max(
    0,
    person.staffedProjects.length - (sourcedProject ? 1 : 0),
  );
  const hoursThisWeek = person.hoursThisWeek;

  return (
    <section className="pd-glance-card">
      <h3 className="pd-card-title">At a glance</h3>
      <div className="pd-glance-grid pd-glance-grid-person">
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Sourced to</span>
          {sourcedProject ? (
            <strong title={sourcedProject.projectName}>
              {sourcedProject.projectName}
              {additionalProjectCount > 0 ? ` +${additionalProjectCount}` : ""}
            </strong>
          ) : (
            <strong>No tracked projects</strong>
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Office</span>
          <strong>{person.officeName}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Supervisor</span>
          <span className="pd-person-chip">
            <Avatar
              fallbackKey={person.supervisorPersonId ?? person.id}
              label={person.supervisorName ?? "No supervisor"}
              photoUrl={person.supervisorPhotoUrl}
              variant="person"
            />
            <strong>{person.supervisorName ?? "No supervisor assigned"}</strong>
          </span>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Hours this week</span>
          <strong>{formatHoursWithUnit(hoursThisWeek)}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Permission</span>
          <strong>{person.effectivePermissionLabel ?? "No account"}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Role</span>
          <strong>{person.title ?? "Not set"}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Salary</span>
          <strong>{formatInrMetric(person.annualSalary)}</strong>
        </div>
      </div>
    </section>
  );
}
