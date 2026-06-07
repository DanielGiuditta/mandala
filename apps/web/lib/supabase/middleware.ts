import { createServerClient } from "@supabase/ssr"
import { createPerfTrace } from "@mandala/db"
import { NextResponse, type NextRequest } from "next/server"

import { getSafeNextPath } from "../auth/paths"

function copyCookies(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }
}

function isProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/projects") ||
    pathname.startsWith("/people") ||
    pathname.startsWith("/library")
  )
}

function isAssetPath(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith("/figma/")
}

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
}

function toBase64(value: string): string {
  const remainder = value.length % 4
  const padding = remainder === 0 ? "" : "=".repeat(4 - remainder)

  return `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/")
}

function decodeSupabaseCookieValue(value: string): string | null {
  const encodedValue = value.startsWith("base64-")
    ? value.slice("base64-".length)
    : value

  try {
    return atob(toBase64(encodedValue))
  } catch {
    return null
  }
}

function readSessionExpiryMs(request: NextRequest): number | null {
  const authCookieChunks = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
    .sort((left, right) => {
      const leftChunk = Number(left.name.match(/\.([0-9]+)$/)?.[1] ?? -1)
      const rightChunk = Number(right.name.match(/\.([0-9]+)$/)?.[1] ?? -1)

      return leftChunk - rightChunk
    })

  if (authCookieChunks.length === 0) {
    return null
  }

  const serializedSession = decodeSupabaseCookieValue(
    authCookieChunks.map((cookie) => cookie.value).join(""),
  )

  if (!serializedSession) {
    return null
  }

  try {
    const parsed = JSON.parse(serializedSession) as {
      access_token?: string
      expires_at?: number
    }

    if (typeof parsed.expires_at === "number") {
      return parsed.expires_at * 1000
    }

    const accessToken = parsed.access_token

    if (!accessToken) {
      return null
    }

    const payload = accessToken.split(".")[1]

    if (!payload) {
      return null
    }

    const decodedPayload = decodeSupabaseCookieValue(payload)

    if (!decodedPayload) {
      return null
    }

    const claims = JSON.parse(decodedPayload) as { exp?: number }
    return typeof claims.exp === "number" ? claims.exp * 1000 : null
  } catch {
    return null
  }
}

function isPrefetchRequest(request: NextRequest): boolean {
  return (
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  )
}

function isRscNavigationRequest(request: NextRequest): boolean {
  return (
    request.nextUrl.searchParams.has("_rsc") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree")
  )
}

function isServerActionRequest(request: NextRequest): boolean {
  return (
    request.method === "POST" &&
    (request.headers.has("next-action") ||
      request.headers.get("content-type")?.includes("multipart/form-data") === true)
  )
}

const SESSION_REFRESH_WINDOW_MS = 60_000

function isSessionFresh(expiresAt?: number | null): boolean {
  if (!expiresAt) {
    return false
  }

  return expiresAt > Date.now() + SESSION_REFRESH_WINDOW_MS
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const pathname = request.nextUrl.pathname
  const trace = createPerfTrace("middleware.updateSession", {
    hasAuthCookie: hasAuthCookie(request),
    pathname,
  })

  if (isAssetPath(pathname)) {
    trace.finish({ result: "asset-bypass" })
    return NextResponse.next({
      request,
    })
  }

  if (!url || !key) {
    trace.finish({ result: "missing-config" })
    return NextResponse.next({
      request,
    })
  }

  // Server Actions already resolve auth inside the action/server tree.
  // Bypassing the middleware refresh avoids edge-only cookie mutation failures
  // on POST requests while preserving downstream auth checks.
  if (isServerActionRequest(request)) {
    trace.finish({ result: "server-action-bypass" })
    return NextResponse.next({
      request,
    })
  }

  if (!hasAuthCookie(request)) {
    if (isProtectedPath(pathname)) {
      trace.finish({ result: "redirect-login-no-cookie" })
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
      return NextResponse.redirect(loginUrl)
    }

    trace.finish({ result: "public-no-cookie" })
    return NextResponse.next({
      request,
    })
  }

  // Client-side route transitions already resolve auth in the server component tree.
  // Skipping the middleware refresh here avoids a second Supabase auth roundtrip
  // on every in-app navigation while keeping full-document requests protected.
  if (isPrefetchRequest(request) || isRscNavigationRequest(request)) {
    trace.finish({ result: "prefetch-or-rsc-bypass" })
    return NextResponse.next({
      request,
    })
  }

  const cookieSessionExpiresAt = readSessionExpiryMs(request)

  if (isSessionFresh(cookieSessionExpiresAt)) {
    if (pathname === "/login") {
      trace.finish({ result: "redirect-from-login-fresh-cookie" })
      return NextResponse.redirect(
        new URL(getSafeNextPath(request.nextUrl.searchParams.get("next")), request.url),
      )
    }

    trace.finish({ result: "fresh-cookie-session" })
    return NextResponse.next({
      request,
    })
  }

  let response = NextResponse.next({
    request,
  })

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, options, value } of cookiesToSet) {
            try {
              request.cookies.set(name, value)
            } catch {
              // Some edge requests expose an immutable request cookie jar.
            }

            response.cookies.set(name, value, options)
          }
        },
      },
    })
    const {
      data: { session },
    } = await trace.measure("supabase.auth.getSession", () =>
      supabase.auth.getSession(),
    )

    if (session?.user && isSessionFresh(session.expires_at ? session.expires_at * 1000 : null)) {
      if (pathname === "/login") {
        trace.finish({ result: "redirect-from-login-fresh-session" })
        return NextResponse.redirect(
          new URL(getSafeNextPath(request.nextUrl.searchParams.get("next")), request.url),
        )
      }

      trace.finish({ result: "fresh-session" })
      return response
    }

    const {
      data: { user },
    } = await trace.measure("supabase.auth.getUser", () =>
      supabase.auth.getUser(),
    )

    if (!user && isProtectedPath(pathname)) {
      trace.finish({ result: "redirect-login-no-user" })
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)

      const redirectResponse = NextResponse.redirect(loginUrl)
      copyCookies(response, redirectResponse)
      return redirectResponse
    }

    if (user && pathname === "/login") {
      trace.finish({ result: "redirect-from-login-user" })
      const redirectResponse = NextResponse.redirect(
        new URL(getSafeNextPath(request.nextUrl.searchParams.get("next")), request.url),
      )
      copyCookies(response, redirectResponse)
      return redirectResponse
    }

    trace.finish({ result: user ? "user-allowed" : "anonymous-allowed" })
    return response
  } catch (error) {
    trace.finish({
      result: "error-fallback",
    })

    return NextResponse.next({
      request,
    })
  }
}
