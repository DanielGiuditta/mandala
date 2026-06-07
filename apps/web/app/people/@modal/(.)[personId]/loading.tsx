import { EntityDetailLoading } from "../../../components/entity-detail-loading";
import { EntityModal } from "../../../components/entity-modal";

export default function PersonDetailModalLoading() {
  return (
    <EntityModal
      panelClassName="entity-modal-panel-project-workspace"
      showBackdrop={false}
    >
      <EntityDetailLoading />
    </EntityModal>
  );
}
