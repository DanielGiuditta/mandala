# Domain Model

## Overview

This document defines the canonical data model for the project tracker.

The domain model is the source of truth for:

- database schema
- backend logic
- UI mapping
- Codex implementation

Core entities:

- Office
- Person
- Project
- Assignment
- TimeEntry
- ResourceDocument
- ChecklistItem

Supporting authorization models:

- UserAccount
- RoleAssignment
- ClientProjectAccess

## Office

Represents a firm office.

Offices are the primary operating unit in the system.

An office can:

- originate projects
- manage projects
- employ people
- own project costs
- have a partner responsible for that office

### Fields

- `id`
- `name`
- `location`
- `partnerPersonId`
- `active`

### Relationships

- Office → People
- Office → OriginatedProjects
- Office → ManagedProjects

## Person

Represents a person who can work on projects.

### Fields

- `id`
- `fullName`
- `title`
- `photoUrl`
- `officeId`
- `supervisorPersonId`
- `annualSalary`
- `availabilityHoursPerWeek`
- `email`
- `active`

### Derived values

- `hourlyCost`
- `assignedHours`
- `remainingCapacity`
- `allocationPercent`
- `utilizationPercent`

### Derivation rules

- `hourlyCost = annualSalary / 2080`
- `allocationPercent = assignedHours / availabilityHoursPerWeek`
- `remainingCapacity = availabilityHoursPerWeek - assignedHours`
- `utilizationPercent = loggedHoursInPeriod / availableHoursInPeriod`

### Notes

- utilization uses actual logged project time, not planned assignment hours
- `availableHoursInPeriod` must use the same time window as `loggedHoursInPeriod`
- `title` is a job title, not an authorization role
- `supervisorPersonId` is an optional reporting relationship used for people management and time-review workflows
- the tracking-first V1 create-person flow may default `availabilityHoursPerWeek` to `40` when the UI hides planning-capacity fields

### Relationships

- Person → Office
- Person → Supervisor
- Person → DirectReports
- Person → Assignments
- Person → ChecklistItems
- Person → TimeEntries

## Project

Represents a client project.

A project may originate in one office and be managed by another.

### Fields

- `id`
- `name`
- `clientName`
- `description`
- `photoUrl`
- `originatingOfficeId`
- `managingOfficeId`
- `leadPersonId`
- `stage`
- `startDate`
- `targetCompletionDate`
- `active`

### Relationships

- Project → OriginatingOffice
- Project → ManagingOffice
- Project → LeadPerson
- Project → Assignments
- Project → ChecklistItems
- Project → TimeEntries
- Project → ResourceDocuments

### Notes

The managing office owns:

- staffing
- project execution
- labor cost reporting
- project ownership and reporting context

## Assignment

Represents planned staffing on a project.

Assignments are stored in hours per week, not percent.

### Fields

- `id`
- `projectId`
- `personId`
- `assignedHoursPerWeek`
- `startDate`
- `endDate`
- `notes`
- `active`

### Derived values

- `allocationPercent = assignedHoursPerWeek / person.availabilityHoursPerWeek`

### Relationships

- Assignment → Person
- Assignment → Project

### Notes

- overlap is allowed
- a person can have multiple active assignments
- role comes from the person's `title`, not the assignment
- tracked time does not automatically create or update planned weekly assignment hours

## TimeEntry

Represents actual hours worked.

In V1, time is captured primarily through the native Windows checker.

At machine login or session start, the person selects the current project from a dropdown.

The web app may also expose a lightweight self-only sidebar tracker for any signed-in internal user account.

### Fields

- `id`
- `personId`
- `projectId`
- `assignmentId`
- `date`
- `hours`
- `notes`
- `source`

### Derived values

- `laborCost = hours * person.hourlyCost`

### Notes

- `source` distinguishes Windows checker sync from any manual correction or import path
- approvals are deferred in V1
- `assignmentId` may be optional in the schema and its absence is valid when the person is not staffed to the tracked project
- the sidebar tracker is self-only, resolves the signed-in internal user by email-backed person identity, and writes a single manual `TimeEntry` on stop
- a `TimeEntry` is finalized work history, not the active timer state
- the sidebar tracker may target only projects the current viewer is allowed to track against
- the standalone time-tracker workspace is limited to partners, admins, and project leads; employees use the sidebar tracker instead
- once a person has tracked time on a project, project and people staffed views should include that person for the project even when `assignmentId` is null
- dedicated web time-entry flows are out of scope for V1, but supervisors and project leads may still correct tracked time

## ActiveWorkSession

Represents the one live work session allowed for a person. This is supporting runtime state, not an additional reporting entity.

### Fields

- `personId` (unique; one active session per person)
- `projectId`
- `startedAt`
- `lastActivityAt`

### Notes

- starting a new project after confirmation closes the previous session and writes its elapsed time as a manual `TimeEntry`
- after more than five minutes without activity, the session pauses and its elapsed time is written only through the last active minute window
- active sessions govern project working mode; viewing other projects remains available but is read-only

## ResourceDocument

Represents a document attached to a project or the shared library.

### Fields

- `id`
- `name`
- `fileUrl`
- `fileType`
- `projectId`
- `category`
- `description`
- `uploadedByPersonId`
- `createdAt`

### Notes

- if `projectId` is null, the document belongs to the shared library
- this is the meaning of "resource" in the product

## ChecklistItem

Represents a lightweight to-do on a project.

### Fields

- `id`
- `projectId`
- `title`
- `assignedPersonId`
- `completed`
- `createdAt`
- `completedAt`

### Relationships

- ChecklistItem → Project
- ChecklistItem → AssignedPerson

### Notes

- `assignedPersonId` is optional
- checklist items are not tied to stage gating in V1
- this is not a full task-management system in V1

## UserAccount

Represents a login identity for an internal staff member or a client user.

### Fields

- `id`
- `personId`
- `email`
- `active`

### Relationships

- UserAccount → Person (optional)
- UserAccount → RoleAssignments
- UserAccount → ClientProjectAccess

### Notes

- internal users usually link to a `Person`
- client users may exist without a `Person`
- this model is separate from `Person.title`
- one exact email, `danielgiuditta@gmail.com`, may receive a bootstrap authorization override above partner access without creating a new stored role

## RoleAssignment

Represents an elevated internal authorization role plus optional office scope.

### Fields

- `id`
- `userAccountId`
- `role`
- `officeId`
- `assignedByUserAccountId`
- `active`

### Relationships

- RoleAssignment → UserAccount
- RoleAssignment → Office
- RoleAssignment → AssignedByUserAccount

### Notes

- persisted elevated roles in V1 are `partner` and `admin`
- `partner` is instance-scoped and does not use office scope
- `admin` is instance-scoped in the current V1 contract
- assigning admins is partner-only in V1
- `officeId` may remain on the table for compatibility, but it does not narrow current admin scope

## ClientProjectAccess

Represents explicit read access for a client user to a project.

### Fields

- `id`
- `userAccountId`
- `projectId`
- `active`

### Relationships

- ClientProjectAccess → UserAccount
- ClientProjectAccess → Project

### Notes

- client access is never inferred from `Project.clientName`
- client users are read-only in V1
- project-lead permissions are derived from `Project.leadPersonId`, not a separate table
- project leads receive system-wide employee/project read access and project-scoped write access on projects they lead
- employee permissions are derived from the internal `UserAccount` to `Person` link plus project assignment relationships

## Project stage labels

`Project.stage` is a lifecycle label, not a separate entity in V1.

### Example values

- `proposal`
- `planning`
- `active`
- `construction`
- `completed`
- `onHold`

### Notes

- stage is currently a label, not a workflow gate
- the V1 stage set is fixed
- partners can change stage on any project
- admins can change stage on any project
- project leads can change stage on projects they lead
- changing the global stage set is outside V1

## Key reporting views

The system should support reporting by:

- all offices
- projects managed by office
- projects originated by office
- people by home office
- staffing allocation
- remaining capacity
- utilization based on logged project time versus available time
- project labor cost
