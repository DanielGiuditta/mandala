
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

- [ ] Implement Assignment entity

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

- [ ] Implement TimeEntry entity

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

- [ ] Implement document resource entity

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

# Phase 2 — Database Integrity

- [ ] Add foreign keys

```
Person.officeId → Office.id
Project.originatingOfficeId → Office.id
Project.managingOfficeId → Office.id
Assignment.personId → Person.id
Assignment.projectId → Project.id
TimeEntry.personId → Person.id
```

- [ ] Add indexes for common queries

Commit

```
git commit -am "add database constraints"
```

---

# Phase 3 — First Vertical Slice

Goal: First working screen.

Feature: Project list

Display

- project name
- client
- stage
- originating office
- managing office

- [ ] Build Projects list UI
- [ ] Fetch projects from backend
- [ ] Display office names

Commit

```
git commit -am "implement projects list"
```

---

# Phase 4 — Project Detail

- [ ] Build project detail page
- [ ] Show assignments
- [ ] Show documents
- [ ] Show time entries

Commit

```
git commit -am "implement project detail"
```

---

# Phase 5 — People

- [ ] Build People list

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

# Phase 6 — Staffing Planner

- [ ] Implement assignment editor
- [ ] Show weekly hours per person
- [ ] Show allocation %

Commit

```
git commit -am "implement staffing planner"
```

---

# Phase 7 — Time Tracking

- [ ] Implement manual time entry
- [ ] Allow selecting project
- [ ] Allow entering hours
- [ ] Display recent entries

Commit

```
git commit -am "implement time tracking"
```

---

# Phase 8 — Cost Visibility

- [ ] Calculate project labor cost

```
sum(timeEntry.hours * hourlyCost)
```

- [ ] Show cost on project page

Commit

```
git commit -am "implement cost reporting"
```

---

# Phase 9 — Documents

- [ ] Upload documents
- [ ] Show project document list
- [ ] Show library documents

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
