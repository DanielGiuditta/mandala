# Access Control

## Intent

Authorization must be modeled separately from staffing, job titles, and client names.

This document defines the effective user tiers for V1 and the minimum data needed to enforce them.

## Core rules

- `Person.title` is a job title, not a permission role.
- `Person.supervisorPersonId` is a reporting relationship, not a permission role assignment.
- The lightweight sidebar tracker is available to any signed-in internal user account and is self-only. It may create manual `TimeEntry` rows only for that signed-in person's own time.
- Internal time tracking identity resolves from the signed-in internal user account email to a person record, using the explicit `UserAccount.personId` link when present and otherwise a unique matching `Person.email`.
- A person's recorded supervisor may review and correct that person's tracked project time in V1.
- `Office.partnerPersonId` identifies the partner responsible for an office. It does not by itself grant instance-wide partner permissions.
- `Project.leadPersonId` remains the source of truth for who leads a project. Project-lead permissions derive from that relationship once the lead person is linked to a user account.
- Office-scoped admin permissions resolve against `Person.officeId` for person records.
- Office-scoped admin permissions resolve against `Project.managingOfficeId` for project staffing, stage, time, checklist, and document actions.
- Client access is explicit per project and is never inferred from `Project.clientName`.
- V1 keeps the global project stage set fixed. Access control governs who can change a project's stage, not who can redefine the stage catalog.

## Effective user tiers

### `partner`

Instance-scoped internal role with full operational control across all offices and projects.

Partners can assign admin roles.

### `admin`

Office-scoped internal role that may be assigned to one or more offices.

Admins have the same operational permissions as partners within their scoped offices and the projects managed by those offices, except assigning admins remains partner-only in V1.

### `projectLead`

Project-scoped effective role derived from `Project.leadPersonId`.

Project leads can manage staffing, project stage, and project time for projects they lead.

### `employee`

Internal user linked to a `Person` record without broader elevated scope.

Employees can contribute checklist items and project documents on projects where they are actively assigned or are the lead.

Employees may record their own manual project time through the sidebar tracker on any active project.

### `noAccount`

Person record without a linked application login yet.

This is a people-directory state, not an effective signed-in user tier.

### `client`

External or restricted read-only user with explicit access to one or more projects.

Clients never receive internal write permissions.

## Permission matrix

| Action | Partner | Admin | Project Lead | Employee | Client | Scope rule |
| --- | --- | --- | --- | --- | --- | --- |
| View internal project detail | Yes | Yes | Yes | Yes | Limited | Admin reads are office-scoped. Project leads and employees read projects they lead or are assigned to. Clients only read explicitly assigned projects. |
| Create or update people | Yes | Yes | No | No | No | `Person.officeId` must be in admin scope. |
| View salary and hourly cost | Yes | Yes | No | Self only | No | Compensation remains internal. |
| Create or update projects | Yes | Yes | No | No | No | `Project.managingOfficeId` must be in admin scope. |
| Set project lead | Yes | Yes | No | No | No | Same scope as project updates. |
| Assign people to projects | Yes | Yes | Yes | No | No | Admin scope uses `Project.managingOfficeId`. Project leads act only on projects they lead. |
| Change project stage | Yes | Yes | Yes | No | No | Same scope as assignment management. |
| Track own time via sidebar tracker | Yes | Yes | Yes | Yes | No | Self only. Any signed-in internal user may create their own manual `TimeEntry` on any active project. The system resolves the signed-in email to the person's backing record. |
| Edit project time entries | Yes | Yes | Yes | No | No | Partners and admins retain elevated time-entry edit scope. Project leads may edit time for projects they lead. A person's recorded supervisor may also edit that person's time entries. |
| Add checklist items | Yes | Yes | Yes | Yes | No | Employees act only on projects they are actively assigned to or lead. |
| Upload project documents | Yes | Yes | Yes | Yes | No | Same scope as checklist contribution. |
| Assign admins | Yes | No | No | No | No | Partner-only in V1. |

## Create-person permission mapping

The create-person flow may expose a `Permission` control, but it must map to the authorization layer, not `Person.title`.

- `No account` → create only the `Person` record
- `Employee` → create a linked `UserAccount` with no elevated `RoleAssignment`
- `Admin` → create a linked `UserAccount` plus an office-scoped `RoleAssignment(role='admin', officeId=person.officeId)`
- `Partner` → create a linked `UserAccount` plus an instance-scoped `RoleAssignment(role='partner')`

Do not use `Project Lead` as a create-person permission value. Project-lead capability remains derived from `Project.leadPersonId`.

## Minimal supporting models

The existing core operational entities remain unchanged. V1 needs a small supporting authorization layer beside them:

### `UserAccount`

Application-level login identity.

- internal users link to a `Person`
- client users may exist without a `Person`
- for self time tracking, internal identity may also resolve by a unique `Person.email` match when the explicit `personId` link is missing

### `RoleAssignment`

Persisted elevated authorization role plus optional office scope.

- persisted V1 elevated roles are `partner` and `admin`
- `partner` is instance-scoped
- `admin` is office-scoped and uses one row per office

### `ClientProjectAccess`

Explicit project entitlement for client users.

- one client may have access to multiple projects
- one project may be visible to multiple client users

## V1 limits

- This proposal does not make the stage catalog user-configurable.
- This proposal does not introduce client-visible checklist, time, or document visibility flags.
- Because checklist items, time entries, and resource documents are internal by default today, V1 client access should start with a restricted project summary unless the product docs are later expanded with explicit client-visibility fields.
