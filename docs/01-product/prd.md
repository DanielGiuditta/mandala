# Architecture Firm Project Tracker – PRD

## 1. Overview

This product helps a multi-office architecture firm manage projects, people, staffing, time, and document resources in one internal system.

The tool should answer:

- which office is running a project
- where a project originated
- who is staffed on each project
- how many hours people are planned for
- how many hours people actually worked
- rough labor cost based on salary-derived hourly cost
- what stage a project is in
- what documents are attached to a project or the shared library

This is a lightweight operational tracker, not a full ERP or payroll system.

## 2. Core Concepts

### 2.1 Offices are first-class

The firm operates through offices. Office is the primary organizational unit in the system.

An office can:

- originate projects
- manage projects
- employ people
- own project delivery
- own project labor cost reporting
- have a partner responsible for that office

Projects may originate in one office and later be managed by another.

### 2.2 People belong to a home office

Each person belongs to one home office in V1.

A person may still work on projects managed by other offices.

### 2.3 Projects have two office relationships

Each project should track:

- `originatingOfficeId`: the office that brought the project in or set it up
- `managingOfficeId`: the office that runs the project and owns delivery and labor cost

These may be the same office or different offices.

### 2.4 Assignments are planned hours

Assignments represent planned staffing on a project.

Assignments are stored as `assignedHoursPerWeek`.

The system should also derive an allocation percentage relative to the person's weekly availability.

People may have overlapping assignments across projects.

### 2.5 Time tracking is lightweight

In V1, people capture time primarily through a native Windows checker.

At machine login or session start, the person selects the current project from a dropdown.

Time tracking is intended for simple operational tracking and rough project cost visibility.

Dedicated web time-entry screens, manager time review, and time-card approval workflows are out of scope for V1.

### 2.6 Salary drives labor cost

The system stores annual salary on the person record.

Hourly cost is derived by the system using:

`hourlyCost = annualSalary / 2080`

Project labor cost is estimated from logged time and derived hourly cost.

### 2.7 Resource means document

In this system, a resource is a document or library asset.

Examples include:

- drawings
- briefs
- templates
- reference documents
- attachments

Do not use "resource" to mean a person or staffing slot.

### 2.8 Stage is a label

Project stage is a lifecycle label.

Admins control stage changes in V1.

### 2.9 Utilization is actual logged time

Utilization measures actual logged work relative to available time for the same period.

The system should derive:

`utilizationPercent = loggedHoursInPeriod / availableHoursInPeriod`

In V1, utilization is based on logged project time, not planned assignment hours.

## 3. Core Entities

- Office
- Person
- Project
- Assignment
- TimeEntry
- ResourceDocument

## 4. Reporting

The system should support reporting across:

- all offices
- projects managed by office
- projects originated by office
- people by home office
- staffing allocation
- remaining capacity
- utilization based on logged project time versus available time
- project labor cost

## 5. V1 Scope Notes

V1 should prioritize:

- office-aware project tracking
- person records with salary and availability
- planned staffing assignments in hours
- native Windows time capture with project selection at login or session start
- project labor cost rollups
- project documents / library documents

V1 does not require:

- payroll integration
- dedicated web time-entry screens
- manager time review
- formal time approval workflows
- complex accounting structures
- division-based reporting
