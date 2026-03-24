"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function cameFromProjects(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (!document.referrer) {
    return false;
  }

  try {
    const referrer = new URL(document.referrer);

    return (
      referrer.origin === window.location.origin &&
      referrer.pathname.startsWith("/projects")
    );
  } catch {
    return false;
  }
}

export function ProjectDetailCloseButton() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/projects");
  }, [router]);

  function handleClick() {
    if (cameFromProjects()) {
      router.back();
      return;
    }

    router.push("/projects");
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
