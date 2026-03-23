# Project Stage Labels

## Default V1 stage set

- `proposal`
- `planning`
- `active`
- `construction`
- `completed`
- `onHold`

## Required V1 behavior

- Stage is a project lifecycle label.
- The V1 stage set is fixed.
- Partners can change stage on any project.
- Scoped admins can change stage on projects managed by their scoped offices.
- Project leads can change stage on projects they lead.
- Stage changes are not gated by approvals or checklists in V1.
- Project checklist items may exist in V1 without affecting stage changes.

## Future workflow notes

If advanced workflow logic or custom stage catalogs are added later, define these explicitly first:
- Which checklist items are required for each stage?
- Which approvals, if any, are required for each stage?
- Which roles can approve each stage?
- Can partners or admins change the global stage set?
- Are backward transitions allowed?
- Can a project skip a stage?
- What happens to incomplete approvals after a backward move?
