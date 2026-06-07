"use client";

import { EntityFormPhotoInput } from "../ui/entity-form-photo-input";
import {
  getPersonCreateFallbackInitial,
  getPersonCreateFallbackStyle,
} from "./person-create-utils";

interface PersonPhotoInputProps {
  inputId: string;
  onPhotoChange: (file: File | null) => void;
  personName: string;
  photoFile: File | null;
  photoUrl?: string | null;
}

export function PersonPhotoInput({
  inputId,
  onPhotoChange,
  personName,
  photoFile,
  photoUrl = null,
}: PersonPhotoInputProps) {
  return (
    <EntityFormPhotoInput
      fallbackInitial={getPersonCreateFallbackInitial(personName)}
      fallbackStyle={getPersonCreateFallbackStyle(personName)}
      inputId={inputId}
      onPhotoChange={onPhotoChange}
      photoFile={photoFile}
      photoUrl={photoUrl}
      previewAlt="Selected person photo preview"
    />
  );
}
