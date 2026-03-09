# Testing Strategy

## Priorities

1. Business rules and access rules
2. Office relationships and stage labels
3. Rollups and cost calculations
4. Critical list/detail screens
5. Time-entry correctness

## Minimum recommended layers

- Unit tests for pure business logic
- Integration tests for database-backed workflows
- UI smoke tests for critical screens
- Manual acceptance checks for Figma-heavy work

## Test data

Maintain a realistic seed dataset covering:
- multiple offices
- active and inactive staff
- projects in different stages
- projects whose originating and managing offices differ
- people on multiple assignments
- project documents and shared library documents

## Risk-based focus

Test these first when time is tight:
- originating/managing office integrity
- stage label changes
- assignment/time rollups
- salary/cost visibility rules
- storage access rules
