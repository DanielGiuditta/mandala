# Architecture Firm Project Tracker – PRD

## 1. Overview

This product helps a multi-office architecture firm manage projects, people, staffing, time, and document resources in one internal system.

The tool should answer:

- which office is running a project
- where a project originated
- who is staffed on each project
- which checklist items are still open on a project
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

Tracked time does not silently create planned weekly assignment hours.

The system should also derive an allocation percentage relative to the person's weekly availability.

People may have overlapping assignments across projects.

### 2.5 Time tracking is lightweight

In V1, people capture time primarily through a native Windows checker.

At machine login or session start, the person selects the current project from a dropdown.

The web app may also expose a lightweight self-only sidebar tracker for any signed-in internal user account.

That tracker may let the person pick any project they are allowed to track against, start or stop a timer, and write a single manual time entry when the timer stops. The signed-in email resolves to the person's backing record for storage.

The standalone web time-tracker workspace remains limited to partners, admins, and project leads. Employees use the sidebar tracker instead.

Once a person has recorded time on a project, the web app should treat that person as staffed to the project for project and people visibility across the system, even if no planned assignment exists yet.

Time tracking is intended for simple operational tracking and rough project cost visibility.

Dedicated web time-entry screens and time-card approval workflows are out of scope for V1. Supervisors and project leads may still correct tracked time after the fact.

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

The V1 stage set is fixed across the instance.

Partners can change stage on any project.

Admins can change stage on any project.

Project leads can change stage on projects they lead.

Changing the global stage set itself is out of scope for V1.

### 2.9 Utilization is actual logged time

Utilization measures actual logged work relative to available time for the same period.

The system should derive:

`utilizationPercent = loggedHoursInPeriod / availableHoursInPeriod`

In V1, utilization is based on logged project time, not planned assignment hours.

### 2.10 Checklist items are lightweight project to-dos

Projects may have lightweight checklist items in V1.

Each checklist item:

- belongs to a project
- has a short title
- may optionally be assigned to a person
- may be marked complete

Checklist items are not tied to stage gating in V1.

### 2.11 Access control is separate from staffing data

Authorization is separate from job titles, office partner designation, and client names.

V1 should support these effective user tiers:

- `partner` — instance-wide operational control and admin assignment
- `admin` — instance-wide operational control
- `projectLead` — system-wide project/people read plus project-scoped write derived from project lead assignment
- `employee` — internal contributor limited to assigned projects
- `client` — read-only access to explicitly assigned projects

One exact internal email, `danielgiuditta@gmail.com`, also holds a non-persisted bootstrap override above partner access.

Client access is explicit per project and must not be inferred from `clientName`.

## 3. Core Entities

- Office
- Person
- Project
- Assignment
- TimeEntry
- ResourceDocument
- ChecklistItem

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
- lightweight project checklist items

V1 does not require:

- payroll integration
- dedicated web time-entry screens
- manager time review
- stage-gated checklist workflows
- formal time approval workflows
- complex accounting structures
- division-based reporting
