"use server"

import { getDatabaseStatus } from "@mandala/db"
import { redirect } from "next/navigation"

import { getSafeNextPath } from "../../lib/auth/paths"
import { createWebServerSupabaseClient } from "../../lib/supabase/server"

interface LoginRedirectOptions {
  email?: string | null
  error?: string
  nextPath: string
}

function buildLoginRedirect({
  email,
  error,
  nextPath,
}: LoginRedirectOptions): string {
  const searchParams = new URLSearchParams()

  if (error) {
    searchParams.set("error", error)
  }

  if (email) {
    searchParams.set("email", email)
  }

  if (nextPath !== "/projects") {
    searchParams.set("next", nextPath)
  }

  const query = searchParams.toString()
  return query ? `/login?${query}` : "/login"
}

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const nextPath = getSafeNextPath(
    typeof formData.get("next") === "string" ? String(formData.get("next")) : null,
  )

  if (!email || !password) {
    redirect(
      buildLoginRedirect({
        email,
        error: "Enter an email and password.",
        nextPath,
      }),
    )
  }

  const status = getDatabaseStatus()

  if (!status.configured) {
    redirect(
      buildLoginRedirect({
        email,
        error: "Supabase auth is not configured for this workspace yet.",
        nextPath,
      }),
    )
  }

  const supabase = await createWebServerSupabaseClient()

  if (!supabase) {
    redirect(
      buildLoginRedirect({
        email,
        error: "Supabase auth is not configured for this workspace yet.",
        nextPath,
      }),
    )
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect(
      buildLoginRedirect({
        email,
        error: error.message,
        nextPath,
      }),
    )
  }

  redirect(nextPath)
}

export async function signOutAction(): Promise<void> {
  const supabase = await createWebServerSupabaseClient()

  await supabase?.auth.signOut()

  redirect("/login")
}
