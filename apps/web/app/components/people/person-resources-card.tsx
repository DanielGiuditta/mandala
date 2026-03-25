import { ProjectCardHeader } from "../projects/project-card-header";

export function PersonResourcesCard() {
  return (
    <section className="pd-card">
      <ProjectCardHeader title="Resources" />
      <p className="pd-empty">
        Person-level resources are not available yet in the current backend contract.
      </p>
    </section>
  );
}
