# UI package

Shared UI components, tokens, and layout primitives.

Rules:
- Prefer semantic building blocks.
- Keep styling decisions centralized.
- Avoid product-specific business logic here.

Current note:
- The reusable dropdown system is implemented in `apps/web/app/components/ui/dropdown.tsx` for this task because `packages/ui` is not yet wired as a consumable workspace package (no `package.json` / exports setup). The API is extraction-ready and intentionally presentation-only.
