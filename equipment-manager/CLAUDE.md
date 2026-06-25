# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**EquipHub** — an offline-first Electron desktop app for internal equipment inventory, allocation, and department tracking. Electron main process + React renderer, with a local SQLite database. The UI is entirely in **Vietnamese**.

## Commands

```bash
# Install + rebuild the native SQLite module against Electron (run after install / Electron upgrade)
npm install
npx electron-rebuild -f -w better-sqlite3   # also runs automatically via `predev`

npm run dev          # launch the app with hot reload (electron-vite)
npm run build        # production build
npm run start        # preview the production build

npm run typecheck    # both sides: typecheck:node (tsconfig.node.json) + typecheck:web (tsconfig.json)
npm test             # full Vitest suite (vitest run)
npm run test:watch   # watch mode

npx vitest run path/to/file.test.ts                     # single test file
npx vitest run -t "name of test"                         # single test by name

npm run db:generate  # regenerate Drizzle migrations from schema.ts (drizzle-kit)
```

Default login: **admin / admin**.

### Environment gotchas (important)

- The `dev`/`build`/`start` scripts are already prefixed with `env -u ELECTRON_RUN_AS_NODE`. Claude Code's shell inherits `ELECTRON_RUN_AS_NODE=1`, which makes Electron launch as a bare Node process instead of a GUI app. **Do not** invoke `electron-vite dev` directly without unsetting that var — use the npm scripts.
- `npm test` can fail with a `better-sqlite3` NODE_MODULE_VERSION / ABI mismatch because `electron-rebuild` compiled the native module for Electron's ABI, not the system Node's. If tests fail to load `better-sqlite3`, run vitest directly under Node 22, or re-run `npm install` to restore the Node-ABI build before testing.

## Architecture

### Process split & the IPC contract

Everything is wired around a single typed IPC contract in **`electron/shared/ipc.ts`** — the source of truth shared by both processes (alias `@shared`). It defines:

- `CHANNELS` — the channel-name constants (e.g. `'devices.list'`).
- All argument/result types and the `Api` interface that `window.api` implements.
- `ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code; message } }`.

Data flow: **renderer** `window.api.<domain>.<method>(args)` → **preload** bridge → **main** `ipcMain.handle` → handler → SQLite → `ApiResponse<T>` back. The renderer's `src/lib/api.ts` exposes `unwrap()`, which throws on `ok: false` so TanStack Query treats handler errors as query/mutation failures.

Main-process handlers live in **`electron/main/handlers/`**, one module per domain (`auth`, `devices`, `dashboard`, `requests`, `allocate`, `catalog`, `settings`). Each exports a `make<Domain>Handlers(db)` factory. `handlers/index.ts` instantiates them and registers every channel. All channels except the `auth.*` ones are wrapped in `auth_guard(...)`, which returns `UNAUTHORIZED` unless `session.current` is set.

**Session** is a module-level singleton in `electron/main/session.ts` (`{ current: SessionUser | null }`) — set on `auth.login`, cleared on `auth.logout`. There is no token; auth is in-process state.

### Adding a new API endpoint

1. Add the channel to `CHANNELS` and its arg/result types to `electron/shared/ipc.ts`; add the method to the `Api` interface.
2. Implement it in the relevant `electron/main/handlers/<domain>.ts` factory.
3. Register the channel in `handlers/index.ts` (wrap in `auth_guard` unless it's an auth endpoint).
4. Expose it on `window.api` in `electron/preload/index.ts`.
5. Call it from the renderer via `unwrap(api.<domain>.<method>(...))`, typically inside a hook in `src/hooks/`.

### Database

- Drizzle ORM over `better-sqlite3`. Schema in `electron/main/db/schema.ts`: `categories`, `departments`, `employees`, `appUsers`, `devices`, `requests`, `allocations`, `maintenanceLogs`.
- On launch (`electron/main/index.ts`): open DB at `app.getPath('userData')/equiphub.db`, `runMigrations(db)`, then `seedIfEmpty(db)`, then `registerHandlers`. Migrations are in `electron/main/db/migrations/`.
- macOS DB path: `~/Library/Application Support/equipment-manager/equiphub.db`. **Delete this file to reset to seed data.**

### Renderer

- React 18 + React Router (`src/router.tsx`), TanStack Query (data) and TanStack Table (tables). Aliases: `@` → `src`, `@shared` → `electron/shared`.
- `src/pages/` are routed screens (Dashboard, Devices, DeviceDetail, Requests, RequestDetail, Allocate, Catalog, Settings, Login); `src/hooks/` hold the per-domain query/mutation hooks; `src/components/` hold shared UI incl. dialog workflows (AllocationDrawer, ChangeStatusDialog, ReturnDialog, DeviceFormDialog, ConfirmDeleteDialog).
- `src/context/AuthContext.tsx` exposes `useAuth()`; admin-only UI gates on `useAuth().isAdmin`. Two roles exist: `admin` and `staff`.

### Auth & roles

Passwords are hashed with `bcryptjs` in `appUsers`. Roles are `admin` / `staff`; the role lives in the main-process session and surfaces to the renderer through `AuthContext`.

## Conventions

- **Styling:** inline styles + CSS custom properties (`src/styles/tokens.css`), e.g. `--primary`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--rad-lg/md/sm`, `--rh` (row height). No CSS modules. Tailwind/PostCSS are configured but the app is primarily token-driven inline styles.
- **Language:** all user-facing labels and error messages are in Vietnamese.
- **Design source:** UI mirrors the `.dc.html` handoff in `design_handoff_equipment_manager/` (repo root). When that file changes, sync the affected React pages to match.
