Based on everything visible in the conversation, here's a CLAUDE.md for this project:

```markdown
# Equipment Manager (EquipHub)

Electron desktop app for internal equipment allocation management. Offline-first, Vietnamese UI.

## Tech Stack

- **Electron** (main process) + **React** (renderer) via `electron-vite`
- **SQLite** via Drizzle ORM (main process only)
- **TanStack Query** for data fetching in renderer
- **TanStack Table** for table views
- **React Router** for client-side routing

## Project Layout
```

equipment-manager/
electron/
main/
db/ # Drizzle schema + migrations
handlers/ # IPC handler modules (dashboard, devices, requests, allocate, catalog, settings)
index.ts # Main process entry
preload/
index.ts # Exposes typed `window.api` bridge
shared/
ipc.ts # Shared IPC channel names + all TypeScript types (Api, Args, Results)
src/
pages/ # React page components
hooks/ # useQuery/useMutation hooks per domain
components/ # Shared UI components (AppShell, StatusBadge, etc.)
lib/ # api.ts (typed client), status.ts, icons.ts
context/ # AuthContext
router.tsx

````

## Key Patterns

### IPC Flow
All data goes through IPC: renderer → `window.api.<domain>.<method>(args)` → main handler → SQLite → `ApiResponse<T>` back.

Types live in `electron/shared/ipc.ts` — add new channels there first, then implement in a handler file, register in `handlers/index.ts`, expose in `preload/index.ts`.

### Adding a new API endpoint
1. Add channel to `CHANNELS` + types to `ipc.ts`
2. Implement in the relevant `handlers/<domain>.ts`
3. Register in `handlers/index.ts`
4. Expose on `window.api` in `preload/index.ts`
5. Add to `Api` interface in `ipc.ts`
6. Call via `unwrap(api.<domain>.<method>())` in renderer

### ApiResponse
Every handler returns `ApiResponse<T>`:
```ts
{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }
````

Use `unwrap()` from `src/lib/api.ts` in React hooks — it throws on `ok: false` so TanStack Query catches it.

## Running

```bash
# Must unset ELECTRON_RUN_AS_NODE (Claude Code sets it; breaks Electron)
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Do **not** use `npm run dev` directly from Claude Code — it will launch as a Node process, not an Electron app.

## Auth & Roles

Two roles: `admin` and `staff`. Role is stored in session (main process). The `isAdmin` flag comes from `AuthContext` in the renderer. Admin-only UI sections check `useAuth().isAdmin`.

## Design

UI is built from a `.dc.html` design handoff in `design_handoff_equipment_manager/`. When the design file is updated, sync the React pages to match it.

Design conventions:

- CSS vars: `--primary`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--hoverbg`, `--rad-lg/md/sm`, `--rh` (row height)
- Inline styles throughout (no CSS modules or Tailwind)
- Vietnamese labels everywhere

```

Paste this into `equipment-manager/CLAUDE.md` (or the repo root if you prefer). Adjust the run command section if you have a different npm script name.
```
