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

### `annualSalary`
Annual salary used to derive hourly labor cost.

### `availabilityHoursPerWeek`
Weekly working capacity used to calculate assignment allocation and remaining capacity.

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

## ResourceDocument

### `projectId`
If present, the document belongs to a project. If null, it belongs to the shared library.

### `category`
Document grouping label such as drawing, brief, template, or reference.

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

## RoleAssignment

### `role`
Elevated authorization role such as `partner` or `admin`.

### `officeId`
Optional office scope for the role assignment.

In V1, admin scope uses this field and partner scope leaves it null.

### `assignedByUserAccountId`
User who granted the elevated role assignment.

## ClientProjectAccess

### `projectId`
Project the client user may view.

### `userAccountId`
Client user receiving explicit access to the project.
