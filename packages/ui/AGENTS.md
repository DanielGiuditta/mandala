# AGENTS.md for packages/ui

This folder owns reusable UI primitives and shared components.

## Rules

- Prefer composition over one-off feature components.
- Do not introduce new primitives unless the existing set cannot express the design.
- Use tokens and variables; do not hardcode visual values without a documented reason.
- Keep components presentation-focused; business decisions belong outside this package.
- Document any new shared component API in code comments or package docs.
