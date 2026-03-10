
# Architecture Firm Tracker — Build Roadmap

Work through this roadmap sequentially with Codex.
Check items off as you complete them.

---

## Phase 0 — Repo Setup

- [x] Unzip the starter repo into your project
- [x] Commit the initial repo

```
git add .
git commit -m "initial codex project scaffold"
```

- [x] Open the repo root in Codex
- [x] Confirm these files exist

```
docs/01-product/prd.md
docs/01-product/domain-model.md
docs/01-product/field-definitions.md
docs/01-product/ui-domain-mapping.md
AGENTS.md
```

---

# Phase 1 — Core Domain

Goal: Implement the canonical entities.

DO NOT BUILD UI YET.

---

## Step 1 — Office

- [x] Prompt Codex to implement the Office entity
- [x] Add database table
- [x] Add domain type in packages/domain
- [x] Add seed data

Example offices:

- Calicut
- Bangalore
- Kochi

Commit

```
git commit -am "implement office entity"
```

---

## Step 2 — Person

- [x] Prompt Codex to implement Person
- [x] Person belongs to an office
- [x] Add salary + availability fields
- [x] Add derived hourly cost

```
hourlyCost = annualSalary / 2080
```

Commit

```
git commit -am "implement person entity"
```

---

## Step 3 — Project

- [x] Prompt Codex to implement Project

Required fields:

- id
- name
- clientName
- originatingOfficeId
- managingOfficeId
- leadPersonId
- stage

Important rule

A project may originate in one office and be managed by another.

Commit

```
git commit -am "implement project entity"
```

---

## Step 4 — Assignment

- [x] Implement Assignment entity

Fields

- id
- projectId
- personId
- assignedHoursPerWeek
- startDate
- endDate

Derived value

```
allocationPercent =
assignedHoursPerWeek / availabilityHoursPerWeek
```

Commit

```
git commit -am "implement assignment entity"
```

---

## Step 5 — TimeEntry

- [x] Implement TimeEntry entity

Fields

- personId
- projectId
- hours
- date
- source

Derived

```
laborCost = hours * hourlyCost
```

Commit

```
git commit -am "implement time entry entity"
```

---

## Step 6 — ResourceDocument

- [x] Implement document resource entity

Fields

- name
- fileUrl
- projectId
- uploadedByPersonId

Note

If projectId is null → library document

Commit

```
git commit -am "implement resource document entity"
```

---

## Step 7 — ChecklistItem

- [x] Implement checklist item entity

Fields

- id
- projectId
- title
- assignedPersonId
- completed

Note

Checklist items are lightweight project to-dos and are not stage-gated in V1.

Commit

```
git commit -am "implement checklist item entity"
```

---

# Phase 2 — Database Integrity

- [x] Add foreign keys

```
Person.officeId → Office.id
Project.originatingOfficeId → Office.id
Project.managingOfficeId → Office.id
Assignment.personId → Person.id
Assignment.projectId → Project.id
ChecklistItem.projectId → Project.id
ChecklistItem.assignedPersonId → Person.id
TimeEntry.personId → Person.id
```

- [x] Add indexes for common queries

Commit

```
git commit -am "add database constraints"
```

---

# Phase 3 — First Vertical Slice

Goal: First working screen.

Feature: Project list

Note

The current implementation is an intentionally minimal technical scaffold, not final UI.

Display

- project name
- client
- stage
- originating office
- managing office

- [x] Build Projects list UI
- [x] Fetch projects from backend
- [x] Display office names

Commit

```
git commit -am "implement projects list"
```

---

# Phase 4 — Project Detail

- [x] Build project detail page
- [x] Show assignments
- [x] Show checklist items
- [x] Show documents
- [x] Show project time summary

Commit

```
git commit -am "implement project detail"
```

---

# Phase 5 — People

- [x] Build People list

Display

- name
- title
- office
- availability
- salary
- hourly cost

Commit

```
git commit -am "implement people list"
```

---

# Phase 6 — Project Staffing

- [ ] Implement assignment editor
- [ ] Show weekly hours per person
- [ ] Show allocation %

Note

Staffing is handled inside project detail in V1, not as a top-level module.

Commit

```
git commit -am "implement staffing planner"
```

---

# Phase 7 — Native Time Capture

- [ ] Implement Windows checker project selection flow
- [ ] Sync captured time into `TimeEntry`
- [x] Display recent entries on the project page

Note

Dedicated web time entry is out of scope for V1.

Commit

```
git commit -am "implement time tracking"
```

---

# Phase 8 — Cost Visibility

- [x] Calculate project labor cost

```
sum(timeEntry.hours * hourlyCost)
```

- [x] Show cost on project page

Commit

```
git commit -am "implement cost reporting"
```

---

# Phase 9 — Documents

- [ ] Upload documents
- [x] Show project document list
- [x] Show library documents

Commit

```
git commit -am "implement documents"
```

---

# Phase 10 — Dashboard

- [ ] Build firm dashboard

Show

- projects by stage
- projects by office
- utilization
- active staffing

Commit

```
git commit -am "implement dashboard"
```
