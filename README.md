# Architecture Firm Tracker

This repository is a starter scaffold for the internal architecture-firm tracker.

## Current technical scaffold

The repo now includes a runnable Next.js workspace in `apps/web` with deliberately
minimal, non-final screens for:

- projects list
- project detail
- people list
- shared library documents

These routes are intended to validate the domain/query layer before final UI design lands.

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Optionally fill in `SUPABASE_SERVICE_ROLE_KEY` for admin scripts or manual maintenance
4. Run `npm install`
5. Run `npm run dev`
6. Sign in at `/login` with a Supabase Auth user whose email matches `public.user_accounts.email`

If Supabase is not configured, the app falls back to seeded preview data. In that preview-only mode, `KOLAM_VIEWER_EMAIL` and `KOLAM_VIEWER_USER_ACCOUNT_ID` control impersonation. Legacy `MANDALA_VIEWER_EMAIL` and `MANDALA_VIEWER_USER_ACCOUNT_ID` are still supported for compatibility.

## What to keep true

- `docs/01-product/prd.md` is the product source of truth
- `docs/01-product/domain-model.md` is the domain source of truth
- `AGENTS.md` files are the execution contract for Codex
- nested `AGENTS.md` files narrow behavior by folder

## Recommended build order

1. Offices
2. People
3. Projects
4. Assignments
5. Native time capture and rollups
6. Resources
7. Checklist items
8. Stage labels and admin controls
9. Dashboard

## How to use with Codex

Open the repo root and keep tasks narrow.

Good prompts:
- "Implement the Projects list page in `apps/web` using the documented Project entity and reuse shared table components."
- "Add database and domain support for assignments, keeping `assignedHoursPerWeek` as the source value."
- "Implement this Figma frame in `apps/web/...` and use the `implement-figma-contract` skill."

## Important repo behavior

Codex reads root and nested `AGENTS.md` files before working, with deeper folders overriding broader instructions.

## First docs to read

- `docs/01-product/prd.md`
- `docs/01-product/domain-model.md`
- `docs/02-architecture/database.md`
- `docs/03-design/design-contract.md`
- `docs/03-design/figma-map.md`
