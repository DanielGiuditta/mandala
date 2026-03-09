# AGENTS.md for supabase

This folder owns schema evolution, row-level security, and seed data.

## Rules

- Every schema change must be additive and migration-driven.
- Do not edit prior migrations unless the repo is still pre-release and the change is coordinated.
- Preserve or strengthen RLS.
- Seed data should resemble realistic architecture-firm data.
- Keep permission assumptions aligned with product docs.

## Required outputs for schema work

- migration file
- any policy changes
- doc updates in `../docs/02-architecture/database.md`
- domain doc updates if meaning changed
