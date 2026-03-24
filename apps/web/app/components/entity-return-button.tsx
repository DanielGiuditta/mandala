"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  getEntityReturnUrl,
  type EntityReturnScope,
} from "./entity-return-url";

interface EntityReturnButtonProps {
  ariaLabel?: string;
  className?: string;
  fallbackHref: string;
  iconSrc?: string;
  label?: string;
  scope: EntityReturnScope;
}

export function EntityReturnButton({
  ariaLabel,
  className,
  fallbackHref,
  iconSrc,
  label,
  scope,
}: EntityReturnButtonProps) {
  const router = useRouter();
  const returnUrl = getEntityReturnUrl(scope) ?? fallbackHref;

  useEffect(() => {
    router.prefetch(returnUrl);
  }, [returnUrl, router]);

  function handleClick() {
    router.push(returnUrl);
  }

  return (
    <button
      aria-label={ariaLabel ?? label}
      className={className}
      onClick={handleClick}
      type="button"
    >
      {iconSrc ? (
        <img
          alt=""
          aria-hidden
          className="entity-header-close-icon"
          src={iconSrc}
        />
      ) : null}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
