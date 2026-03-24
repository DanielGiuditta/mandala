# Definition of Done

A task is done only when all relevant items below are satisfied.

## Product
- Behavior matches the documented scope.
- No undocumented statuses, stages, or fields were invented.

## Code
- The smallest coherent change was made.
- Shared abstractions were reused where appropriate.
- New code is named clearly.

## Data
- Migrations exist for schema changes.
- Policies exist for protected data and storage access.

## Design
- UI work references a real design source.
- Any deviation is documented.
- For entity workspaces, list/detail navigation does not regress into unnecessary full-page teardown when a shared segment layout can preserve the workspace.

## Validation
- Relevant checks were run, or the exact reason they were not is stated.
- Manual verification steps are written for UI flows.

## Documentation
- Contract docs were updated if behavior changed.
