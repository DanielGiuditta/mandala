# UI Domain Mapping

Use these mappings so UI labels can stay user-friendly while code stays consistent.

## Entity mappings

- "Office" → `Office`
- "Team Member" / "Employee" / "Person" → `Person`
- "Project" → `Project`
- "Assignment" / "Staffing Assignment" → `Assignment`
- "Checklist Item" / "Project Checklist" / "To-Do" → `ChecklistItem`
- "Time Entry" / "Tracked Time" / "Project Time" → `TimeEntry`
- "Project Document" / "Library Resource" / "Resource" → `ResourceDocument`
- "Stage" / "Project Stage" → `stage`

## Action mappings

- "Add Team Member" → create `Person`
- "Create Project" → create `Project`
- "Assign To Project" → create `Assignment`
- "Add Checklist Item" → create `ChecklistItem`
- "Complete Checklist Item" → update `ChecklistItem.completed`
- "View Project Time" → read `TimeEntry`
- "Upload Document" → create `ResourceDocument`
- "Change Project Stage" → update `Project.stage`

## Naming rules

- Do not use "Resource" for a person or staffing slot.
- Do not use "Division" or "Cost Center" unless the product docs explicitly add them.
- Use office-based language for organization and reporting.
- Do not treat checklist items as stage gates in V1.
- Do not add a dedicated V1 web "Log Time" action; time capture happens in the native Windows checker.
