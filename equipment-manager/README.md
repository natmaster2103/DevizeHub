# EquipHub — Equipment Manager (M1)

Desktop application for managing equipment inventory, allocation, and department tracking. Built with Electron + React + SQLite.

## Prerequisites

- Node.js 22 (LTS)
- macOS (development target for M1)

## Install

```bash
npm install
npx electron-rebuild -f -w better-sqlite3
```

The `electron-rebuild` step recompiles the native SQLite module against the Electron runtime. Run it once after `npm install` and again whenever you update Electron.

## Dev

```bash
npm run dev
```

Opens the Electron app with hot reload via `electron-vite`. Default login: **admin / admin**.

## Tests

```bash
npm test
```

Runs the full Vitest suite (8 test files, 21 tests). Coverage spans:

- DB migrations and seeding (`electron/main/db/`)
- IPC handlers: auth, devices, dashboard (`electron/main/handlers/`)
- Status helpers and StatusBadge component (`src/lib/status`, `src/components/`)

## Typecheck

```bash
npm run typecheck
```

Runs `tsc --noEmit` for both the Node/Electron side (`tsconfig.node.json`) and the renderer/web side (`tsconfig.json`).

## Database

SQLite file lives at:

```
{app.getPath('userData')}/equiphub.db
```

On macOS this is typically `~/Library/Application Support/equipment-manager/equiphub.db`. The DB is created and migrated automatically on first launch. Delete the file to reset to seed data.

## Milestone Roadmap

See `.superpowers/sdd/` for the full design spec and per-milestone task briefs. This build covers **M1 (Walking Skeleton)** — login gate, dashboard with stat cards and dept grid, devices list with filter/search, device detail with info and history tabs.

M2 will add CRUD mutations: add device, change status, record allocation/return via dialog workflows.
