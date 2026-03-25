"use client"

import type { SelfTimeTrackerData } from "@mandala/db"
import Link from "next/link"
import { useEffect, useState } from "react"

import { signOutAction } from "../login/actions"
import { SidebarNav } from "../sidebar-nav"
import { AppMenuSelect } from "./app-menu-select"

export interface AppShellState {
  accessMessage: string | null
  configured: boolean
  displayName: string | null
  isAuthenticated: boolean
  officeName: string | null
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

function formatTierLabel(value: string | null): string {
  if (!value) {
    return "No role"
  }

  if (value === "projectLead") {
    return "Project lead"
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
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

export function AppSidebar({ shell }: { shell: AppShellState }) {
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(false)
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
  const profileName = shell.displayName ?? "kolam user"
  const profileInitial = profileName.charAt(0).toUpperCase()
  const sessionEmail = shell.sessionEmail
  const shellItems = [
    shell.configured ? "Live data" : "Preview data",
    shell.officeName ? `Office: ${shell.officeName}` : null,
    `Tier: ${formatTierLabel(shell.primaryTier)}`,
  ].filter((item): item is string => Boolean(item))

  useEffect(() => {
    function syncViewportWidth() {
      setViewportWidth(window.innerWidth)
    }

    syncViewportWidth()
    window.addEventListener("resize", syncViewportWidth)

    return () => window.removeEventListener("resize", syncViewportWidth)
  }, [])

  const isForcedCollapsed = viewportWidth < NAV_FORCE_COLLAPSE_WIDTH
  const isSidebarOpen = !isForcedCollapsed && !isManuallyCollapsed
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
      setTrackerVisible(true)
      setTrackerLoading(true)
      setTrackerAccessMessage(null)
      setTrackerError(null)

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
        const storedSelectedProjectId = localStorage.getItem(storageKeys.selectedProjectId)
        const storedRunningStateRaw = localStorage.getItem(storageKeys.running)
        const availableProjectIds = new Set(response.projects.map((project) => project.id))

        let nextRunningState: RunningTrackerState | null = null
        if (storedRunningStateRaw) {
          try {
            const parsedRunningState = JSON.parse(storedRunningStateRaw)
            if (isRunningTrackerState(parsedRunningState)) {
              nextRunningState = parsedRunningState
            } else {
              localStorage.removeItem(storageKeys.running)
            }
          } catch {
            localStorage.removeItem(storageKeys.running)
          }
        }

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
        clearTimeTrackerStorage(trackerSessionEmail)
        setTrackerVisible(true)
        setTrackerProjects([])
        setTrackerSelectedProjectId("")
        setTrackerRunningState(null)
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

        {isSidebarOpen ? (
          <section className="app-pinned">
            <p>Session</p>
            <ul className="app-pinned-list">
              {shellItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {isSidebarOpen ? (
          <div className="app-sidebar-auth">
            {shell.isAuthenticated ? (
              <form action={signOutAction}>
                <button className="ghost-button" type="submit">
                  Sign out
                </button>
              </form>
            ) : shell.configured ? (
              <Link className="ghost-button" href="/login">
                Sign in
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={`app-sidebar-bottom ${isSidebarOpen ? "" : "app-sidebar-bottom-closed"}`}>
        {isSidebarOpen && trackerVisible ? (
          <section className="app-time-tracker" aria-label="Time tracker">
            <p className="app-time-tracker-title">Time tracker</p>
            <AppMenuSelect
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

        <div className={`app-sidebar-profile ${isSidebarOpen ? "" : "app-sidebar-profile-closed"}`}>
          <div
            aria-hidden="true"
            className={`app-profile-avatar app-profile-avatar-fallback ${isSidebarOpen ? "app-profile-avatar-open" : "app-profile-avatar-closed"}`}
          >
            {profileInitial}
          </div>
          {isSidebarOpen ? (
            <div>
              <p className="app-profile-name">{profileName}</p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
