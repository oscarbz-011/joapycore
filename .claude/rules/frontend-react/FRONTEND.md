---
paths:
  - "front/**/*.ts"
  - "front/**/*.tsx"
  - "front/**/*.css"
---

# Next.js frontend

- Use the existing Next.js App Router structure, API helpers in `front/lib/api`, shared components, query keys, and permission/module gates before creating a new pattern.
- Keep server and client component boundaries explicit. Add `"use client"` only where hooks, browser APIs, or event handlers require it.
- Model API data with TypeScript types, normalize optional values at boundaries, and show actionable backend error messages without leaking sensitive details.
- Render intentional loading, empty, error, and success states. Preserve keyboard access, labels, focus behavior, contrast, responsive layout, and semantic elements.
- After a mutation, update or invalidate the smallest relevant query/cache and prevent duplicate submissions. Do not assume an optimistic update is safe when the server computes financial or stock state.
- Add Vitest coverage for changed logic and interaction behavior. For `.ts`/`.tsx` changes run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, and `pnpm build` from `front/` before PR.
