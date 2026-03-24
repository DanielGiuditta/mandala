const PROJECTS_RETURN_URL_KEY = "kolam-projects-return-url";

export function rememberProjectsReturnUrl(url: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PROJECTS_RETURN_URL_KEY, url);
}

export function getProjectsReturnUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(PROJECTS_RETURN_URL_KEY);
}
