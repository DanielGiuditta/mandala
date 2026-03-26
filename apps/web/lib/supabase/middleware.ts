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

const SESSION_REFRESH_WINDOW_MS = 60_000

function isSessionFresh(expiresAt?: number | null): boolean {
  if (!expiresAt) {
    return false
  }

  return expiresAt * 1000 > Date.now() + SESSION_REFRESH_WINDOW_MS
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

  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, options, value } of cookiesToSet) {
          request.cookies.set(name, value)
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

  if (session?.user && isSessionFresh(session.expires_at)) {
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
}
