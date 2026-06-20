# Equipment Manager — Milestone 1: Walking Skeleton — Design Spec

**Date:** 2026-06-20
**Stack:** Electron + electron-vite + TypeScript + React + SQLite (Drizzle ORM, better-sqlite3)
**UI:** shadcn/ui + Tailwind CSS + TanStack Table + TanStack Query
**Language (UI):** Vietnamese
**Dev platform:** macOS (development now). **Target platform:** Windows (packaging in a later milestone).

This spec covers **Milestone 1 only**, plus the overall milestone roadmap and the full database schema (defined once now to avoid migration churn later). Source design: `design_handoff_DevizeHub/` (prototype `DevizeHub.dc.html`, `README.md`) and `docs/superpowers/specs/2026-06-18-equipment-management-design.md`.

---

## 1. Goal

A real, runnable Electron desktop app that proves the entire architecture end-to-end:

```
React renderer  ⇄  typed contextBridge API  ⇄  ipcMain handlers  ⇄  Drizzle/better-sqlite3
```

Milestone 1 delivers Login, the app shell, the Dashboard, and Devices (list + detail), all reading from a **seeded local SQLite database**. Running `npm run dev` on macOS opens the Electron app, lets you log in as `admin`/`admin`, and browse real data with the prototype's visual fidelity.

M1 is the foundation. Later milestones layer on the remaining screens and write flows without re-architecting.

---

## 2. Resolved scope decisions

These were settled during brainstorming and are binding for this build:

1. **Build strategy:** Walking skeleton first (this milestone), then feature milestones.
2. **Dashboard source of truth = the prototype:** stat cards + "by department" grid only. **No** monthly bar chart, **no** alerts panel (the spec's chart/alerts were removed post-review in the handoff).
3. **Maintenance = status-only:** `maintenance` is a device status reachable later via "Change status", and `maintenance_logs` exists in the schema for history. **No** dedicated Maintenance nav item or screen.
4. **Data layer = Approach A:** typed IPC + TanStack Query (`useQuery`/`useMutation`) wrapping a single typed `window.api`.
5. **Platform:** develop/run on macOS in M1; Windows packaging deferred to a later milestone (native `better-sqlite3` rebuild for Windows handled then).

---

## 3. Milestone roadmap (context; only M1 is specced here)

- **M1 — Walking Skeleton (this spec):** scaffold, full schema + migrations + seed, IPC foundation, Login, App Shell, Dashboard, Devices list/detail. Read-only.
- **M2 — Requests & Allocations:** Requests list/detail, Allocate (single) form, Return dialog, Add-Device dialog. First write/transaction flows; derived request status.
- **M3 — Catalog & Settings:** CRUD for categories/departments/employees; user management, change password, DB path display.
- **M4 — Device writes & status transitions:** Add/Edit device, Change status (incl. maintenance/decommission), device history from real allocations + maintenance logs.
- **M5 — Reports & Export:** report filters/aggregates, Excel (exceljs) + PDF (pdfmake) export.
- **M6 — Windows packaging:** electron-builder, native rebuild, NSIS installer, default DB path `C:\ProgramData\EquipHub\equiphub.db`, first-run admin bootstrap.

YAGNI: out of scope for the whole product (per spec §10) — multi-machine sync, device photos, email/push, mobile.

---

## 4. Architecture

**Processes**
- **Main** (`electron/main/`): owns SQLite (better-sqlite3 + Drizzle), runs migrations + seed on startup, hosts all `ipcMain.handle` domain handlers, holds business logic. No business logic in the renderer.
- **Preload** (`electron/preload/`): `contextBridge.exposeInMainWorld('api', …)` exposing a typed, minimal surface. `contextIsolation: true`, `nodeIntegration: false`. Renderer never touches Node directly.
- **Renderer** (`src/`): React + React Router + shadcn/ui. TanStack Query for all data access; TanStack Table for tabular screens.

**Data flow (read example):** `Devices.tsx` → `useDevices(filter, query)` (TanStack Query) → `window.api.devices.list({filter, query})` → preload invoke → `ipcMain.handle('devices.list')` → Drizzle query → typed rows back up the chain.

**Type sharing:** a `shared/` (or `electron/shared/`) module holds the IPC channel contract (request/response types) imported by both preload and renderer, so the API is end-to-end typed. Drizzle's inferred row types are the basis for response DTOs.

**IPC contract shape:** one typed object per domain, e.g. `window.api.devices.list(args)`, `window.api.auth.login(args)`. Each maps to a named channel string (`'devices.list'`). A thin `registerHandlers()` in main wires channel → handler.

---

## 5. Full database schema (Drizzle)

Defined in full now; M1 reads from it (and seeds it). Columns follow the design spec §3.

- **categories**: `id` PK, `name`, `min_stock` (int), `created_at` (ISO text).
- **departments**: `id` PK, `name`, `created_at`.
- **employees**: `id` PK, `name`, `employee_code`, `department_id` FK→departments, `created_at`.
- **app_users**: `id` PK, `username` UNIQUE, `password_hash` (bcrypt), `role` (`admin`|`staff`), `display_name`, `active` (int 0/1, default 1), `created_at`.
- **devices**: `id` PK, `sku` UNIQUE, `name`, `category_id` FK→categories, `serial_number`, `status` (`available`|`allocated`|`maintenance`|`broken`|`decommissioned`), `notes`, `created_at`, `updated_at`.
- **requests**: `id` PK, `code` UNIQUE, `department_id` FK, `employee_id` FK, `created_by` FK→app_users, `created_at`, `notes`. (Status is **derived**, not stored.)
- **allocations**: `id` PK, `request_id` FK→requests (nullable), `device_id` FK, `employee_id` FK, `department_id` FK, `issued_by` FK→app_users, `issued_at`, `due_date` (nullable), `returned_at` (nullable), `condition_out`, `condition_in`, `notes`.
- **maintenance_logs**: `id` PK, `device_id` FK, `started_at`, `completed_at` (nullable), `description`, `performed_by`.

**Status vocabulary:** DB stores English enums (`available`, …); the UI maps to Vietnamese labels + badge colors via a single `statusMap` (Trong kho / Đang trang bị / Đang bảo trì / Hỏng / Thanh lý). Request derived status: any allocation with `returned_at IS NULL` ⇒ "Đang trang bị", else "Hoàn tất" (an explicit "Đang xử lý" state for requests with no allocations yet is handled in M2).

**Migrations:** `drizzle-kit` generates SQL migrations; a `migrate.ts` runner applies them on app startup (idempotent). DB file at `app.getPath('userData')/equiphub.db` in dev.

**Seed:** `seed.ts` populates from the prototype's sample data so screens are realistic: the 7 categories, 7 departments, sample employees, the `admin` user (bcrypt-hashed `admin`, display name "Trần Quốc Bảo"), the 12 devices with their statuses/serials/notes, and the dept-allocation/request/allocation rows backing the dashboard dept grid and device history. Seed runs only when tables are empty (first run).

---

## 6. IPC handlers (M1 set)

| Channel | Args | Returns | Notes |
|---|---|---|---|
| `auth.login` | `{username, password}` | `{user}` or error | bcrypt compare; rejects inactive users |
| `auth.me` | — | `{user} \| null` | current in-memory session |
| `auth.logout` | — | `{ok}` | clears session |
| `devices.list` | `{filter, query}` | `Device[]` + counts per status | filter = status key or `all`; query matches sku/name/holder/dept/serial |
| `devices.get` | `{sku}` | `{device, info, history}` | history = allocations + maintenance for that device, sorted desc |
| `dashboard.summary` | — | `{stats, deptCards}` | stat counts (total/allocated/maintenance/broken) + dept-grouped active allocations with their requests/items |

Errors: handlers return a typed `{error: {code, message}}` envelope or throw a serializable error; renderer surfaces a Vietnamese message. Auth state lives in main-process memory for M1 (logout on app exit), matching the spec.

---

## 7. UI / screens (M1)

Visual fidelity per the handoff **Design Tokens** (light/dark theme variables, accent, density, chrome radius) wired as CSS variables on a root wrapper. Font: Segoe UI / system-ui; monospace Consolas/SF Mono for SKU/dates.

- **AppShell** — collapsible sidebar (232px ⇄ 68px), nav items (Tổng quan, Thiết bị, Phiếu đề nghị, Cấp phát lẻ, Báo cáo, Danh mục, Cài đặt — non-M1 routes render a "coming soon" placeholder). Topbar: page title/subtitle, role toggle, theme toggle, notifications bell, user avatar/name, logout. Theme + collapse persisted to `localStorage`; role toggle via an `AuthContext`/`useRole`.
- **Login** — centered 380px card per prototype; calls `auth.login`; on success routes to `/` (Dashboard).
- **Dashboard** — `max-width:1240px`. 4 stat cards (from `dashboard.summary`). "Thiết bị đang trang bị theo phòng ban" grid (2 cols, 4 dept cards): request chips (horizontal scroll, active chip = primary), meta line + status badge (only when "Đang trang bị"), device list with borrow datetime / borrower / lender and a "Trả về" button (placeholder no-op in M1 — wired to the Return dialog in M2), pagination at 6 items/page with per-card chip + page state.
- **Devices** — search input (with barcode-scan affordance), status filter chips with counts, TanStack Table (SKU monospace / name / category / status badge / dept+holder / actions). "Xem" (eye) always visible; "Sửa" + "Đổi trạng thái" admin-only (placeholder no-ops in M1). Footer "Hiển thị X / Y" + pager.
- **DeviceDetail** — back link; header (icon, name, SKU, status badge, admin-only action buttons as placeholders); Tabs "Thông tin" (key/value table) / "Lịch sử" (vertical timeline: allocate=blue, return=green, maintenance=yellow, create=gray).

**Role-based UI:** an `isAdmin` flag from context hides admin-only controls entirely when role = `staff` (the topbar role toggle flips it for demo, as in the prototype).

**Reusable components:** `StatusBadge` (status enum → label + pill colors), `PageHeader`, `Sidebar`, `Topbar`, theme/role context providers.

---

## 8. Project structure (target)

```
equipment-manager/
├── electron/
│   ├── main/
│   │   ├── index.ts            # app/window bootstrap, run migrations+seed
│   │   ├── db/{schema.ts,migrate.ts,seed.ts,index.ts}
│   │   ├── handlers/{auth.ts,devices.ts,dashboard.ts,index.ts}
│   │   └── session.ts          # in-memory auth session
│   ├── preload/index.ts        # contextBridge typed api
│   └── shared/ipc.ts           # channel contract + DTO types (imported both sides)
├── src/
│   ├── main.tsx, App.tsx, router.tsx
│   ├── pages/{Login,Dashboard,Devices,DeviceDetail}.tsx + placeholders
│   ├── components/{AppShell,Sidebar,Topbar,StatusBadge,...}, components/ui/ (shadcn)
│   ├── lib/{api.ts (typed window.api wrapper), queryClient.ts, status.ts, utils.ts}
│   ├── hooks/{useDevices.ts,useDevice.ts,useDashboard.ts,useAuth.ts}
│   └── styles/tokens.css       # design-token CSS variables (light/dark/accent/density/chrome)
├── electron.vite.config.ts
├── drizzle.config.ts
├── tailwind.config.ts, postcss.config.js
├── vitest.config.ts
└── package.json
```

---

## 9. Testing strategy

TDD where it pays off (main-process logic first):
- **Unit (Vitest, main):** `devices.list` filter+search, `dashboard.summary` aggregation, request-status derivation helper, status label/badge mapping, bcrypt auth (login success/failure/inactive). Run against a temp/in-memory SQLite seeded by the test.
- **Component (Vitest + Testing Library):** `StatusBadge` mapping; Devices filter-chip behavior with a mocked `window.api`.
- **Manual smoke (documented):** `npm run dev` on macOS → login `admin`/`admin` → Dashboard renders stats + dept grid → Devices filter/search/paginate → open a device → Info/History tabs → theme + collapse + role toggles behave.

Native `better-sqlite3` requires `electron-rebuild` (or electron-vite's handling) against the dev Electron version — captured as a setup step.

---

## 10. Error handling & edge cases (M1-relevant)

- Failed login → inline Vietnamese error; never reveal which field was wrong.
- DB file locked / migration failure on startup → main logs and shows a fatal dialog (restart guidance).
- Empty/seed-less DB → seed runs; if seed fails, surface a clear error rather than a blank app.
- IPC handler throw → serializable error envelope → renderer toast/inline message; no unhandled rejections crashing the renderer.
- Unknown route / non-M1 nav target → friendly "Tính năng đang phát triển" placeholder, not a dead link.

---

## 11. Definition of done (M1)

- `npm run dev` on macOS launches the Electron app with HMR.
- Login with seeded `admin`/`admin` works; wrong credentials rejected.
- Dashboard shows real seeded stats + dept grid (chips switch device lists, pagination works).
- Devices list reads from DB; status filter + search + pager work; row "Xem" opens DeviceDetail.
- DeviceDetail shows Info + History from seeded data.
- Theme, sidebar collapse, and role toggle all function; admin-only controls hide for `staff`.
- All Vitest unit/component tests pass.
- Repo committed; README documents how to run.
