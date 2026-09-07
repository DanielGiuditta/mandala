# Architecture

## Suggested top-level shape

- `apps/web` — user-facing application, including the lightweight self-only sidebar tracker
- `apps/desktop-agent` — Windows companion app for V1 project selection and time capture
- `packages/ui` — shared components and tokens
- `packages/domain` — shared schemas, types, enums, and pure business logic
- `packages/db` — database clients, generated types, query helpers
- `supabase` — local config, migrations, policies, seed data

## Why this shape

The product has two interfaces with shared domain rules:
1. the web application
2. a Windows companion app for V1 time capture

The Windows companion app remains the primary V1 time-capture surface, but the web shell may also expose a lightweight self-only sidebar tracker that writes manual time entries on projects the signed-in internal user may track against, resolving the signed-in email to the backing person identity.

The Windows agent is a native .NET application. It calls the authenticated active-work-session database functions directly, stores its refresh token with Windows DPAPI for the current Windows user, and uses Windows-wide idle detection rather than browser activity events. Signed installer releases live in a private storage bucket; the web application creates short-lived download links only for partners and admins.

IT may configure a separate LAN transport using `ProgramData/Mandala Agent/lan.config.json` without changing the audited production backend embedded in the installer. The LAN mode uses `apps/lan-services/gateway.mjs`: HTTPS with enrolled client certificates, fixed production upstream, bounded JSON requests, and an exact RPC/auth allowlist. It has no file-sharing or general proxy endpoints and no service-role credential. The agent journals its desktop-owned session with Windows DPAPI and atomic replacement, including the exact local stop before attempting upload. See [LAN deployment](lan-deployment.md) for ownership, recovery, and installation details.

For LAN browser access, run an office copy of `apps/web` behind trusted HTTPS. Browser authentication handoff is completed on this server, so browser Supabase access is unnecessary. Preview-enabled office builds expose the existing resource actions plus Preview. The web server checks live resource permission and signs a 30-second, resource/user/path-bound permit. A separate preview reader verifies that permit and a publication-specific viewer allowlist, then serves only approved PDF/image copies. Reader and publisher run as separate accounts; only the publisher can write preview storage. Both are firewalled from the original file server. An internal publishing workstation pushes pre-exported files via a separate enrolled-certificate endpoint. No converter or share crawler runs in either service.

The standalone time-tracker workspace remains an elevated internal surface for partners, admins, and project leads. Employees use the sidebar tracker instead.

A monorepo avoids duplicating domain types, permission enums, workflow keys, and design-system primitives.

## Hosted production topology

- The production Supabase project is `Kolam Production India` in Mumbai (`ap-south-1`).
- Production Vercel functions run in Mumbai (`bom1`) so server-rendered routes and API handlers stay close to Postgres, Auth, and Storage.
- Keep the application and database regions co-located. A region change requires a controlled Supabase project migration; changing only the Vercel region would reintroduce a long cross-region database hop.
- Supabase project credentials remain deployment environment variables and must not be committed.

## Build strategy

Lay the core model down first, then build vertical slices:
1. Offices
2. People
3. Projects
4. Assignments
5. Native time capture + time rollups
6. Resources + storage
7. Checklist items
8. Auth + authorization skeleton
9. Project and people list/detail flows
10. Dashboard
11. Advanced workflow and approvals only if scope expands beyond V1

For V1, the authorization skeleton should add:

- `UserAccount` for login identity
- `RoleAssignment` for elevated instance-scoped `partner` and `admin` permissions
- `ClientProjectAccess` for explicit client entitlements
- derived project-lead permissions from `Project.leadPersonId`
- derived employee permissions from the `UserAccount` to `Person` link and active project relationships
- one exact-email bootstrap override for `danielgiuditta@gmail.com` without introducing a new stored role

Project-lead write checks should still use the specific target project's `leadPersonId`.

## Boundaries

- UI packages should not own business rules.
- Database packages should not own presentation decisions.
- Shared domain package owns canonical enums and validation.
- Shared domain package should also own authorization role enums and scope rules.
- Authorization roles must not be stored in `Person.title`.
- App code composes modules; it should not redefine domain constants.

## Route architecture

Entity-heavy areas should prefer a persistent master-detail route structure over flat sibling pages when the design expects an in-context workspace.

- Keep the list or rail mounted in a shared segment layout.
- Render detail via nested or intercepted routes so the URL still reflects the selected entity.
- Use the same pattern for Projects and People so navigation behavior stays consistent.
- Do not rebuild the entire entity workspace on every list/detail hop if a shared layout can preserve it.
- Direct loads of detail URLs must still work without relying on client-only state.
