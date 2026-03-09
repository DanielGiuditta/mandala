# CLAUDE.md

See @README.md for repo overview.
See @docs/01-product/prd.md for V1 scope.
See @docs/01-product/domain-model.md for domain language and invariants.
See @docs/02-architecture/architecture.md for system layout.
See @docs/03-design/design-contract.md for design implementation rules.
See @docs/04-delivery/definition-of-done.md for completion criteria.

## Project priorities

- Correct domain behavior
- Clean data model
- Tight V1 scope
- Reusable UI
- Explicit security boundaries

## Working rules

- Do not make up statuses, stages, permission rules, or calculations.
- Keep instructions concise and local to the files being changed.
- Prefer existing packages, components, and tokens.
- If changing contracts, update the docs in the same task.
- If touching UI, validate against the design contract.
- If touching database tables or storage, preserve RLS expectations.

## Preferred implementation style

- Small diffs
- Clear naming
- Minimal abstraction until repetition is real
- Strong typing and runtime validation at boundaries
- Tests for business logic and critical flows

## Avoid

- Hidden side effects
- One-off patterns that bypass shared packages
- Huge docs in this file
- Unbounded scope creep
