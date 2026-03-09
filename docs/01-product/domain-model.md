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
- `officeId`
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

### Relationships

- Person → Office
- Person → Assignments
- Person → TimeEntries

## Project

Represents a client project.

A project may originate in one office and be managed by another.

### Fields

- `id`
- `name`
- `clientName`
- `description`
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
- Project → TimeEntries
- Project → ResourceDocuments

### Notes

The managing office owns:

- staffing
- project execution
- labor cost reporting

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

## TimeEntry

Represents actual hours worked.

Employees enter time manually or through the Windows tracker.

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

- approvals are deferred in V1
- `assignmentId` may be optional in the schema but should be linked when possible

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
- admins control stage changes in V1

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
