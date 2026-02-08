# AGENTS.md - Repository Guidelines for AI Coding Agents

This document helps AI agents work effectively in the Inventory-Tracker codebase.

## Essential Commands

### Build & Development
```bash
bun run dev          # Start dev server on port 3000
bun run build        # Production build
bun run preview      # Preview production build
```

### Code Quality
```bash
bun run lint         # Run Biome linter
bun run format       # Format code with Biome (tabs, double quotes)
bun run check        # Run both lint and format
```

### Testing
```bash
bun run test         # Run all tests once
# To run a single test file: bun run test path/to/test.test.ts
# For watch mode: vitest (without --run flag)
# Tests use Vitest with jsdom environment
```

### Shadcn Components
```bash
# Add new components using latest version:
bunx shadcn@latest add button
```

## Code Style Guidelines

### Imports & Organization
- Group imports: external deps → internal deps → relative paths
- Use specific imports from Convex: `query`, `mutation`, `internalMutation` from `'./_generated/server'`
- Import from generated API: `import { api } from '../../convex/_generated/api'`
- Path aliases: `@/*` points to `src/*`, `@/convex/*` points to `convex/*`

### Formatting (Biome)
- Tabs for indentation (configured in biome.json)
- Double quotes for strings
- Organize imports automatically enabled
- Run `bun run format` before committing

### TypeScript
- Strict mode enabled (noUnusedLocals, noUnusedParameters)
- Use explicit types for function parameters and return values
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use Convex types: `v.id('tableName')`, `v.string()`, `v.optional()`

### Naming Conventions
- Components: PascalCase (DashboardPage, Button, Card)
- Functions/hooks: camelCase (useAuth, getUserById)
- Variables: camelCase (userId, isLoading)
- Constants: UPPER_SNAKE_CASE (API_URL, MAX_ITEMS)
- Files: kebab-case for components (button.tsx), camelCase for hooks (useAuth.tsx)

### Error Handling
- Use try/catch for async operations in components
- Throw Errors in Convex functions for client catch
- Log errors with console.error during development
- Set error state and display to users in UI
- Handle LogtoRequestError specifically for auth issues

### React Patterns
- Functional components with hooks
- Destructure props in function signature
- Use useMemo/useCallback for expensive computations or stable references
- Keep component logic with useAuth hooks for auth state
- Route components export `export const Route = createFileRoute("/path")({ component: Component })`

### Convex Backend Guidelines
- Use `v` validator builder from `convex/values`
- Define schemas with `defineSchema`, `defineTable` from `convex/server`
- Every table has system fields: `_id`, `_creationTime` (auto-added, no manual indices needed)
- Add indexes with `.index("name", ["field"])` for performant queries
- Use `v.optional(T)` for nullable fields (e.g., `v.optional(v.string())`)
- Use `v.union(v.literal(...))` for enums (e.g., `v.union(v.literal("active"), v.literal("inactive"))`)
- Validate auth context in all queries/mutations with `authContextSchema`
- Use `getCurrentUser(ctx, authContext)` for user authorization

### Convex Validator Reference
Use these validators from `v`:
- `v.id("tableName")` - ID reference to another table
- `v.string()`, `v.number()`, `v.boolean()` - primitives
- `v.array(v.string())` - arrays
- `v.object({ field: v.string() })` - nested objects
- `v.union(v.literal("a"), v.literal("b"))` - enums
- `v.optional(v.string())` - nullable fields

### Multi-Tenant Architecture
- All organization-scoped tables include `orgId: v.id('organizations')`
- Role hierarchy: Administrator > Executive Officers > General Officers > Member
- Verify user belongs to org before returning data
- Use `ctx.db.get()` to fetch, throw error if not found or access denied

### Component Structure
- Separate features into directories: components/auth/, components/ui/
- Export barrel index.ts files: `export { Button } from './button'`
- Use shadcn components from @/components/ui
- Utility functions in @/lib (cn helper for Tailwind classes)

### Testing
- File pattern: `*.test.ts` or `*.spec.ts`
- Use Vitest with jsdom environment
- Test Convex queries/mutations with mock ctx
- Test React components with @testing-library/react
- Run single test: `bun test path/to/test.test.ts`
- Watch mode: `vitest` (without --run flag)

## Important Notes
- Never commit secrets (.env.local, credentials.json)
- Run lint/typecheck after changes
- Follow existing code patterns - read surrounding files before editing
- Use Lucide icons (iconLibrary configured in components.json)
- CSS uses Tailwind v4 with @tailwindcss/vite plugin
- Package manager: bun (not npm, pnpm, or yarn)
- Environment variables managed with @t3-oss/env-core

## Example Convex Schema
```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
  }),
  
  sessions: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
  }).index("sessionId", ["sessionId"]),
});
```
