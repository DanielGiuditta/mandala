# Design Contract

This document exists to stop agents from making UI details up.

## Core rule

A design task must point to one of the following:
- a Figma frame URL with node ID,
- a component URL with node ID,
- or a documented reusable pattern already in the codebase.

If none of those exist, the task is design exploration, not implementation.

## Source-of-truth order

1. Approved Figma node / frame
2. Existing shared UI component contract in `packages/ui`
3. Documented design tokens / variables
4. Project-level UI rules

## What an implementation task must include

- exact Figma URL or node ID
- target file path(s)
- whether to create or reuse components
- responsive expectations
- interaction notes
- accessibility notes if relevant
- acceptance criteria

## Required implementation workflow

1. Capture the exact design reference.
2. Extract design context and screenshot.
3. Identify which existing components can be reused.
4. Split the screen into sections.
5. Implement section by section.
6. Validate against the reference.
7. Record any deviation.

## Hard constraints

- Do not hardcode random pixel values if tokens/variables exist.
- Do not invent hover, loading, empty, or error states unless documented.
- Do not replace a shared component with a custom one unless the contract requires it.
- Do not build an entire complex screen from one giant generated block.
- Do not guess icons, imagery, or chart data.
- Do not hardcode shell identity data from mockups. App chrome such as user names, role labels, office labels, and session state must come from the real app session or preview auth path.
- If a Figma table or dashboard shows fields that are not in the current query contract, extend the backend with documented derived values first or keep the UI honest by hiding/relabeling the field. Never ship placeholder dashes for invented backend fields.

## Required Figma hygiene

Design files should use:
- components for repeated UI
- variables for spacing, color, typography, and radius
- semantic layer names
- auto layout
- annotations when intent is not obvious

## Deviation rule

If implementation must deviate for accessibility, framework constraints, or shared design-system consistency:
- keep the deviation minimal
- document it in the task or PR
- prefer the shared design system over one-off literal translation
