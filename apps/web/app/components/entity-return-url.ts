export type EntityReturnScope = "people" | "projects";

function getListPath(scope: EntityReturnScope): string {
  return scope === "people" ? "/people" : "/projects";
}

function getStorageKey(scope: EntityReturnScope): string {
  return `kolam-return-url:${scope}`;
}

function normalizeEntityReturnUrl(scope: EntityReturnScope, url: string): string {
  if (typeof window === "undefined") {
    return getListPath(scope);
  }

  const listPath = getListPath(scope);

  try {
    const resolvedUrl = new URL(url, window.location.origin);

    if (resolvedUrl.pathname === listPath) {
      return `${resolvedUrl.pathname}${resolvedUrl.search}`;
    }
  } catch {
    return listPath;
  }

  return listPath;
}

export function rememberEntityReturnUrl(
  scope: EntityReturnScope,
  url: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getStorageKey(scope), normalizeEntityReturnUrl(scope, url));
}

export function getEntityReturnUrl(
  scope: EntityReturnScope,
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedUrl = window.sessionStorage.getItem(getStorageKey(scope));

  if (!storedUrl) {
    return null;
  }

  return normalizeEntityReturnUrl(scope, storedUrl);
}
