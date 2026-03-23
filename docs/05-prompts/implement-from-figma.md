# Prompt: Implement from Figma

Read `docs/03-design/design-contract.md` first.

Implement the UI for:
- Figma URL / node: <PASTE URL>
- Target path(s): <PATHS>
- Reuse these components first: <COMPONENTS>

Rules:
- Treat Figma output as design context, not final code.
- Reuse tokens and shared components.
- Do not invent states, assets, or interactions.
- Split the work into sections if the frame is large.
- Document any deviation.
- Start from the existing `packages/db` and auth/session contract before translating the frame into UI.
- For shell chrome, bind identity and navigation context to real session data or preview auth data. Do not hardcode mock user names, pinned items, or workspace labels from Figma.
- For list/table screens, map every visible column to a real field or documented derived value. If the current contract does not expose a required metric, extend the query layer first.
- If access rules restrict a field such as labor cost or staffing metrics, keep the layout but hide or redact the value instead of faking it.

Return:
1. component reuse plan
2. file changes
3. deviation notes
4. backend contract mapping for any new derived UI fields
5. manual visual check list
