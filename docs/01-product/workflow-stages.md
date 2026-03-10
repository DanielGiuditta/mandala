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
- Admins control stage changes in V1.
- Stage changes are not gated by approvals or checklists in V1.
- Project checklist items may exist in V1 without affecting stage changes.

## Future workflow notes

If advanced workflow logic is added later, define these explicitly first:
- Which checklist items are required for each stage?
- Which approvals, if any, are required for each stage?
- Which roles can move stages?
- Which roles can approve each stage?
- Are backward transitions allowed?
- Can a project skip a stage?
- What happens to incomplete approvals after a backward move?
