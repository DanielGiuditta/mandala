import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSafeNextPath } from "../auth/paths"

function copyCookies(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }
}

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/people") ||
    pathname.startsWith("/library")
  )
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
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
    data: { user },
  } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)

    const redirectResponse = NextResponse.redirect(loginUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  if (user && pathname === "/login") {
    const redirectResponse = NextResponse.redirect(
      new URL(getSafeNextPath(request.nextUrl.searchParams.get("next")), request.url),
    )
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  return response
}
