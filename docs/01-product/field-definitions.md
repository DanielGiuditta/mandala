# Field Definitions

## Office

### `partnerPersonId`
The partner responsible for the office.

## Person

### `title`
The person's role or job title.

### `officeId`
The person's home office.

### `annualSalary`
Annual salary used to derive hourly labor cost.

### `availabilityHoursPerWeek`
Weekly working capacity used to calculate assignment allocation and remaining capacity.

## Project

### `originatingOfficeId`
The office that brought the project into the firm or initially set it up.

### `managingOfficeId`
The office responsible for delivery, staffing, and labor cost reporting.

### `leadPersonId`
The person responsible for leading the project.

### `stage`
Lifecycle stage label for the project.

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
