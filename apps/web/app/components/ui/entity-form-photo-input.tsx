"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef } from "react";

interface EntityFormPhotoInputProps {
  fallbackInitial: string;
  fallbackStyle: CSSProperties;
  inputId: string;
  onPhotoChange: (file: File | null) => void;
  photoFile: File | null;
  photoUrl?: string | null;
  previewAlt: string;
}

export function EntityFormPhotoInput({
  fallbackInitial,
  fallbackStyle,
  inputId,
  onPhotoChange,
  photoFile,
  photoUrl = null,
  previewAlt,
}: EntityFormPhotoInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = useMemo(() => {
    if (!photoFile) {
      return null;
    }

    return URL.createObjectURL(photoFile);
  }, [photoFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="project-create-photo-field">
      <input
        accept="image/*"
        className="project-create-photo-native-input"
        id={inputId}
        onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
        ref={fileInputRef}
        type="file"
      />
      <button
        aria-controls={inputId}
        aria-label="Add photo"
        className="project-create-photo-trigger"
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        {previewUrl || photoUrl ? (
          <img
            alt={previewAlt}
            className="project-create-photo-preview-image"
            src={previewUrl ?? photoUrl ?? undefined}
          />
        ) : (
          <span
            aria-hidden
            className="project-create-photo-fallback"
            style={fallbackStyle}
          >
            {fallbackInitial}
          </span>
        )}
        <span aria-hidden className="project-create-photo-overlay">
          <span className="project-create-photo-action-label">Add</span>
        </span>
      </button>
    </div>
  );
}
