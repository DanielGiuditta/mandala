# AGENTS.md

## Purpose

This repository is the source of truth for an internal tracker used by a multi-office architecture firm to manage projects, people, staffing, time, and document resources.

Read these files before making changes:

- `docs/01-product/prd.md`
- `docs/01-product/access-control.md`
- `docs/01-product/domain-model.md`
- `docs/01-product/field-definitions.md`
- `docs/01-product/ui-domain-mapping.md`
- `docs/02-architecture/architecture.md`
- `docs/02-architecture/database.md`
- `docs/03-design/design-contract.md`
- `docs/04-delivery/definition-of-done.md`

## Core product rules

- Offices are the primary organizational unit.
- Do not introduce divisions or cost centers unless the docs are explicitly updated to add them back.
- People belong to a home office.
- Projects may originate in one office and be managed by another office.
- Projects must model both `originatingOfficeId` and `managingOfficeId`.
- Assignments represent planned staffing hours per week.
- Checklist items are project-scoped, may optionally be assigned to a person, and are not stage-gated in V1.
- Time tracking is lightweight and captured primarily through the native Windows checker, with project selection at login or session start.
- Salary is stored on the person record and hourly cost is derived from salary.
- "Resource" means a document or library asset, not a person or staffing slot.

## Implementation rules

- Do not invent entities, enums, fields, or relationships.
- If a field is unclear, prefer the domain docs over UI wording.
- Update docs when business meaning changes.
- Keep changes scoped to the requested feature.
- Reuse shared packages and existing patterns before creating new ones.

## Deployment preference

- During the current pre-launch stage, ship deployments to production by default.
- Do not create preview deployments unless the user explicitly asks for a preview deployment.
- When deploying, include the full current code changes for the requested work instead of deploying only a partial subset, unless the user explicitly asks to exclude something.
- Revisit this preference after launch if the team decides to return to preview-first deploys.

## Windows agent release guardrails

- The Windows agent, web application, database checks, and release-storage credentials must all target the same Supabase project. The current production project reference is `nzlajptokbcgeaifgnoq`; a different Supabase hostname is a different backend and must not be used for an employee installer.
- The GitHub release secrets must stay aligned: `MANDALA_SUPABASE_URL` and `MANDALA_SUPABASE_ANON_KEY` configure the installer, while `SUPABASE_SERVICE_ROLE_KEY` publishes to the same project’s `desktop-agent-releases` bucket. A successful Windows compile does not prove that the installer is connected to production.
- Before handing an installer to IT, verify all of the following: the version number, the embedded Supabase hostname, the versioned object in the production storage bucket, and that the download page selects that version.
- A release is handoff-ready only after the Windows CI installer audit passes and a Mac download of the live installer matches that audited artifact's SHA-256 and byte size.
- The release publisher must write `latest/release.json`, and the web download route must fail closed when the manifest is missing, malformed, points to a different filename/version, or names a backend other than `nzlajptokbcgeaifgnoq`.
- The Agent must show its version and backend before sign-in and must disable sign-in with `AGENT-CONFIG-BACKEND-001` when it targets a non-production backend.
- The installer requires Windows administrator approval. Handoff instructions must name that prerequisite before testing begins and must require the exact versioned installer filename.
- A diagnostic log showing a healthy project list is not proof of correct data logging. The agent must complete a start/stop test, confirm a new `time_entries` row, and provide the diagnostic report when a save is missing.
- The August 2026 incident was caused by a backend mismatch: the agent reported `izddgdizwlwnhjwnojaw.supabase.co` while the web app and database being checked used `nzlajptokbcgeaifgnoq.supabase.co`. The old agent could load projects and show no error while writing/checking against the wrong backend, so this must be treated as a release-blocking configuration error.

## Windows agent debugging checklist

1. Confirm the installed version and signed-in email in the agent UI.
2. Confirm the diagnostic log’s `backend=` hostname matches the production Supabase hostname above.
3. Confirm the project dropdown loads before starting work.
4. Record India Standard Time (IST), including the date and AM/PM, for start, switch, stop, disconnect, and reconnect actions.
5. Test one start/stop and one confirmed project switch; require the agent’s save confirmation/reference after each finalized session.
6. If the save confirmation is missing, use the agent’s diagnostics export and preserve the report before repeating the test.
7. Check the live `time_entries` record for the same person, project, date, and test window. Do not infer success from the absence of an on-screen error.

## Build order preference

When implementing the core model, prefer this order:

1. Office
2. Person
3. Project
4. Assignment
5. TimeEntry
6. ResourceDocument
7. ChecklistItem

## Validation

Before closing work:

- confirm the implementation matches `docs/01-product/domain-model.md`
- confirm no division/cost-center concepts were added
- confirm naming matches `docs/01-product/ui-domain-mapping.md`
- document any deviations
