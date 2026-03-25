"use server"

import { redirect } from "next/navigation"

import { createWebServerSupabaseClient } from "../../lib/supabase/server"

const MIN_PASSWORD_LENGTH = 6

interface JoinRedirectOptions {
  error?: string
}

function isJoinTokenType(value: string): value is "invite" | "recovery" {
  return value === "invite" || value === "recovery"
}

function buildJoinRedirect({ error }: JoinRedirectOptions = {}): string {
  const searchParams = new URLSearchParams()

  if (error) {
    searchParams.set("error", error)
  }

  const query = searchParams.toString()
  return query ? `/join?${query}` : "/join"
}

export async function claimJoinEmailAction(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("tokenHash") ?? "").trim()
  const type = String(formData.get("type") ?? "").trim()

  if (!tokenHash || !isJoinTokenType(type)) {
    redirect(
      buildJoinRedirect({
        error: "The email link is incomplete or invalid.",
      }),
    )
  }

  const supabase = await createWebServerSupabaseClient()

  if (!supabase) {
    redirect(
      buildJoinRedirect({
        error: "Supabase auth is not configured for this workspace yet.",
      }),
    )
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error) {
    redirect(
      buildJoinRedirect({
        error: error.message,
      }),
    )
  }

  redirect("/join")
}

export async function setPasswordAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (password.length < MIN_PASSWORD_LENGTH) {
    redirect(
      buildJoinRedirect({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      }),
    )
  }

  if (password !== confirmPassword) {
    redirect(
      buildJoinRedirect({
        error: "Password confirmation does not match.",
      }),
    )
  }

  const supabase = await createWebServerSupabaseClient()

  if (!supabase) {
    redirect(
      buildJoinRedirect({
        error: "Supabase auth is not configured for this workspace yet.",
      }),
    )
  }

  const { error } = await supabase.auth.updateUser({
    password,
  })

  if (error) {
    redirect(
      buildJoinRedirect({
        error: error.message,
      }),
    )
  }

  redirect("/projects")
}
