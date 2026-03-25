"use client"

import type { SelfTimeTrackerData } from "@mandala/db"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"

import { signOutAction } from "../login/actions"
import { SidebarNav } from "../sidebar-nav"
import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
} from "./projects/project-avatar-utils"
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
}

const NAV_FORCE_COLLAPSE_WIDTH = 800
const TIME_TRACKER_STORAGE_PREFIX = "mandala.timeTracker"

interface RunningTrackerState {
  projectId: string
  startedAt: string
}

interface TimeTrackerStorageKeys {
  running: string
  selectedProjectId: string
}

interface TimeTrackerMutationResponse {
  error: string | null
  ok: boolean
  todayHours: number | null
}

function BrandMark() {
  return (
    <img
      alt=""
      aria-hidden
      className="app-logo-icon app-logo-icon-open"
      src="/figma/nav/logo-icon.svg"
    />
  )
}

function CollapseIcon({ expanded }: { expanded: boolean }) {
  return (
    <img
      alt=""
      aria-hidden
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

function getTrackerRunningHoursForToday(
  runningState: RunningTrackerState | null,
  selectedProjectId: string,
  nowTimestamp: number,
): number {
  if (!runningState || runningState.projectId !== selectedProjectId) {
    return 0
  }

  const startedAt = new Date(runningState.startedAt)
  if (Number.isNaN(startedAt.getTime())) {
    return 0
  }

  const now = new Date(nowTimestamp)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const effectiveStart = startedAt > dayStart ? startedAt : dayStart

  if (effectiveStart.getTime() >= nowTimestamp) {
    return 0
  }

  return (nowTimestamp - effectiveStart.getTime()) / (1000 * 60 * 60)
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

function isRunningTrackerState(value: unknown): value is RunningTrackerState {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as { projectId?: unknown; startedAt?: unknown }
  if (typeof candidate.projectId !== "string" || typeof candidate.startedAt !== "string") {
    return false
  }

  return !Number.isNaN(new Date(candidate.startedAt).getTime())
}

function getTimeTrackerStorageKeys(sessionEmail: string): TimeTrackerStorageKeys {
  const namespace = `${TIME_TRACKER_STORAGE_PREFIX}:${sessionEmail.toLowerCase()}`
  return {
    running: `${namespace}:running`,
    selectedProjectId: `${namespace}:selectedProjectId`,
  }
}

function clearTimeTrackerStorage(sessionEmail: string) {
  const storageKeys = getTimeTrackerStorageKeys(sessionEmail)
  localStorage.removeItem(storageKeys.running)
  localStorage.removeItem(storageKeys.selectedProjectId)
}

function readTimeTrackerStorage(sessionEmail: string): {
  runningState: RunningTrackerState | null
  selectedProjectId: string
} {
  const storageKeys = getTimeTrackerStorageKeys(sessionEmail)
  const storedSelectedProjectId = localStorage.getItem(storageKeys.selectedProjectId) ?? ""
  const storedRunningStateRaw = localStorage.getItem(storageKeys.running)
  let runningState: RunningTrackerState | null = null

  if (storedRunningStateRaw) {
    try {
      const parsedRunningState = JSON.parse(storedRunningStateRaw)
      if (isRunningTrackerState(parsedRunningState)) {
        runningState = parsedRunningState
      } else {
        localStorage.removeItem(storageKeys.running)
      }
    } catch {
      localStorage.removeItem(storageKeys.running)
    }
  }

  return {
    runningState,
    selectedProjectId: storedSelectedProjectId || runningState?.projectId || "",
  }
}

export function AppSidebar({ shell }: { shell: AppShellState }) {
  const router = useRouter()
  const profilePanelId = useId()
  const signOutFormRef = useRef<HTMLFormElement | null>(null)
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(false)
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
  const profileName = shell.displayName ?? shell.sessionEmail ?? "kolam user"
  const profileInitial = getFallbackAvatarInitial(profileName, "K")
  const profileAvatarStyle = getPersonFallbackAvatarStyle(profileName, "app-shell")
  const sessionEmail = shell.sessionEmail
  const isForcedCollapsed = viewportWidth < NAV_FORCE_COLLAPSE_WIDTH
  const isSidebarOpen = !isForcedCollapsed && !isManuallyCollapsed
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
          <p className="app-profile-name">{profileName}</p>
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

  const trackerSelectedProject = trackerProjects.find(
    (project) => project.id === trackerSelectedProjectId,
  )
  const trackerDisplayHours =
    (trackerSelectedProject?.todayHours ?? 0) +
    getTrackerRunningHoursForToday(
      trackerRunningState,
      trackerSelectedProjectId,
      trackerNowTimestamp,
    )
  const canStartTracker =
    trackerVisible &&
    !trackerLoading &&
    !trackerSaving &&
    !trackerAccessMessage &&
    !trackerRunningState &&
    Boolean(trackerSelectedProjectId)
  const canStopTracker =
    trackerVisible &&
    !trackerLoading &&
    !trackerSaving &&
    !trackerAccessMessage &&
    Boolean(trackerRunningState)

  useEffect(() => {
    if (!isSidebarOpen || !shell.isAuthenticated || !sessionEmail) {
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

    const trackerSessionEmail: string = sessionEmail
    let isCancelled = false

    async function hydrateTracker() {
      const persistedState = readTimeTrackerStorage(trackerSessionEmail)
      setTrackerVisible(true)
      setTrackerLoading(true)
      setTrackerAccessMessage(null)
      setTrackerError(null)
      setTrackerSelectedProjectId(persistedState.selectedProjectId)
      setTrackerRunningState(persistedState.runningState)

      try {
        const localDate = getLocalDateString(new Date())
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

        if (response.forbidden || !response.configured) {
          clearTimeTrackerStorage(trackerSessionEmail)
          setTrackerProjects([])
          setTrackerSelectedProjectId("")
          setTrackerRunningState(null)
          setTrackerAccessMessage(
            response.accessMessage ?? response.configMessage ?? "Time tracker is unavailable.",
          )
          return
        }

        const storageKeys = getTimeTrackerStorageKeys(trackerSessionEmail)
        const persistedTrackerState = readTimeTrackerStorage(trackerSessionEmail)
        const storedSelectedProjectId = persistedTrackerState.selectedProjectId
        const availableProjectIds = new Set(response.projects.map((project) => project.id))

        let nextRunningState = persistedTrackerState.runningState

        let nextSelectedProjectId = ""
        if (storedSelectedProjectId && availableProjectIds.has(storedSelectedProjectId)) {
          nextSelectedProjectId = storedSelectedProjectId
        } else {
          localStorage.removeItem(storageKeys.selectedProjectId)
        }

        if (nextRunningState && !availableProjectIds.has(nextRunningState.projectId)) {
          nextRunningState = null
          nextSelectedProjectId = ""
          clearTimeTrackerStorage(trackerSessionEmail)
        } else if (response.accessMessage) {
          nextRunningState = null
          clearTimeTrackerStorage(trackerSessionEmail)
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
        const persistedTrackerState = readTimeTrackerStorage(trackerSessionEmail)
        setTrackerVisible(true)
        setTrackerProjects([])
        setTrackerSelectedProjectId(persistedTrackerState.selectedProjectId)
        setTrackerRunningState(persistedTrackerState.runningState)
        setTrackerAccessMessage(null)
        setTrackerError(error instanceof Error ? error.message : "Unable to load tracker.")
      } finally {
        if (!isCancelled) {
          setTrackerLoading(false)
        }
      }
    }

    void hydrateTracker()

    return () => {
      isCancelled = true
    }
  }, [isSidebarOpen, shell.isAuthenticated, sessionEmail])

  useEffect(() => {
    if (!isSidebarOpen || !trackerVisible || !trackerRunningState) {
      return
    }

    setTrackerNowTimestamp(Date.now())
    const intervalId = window.setInterval(() => {
      setTrackerNowTimestamp(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [isSidebarOpen, trackerRunningState, trackerVisible])

  async function handleTrackerStop() {
    if (!sessionEmail || !trackerRunningState || trackerSaving || trackerLoading) {
      return
    }

    setTrackerSaving(true)
    setTrackerError(null)
    const stoppedAt = new Date().toISOString()
    const entryDate = getLocalDateString(new Date())

    try {
      const response = await fetch("/api/time-tracker", {
        body: JSON.stringify({
          entryDate,
          projectId: trackerRunningState.projectId,
          startedAt: trackerRunningState.startedAt,
          stoppedAt,
        }),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
      const result = (await response.json()) as TimeTrackerMutationResponse

      if (!result.ok || result.todayHours == null) {
        setTrackerError(result.error ?? "Unable to save tracked time.")
        return
      }

      const storageKeys = getTimeTrackerStorageKeys(sessionEmail)
      localStorage.removeItem(storageKeys.running)
      setTrackerRunningState(null)
      setTrackerProjects((previous) =>
        previous.map((project) =>
          project.id === trackerRunningState.projectId
            ? { ...project, todayHours: result.todayHours ?? project.todayHours }
            : project,
        ),
      )
      router.refresh()
    } catch (error) {
      setTrackerError(error instanceof Error ? error.message : "Unable to save tracked time.")
    } finally {
      setTrackerSaving(false)
    }
  }

  function handleTrackerStart() {
    if (!sessionEmail || !trackerSelectedProjectId || trackerLoading || trackerSaving) {
      return
    }

    const runningState: RunningTrackerState = {
      projectId: trackerSelectedProjectId,
      startedAt: new Date().toISOString(),
    }
    const storageKeys = getTimeTrackerStorageKeys(sessionEmail)
    localStorage.setItem(storageKeys.running, JSON.stringify(runningState))
    localStorage.setItem(storageKeys.selectedProjectId, trackerSelectedProjectId)
    setTrackerRunningState(runningState)
    setTrackerNowTimestamp(Date.now())
    setTrackerError(null)
  }

  function handleTrackerSelectionChange(nextProjectId: string) {
    if (!sessionEmail || trackerRunningState) {
      return
    }

    const storageKeys = getTimeTrackerStorageKeys(sessionEmail)
    if (!nextProjectId) {
      localStorage.removeItem(storageKeys.selectedProjectId)
      setTrackerSelectedProjectId("")
      return
    }

    localStorage.setItem(storageKeys.selectedProjectId, nextProjectId)
    setTrackerSelectedProjectId(nextProjectId)
  }

  return (
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

        <SidebarNav isOpen={isSidebarOpen} />

        <div className={`app-pinned-divider ${isSidebarOpen ? "" : "app-pinned-divider-closed"}`} />

        <button
          aria-hidden={isSidebarOpen}
          aria-label="Expand sidebar"
          className={`app-nav-open-button ${isSidebarOpen ? "app-control-hidden" : ""}`}
          onClick={(event) => {
            event.preventDefault()
            if (!isForcedCollapsed) {
              setIsManuallyCollapsed(false)
            }
          }}
          tabIndex={isSidebarOpen ? -1 : 0}
          type="button"
        >
          <CollapseIcon expanded={false} />
        </button>

      </div>

      <div className={`app-sidebar-bottom ${isSidebarOpen ? "" : "app-sidebar-bottom-closed"}`}>
        {isSidebarOpen && trackerVisible ? (
          <section className="app-time-tracker" aria-label="Time tracker">
            <p className="app-time-tracker-title">Time tracker</p>
            <SelectDropdownField
              ariaLabel="Tracked project"
              disabled={trackerLoading || trackerSaving || Boolean(trackerRunningState)}
              options={trackerProjects.map((project) => ({ label: project.name, value: project.id }))}
              placeholder="Select project"
              value={trackerSelectedProjectId}
              onValueChange={handleTrackerSelectionChange}
            />

            {trackerRunningState ? (
              <button
                className="app-time-tracker-button app-time-tracker-button-stop"
                disabled={!canStopTracker}
                onClick={() => void handleTrackerStop()}
                type="button"
              >
                Stop
              </button>
            ) : (
              <button
                className="app-time-tracker-button"
                disabled={!canStartTracker}
                onClick={handleTrackerStart}
                type="button"
              >
                Start
              </button>
            )}

            <p className="app-time-tracker-today">
              {trackerSelectedProject
                ? `${formatTodayHours(trackerDisplayHours)} today`
                : "0m today"}
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
  )
}
