# Features

Each folder here is one concept in the product — everything about it lives
together instead of being scattered across `components/`, `actions/`,
`hooks/`, etc.

Every feature folder follows the same three files, so once you understand
one, you understand the rest:

- **`types.ts`** — TypeScript types specific to this feature
- **`queries.ts`** — TanStack Query hooks for *reading* data (`useResources()`, `useNotices()`, ...)
- **`actions.ts`** — Server Actions for *writing* data (CR-only mutations: upload, edit, approve, ...)
- **`components/`** — components used only by this feature. If a component
  ends up needed by more than one feature (e.g. a `ResourceCard` shown in
  both Notes & Lab and PYQs), promote it to `src/components/shared/`
  instead of importing it across feature folders.

When Sancturm grows a genuinely new concept later (e.g. "Study Groups"),
it gets a new folder here, built the same way — nothing else in the app
needs to change.
