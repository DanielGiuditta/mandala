# Field Definitions

## Office

### `partnerPersonId`
The partner responsible for the office.

This is a business relationship on the office record, not the authorization role assignment model.

## Person

### `title`
The person's role or job title.

Do not use this field to store authorization roles or permission tiers.

### `photoUrl`
Optional image URL for the person's profile photo or avatar.

If absent, the UI should render a deterministic fallback avatar.

### `officeId`
The person's home office.

### `supervisorPersonId`
Optional reporting relationship to another `Person`.

This is used for people-management and time-review workflows.
It is not an authorization role assignment.

### `annualSalary`
Annual salary used to derive hourly labor cost.

### `availabilityHoursPerWeek`
Weekly working capacity used to calculate assignment allocation and remaining capacity.

In the tracking-first V1 create-person flow, this may be defaulted server-side to `40` when the UI does not expose a planning-capacity input yet.

## Project

### `photoUrl`
Optional image URL for the project's visual cover or avatar.

If absent, the UI should render a deterministic fallback avatar.

### `originatingOfficeId`
The office that brought the project into the firm or initially set it up.

### `managingOfficeId`
The office responsible for delivery, staffing, and labor cost reporting.

### `leadPersonId`
The person responsible for leading the project.

This field also drives project-lead permissions once the lead person is linked to a user account.

### `stage`
Lifecycle stage label for the project.

The V1 stage set is fixed; permissions control who may change a project's stage.

## Assignment

### `assignedHoursPerWeek`
Planned weekly staffing hours for a person on a project.

Tracked time on its own does not backfill this field.

### `startDate`
Start date of the assignment window.

### `endDate`
End date of the assignment window.

## TimeEntry

### `hours`
Actual time worked for a project on a given date.

### `source`
Where the time entry originated, such as native Windows checker sync or a manual correction/import path.

### `assignmentId`
Optional link to the related assignment when available.

It may remain null for valid tracked time when the person is not staffed to the selected project.

Even when this field is null, tracked time may still make the person appear as staffed to the project in derived UI views.

## ResourceDocument

### `projectId`
If present, the document belongs to a project. If null, it belongs to the shared library.

### `category`
Document grouping label such as drawing, brief, template, or reference.

### `fileUrl`
HTTPS URL for the document or library asset.

The URL must not include embedded credentials.

## ChecklistItem

### `assignedPersonId`
Optional person responsible for completing the checklist item.

### `completed`
Whether the checklist item is complete.

### `completedAt`
Timestamp recorded when the checklist item is marked complete.

## UserAccount

### `personId`
Optional link to the internal person record for staff users.

### `email`
Login email for the user account.

The exact value `danielgiuditta@gmail.com` is reserved for the bootstrap authorization override documented in access control.

## RoleAssignment

### `role`
Elevated authorization role such as `partner` or `admin`.

### `officeId`
Optional office scope for the role assignment.

In the current V1 contract, partner and admin access are both instance-scoped, so new elevated rows should leave this field null. Legacy non-null admin values do not narrow current admin scope.

### `assignedByUserAccountId`
User who granted the elevated role assignment.

## ClientProjectAccess

### `projectId`
Project the client user may view.

### `userAccountId`
Client user receiving explicit access to the project.
