"use client";

import type { ProjectStage } from "@mandala/domain";

import type { SelectDropdownOption } from "../ui/dropdown";
import { formatProjectStageLabel } from "./project-create-utils";
import { stageIcon } from "./projects-formatters";

/** Stage row for listboxes: emoji + label (matches stage pills across the app). */
export function projectStageToSelectOption(stage: ProjectStage): SelectDropdownOption {
  return {
    label: formatProjectStageLabel(stage),
    leadingVisual: <span className="dropdown-stage-emoji-slot">{stageIcon(stage)}</span>,
    leadingVisualShape: "bare",
    value: stage,
  };
}
