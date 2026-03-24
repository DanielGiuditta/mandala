"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getProjectsReturnUrl } from "./project-navigation";

export function ProjectDetailCloseButton() {
  const router = useRouter();
  const returnUrl = getProjectsReturnUrl() ?? "/projects";

  useEffect(() => {
    router.prefetch(returnUrl);
  }, [returnUrl, router]);

  function handleClick() {
    router.push(returnUrl);
  }

  return (
    <button
      aria-label="Close and return to projects"
      className="entity-header-close-button"
      onClick={handleClick}
      type="button"
    >
      <img
        alt=""
        aria-hidden
        className="entity-header-close-icon"
        src="/figma/nav/close-icon.svg"
      />
    </button>
  );
}
