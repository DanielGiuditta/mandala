"use client"

import { EntityFormPhotoInput } from "../ui/entity-form-photo-input"
import { getProjectFallbackInitial, getProjectFallbackStyle } from "./project-create-utils"

interface ProjectPhotoInputProps {
  inputId: string
  photoFile: File | null
  photoUrl?: string | null
  projectName: string
  onPhotoChange: (file: File | null) => void
}

export function ProjectPhotoInput({
  inputId,
  photoFile,
  photoUrl = null,
  projectName,
  onPhotoChange,
}: ProjectPhotoInputProps) {
  return (
    <EntityFormPhotoInput
      fallbackInitial={getProjectFallbackInitial(projectName)}
      fallbackStyle={getProjectFallbackStyle(projectName)}
      inputId={inputId}
      onPhotoChange={onPhotoChange}
      photoFile={photoFile}
      photoUrl={photoUrl}
      previewAlt="Selected project photo preview"
    />
  )
}
