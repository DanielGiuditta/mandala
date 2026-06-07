# Access Control

## Intent

Authorization must be modeled separately from staffing, job titles, and client names.

This document defines the effective user tiers for V1 and the minimum data needed to enforce them.

## Core rules

- `Person.title` is a job title, not a permission role.
- `Person.supervisorPersonId` is a reporting relationship, not a permission role assignment.
- `Office.partnerPersonId` identifies the partner responsible for an office. It does not by itself grant instance-wide partner permissions.
- `Project.leadPersonId` remains the source of truth for who leads a project.
- Leading at least one active project grants system-wide read access to employees and projects, but project write access still applies only to projects the viewer leads.
- `admin` and `partner` remain the only persisted elevated `RoleAssignment.role` values in V1.
- `partner` is instance-scoped.
- `admin` is also instance-scoped in the current V1 contract. New admin rows should leave `RoleAssignment.officeId` null. Legacy non-null admin `officeId` values do not narrow current admin scope.
- Only admins, partners, and the exact-email override may set or revoke `Project.leadPersonId`.
- Only partners and the exact-email override may grant or revoke elevated `admin` or `partner` permissions.
- Compensation visibility is restricted to admins, partners, and the exact-email override.
- Client access is explicit per project and is never inferred from `Project.clientName`.
- V1 keeps the global project stage set fixed. Access control governs who can change a project's stage, not who can redefine the stage catalog.

## Exact-email override

One internal account has a bootstrap override above normal partner access.

- the override is keyed by exact `UserAccount.email = danielgiuditta@gmail.com`
- it is not a persisted `RoleAssignment`
- it outranks partners for people and permission actions
- it exists to retain full control over every person in the system, including partners

## Effective user tiers

### `partner`

Instance-scoped internal role with full operational control across the system.

Partners can grant and revoke admin permissions.

### `admin`

Instance-scoped internal role with the same operational read/write scope as partners, except elevated permission management remains partner-only unless the exact-email override is used.

### `projectLead`

Project-scoped effective role derived from `Project.leadPersonId`.

Project leads have:

- system-wide read access to employees and projects
- full write access on projects they lead
- no salary or cost visibility

### `employee`

Internal user linked to a `Person` record without broader elevated scope.

Employees may only access projects where they are actively assigned.

On those projects they may:

- read internal project detail
- track their own time through the sidebar tracker
- add checklist items
- upload project documents

Employees do not receive system-wide people, project, library, compensation, or standalone time-tracker workspace visibility.

### `noAccount`

Person record without a linked application login yet.

This is a people-directory state, not an effective signed-in user tier.

### `client`

External or restricted read-only user with explicit access to one or more projects.

Clients never receive internal write permissions.

## Permission matrix

| Action | Partner | Admin | Project Lead | Employee | Client | Scope rule |
| --- | --- | --- | --- | --- | --- | --- |
| View people directory | Yes | Yes | Yes | No | No | Project leads get system-wide read. |
| View person detail | Yes | Yes | Yes | No | No | Same as people-directory visibility. |
| View salary and hourly cost | Yes | Yes | No | No | No | Compensation is restricted. |
| Create or update people | Yes | Yes | No | No | No | Global for admins and partners. |
| Change elevated admin / partner permissions | Yes | No | No | No | No | Exact-email override also allowed. |
| View internal project detail | Yes | Yes | Yes | Yes | Limited | Project leads read every project. Employees read assigned projects only. Clients stay summary-only. |
| Create projects | Yes | Yes | No | No | No | Global for admins and partners. |
| Update project fields | Yes | Yes | Yes | No | No | Project leads write only on projects they lead. |
| Set project lead | Yes | Yes | No | No | No | Exact-email override also allowed. |
| Assign people to projects | Yes | Yes | Yes | No | No | Project leads act only on projects they lead. |
| Change project stage | Yes | Yes | Yes | No | No | Same scope as project write. |
| View standalone time-tracker workspace | Yes | Yes | Yes | No | No | Employees use the sidebar tracker instead of the dedicated workspace. |
| Track own time via sidebar tracker | Yes | Yes | Yes | Yes | No | Self only. Partners, admins, and project leads may track on projects they can write to. Employees may track on projects where they are actively assigned. |
| Edit project time entries | Yes | Yes | Yes | No | No | A tracked person's recorded supervisor may also edit that person's time entries. |
| Add checklist items | Yes | Yes | Yes | Yes | No | Employees act only on assigned projects. |
| Upload project documents | Yes | Yes | Yes | Yes | No | Same scope as checklist contribution. |

## Create-person permission mapping

The create-person flow may expose a `Permission` control, but it must map to the authorization layer, not `Person.title`.

- `No account` → create only the `Person` record
- `Employee` → create a linked `UserAccount` with no elevated `RoleAssignment` and send an invite email so the person can set a password
- `Admin` → create a linked `UserAccount` plus one instance-scoped `RoleAssignment(role='admin', officeId=null)` and send an invite email so the person can set a password
- `Partner` → create a linked `UserAccount` plus one instance-scoped `RoleAssignment(role='partner')` and send an invite email so the person can set a password

Do not use `Project Lead` as a create-person permission value. Project-lead capability remains derived from `Project.leadPersonId`.

## Edit-person modal permission mapping

The person edit modal reuses the create-person permission selector with prefilled values.

- `No account` → keep only the `Person` record and remove linked `UserAccount` / elevated `RoleAssignment` rows
- `Employee` → keep or create a linked `UserAccount` with no elevated `RoleAssignment`
- `Admin` → keep or create a linked `UserAccount` plus one instance-scoped `RoleAssignment(role='admin', officeId=null)`
- `Partner` → keep or create a linked `UserAccount` plus one instance-scoped `RoleAssignment(role='partner')`

Admins and partners may edit person fields across the system.

Only partners and the exact-email override may change elevated admin / partner permissions.

As a safety guard, a person may not use that selector to remove their own elevated access. Another partner or admin must make that permission downgrade.

## Remove-person behavior

The edit-person modal may expose a remove action for admins and partners.

Removing a person is a deactivation workflow, not a destructive purge of project history:

- set `Person.active=false`
- revoke linked login access by deactivating the linked `UserAccount` and elevated `RoleAssignment` rows
- clear active relationship pointers such as project lead, office partner, supervisor, active assignments, and checklist assignee
- preserve historical `TimeEntry` and `ResourceDocument` records for reporting and audit context

A person may not remove their own person record. Removing a person with elevated admin or partner permission requires partner privileges or the exact-email override.

## Minimal supporting models

The existing core operational entities remain unchanged. V1 needs a small supporting authorization layer beside them:

### `UserAccount`

Application-level login identity.

- internal users link to a `Person`
- client users may exist without a `Person`
- for self time tracking, internal identity may also resolve by a unique `Person.email` match when the explicit `personId` link is missing
- one exact email, `danielgiuditta@gmail.com`, has a non-persisted bootstrap override above partner access

### `RoleAssignment`

Persisted elevated authorization role plus optional office scope.

- persisted V1 elevated roles are `partner` and `admin`
- both roles are instance-scoped in the current contract
- `officeId` remains nullable on the table for compatibility, but it is not used to narrow current admin scope

### `ClientProjectAccess`

Explicit project entitlement for client users.

- one client may have access to multiple projects
- one project may be visible to multiple client users

## V1 limits

- This proposal does not make the stage catalog user-configurable.
- This proposal does not introduce client-visible checklist, time, or document visibility flags.
- Because checklist items, time entries, and resource documents are internal by default today, V1 client access should start with a restricted project summary unless the product docs are later expanded with explicit client-visibility fields.
