import type { ProjectDetailData } from "@mandala/db";

import { EntityModal } from "../entity-modal";
import { EntityReturnButton } from "../entity-return-button";
import { ProjectDetailEntity } from "./project-detail-entity";

interface ProjectDetailOverlayProps {
  data: ProjectDetailData;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  projectId: string;
}

export function ProjectDetailOverlay({
  data,
  loadPeopleOptionsAction,
  projectId,
}: ProjectDetailOverlayProps) {
  return (
    <EntityModal panelClassName="entity-modal-panel-project">
      {data.forbidden ? (
        <section className="pd-card entity-modal-state-card">
          <div className="button-row">
            <EntityReturnButton
              className="secondary"
              fallbackHref="/projects"
              label="Back to projects"
              scope="projects"
            />
          </div>
          <div className="pd-card-header">
            <h2 className="pd-card-title">Project access</h2>
          </div>
          <p className="pd-empty">
            {data.accessMessage ??
              "This viewer does not have access to the requested project."}
          </p>
          {data.viewerLabel ? (
            <p className="pd-meta-text">Viewer: {data.viewerLabel}</p>
          ) : null}
          {!data.configured && data.configMessage ? (
            <p className="pd-meta-text">{data.configMessage}</p>
          ) : null}
        </section>
      ) : (
        <ProjectDetailEntity
          data={data}
          loadPeopleOptionsAction={loadPeopleOptionsAction}
          projectId={projectId}
        />
      )}
    </EntityModal>
  );
}
