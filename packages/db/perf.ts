type PerfValue = boolean | number | null | string | undefined

interface PerfStep {
  durationMs: number
  name: string
}

export interface PerfTrace {
  finish(meta?: Record<string, PerfValue>): void
  measure<T>(
    name: string,
    work: () => Promise<T> | T,
    meta?: Record<string, PerfValue>,
  ): Promise<T>
  step(
    name: string,
    startedAt: number,
    meta?: Record<string, PerfValue>,
  ): void
  toServerTimingHeader(): string | null
}

function isPerfLoggingEnabled(): boolean {
  const configuredValue = process.env.MANDALA_DEBUG_PERF?.trim().toLowerCase()

  if (configuredValue) {
    return ["1", "true", "yes", "on"].includes(configuredValue)
  }

  return process.env.NODE_ENV !== "production"
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100
}

function normalizeMeta(
  meta?: Record<string, PerfValue>,
): Record<string, boolean | number | null | string> | undefined {
  if (!meta) {
    return undefined
  }

  const entries = Object.entries(meta).filter(([, value]) => value !== undefined)

  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries) as Record<
    string,
    boolean | number | null | string
  >
}

function sanitizeServerTimingToken(value: string): string {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return token || "step"
}

function createTraceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8)
  }

  return Math.random().toString(36).slice(2, 10)
}

function logPerfEvent(
  event: "finish" | "start" | "step",
  scope: string,
  traceId: string,
  meta?: Record<string, PerfValue>,
): void {
  const payload = {
    event,
    meta: normalizeMeta(meta),
    scope,
    traceId,
  }

  console.info(`[mandala-perf] ${JSON.stringify(payload)}`)
}

export function createPerfTrace(
  scope: string,
  meta?: Record<string, PerfValue>,
): PerfTrace {
  const enabled = isPerfLoggingEnabled()
  const traceId = createTraceId()
  const startedAt = performance.now()
  const steps: PerfStep[] = []

  if (enabled) {
    logPerfEvent("start", scope, traceId, meta)
  }

  return {
    finish(extraMeta) {
      if (!enabled) {
        return
      }

      logPerfEvent("finish", scope, traceId, {
        ...meta,
        ...extraMeta,
        stepCount: steps.length,
        totalMs: roundDuration(performance.now() - startedAt),
      })
    },

    async measure<T>(
      name: string,
      work: () => Promise<T> | T,
      extraMeta?: Record<string, PerfValue>,
    ): Promise<T> {
      const stepStartedAt = performance.now()

      try {
        return await work()
      } finally {
        this.step(name, stepStartedAt, extraMeta)
      }
    },

    step(
      name: string,
      stepStartedAt: number,
      extraMeta?: Record<string, PerfValue>,
    ) {
      const durationMs = roundDuration(performance.now() - stepStartedAt)
      steps.push({ durationMs, name })

      if (!enabled) {
        return
      }

      logPerfEvent("step", scope, traceId, {
        ...meta,
        ...extraMeta,
        durationMs,
        step: name,
      })
    },

    toServerTimingHeader() {
      if (!enabled || steps.length === 0) {
        return null
      }

      return steps
        .slice(0, 10)
        .map(
          (step) =>
            `${sanitizeServerTimingToken(step.name)};dur=${step.durationMs}`,
        )
        .join(", ")
    },
  }
}
