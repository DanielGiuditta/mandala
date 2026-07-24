"use client"

import type { SelfTimeTrackerData } from "@mandala/db"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"

import { signOutAction } from "../login/actions"
import { SidebarNav } from "../sidebar-nav"
import { EntityModal } from "./entity-modal"
import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
} from "./projects/project-avatar-utils"
import type { AppTheme } from "./theme"
import { TokenIcon } from "./ui/token-icon"
import { SelectDropdownField } from "./ui/dropdown"

export interface AppShellState {
  accessMessage: string | null
  configured: boolean
  displayName: string | null
  isAuthenticated: boolean
  officeName: string | null
  photoUrl: string | null
  primaryTier: string | null
  sessionEmail: string | null
  viewerEmail: string | null
}

const NAV_FORCE_COLLAPSE_WIDTH = 800
const TIME_TRACKER_STORAGE_PREFIX = "mandala.timeTracker"
const TRACKER_IDLE_TIMEOUT_MS = 5 * 60 * 1000
const TRACKER_ACTIVITY_HEARTBEAT_MS = 30 * 1000

interface RunningTrackerState {
  projectId: string
  projectName: string | null
  startedAt: string
}

interface TimeTrackerStorageKeys {
  running: string
  selectedProjectId: string
}

interface TimeTrackerMutationResponse {
  activeSession: SelfTimeTrackerData["activeSession"]
  error: string | null
  ok: boolean
  stoppedProjectId: string | null
}

function BrandMark() {
  return (
    <TokenIcon
      className="app-logo-icon app-logo-icon-open"
      src="/figma/nav/logo-icon.svg"
    />
  )
}

function CollapseIcon({ expanded }: { expanded: boolean }) {
  return (
    <TokenIcon
      className={`app-logo-collapse-icon ${expanded ? "" : "app-logo-collapse-icon-flipped"}`}
      src="/figma/nav/close-icon.svg"
    />
  )
}

function ProfileChevron({ expanded }: { expanded: boolean }) {
  return (
    <span className={`app-profile-chevron ${expanded ? "app-profile-chevron-open" : ""}`}>
      <svg
        aria-hidden
        className="dropdown-trigger-chevron-icon"
        viewBox="0 0 20 20"
      >
        <path
          d="M5.7 7.7a1 1 0 0 1 1.4 0L10 10.58l2.9-2.88a1 1 0 0 1 1.4 1.42l-3.6 3.58a1 1 0 0 1-1.4 0L5.7 9.12a1 1 0 0 1 0-1.42Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getTrackerElapsedHours(
  runningState: RunningTrackerState | null,
  nowTimestamp: number,
): number {
  if (!runningState) {
    return 0
  }

  const startedAt = new Date(runningState.startedAt)
  if (Number.isNaN(startedAt.getTime())) {
    return 0
  }

  if (startedAt.getTime() >= nowTimestamp) {
    return 0
  }

  return (nowTimestamp - startedAt.getTime()) / (1000 * 60 * 60)
}

function formatTodayHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  const wholeHours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60

  if (wholeHours === 0) {
    return `${remainingMinutes}m`
  }

  if (remainingMinutes === 0) {
    return `${wholeHours}h`
  }

  return `${wholeHours}h ${remainingMinutes}m`
}

function getTimeTrackerStorageKeys(sessionEmail: string): TimeTrackerStorageKeys {
  const namespace = `${TIME_TRACKER_STORAGE_PREFIX}:${sessionEmail.toLowerCase()}`
  return {
    running: `${namespace}:running`,
    selectedProjectId: `${namespace}:selectedProjectId`,
  }
}

function isDetailWorkspacePath(pathname: string | null): boolean {
  if (!pathname) {
    return false
  }

  return /^\/(?:people|projects)\/[^/]+$/.test(pathname)
}

function clearTimeTrackerStorage(sessionEmail: string) {
  const storageKeys = getTimeTrackerStorageKeys(sessionEmail)
  localStorage.removeItem(storageKeys.running)
  localStorage.removeItem(storageKeys.selectedProjectId)
}

function readTimeTrackerStorage(sessionEmail: string): {
  selectedProjectId: string
} {
  const storageKeys = getTimeTrackerStorageKeys(sessionEmail)
  const storedSelectedProjectId = localStorage.getItem(storageKeys.selectedProjectId) ?? ""
  // Active timers moved from browser storage to the shared server session.
  localStorage.removeItem(storageKeys.running)

  return {
    selectedProjectId: storedSelectedProjectId,
  }
}

export function AppSidebar({
  onThemeToggle,
  shell,
  theme,
}: {
  onThemeToggle: () => void
  shell: AppShellState
  theme: AppTheme
}) {
  const pathname = usePathname()
  const router = useRouter()
  const profilePanelId = useId()
  const signOutFormRef = useRef<HTMLFormElement | null>(null)
  const trackerHydrationKeyRef = useRef<string | null>(null)
  const trackerIdleTimeoutRef = useRef<number | null>(null)
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(false)
  const [isDetailWorkspaceNavExpanded, setIsDetailWorkspaceNavExpanded] = useState(false)
  const [isProfileExpanded, setIsProfileExpanded] = useState(false)
  const [viewportWidth, setViewportWidth] = useState<number>(NAV_FORCE_COLLAPSE_WIDTH)
  const [trackerVisible, setTrackerVisible] = useState(false)
  const [trackerLoading, setTrackerLoading] = useState(false)
  const [trackerSaving, setTrackerSaving] = useState(false)
  const [trackerAccessMessage, setTrackerAccessMessage] = useState<string | null>(null)
  const [trackerProjects, setTrackerProjects] = useState<SelfTimeTrackerData["projects"]>([])
  const [trackerSelectedProjectId, setTrackerSelectedProjectId] = useState("")
  const [trackerRunningState, setTrackerRunningState] = useState<RunningTrackerState | null>(null)
  const [trackerNowTimestamp, setTrackerNowTimestamp] = useState(() => Date.now())
  const [trackerError, setTrackerError] = useState<string | null>(null)
  const [trackerReloadVersion, setTrackerReloadVersion] = useState(0)
  const [pendingTrackerSwitchProjectId, setPendingTrackerSwitchProjectId] = useState<string | null>(null)
  const profileName = shell.displayName ?? shell.sessionEmail ?? "kolam user"
  const profileInitial = getFallbackAvatarInitial(profileName, "K")
  const profileAvatarStyle = getPersonFallbackAvatarStyle(profileName, "app-shell")
  const trackerSessionEmail = shell.sessionEmail ?? shell.viewerEmail
  const canSeeSidebarTimeTracker = shell.primaryTier === "partner" ||
    shell.primaryTier === "admin" ||
    shell.primaryTier === "projectLead" ||
    shell.primaryTier === "employee"
  const canDownloadDesktopAgent = shell.primaryTier === "partner" || shell.primaryTier === "admin"
  const isForcedCollapsed = viewportWidth < NAV_FORCE_COLLAPSE_WIDTH
  const isDetailWorkspaceOpen = isDetailWorkspacePath(pathname)
  const isSidebarOpen =
    !isForcedCollapsed &&
    !isManuallyCollapsed &&
    (!isDetailWorkspaceOpen || isDetailWorkspaceNavExpanded || Boolean(trackerRunningState))
  const profileAvatar = shell.photoUrl ? (
    <img
      alt=""
      aria-hidden
      className={`app-profile-avatar ${isSidebarOpen ? "app-profile-avatar-open" : "app-profile-avatar-closed"}`}
      src={shell.photoUrl}
    />
  ) : (
    <div
      aria-hidden="true"
      className={`app-profile-avatar app-profile-avatar-fallback ${isSidebarOpen ? "app-profile-avatar-open" : "app-profile-avatar-closed"}`}
      style={profileAvatarStyle}
    >
      {profileInitial}
    </div>
  )
  const profileContent = (
    <div className={`app-profile-trigger-content ${isSidebarOpen ? "" : "app-profile-trigger-content-closed"}`}>
      {profileAvatar}
      {isSidebarOpen ? (
        <div className="app-profile-trigger-copy">
          <p className="app-profile-name" title={profileName}>{profileName}</p>
        </div>
      ) : null}
    </div>
  )
  useEffect(() => {
    function syncViewportWidth() {
      setViewportWidth(window.innerWidth)
    }

    syncViewportWidth()
    window.addEventListener("resize", syncViewportWidth)

    return () => window.removeEventListener("resize", syncViewportWidth)
  }, [])

  useEffect(() => {
    if (!isSidebarOpen) {
      setIsProfileExpanded(false)
    }
  }, [isSidebarOpen])

  useEffect(() => {
    if (!isDetailWorkspaceOpen) {
      setIsDetailWorkspaceNavExpanded(false)
    }
  }, [isDetailWorkspaceOpen])

  const trackerSelectedProject = trackerProjects.find(
    (project) => project.id === trackerSelectedProjectId,
  )
  const trackerRunningProject = trackerProjects.find(
    (project) => project.id === trackerRunningState?.projectId,
  )
  const trackerRunningProjectName =
    trackerRunningState?.projectName ?? trackerRunningProject?.name ?? "Current project"
  const pendingTrackerSwitchProject = trackerProjects.find(
    (project) => project.id === pendingTrackerSwitchProjectId,
  )
  const trackerElapsedHours = getTrackerElapsedHours(
    trackerRunningState,
    trackerNowTimestamp,
  )
  const canStartTracker =
    canSeeSidebarTimeTracker &&
    Boolean(trackerSessionEmail) &&
    !trackerLoading &&
    !trackerSaving &&
    !trackerAccessMessage &&
    Boolean(trackerSelectedProjectId)
  const canStopTracker =
    canSeeSidebarTimeTracker &&
    Boolean(trackerSessionEmail) &&
    !trackerLoading &&
    !trackerSaving &&
    !trackerAccessMessage &&
    Boolean(trackerRunningState)

  useEffect(() => {
    if (!canSeeSidebarTimeTracker || !trackerSessionEmail) {
      trackerHydrationKeyRef.current = null
      setTrackerVisible(false)
      setTrackerProjects([])
      setTrackerSelectedProjectId("")
      setTrackerRunningState(null)
      setTrackerAccessMessage(null)
      setTrackerError(null)
      setTrackerLoading(false)
      setTrackerSaving(false)
      return
    }

    const trackerEmail = trackerSessionEmail
    const trackerHydrationKey = `${trackerEmail}:${getLocalDateString(new Date())}:${trackerReloadVersion}`
    const persistedState = readTimeTrackerStorage(trackerEmail)
    let isCancelled = false

    async function hydrateTracker() {
      try {
        const localDate = getLocalDateString(new Date())
        const requestStartedAt = performance.now()
        const trackerResponse = await fetch(
          `/api/time-tracker?localDate=${encodeURIComponent(localDate)}`,
          {
            credentials: "same-origin",
            method: "GET",
          },
        )

        const response = (await trackerResponse.json()) as SelfTimeTrackerData

        if (isCancelled) {
          return
        }

        if (process.env.NODE_ENV !== "production") {
          console.info(
            `[mandala-perf] ${JSON.stringify({
              durationMs: Math.round((performance.now() - requestStartedAt) * 100) / 100,
              forbidden: response.forbidden,
              projectCount: response.projects.length,
              scope: "client.timeTrackerFetch",
              status: trackerResponse.status,
            })}`,
          )
        }

        trackerHydrationKeyRef.current = trackerHydrationKey

        if (response.forbidden) {
          clearTimeTrackerStorage(trackerEmail)
          setTrackerProjects([])
          setTrackerSelectedProjectId("")
          setTrackerRunningState(null)
          setTrackerAccessMessage(
            response.accessMessage ?? response.configMessage ?? "Time tracker is unavailable.",
          )
          return
        }

        const storageKeys = getTimeTrackerStorageKeys(trackerEmail)
        const persistedTrackerState = readTimeTrackerStorage(trackerEmail)
        const storedSelectedProjectId = persistedTrackerState.selectedProjectId
        const availableProjectIds = new Set(response.projects.map((project) => project.id))

        const nextRunningState = response.activeSession
          ? {
              projectId: response.activeSession.projectId,
              projectName: response.activeSession.projectName,
              startedAt: response.activeSession.startedAt,
            }
          : null

        let nextSelectedProjectId = ""
        if (storedSelectedProjectId && availableProjectIds.has(storedSelectedProjectId)) {
          nextSelectedProjectId = storedSelectedProjectId
        } else {
          localStorage.removeItem(storageKeys.selectedProjectId)
        }

        if (response.accessMessage) {
          clearTimeTrackerStorage(trackerEmail)
        } else if (nextRunningState) {
          nextSelectedProjectId = nextRunningState.projectId
          localStorage.setItem(storageKeys.selectedProjectId, nextSelectedProjectId)
        }

        setTrackerProjects(response.projects)
        setTrackerSelectedProjectId(nextSelectedProjectId)
        setTrackerRunningState(nextRunningState)
        setTrackerAccessMessage(response.accessMessage)
        setTrackerVisible(true)
      } catch (error) {
        if (isCancelled) {
          return
        }
        setTrackerVisible(true)
        setTrackerProjects([])
        setTrackerSelectedProjectId(readTimeTrackerStorage(trackerEmail).selectedProjectId)
        setTrackerRunningState(null)
        setTrackerAccessMessage(null)
        setTrackerError(error instanceof Error ? error.message : "Unable to load tracker.")
      } finally {
        if (!isCancelled) {
          setTrackerLoading(false)
        }
      }
    }

    function startHydrate() {
      if (isCancelled) {
        return
      }

      void hydrateTracker()
    }

    setTrackerVisible(true)
    setTrackerAccessMessage(null)
    setTrackerError(null)
    setTrackerLoading(false)
    setTrackerSelectedProjectId(persistedState.selectedProjectId)
    setTrackerRunningState(null)

    if (trackerHydrationKeyRef.current === trackerHydrationKey) {
      return () => {
        isCancelled = true
      }
    }

    setTrackerLoading(true)
    const idleCallbackId =
      "requestIdleCallback" in window
        ? window.requestIdleCallback(startHydrate, { timeout: 1_500 })
        : null
    const fallbackTimeoutId =
      idleCallbackId === null
        ? window.setTimeout(startHydrate, 250)
        : null

    return () => {
      isCancelled = true
      if (idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId)
      }
      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId)
      }
    }
  }, [
    canSeeSidebarTimeTracker,
    trackerReloadVersion,
    trackerSessionEmail,
  ])

  useEffect(() => {
    if (!trackerRunningState || trackerSaving) {
      return
    }

    setTrackerNowTimestamp(Date.now())
    const intervalId = window.setInterval(() => {
      setTrackerNowTimestamp(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [trackerRunningState, trackerVisible])

  useEffect(() => {
    if (!trackerRunningState) {
      if (trackerIdleTimeoutRef.current !== null) {
        window.clearTimeout(trackerIdleTimeoutRef.current)
        trackerIdleTimeoutRef.current = null
      }
      return
    }

    let lastActivityHeartbeatAt = Date.now()

    function scheduleIdleStop() {
      if (trackerIdleTimeoutRef.current !== null) {
        window.clearTimeout(trackerIdleTimeoutRef.current)
      }

      trackerIdleTimeoutRef.current = window.setTimeout(() => {
        void handleTrackerStop("idle")
      }, TRACKER_IDLE_TIMEOUT_MS)
    }

    function recordActivity() {
      scheduleIdleStop()

      if (Date.now() - lastActivityHeartbeatAt < TRACKER_ACTIVITY_HEARTBEAT_MS) {
        return
      }

      lastActivityHeartbeatAt = Date.now()
      void fetch("/api/time-tracker", {
        body: JSON.stringify({ action: "activity" }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    }

    const activityEvents: Array<keyof DocumentEventMap> = [
      "keydown",
      "mousedown",
      "mousemove",
      "scroll",
      "touchstart",
    ]

    scheduleIdleStop()
    activityEvents.forEach((eventName) =>
      document.addEventListener(eventName, recordActivity, { passive: true }),
    )

    return () => {
      if (trackerIdleTimeoutRef.current !== null) {
        window.clearTimeout(trackerIdleTimeoutRef.current)
        trackerIdleTimeoutRef.current = null
      }
      activityEvents.forEach((eventName) =>
        document.removeEventListener(eventName, recordActivity),
      )
    }
  }, [trackerRunningState, trackerSaving])

  async function handleTrackerStop(reason: "idle" | "manual" = "manual") {
    if (!trackerSessionEmail || !trackerRunningState || trackerSaving || trackerLoading) {
      return
    }

    setTrackerSaving(true)
    setTrackerError(null)
    const entryDate = getLocalDateString(new Date())

    try {
      const response = await fetch("/api/time-tracker", {
        body: JSON.stringify({
          action: "stop",
          entryDate,
        }),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
      const result = (await response.json()) as TimeTrackerMutationResponse

      if (!result.ok) {
        setTrackerError(result.error ?? "Unable to save tracked time.")
        return
      }

      setTrackerRunningState(null)
      setTrackerReloadVersion((value) => value + 1)
      if (reason === "idle") {
        setTrackerError("Timer paused after 5 minutes of inactivity.")
      }
      router.refresh()
    } catch (error) {
      setTrackerError(error instanceof Error ? error.message : "Unable to save tracked time.")
    } finally {
      setTrackerSaving(false)
    }
  }

  async function startTracker(confirmSwitch: boolean) {
    if (!trackerSessionEmail || !trackerSelectedProjectId || trackerLoading || trackerSaving) {
      return
    }

    setTrackerSaving(true)
    setTrackerError(null)

    try {
      const response = await fetch("/api/time-tracker", {
        body: JSON.stringify({
          action: "start",
          confirmSwitch,
          entryDate: getLocalDateString(new Date()),
          projectId: trackerSelectedProjectId,
        }),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
      const result = (await response.json()) as TimeTrackerMutationResponse

      if (!result.ok || !result.activeSession) {
        setTrackerError(result.error ?? "Unable to start the timer.")
        return
      }

      const storageKeys = getTimeTrackerStorageKeys(trackerSessionEmail)
      localStorage.setItem(storageKeys.selectedProjectId, result.activeSession.projectId)
      setTrackerSelectedProjectId(result.activeSession.projectId)
      setTrackerRunningState({
        projectId: result.activeSession.projectId,
        projectName: result.activeSession.projectName,
        startedAt: result.activeSession.startedAt,
      })
      setTrackerNowTimestamp(Date.now())
      setPendingTrackerSwitchProjectId(null)
      setTrackerReloadVersion((value) => value + 1)
      router.refresh()
    } catch (error) {
      setTrackerError(error instanceof Error ? error.message : "Unable to start the timer.")
    } finally {
      setTrackerSaving(false)
    }
  }

  function handleTrackerStart() {
    if (trackerRunningState && trackerRunningState.projectId !== trackerSelectedProjectId) {
      setPendingTrackerSwitchProjectId(trackerSelectedProjectId)
      return
    }

    void startTracker(false)
  }

  function handleTrackerSelectionChange(nextProjectId: string) {
    if (!trackerSessionEmail) {
      return
    }

    const trackerEmail = trackerSessionEmail
    const storageKeys = getTimeTrackerStorageKeys(trackerEmail)
    if (!nextProjectId) {
      localStorage.removeItem(storageKeys.selectedProjectId)
      setTrackerSelectedProjectId("")
      return
    }

    localStorage.setItem(storageKeys.selectedProjectId, nextProjectId)
    setTrackerSelectedProjectId(nextProjectId)
  }

  return (
    <>
    <aside className={`app-sidebar ${isSidebarOpen ? "app-sidebar-open" : "app-sidebar-closed"}`}>
      <div className="app-sidebar-top">
        <div className={`app-logo-row ${isSidebarOpen ? "app-logo-row-open" : "app-logo-row-closed"}`}>
          <div className="app-logo-brand">
            <BrandMark />
            {isSidebarOpen ? <span className="app-logo-name">kolam</span> : null}
          </div>
          <button
            aria-hidden={!isSidebarOpen}
            aria-label="Collapse sidebar"
            className={`app-nav-toggle-button ${isSidebarOpen ? "" : "app-control-hidden"}`}
            onClick={(event) => {
              event.preventDefault()
              setIsManuallyCollapsed(true)
            }}
            tabIndex={isSidebarOpen ? 0 : -1}
            type="button"
          >
            <CollapseIcon expanded />
          </button>
        </div>

        <SidebarNav isOpen={isSidebarOpen} primaryTier={shell.primaryTier} />

        <div className={`app-pinned-divider ${isSidebarOpen ? "" : "app-pinned-divider-closed"}`} />

        <button
          aria-hidden={isSidebarOpen}
          aria-label="Expand sidebar"
          className={`app-nav-open-button ${isSidebarOpen ? "app-control-hidden" : ""}`}
          onClick={(event) => {
            event.preventDefault()
            if (!isForcedCollapsed) {
              setIsManuallyCollapsed(false)
              if (isDetailWorkspaceOpen) {
                setIsDetailWorkspaceNavExpanded(true)
              }
            }
          }}
          tabIndex={isSidebarOpen ? -1 : 0}
          type="button"
        >
          <CollapseIcon expanded={false} />
        </button>

      </div>

      <div className={`app-sidebar-bottom ${isSidebarOpen ? "" : "app-sidebar-bottom-closed"}`}>
        {isSidebarOpen && canSeeSidebarTimeTracker && trackerSessionEmail ? (
          <section
            className="app-time-tracker"
            aria-label="Time tracker"
          >
            <p className="app-time-tracker-title">Time tracker</p>
            <SelectDropdownField
              ariaLabel="Tracked project"
              disabled={trackerLoading || trackerSaving}
              options={trackerProjects.map((project) => ({ label: project.name, value: project.id }))}
              placeholder={trackerLoading ? "Loading projects..." : "Select project"}
              value={trackerSelectedProjectId}
              onValueChange={handleTrackerSelectionChange}
            />

            {trackerRunningState ? (
              <>
                {trackerSelectedProjectId !== trackerRunningState.projectId ? (
                  <button
                    className="app-time-tracker-button"
                    disabled={!canStartTracker}
                    onClick={handleTrackerStart}
                    type="button"
                  >
                    Start Work
                  </button>
                ) : null}
                <button
                  className="app-time-tracker-button app-time-tracker-button-stop"
                  disabled={!canStopTracker}
                  onClick={() => void handleTrackerStop()}
                  type="button"
                >
                  Stop
                </button>
              </>
            ) : (
              <button
                className="app-time-tracker-button"
                disabled={!canStartTracker}
                onClick={handleTrackerStart}
                type="button"
              >
                Start Work
              </button>
            )}

            <p className="app-time-tracker-today">
              {trackerRunningState
                ? `${trackerRunningProjectName} · ${formatTodayHours(trackerElapsedHours)} active`
                : trackerSelectedProject
                  ? `${formatTodayHours(trackerSelectedProject.todayHours)} today`
                  : "No active project"}
            </p>
            {trackerAccessMessage ? (
              <p className="pd-form-error app-time-tracker-error">{trackerAccessMessage}</p>
            ) : null}
            {trackerError ? <p className="pd-form-error app-time-tracker-error">{trackerError}</p> : null}
          </section>
        ) : null}

        <form action={signOutAction} hidden ref={signOutFormRef} />
        {isSidebarOpen ? (
          <section
            aria-label="Profile menu"
            className={`app-profile-panel ${isProfileExpanded ? "app-profile-panel-open" : ""}`}
          >
            {isProfileExpanded ? (
              <div className="app-profile-panel-body" id={profilePanelId}>
                <button
                  aria-checked={theme === "dark"}
                  className="app-profile-theme-toggle"
                  onClick={onThemeToggle}
                  role="switch"
                  type="button"
                >
                  <span className="app-profile-theme-copy">
                    <span className="app-profile-theme-label">Dark mode</span>
                    <span className="app-profile-theme-value">
                      {theme === "dark" ? "On" : "Off"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`app-profile-theme-track ${theme === "dark" ? "app-profile-theme-track-active" : ""}`}
                  >
                    <span className="app-profile-theme-thumb" />
                  </span>
                </button>
                {canDownloadDesktopAgent ? (
                  <button
                    className="ghost-button app-profile-panel-action"
                    onClick={() => {
                      setIsProfileExpanded(false)
                      router.push("/desktop-agent")
                    }}
                    type="button"
                  >
                    Windows companion
                  </button>
                ) : null}
                <button
                  className="ghost-button app-profile-panel-action"
                  onClick={() => signOutFormRef.current?.requestSubmit()}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            ) : null}
            <button
              aria-controls={profilePanelId}
              aria-expanded={isProfileExpanded}
              className="app-profile-trigger"
              onClick={() => setIsProfileExpanded((current) => !current)}
              type="button"
            >
              {profileContent}
              <ProfileChevron expanded={isProfileExpanded} />
            </button>
          </section>
        ) : (
          <div className="app-sidebar-profile app-sidebar-profile-closed">{profileAvatar}</div>
        )}
      </div>
    </aside>
    {trackerRunningState && !isSidebarOpen ? (
      <div className="app-active-work-floating" aria-label="Current active project">
        <span className="app-active-work-kicker">Tracking</span>
        <span className="app-active-work-copy">
          {trackerRunningProjectName} · {formatTodayHours(trackerElapsedHours)} active
        </span>
      </div>
    ) : null}
    {pendingTrackerSwitchProject && trackerRunningState ? (
      <EntityModal>
        <section aria-label="Confirm project switch" className="pd-card" role="dialog">
          <h2 className="pd-card-title">Switch active project?</h2>
          <p className="pd-meta-text">
            You are currently tracking {trackerRunningProjectName}. Do you want to stop it and start tracking {pendingTrackerSwitchProject.name}?
          </p>
          <div className="pd-inline-form-actions">
            <button
              className="pd-secondary-button"
              disabled={trackerSaving}
              onClick={() => setPendingTrackerSwitchProjectId(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="pd-primary-button"
              disabled={trackerSaving}
              onClick={() => void startTracker(true)}
              type="button"
            >
              Stop and start work
            </button>
          </div>
        </section>
      </EntityModal>
    ) : null}
    </>
  )
}
