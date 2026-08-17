"use client";

import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { useState } from "react";

import {
  getEntityReturnUrl,
  type EntityReturnScope,
} from "./entity-return-url";

interface EntityReturnButtonProps {
  ariaLabel?: string;
  className?: string;
  fallbackHref: string;
  icon?: ReactNode;
  iconSrc?: string;
  label?: string;
  scope: EntityReturnScope;
}

export function EntityReturnButton({
  ariaLabel,
  className,
  fallbackHref,
  icon,
  iconSrc,
  label,
  scope,
}: EntityReturnButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const returnUrl = getEntityReturnUrl(scope) ?? fallbackHref;

  function handleClick() {
    setIsPending(true);
    router.replace(returnUrl);
  }

  return (
    <button
      aria-label={ariaLabel ?? label}
      aria-busy={isPending || undefined}
      className={`${className ?? ""}${isPending ? " entity-navigation-pending" : ""}`}
      disabled={isPending}
      onClick={handleClick}
      type="button"
    >
      {icon ? icon : null}
      {!icon && iconSrc ? (
        <img
          alt=""
          aria-hidden
          className="app-close-button-icon"
          src={iconSrc}
        />
      ) : null}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
