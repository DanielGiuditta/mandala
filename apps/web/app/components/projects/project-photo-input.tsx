"use client"

import { useEffect, useMemo, useRef } from "react"

import { getProjectFallbackColor, getProjectFallbackInitial } from "./project-create-utils"

interface ProjectPhotoInputProps {
  inputId: string
  photoFile: File | null
  projectName: string
  onPhotoChange: (file: File | null) => void
}

export function ProjectPhotoInput({
  inputId,
  photoFile,
  projectName,
  onPhotoChange,
}: ProjectPhotoInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrl = useMemo(() => {
    if (!photoFile) {
      return null
    }

    return URL.createObjectURL(photoFile)
  }, [photoFile])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

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
        className="project-create-photo-trigger"
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        {previewUrl ? (
          <img
            alt="Selected project photo preview"
            className="project-create-photo-preview-image"
            src={previewUrl}
          />
        ) : (
          <span
            aria-hidden
            className="project-create-photo-fallback"
            style={{ backgroundColor: getProjectFallbackColor(projectName) }}
          >
            {getProjectFallbackInitial(projectName)}
          </span>
        )}
        <span aria-hidden className="project-create-photo-overlay-icon">
          <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
            <rect height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" width="20" x="2" y="4" />
            <circle cx="8" cy="10" fill="currentColor" r="1.5" />
            <path
              d="M3.5 17L8.8 12.2C9.2 11.8 9.9 11.8 10.3 12.2L12.6 14.5L15.1 12C15.5 11.6 16.2 11.6 16.6 12L20.5 16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </span>
      </button>
    </div>
  )
}
