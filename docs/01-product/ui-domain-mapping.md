# UI Domain Mapping

Use these mappings so UI labels can stay user-friendly while code stays consistent.

## Entity mappings

- "Office" → `Office`
- "Team Member" / "Employee" / "Person" → `Person`
- "User" / "Account" → `UserAccount`
- "Project" → `Project`
- "Office" in project create/list/detail/edit flows → one visible `Office` control that writes the same selection to `Project.managingOfficeId` and `Project.originatingOfficeId`
- "Assignment" / "Staffing Assignment" → `Assignment`
- "Checklist Item" / "Project Checklist" / "To-Do" → `ChecklistItem`
- "Time Entry" / "Tracked Time" / "Project Time" → `TimeEntry`
- "Project Document" / "Library Resource" / "Resource" → `ResourceDocument`
- "Role Assignment" / "Permission Scope" → `RoleAssignment`
- "Client Access" / "Client Project Access" → `ClientProjectAccess`
- "Stage" / "Project Stage" → `stage`
- "Project Photo" / "Cover Image" / "Photo" → `photoUrl`
- "Person Photo" / "Profile Photo" / "Avatar" → `photoUrl`
- "Supervisor" / "Manager" → `Person.supervisorPersonId`
- "Permission" / "Access" (People create/list) → linked `UserAccount` plus optional `RoleAssignment`, not `Person.title`
- "Hours this week" (People list/detail) → current-week rollup of tracked `TimeEntry.hours`
- "Sourced to" (People list/detail) → active projects with tracked `TimeEntry` history for that person, not planned `Assignment` rows
- "Staff" / "Staffed to" (Project detail) → unique people on the project derived from active `Assignment` rows plus tracked `TimeEntry` history

## Action mappings

- "Add Team Member" → create `Person` and optionally linked `UserAccount` / `RoleAssignment` based on the selected permission
- "Assign Admin" → create `RoleAssignment`
- "Create Project" → create `Project`
- "Set Project Lead" → update `Project.leadPersonId`
- "Assign To Project" → create `Assignment`
- "Add Checklist Item" → create `ChecklistItem`
- "Complete Checklist Item" → update `ChecklistItem.completed`
- "Start Work" / "Stop" → manage the self-only `ActiveWorkSession` through the lightweight sidebar tracker; stopping, switching after confirmation, or idle pause writes the finalized elapsed time as a manual `TimeEntry`
- "View Project Time" → read `TimeEntry`
- "Upload Document" → create `ResourceDocument`
- "Grant Client Access" → create `ClientProjectAccess`
- "Change Project Stage" → update `Project.stage`

## Naming rules

- Do not use "Resource" for a person or staffing slot.
- Do not use "Division" or "Cost Center" unless the product docs explicitly add them.
- Use office-based language for organization and reporting.
- Do not surface separate "Managing Office" / "Originating Office" labels in the current project UI; the visible label is just "Office".
- Do not treat checklist items as stage gates in V1.
- Do not add a dedicated V1 web "Log Time" screen or workflow. The lightweight self-only sidebar tracker is the employee-facing web capture surface, and it may target only projects the viewer may track against.
- Opening a project does not change the active project. An accessible project other than the active one is view-only until the employee selects Start Work on it.
- Do not use `Person.title` to store authorization roles.
- Do not infer client permissions from `Project.clientName`.
- Treat "Project Lead" as a permission derived from `Project.leadPersonId`, not a standalone entity.
