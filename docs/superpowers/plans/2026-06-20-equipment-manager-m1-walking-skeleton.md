# Equipment Manager — Milestone 1 (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Electron desktop app (dev on macOS) that proves the full architecture end-to-end: React renderer ⇄ typed contextBridge IPC ⇄ Drizzle/better-sqlite3, delivering Login, App Shell, Dashboard, and Devices (list + detail) screens reading from a seeded local SQLite database at the prototype's visual fidelity.

**Architecture:** electron-vite three-process layout (main / preload / renderer). The main process owns SQLite (better-sqlite3 + Drizzle), runs migrations + seed on startup, and hosts domain IPC handlers. The preload exposes a single typed `window.api` via `contextBridge`. The renderer (React + React Router) accesses all data through TanStack Query hooks wrapping `window.api`; tables use TanStack Table. No business logic in the renderer.

**Tech Stack:** Electron, electron-vite, TypeScript, React 18, React Router, better-sqlite3, drizzle-orm + drizzle-kit, @tanstack/react-query, @tanstack/react-table, bcryptjs, Tailwind CSS, Vitest + @testing-library/react.

## Global Constraints

- **Dev platform:** macOS. Run via `npm run dev`. No packaging in M1.
- **Target platform (later):** Windows. Do not hardcode platform-specific paths in app logic; DB path comes from `app.getPath('userData')` in dev.
- **UI language:** Vietnamese (all visible copy). Code identifiers in English.
- **DB stores English status enums** (`available|allocated|maintenance|broken|decommissioned`); the UI maps to Vietnamese labels via one `statusMap`. Never store Vietnamese labels in the DB.
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (needed for preload require). Renderer never imports Node/Electron directly — only `window.api`.
- **Design tokens:** use the exact values from `design_handoff_DevizeHub/README.md` "Design Tokens" tables (light/dark theme variables, accent, density, chrome radius). Default: light theme, accent "Xanh dương", density "Tiêu chuẩn", chrome "Tiêu chuẩn".
- **Request status is derived, never stored:** any allocation with `returned_at IS NULL` ⇒ "Đang trang bị", else "Hoàn tất".
- **Node:** v22 (already installed). Package manager: npm.
- **Source of visual truth:** `design_handoff_DevizeHub/DevizeHub.dc.html` (markup + inline token styles + sample data in the `Component` class).

---

## File Structure

```
equipment-manager/
├── package.json
├── tsconfig.json                # renderer (react) tsconfig
├── tsconfig.node.json           # main/preload tsconfig
├── electron.vite.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── vitest.config.ts
├── index.html
├── electron/
│   ├── main/
│   │   ├── index.ts             # window bootstrap + run migrations/seed + register handlers
│   │   ├── session.ts           # in-memory auth session
│   │   ├── db/
│   │   │   ├── schema.ts        # Drizzle table defs (full schema)
│   │   │   ├── index.ts         # db instance factory (path-injectable for tests)
│   │   │   ├── migrate.ts       # apply migrations
│   │   │   └── seed.ts          # seed from prototype sample data
│   │   └── handlers/
│   │       ├── auth.ts
│   │       ├── devices.ts
│   │       ├── dashboard.ts
│   │       └── index.ts         # registerHandlers(ipcMain, ctx)
│   ├── preload/
│   │   └── index.ts             # contextBridge typed api
│   └── shared/
│       └── ipc.ts               # channel names + request/response DTO types
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx
│   ├── styles/tokens.css
│   ├── lib/
│   │   ├── api.ts               # typed window.api accessor
│   │   ├── queryClient.ts
│   │   ├── status.ts            # statusMap + badge styles + request-status helpers
│   │   └── icons.tsx            # SVG icon components (ported from prototype ICON map)
│   ├── context/
│   │   ├── AuthContext.tsx      # user + role + login/logout
│   │   └── UiContext.tsx        # theme (dark) + sidebar collapsed, persisted
│   ├── components/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   ├── StatusBadge.tsx
│   │   └── Placeholder.tsx
│   └── pages/
│       ├── Login.tsx
│       ├── Dashboard.tsx
│       ├── Devices.tsx
│       └── DeviceDetail.tsx
└── electron-builder.yml         # NOT in M1 (created in M6)
```

---

## Task 1: Scaffold electron-vite project

**Files:**
- Create: `equipment-manager/package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `electron/main/index.ts`, `electron/preload/index.ts`

**Interfaces:**
- Produces: a runnable Electron window loading a React "Hello" view via `npm run dev`.

- [ ] **Step 1: Create `equipment-manager/package.json`**

```json
{
  "name": "equipment-manager",
  "version": "0.1.0",
  "description": "Offline equipment management desktop app (EquipHub)",
  "main": "./out/main/index.js",
  "author": "",
  "license": "UNLICENSED",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck:node": "tsc -p tsconfig.node.json --noEmit",
    "typecheck:web": "tsc -p tsconfig.json --noEmit",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-table": "^8.20.5",
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^11.3.0",
    "date-fns": "^4.1.0",
    "drizzle-orm": "^0.36.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/bcryptjs": "^2.4.6",
    "@types/better-sqlite3": "^7.6.11",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.28.0",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.9",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.node.json` (main/preload) and `tsconfig.json` (renderer)**

`equipment-manager/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "electron-vite/node"]
  },
  "include": ["electron/**/*", "electron.vite.config.ts", "drizzle.config.ts", "vitest.config.ts"]
}
```

`equipment-manager/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@shared/*": ["electron/shared/*"], "@/*": ["src/*"] }
  },
  "include": ["src/**/*", "electron/shared/**/*"]
}
```

- [ ] **Step 3: Create `electron.vite.config.ts`**

```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: { rollupOptions: { external: ['better-sqlite3'] } },
    resolve: { alias: { '@shared': resolve('electron/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('electron/shared') } }
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@': resolve('src'), '@shared': resolve('electron/shared') } }
  }
})
```

- [ ] **Step 4: Create `index.html`, `src/main.tsx`, `src/App.tsx`**

`equipment-manager/index.html`:
```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quản lý Thiết bị</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`equipment-manager/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`equipment-manager/src/App.tsx`:
```tsx
export default function App() {
  return <div style={{ padding: 24, fontFamily: 'system-ui' }}>EquipHub — đang khởi tạo…</div>
}
```

- [ ] **Step 5: Create `electron/main/index.ts` and `electron/preload/index.ts`**

`equipment-manager/electron/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`equipment-manager/electron/preload/index.ts`:
```ts
import { contextBridge } from 'electron'

// Replaced in Task 9 with the full typed api.
contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 6: Install dependencies and rebuild the native module for Electron**

Run:
```bash
cd equipment-manager && npm install && npx electron-rebuild -f -w better-sqlite3
```
Expected: install completes; `electron-rebuild` reports `better-sqlite3` rebuilt. If `electron-rebuild` binary is missing, add it: `npm i -D @electron/rebuild` then `npx electron-rebuild -f -w better-sqlite3`.

- [ ] **Step 7: Verify the app launches**

Run: `npm run dev`
Expected: an Electron window opens showing "EquipHub — đang khởi tạo…". Close it (Cmd+Q).

- [ ] **Step 8: Commit**

```bash
git add equipment-manager
git commit -m "feat: scaffold electron-vite + react + ts app shell"
```

---

## Task 2: Tailwind + design tokens

**Files:**
- Create: `equipment-manager/tailwind.config.ts`, `postcss.config.js`, `src/styles/tokens.css`
- Modify: `src/main.tsx` (import tokens.css), `src/App.tsx` (apply token wrapper)

**Interfaces:**
- Produces: CSS variables `--bg, --surface, --surface-2, --border, --text, --text-muted, --primary, --primary-hover, --hoverbg, --barmuted, --sidebar, --primary-soft, --primary-soft2, --primary-tint, --rh, --tfs, --rad-lg, --rad-md, --rad-sm` available under `.app-theme` (light) and `.app-theme.dark`.

- [ ] **Step 1: Create `tailwind.config.ts` and `postcss.config.js`**

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: []
} satisfies Config
```

`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

- [ ] **Step 2: Create `src/styles/tokens.css`** (values copied verbatim from the handoff token tables)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; height: 100%; }
body {
  font-family: "Segoe UI", -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: rgba(120,130,150,.35); border-radius: 6px; }
::-webkit-scrollbar-track { background: transparent; }

.app-theme {
  --bg:#f6f8fb; --surface:#ffffff; --surface-2:#f1f5f9; --border:#e6eaf0;
  --text:#0f172a; --text-muted:#64748b; --primary:#2563eb; --primary-hover:#1d4ed8;
  --hoverbg:rgba(15,23,42,.045); --barmuted:#cbd5e1; --sidebar:#ffffff;
  --primary-soft:color-mix(in srgb, var(--primary) 12%, transparent);
  --primary-soft2:color-mix(in srgb, var(--primary) 6%, transparent);
  --primary-tint:color-mix(in srgb, var(--primary) 15%, transparent);
  --rh:54px; --tfs:13.5px; --rad-lg:12px; --rad-md:9px; --rad-sm:7px;
  background: var(--bg); color: var(--text);
  min-height: 100vh; width: 100%;
}
.app-theme.dark {
  --bg:#0b1220; --surface:#111827; --surface-2:#1a2333; --border:#26303f;
  --text:#e8edf5; --text-muted:#8b98ad; --primary:#3b82f6; --primary-hover:#2563eb;
  --hoverbg:rgba(148,163,184,.1); --barmuted:#334155; --sidebar:#0e1626;
}
.mono { font-family: "Consolas", "SF Mono", monospace; }
```

- [ ] **Step 3: Wire it into the app**

In `src/main.tsx`, add as first import: `import './styles/tokens.css'`

Replace `src/App.tsx` with:
```tsx
export default function App() {
  return (
    <div className="app-theme">
      <div style={{ padding: 24 }}>EquipHub — tokens loaded</div>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npm run dev`
Expected: window shows "EquipHub — tokens loaded" on the light `--bg` (#f6f8fb) background.

- [ ] **Step 5: Commit**

```bash
git add equipment-manager
git commit -m "feat: tailwind + design-token css variables"
```

---

## Task 3: Drizzle schema + db factory + drizzle config

**Files:**
- Create: `equipment-manager/electron/main/db/schema.ts`, `electron/main/db/index.ts`, `drizzle.config.ts`

**Interfaces:**
- Produces:
  - `schema` tables: `categories, departments, employees, appUsers, devices, requests, allocations, maintenanceLogs` (camelCase exports).
  - Row types inferred: `export type Device = typeof devices.$inferSelect`, etc.
  - `createDb(filePath: string): { db: BetterSQLite3Database<typeof schema>, sqlite: Database.Database }`

- [ ] **Step 1: Create `electron/main/db/schema.ts`**

```ts
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  minStock: integer('min_stock').notNull().default(0),
  createdAt: text('created_at').notNull()
})

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull()
})

export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  employeeCode: text('employee_code').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  createdAt: text('created_at').notNull()
})

export const appUsers = sqliteTable('app_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'staff'] }).notNull(),
  displayName: text('display_name').notNull(),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull()
})

export const devices = sqliteTable('devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  serialNumber: text('serial_number'),
  status: text('status', {
    enum: ['available', 'allocated', 'maintenance', 'broken', 'decommissioned']
  }).notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const requests = sqliteTable('requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  departmentId: integer('department_id').references(() => departments.id),
  employeeId: integer('employee_id').references(() => employees.id),
  createdBy: integer('created_by').references(() => appUsers.id),
  createdAt: text('created_at').notNull(),
  notes: text('notes')
})

export const allocations = sqliteTable('allocations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: integer('request_id').references(() => requests.id),
  deviceId: integer('device_id').references(() => devices.id).notNull(),
  employeeId: integer('employee_id').references(() => employees.id),
  departmentId: integer('department_id').references(() => departments.id),
  issuedBy: integer('issued_by').references(() => appUsers.id),
  issuedAt: text('issued_at').notNull(),
  dueDate: text('due_date'),
  returnedAt: text('returned_at'),
  conditionOut: text('condition_out'),
  conditionIn: text('condition_in'),
  notes: text('notes')
})

export const maintenanceLogs = sqliteTable('maintenance_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').references(() => devices.id).notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  description: text('description'),
  performedBy: text('performed_by')
})

export const schema = {
  categories, departments, employees, appUsers,
  devices, requests, allocations, maintenanceLogs
}

export type Category = typeof categories.$inferSelect
export type Department = typeof departments.$inferSelect
export type Employee = typeof employees.$inferSelect
export type AppUser = typeof appUsers.$inferSelect
export type Device = typeof devices.$inferSelect
export type RequestRow = typeof requests.$inferSelect
export type Allocation = typeof allocations.$inferSelect
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect
export type DeviceStatus = Device['status']
```

- [ ] **Step 2: Create `electron/main/db/index.ts`**

```ts
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { schema } from './schema'

export type AppDb = BetterSQLite3Database<typeof schema>

export function createDb(filePath: string): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}
```

- [ ] **Step 3: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'sqlite',
  schema: './electron/main/db/schema.ts',
  out: './electron/main/db/migrations'
})
```

- [ ] **Step 4: Generate the initial migration**

Run: `npm run db:generate`
Expected: a migration SQL file appears under `electron/main/db/migrations/` and `meta/` snapshot files. Verify the SQL contains `CREATE TABLE \`devices\`` and the other 7 tables.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS (no type errors).

- [ ] **Step 6: Commit**

```bash
git add equipment-manager
git commit -m "feat: drizzle schema, db factory, and initial migration"
```

---

## Task 4: Migration runner

**Files:**
- Create: `equipment-manager/electron/main/db/migrate.ts`
- Test: `equipment-manager/electron/main/db/migrate.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 3).
- Produces: `export function runMigrations(db: AppDb): void` — applies all generated migrations idempotently.

- [ ] **Step 1: Write the failing test** `electron/main/db/migrate.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createDb } from './index'
import { runMigrations } from './migrate'

describe('runMigrations', () => {
  it('creates all tables in a fresh in-memory db', () => {
    const { db, sqlite } = createDb(':memory:')
    runMigrations(db)
    const rows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const names = rows.map((r) => r.name)
    for (const t of ['categories','departments','employees','app_users','devices','requests','allocations','maintenance_logs']) {
      expect(names).toContain(t)
    }
  })

  it('is idempotent (second run does not throw)', () => {
    const { db } = createDb(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/db/migrate.test.ts`
Expected: FAIL — cannot find `./migrate`.

- [ ] **Step 3: Create `electron/main/db/migrate.ts`**

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import type { AppDb } from './index'

// In dev/test the migrations live in source; in a packaged build they are
// copied next to the compiled main bundle (configured in M6).
const MIGRATIONS_DIR = join(__dirname, 'migrations')
const SOURCE_DIR = join(process.cwd(), 'electron/main/db/migrations')

export function runMigrations(db: AppDb, dir?: string): void {
  const folder = dir ?? (require('fs').existsSync(MIGRATIONS_DIR) ? MIGRATIONS_DIR : SOURCE_DIR)
  migrate(db, { migrationsFolder: folder })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/main/db/migrate.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add equipment-manager
git commit -m "feat: idempotent migration runner with test"
```

---

## Task 5: Seed data + seeder

**Files:**
- Create: `equipment-manager/electron/main/db/seed.ts`
- Test: `equipment-manager/electron/main/db/seed.test.ts`

**Interfaces:**
- Consumes: `createDb`, `runMigrations`, `schema`, bcryptjs.
- Produces: `export function seedIfEmpty(db: AppDb): void` — inserts reference + sample data only when `app_users` is empty. Seeds admin user `admin` / password `admin` (bcrypt). Returns nothing.

Data to seed (port exact values from `design_handoff_DevizeHub/DevizeHub.dc.html`):
- **categories** (7): from `catData.cat` rows — Máy tính xách tay, Máy tính để bàn, Màn hình, Máy in, Điện thoại, Máy chiếu, Thiết bị mạng (use `minStock: 5`).
- **departments** (7): from `catData.dept` — Phòng Kế toán, Phòng Nhân sự, Phòng Kỹ thuật, Phòng Kinh doanh, Phòng IT, Phòng Hành chính, Ban Giám đốc.
- **employees** (7): from `catData.emp` rows (NV001..NV007) mapped to their departments.
- **appUsers**: `admin` (role admin, display "Trần Quốc Bảo"), plus `hang.le`, `khoa.pham`, `lan.do` (role staff; `lan.do` active=0) from the prototype `users` array — all with bcrypt hash of the literal password `admin` for M1 simplicity.
- **devices** (12): from the prototype `devices` array; map Vietnamese status → English enum via: Trong kho→available, Đang trang bị→allocated, Đang bảo trì→maintenance, Hỏng→broken, Thanh lý→decommissioned. Resolve `categoryId` by category name; `serialNumber`, `notes` as given.
- **requests + allocations**: create the requests `DX-301, DX-300, DX-298, DX-295, DX-293, DX-290` (from prototype `requests`), and the allocations backing the dashboard dept grid (from `deptAlloc`) — for each item create an allocation with `issuedAt` from its `datetime`, `returnedAt` NULL when the parent request status is "Đang trang bị" else a non-null timestamp, linking device by name, employee by borrower name (create employees on the fly if a borrower name is not among the 7 seeded — insert minimal employee rows), department by card dept. This makes `dashboard.summary` and device history real.

> Note for implementer: keep seed deterministic. Where a borrower/lender name isn't in the seeded employees, insert an employee with code `NVxxx` incrementing. Use a fixed ISO date for `createdAt` fields (e.g. `'2026-06-01T00:00:00.000Z'`).

- [ ] **Step 1: Write the failing test** `electron/main/db/seed.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { createDb } from './index'
import { runMigrations } from './migrate'
import { seedIfEmpty } from './seed'
import { appUsers, devices, departments } from './schema'
import { eq } from 'drizzle-orm'

function freshSeededDb() {
  const { db } = createDb(':memory:')
  runMigrations(db)
  seedIfEmpty(db)
  return db
}

describe('seedIfEmpty', () => {
  it('seeds the admin user with a working bcrypt password', () => {
    const db = freshSeededDb()
    const admin = db.select().from(appUsers).where(eq(appUsers.username, 'admin')).all()[0]
    expect(admin).toBeTruthy()
    expect(admin.role).toBe('admin')
    expect(bcrypt.compareSync('admin', admin.passwordHash)).toBe(true)
  })

  it('seeds 12 devices with English status enums', () => {
    const db = freshSeededDb()
    const all = db.select().from(devices).all()
    expect(all.length).toBe(12)
    const statuses = new Set(all.map((d) => d.status))
    for (const s of statuses) {
      expect(['available','allocated','maintenance','broken','decommissioned']).toContain(s)
    }
  })

  it('seeds 7 departments', () => {
    const db = freshSeededDb()
    expect(db.select().from(departments).all().length).toBe(7)
  })

  it('does not double-seed when called twice', () => {
    const { db } = createDb(':memory:')
    runMigrations(db)
    seedIfEmpty(db)
    seedIfEmpty(db)
    expect(db.select().from(devices).all().length).toBe(12)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/db/seed.test.ts`
Expected: FAIL — cannot find `./seed`.

- [ ] **Step 3: Implement `electron/main/db/seed.ts`**

Implement `seedIfEmpty(db)` per the data spec above. Structure:
```ts
import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import type { AppDb } from './index'
import {
  categories, departments, employees, appUsers, devices, requests, allocations
} from './schema'

const NOW = '2026-06-01T00:00:00.000Z'
const STATUS_MAP: Record<string, 'available'|'allocated'|'maintenance'|'broken'|'decommissioned'> = {
  'Trong kho': 'available',
  'Đang trang bị': 'allocated',
  'Đang bảo trì': 'maintenance',
  'Hỏng': 'broken',
  'Thanh lý': 'decommissioned'
}

export function seedIfEmpty(db: AppDb): void {
  const existing = db.select().from(appUsers).all()
  if (existing.length > 0) return

  db.transaction((tx) => {
    // 1. categories (name -> id)
    // 2. departments (name -> id)
    // 3. employees (name -> id), seeding NV001..NV007
    // 4. appUsers: admin + 3 staff, passwordHash = bcrypt.hashSync('admin', 10)
    // 5. devices: map status via STATUS_MAP, resolve categoryId/departmentId by name
    // 6. requests + allocations from prototype deptAlloc (see plan Task 5 data spec)
  })
}
```
Fill each numbered block with concrete inserts using the exact prototype values (Task 5 data spec). Use lookup maps (`Map<string, number>`) built from insert results (`.returning({ id: ... })` or re-select by unique name) to resolve foreign keys. Convert prototype `datetime` strings like `'12/03/2026 09:00'` to ISO via a small `parseVnDateTime(s)` helper (DD/MM/YYYY HH:mm → ISO).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/main/db/seed.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add equipment-manager
git commit -m "feat: deterministic db seed from prototype sample data with tests"
```

---

## Task 6: Shared IPC contract types

**Files:**
- Create: `equipment-manager/electron/shared/ipc.ts`

**Interfaces:**
- Produces (imported by handlers, preload, and renderer):
  - `CHANNELS` const map of channel name strings.
  - Request/response DTO types: `LoginArgs`, `SessionUser`, `DeviceListArgs`, `DeviceListResult`, `DeviceRow`, `DeviceDetailResult`, `DashboardSummary`, `DeptCard`, `DeptCardItem`, `DeptCardRequest`, `StatusCount`.
  - `Api` interface describing `window.api`.

- [ ] **Step 1: Create `electron/shared/ipc.ts`**

```ts
export const CHANNELS = {
  authLogin: 'auth.login',
  authMe: 'auth.me',
  authLogout: 'auth.logout',
  devicesList: 'devices.list',
  devicesGet: 'devices.get',
  dashboardSummary: 'dashboard.summary'
} as const

export type Role = 'admin' | 'staff'
export type DeviceStatus = 'available' | 'allocated' | 'maintenance' | 'broken' | 'decommissioned'

export interface SessionUser {
  id: number
  username: string
  role: Role
  displayName: string
}

export interface LoginArgs { username: string; password: string }
export interface LoginResult { user: SessionUser }

export interface DeviceRow {
  sku: string
  name: string
  category: string
  status: DeviceStatus
  department: string | null
  holder: string | null
  serialNumber: string | null
}
export interface StatusCount { key: 'all' | DeviceStatus; count: number }
export interface DeviceListArgs { filter: 'all' | DeviceStatus; query: string }
export interface DeviceListResult { devices: DeviceRow[]; counts: StatusCount[]; total: number }

export interface DeviceHistoryEntry {
  type: 'allocate' | 'return' | 'maintenance' | 'create'
  title: string
  sub: string
  date: string // display string DD/MM/YYYY
}
export interface DeviceInfoField { key: string; value: string }
export interface DeviceDetailResult {
  device: DeviceRow & { notes: string | null }
  info: DeviceInfoField[]
  history: DeviceHistoryEntry[]
}
export interface DeviceGetArgs { sku: string }

export interface DeptCardItem { name: string; datetime: string; borrower: string; lender: string; returnable: boolean }
export interface DeptCardRequest { code: string; requester: string; date: string; status: 'allocated' | 'completed'; items: DeptCardItem[] }
export interface DeptCard { dept: string; count: number; share: number; requests: DeptCardRequest[] }
export interface DashboardSummary {
  stats: { total: number; allocated: number; maintenance: number; broken: number }
  deptCards: DeptCard[]
  deptAllocTotal: number
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export interface Api {
  auth: {
    login(args: LoginArgs): Promise<ApiResponse<LoginResult>>
    me(): Promise<ApiResponse<SessionUser | null>>
    logout(): Promise<ApiResponse<{ ok: true }>>
  }
  devices: {
    list(args: DeviceListArgs): Promise<ApiResponse<DeviceListResult>>
    get(args: DeviceGetArgs): Promise<ApiResponse<DeviceDetailResult>>
  }
  dashboard: {
    summary(): Promise<ApiResponse<DashboardSummary>>
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add equipment-manager
git commit -m "feat: shared typed IPC contract"
```

---

## Task 7: Auth handler + session

**Files:**
- Create: `equipment-manager/electron/main/session.ts`, `electron/main/handlers/auth.ts`
- Test: `equipment-manager/electron/main/handlers/auth.test.ts`

**Interfaces:**
- Consumes: `AppDb`, `appUsers`, bcryptjs, `SessionUser`, `LoginArgs`.
- Produces:
  - `session.ts`: `export const session = { current: null as SessionUser | null }`.
  - `auth.ts`: `export function makeAuthHandlers(db: AppDb)` returning `{ login(args), me(), logout() }` each resolving an `ApiResponse`.

- [ ] **Step 1: Write the failing test** `electron/main/handlers/auth.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeAuthHandlers } from './auth'
import { session } from '../session'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db)
  seedIfEmpty(db)
  return makeAuthHandlers(db)
}

describe('auth handlers', () => {
  beforeEach(() => { session.current = null })

  it('logs in admin/admin and sets session', async () => {
    const h = setup()
    const res = await h.login({ username: 'admin', password: 'admin' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.user.role).toBe('admin')
    expect(session.current?.username).toBe('admin')
  })

  it('rejects wrong password without leaking which field', async () => {
    const h = setup()
    const res = await h.login({ username: 'admin', password: 'nope' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.message).toBe('Tên đăng nhập hoặc mật khẩu không đúng.')
    expect(session.current).toBeNull()
  })

  it('rejects an inactive user', async () => {
    const h = setup()
    const res = await h.login({ username: 'lan.do', password: 'admin' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('me() returns the current session and logout clears it', async () => {
    const h = setup()
    await h.login({ username: 'admin', password: 'admin' })
    const me = await h.me()
    expect(me.ok && me.data?.username).toBe('admin')
    await h.logout()
    expect(session.current).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/handlers/auth.test.ts`
Expected: FAIL — cannot find `./auth` / `../session`.

- [ ] **Step 3: Implement `session.ts` and `auth.ts`**

`electron/main/session.ts`:
```ts
import type { SessionUser } from '@shared/ipc'
export const session: { current: SessionUser | null } = { current: null }
```

`electron/main/handlers/auth.ts`:
```ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { AppDb } from '../db'
import { appUsers } from '../db/schema'
import { session } from '../session'
import type { LoginArgs, ApiResponse, LoginResult, SessionUser } from '@shared/ipc'

const BAD_CREDS = { code: 'BAD_CREDENTIALS', message: 'Tên đăng nhập hoặc mật khẩu không đúng.' }

export function makeAuthHandlers(db: AppDb) {
  return {
    async login(args: LoginArgs): Promise<ApiResponse<LoginResult>> {
      const row = db.select().from(appUsers).where(eq(appUsers.username, args.username)).all()[0]
      if (!row || !bcrypt.compareSync(args.password, row.passwordHash)) {
        return { ok: false, error: BAD_CREDS }
      }
      if (row.active === 0) {
        return { ok: false, error: { code: 'ACCOUNT_DISABLED', message: 'Tài khoản đã bị khóa.' } }
      }
      const user: SessionUser = { id: row.id, username: row.username, role: row.role, displayName: row.displayName }
      session.current = user
      return { ok: true, data: { user } }
    },
    async me(): Promise<ApiResponse<SessionUser | null>> {
      return { ok: true, data: session.current }
    },
    async logout(): Promise<ApiResponse<{ ok: true }>> {
      session.current = null
      return { ok: true, data: { ok: true } }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/main/handlers/auth.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add equipment-manager
git commit -m "feat: auth handlers (bcrypt) + in-memory session with tests"
```

---

## Task 8: Devices + Dashboard handlers

**Files:**
- Create: `equipment-manager/electron/main/handlers/devices.ts`, `electron/main/handlers/dashboard.ts`
- Test: `electron/main/handlers/devices.test.ts`, `electron/main/handlers/dashboard.test.ts`

**Interfaces:**
- Consumes: `AppDb`, schema, DTO types from `@shared/ipc`.
- Produces:
  - `devices.ts`: `export function makeDeviceHandlers(db: AppDb)` → `{ list(args: DeviceListArgs), get(args: DeviceGetArgs) }`.
  - `dashboard.ts`: `export function makeDashboardHandlers(db: AppDb)` → `{ summary() }`.
- `list` maps DB enum → no translation here (returns English enum in `DeviceRow.status`); UI translates. `holder` is the employee name of the active (un-returned) allocation, else null; `department` similarly.

- [ ] **Step 1: Write the failing tests**

`electron/main/handlers/devices.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeDeviceHandlers } from './devices'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return makeDeviceHandlers(db)
}

describe('devices.list', () => {
  it('returns all 12 devices with total and counts when filter=all', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: '' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.total).toBe(12)
      expect(res.data.devices.length).toBe(12)
      const all = res.data.counts.find((c) => c.key === 'all')
      expect(all?.count).toBe(12)
    }
  })

  it('filters by status', async () => {
    const h = setup()
    const res = await h.list({ filter: 'available', query: '' })
    if (res.ok) expect(res.data.devices.every((d) => d.status === 'available')).toBe(true)
  })

  it('searches by sku/name (case-insensitive)', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: 'lap-0012' })
    if (res.ok) {
      expect(res.data.devices.length).toBe(1)
      expect(res.data.devices[0].sku).toBe('LAP-0012')
    }
  })
})

describe('devices.get', () => {
  it('returns device detail with info fields and history for LAP-0012', async () => {
    const h = setup()
    const res = await h.get({ sku: 'LAP-0012' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.device.sku).toBe('LAP-0012')
      expect(res.data.info.length).toBeGreaterThanOrEqual(6)
      expect(Array.isArray(res.data.history)).toBe(true)
    }
  })

  it('returns an error for an unknown sku', async () => {
    const h = setup()
    const res = await h.get({ sku: 'NOPE-9999' })
    expect(res.ok).toBe(false)
  })
})
```

`electron/main/handlers/dashboard.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeDashboardHandlers } from './dashboard'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return makeDashboardHandlers(db)
}

describe('dashboard.summary', () => {
  it('returns stat counts consistent with the seeded devices', async () => {
    const h = setup()
    const res = await h.summary()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.stats.total).toBe(12)
      expect(res.data.stats.allocated).toBeGreaterThan(0)
      expect(res.data.deptCards.length).toBeGreaterThan(0)
      expect(res.data.deptCards[0].requests.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/main/handlers/devices.test.ts electron/main/handlers/dashboard.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the handlers**

`electron/main/handlers/devices.ts`: implement `list` and `get`.
- `list`: select devices joined to categories (name), and LEFT JOIN the active allocation (`returnedAt IS NULL`) → employees (holder) + departments (department). Apply `filter` (status) and `query` (case-insensitive match across `sku, name, holder, department, serialNumber`) in SQL or in JS after fetch (JS is acceptable for 12 rows). Build `counts` for keys `['all','available','allocated','maintenance','broken','decommissioned']`. Return `{ devices, counts, total }`.
- `get`: fetch the device by sku (error envelope `{code:'NOT_FOUND', message:'Không tìm thấy thiết bị.'}` if missing). Build `info` fields (SKU, Tên, Loại, Serial, Trạng thái(English enum value passed through — UI maps), Phòng, Người dùng, Ghi chú). Build `history` from this device's allocations (allocate + return entries) and maintenance_logs (maintenance entries), plus a `create` entry from `createdAt`, sorted by date desc. Format dates DD/MM/YYYY.

`electron/main/handlers/dashboard.ts`: implement `summary`.
- `stats`: counts of devices by status (total, allocated, maintenance, broken).
- `deptCards`: group active+historical allocations by department (top 4 by active count), each with its requests and items; compute `share` = round(count / deptAllocTotal * 100). `returnable = request.status === 'allocated'`. Mirror the prototype `deptAlloc` shape but sourced from DB rows.

Keep each function small and pure over `db`. Use `drizzle-orm` query builder; for the 12-row dataset, fetching rows and shaping in JS is fine.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/devices.test.ts electron/main/handlers/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add equipment-manager
git commit -m "feat: devices + dashboard IPC handlers with tests"
```

---

## Task 9: Register handlers in main + typed preload bridge

**Files:**
- Create: `equipment-manager/electron/main/handlers/index.ts`
- Modify: `electron/main/index.ts` (init db, migrate, seed, register handlers), `electron/preload/index.ts` (typed api)
- Test: `electron/main/handlers/index.test.ts`

**Interfaces:**
- Consumes: all `make*Handlers`, `CHANNELS`.
- Produces: `export function registerHandlers(ipcMain, db)` wiring each channel to its handler; preload `window.api` matching the `Api` interface.

- [ ] **Step 1: Write the failing test** `electron/main/handlers/index.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { registerHandlers } from './index'
import { CHANNELS } from '@shared/ipc'

describe('registerHandlers', () => {
  it('registers a handler for every channel', () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const handlers = new Map<string, Function>()
    const ipcMain = { handle: (ch: string, fn: Function) => handlers.set(ch, fn) }
    registerHandlers(ipcMain as any, db)
    for (const ch of Object.values(CHANNELS)) {
      expect(handlers.has(ch)).toBe(true)
    }
  })

  it('dispatches devices.list through the registered handler', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const handlers = new Map<string, Function>()
    const ipcMain = { handle: (ch: string, fn: Function) => handlers.set(ch, fn) }
    registerHandlers(ipcMain as any, db)
    const res = await handlers.get(CHANNELS.devicesList)!({}, { filter: 'all', query: '' })
    expect(res.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/handlers/index.test.ts`
Expected: FAIL — `./index` registerHandlers missing.

- [ ] **Step 3: Implement `electron/main/handlers/index.ts`**

```ts
import type { IpcMain } from 'electron'
import type { AppDb } from '../db'
import { CHANNELS } from '@shared/ipc'
import { makeAuthHandlers } from './auth'
import { makeDeviceHandlers } from './devices'
import { makeDashboardHandlers } from './dashboard'

export function registerHandlers(ipcMain: IpcMain, db: AppDb): void {
  const auth = makeAuthHandlers(db)
  const devices = makeDeviceHandlers(db)
  const dashboard = makeDashboardHandlers(db)

  ipcMain.handle(CHANNELS.authLogin, (_e, args) => auth.login(args))
  ipcMain.handle(CHANNELS.authMe, () => auth.me())
  ipcMain.handle(CHANNELS.authLogout, () => auth.logout())
  ipcMain.handle(CHANNELS.devicesList, (_e, args) => devices.list(args))
  ipcMain.handle(CHANNELS.devicesGet, (_e, args) => devices.get(args))
  ipcMain.handle(CHANNELS.dashboardSummary, () => dashboard.summary())
}
```

- [ ] **Step 4: Wire `electron/main/index.ts`** — add DB init before `createWindow`:

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { createDb } from './db'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerHandlers } from './handlers'

app.whenReady().then(() => {
  const dbPath = join(app.getPath('userData'), 'equiphub.db')
  const { db } = createDb(dbPath)
  runMigrations(db)
  seedIfEmpty(db)
  registerHandlers(ipcMain, db)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
```
(Keep the existing `createWindow` and `window-all-closed` code.)

- [ ] **Step 5: Implement typed `electron/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type Api } from '@shared/ipc'

const api: Api = {
  auth: {
    login: (args) => ipcRenderer.invoke(CHANNELS.authLogin, args),
    me: () => ipcRenderer.invoke(CHANNELS.authMe),
    logout: () => ipcRenderer.invoke(CHANNELS.authLogout)
  },
  devices: {
    list: (args) => ipcRenderer.invoke(CHANNELS.devicesList, args),
    get: (args) => ipcRenderer.invoke(CHANNELS.devicesGet, args)
  },
  dashboard: {
    summary: () => ipcRenderer.invoke(CHANNELS.dashboardSummary)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 6: Run test + typecheck + launch**

Run: `npx vitest run electron/main/handlers/index.test.ts` → PASS
Run: `npm run typecheck:node` → PASS
Run: `npm run dev` → window opens, no console errors about IPC (renderer still shows the tokens placeholder).

- [ ] **Step 7: Commit**

```bash
git add equipment-manager
git commit -m "feat: register IPC handlers + typed preload bridge + db bootstrap"
```

---

## Task 10: Renderer data layer (api accessor, query client, status map)

**Files:**
- Create: `equipment-manager/src/lib/api.ts`, `src/lib/queryClient.ts`, `src/lib/status.ts`, `src/vite-env.d.ts`
- Test: `src/lib/status.test.ts`

**Interfaces:**
- Produces:
  - `api` — `window.api` typed via `Api`, with a `unwrap<T>(p): Promise<T>` helper that throws on `{ok:false}` (so TanStack Query surfaces the error).
  - `queryClient` — configured `QueryClient`.
  - `status.ts`: `STATUS_LABELS: Record<DeviceStatus,string>`, `badgeStyle(status): {bg,fg}`, `requestStatusLabel(s)`.

- [ ] **Step 1: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
import type { Api } from '@shared/ipc'
declare global { interface Window { api: Api } }
```

- [ ] **Step 2: Write the failing test** `src/lib/status.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { STATUS_LABELS, badgeStyle } from './status'

describe('status map', () => {
  it('maps English enums to Vietnamese labels', () => {
    expect(STATUS_LABELS.available).toBe('Trong kho')
    expect(STATUS_LABELS.allocated).toBe('Đang trang bị')
    expect(STATUS_LABELS.maintenance).toBe('Đang bảo trì')
    expect(STATUS_LABELS.broken).toBe('Hỏng')
    expect(STATUS_LABELS.decommissioned).toBe('Thanh lý')
  })
  it('gives green for available and primary blue for allocated', () => {
    expect(badgeStyle('available').fg).toBe('#16a34a')
    expect(badgeStyle('allocated').fg).toBe('#2563eb')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/status.test.ts`
Expected: FAIL — `./status` not found.

- [ ] **Step 4: Implement `src/lib/status.ts`, `src/lib/api.ts`, `src/lib/queryClient.ts`**

`src/lib/status.ts`:
```ts
import type { DeviceStatus } from '@shared/ipc'

export const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Trong kho',
  allocated: 'Đang trang bị',
  maintenance: 'Đang bảo trì',
  broken: 'Hỏng',
  decommissioned: 'Thanh lý'
}

const COLORS: Record<DeviceStatus, { bg: string; fg: string }> = {
  available: { bg: 'rgba(22,163,74,.14)', fg: '#16a34a' },
  allocated: { bg: 'rgba(37,99,235,.14)', fg: '#2563eb' },
  maintenance: { bg: 'rgba(202,138,4,.18)', fg: '#ca8a04' },
  broken: { bg: 'rgba(220,38,38,.14)', fg: '#dc2626' },
  decommissioned: { bg: 'rgba(100,116,139,.18)', fg: '#64748b' }
}
export function badgeStyle(status: DeviceStatus) { return COLORS[status] }
export function requestStatusLabel(s: 'allocated' | 'completed'): string {
  return s === 'allocated' ? 'Đang trang bị' : 'Hoàn tất'
}
```

`src/lib/api.ts`:
```ts
import type { ApiResponse } from '@shared/ipc'
export const api = window.api

export async function unwrap<T>(p: Promise<ApiResponse<T>>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}
```

`src/lib/queryClient.ts`:
```ts
import { QueryClient } from '@tanstack/react-query'
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5000 } }
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/status.test.ts`
Expected: PASS.

> Note: `src/lib/status.test.ts` runs in jsdom but imports only types/constants — ensure `vitest.config.ts` (Task 16 creates it; if not yet present, create a minimal one here) sets `environment: 'node'` is fine for this file. If the config isn't created yet, defer running this until Task 16 and just commit.

- [ ] **Step 6: Commit**

```bash
git add equipment-manager
git commit -m "feat: renderer data layer — api accessor, query client, status map"
```

---

## Task 11: Auth + UI context providers

**Files:**
- Create: `equipment-manager/src/context/AuthContext.tsx`, `src/context/UiContext.tsx`

**Interfaces:**
- Produces:
  - `AuthProvider`, `useAuth(): { user, isAdmin, role, login(args), logout(), toggleRole() }`. `toggleRole()` flips a demo role override (admin↔staff) without re-auth, per prototype.
  - `UiProvider`, `useUi(): { dark, collapsed, toggleTheme(), toggleSidebar() }`, persisted to `localStorage` keys `equiphub.dark` / `equiphub.collapsed`.

- [ ] **Step 1: Implement `src/context/UiContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface UiCtx { dark: boolean; collapsed: boolean; toggleTheme(): void; toggleSidebar(): void }
const Ctx = createContext<UiCtx | null>(null)

function read(key: string, def: boolean) {
  const v = localStorage.getItem(key); return v == null ? def : v === '1'
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => read('equiphub.dark', false))
  const [collapsed, setCollapsed] = useState(() => read('equiphub.collapsed', false))
  useEffect(() => { localStorage.setItem('equiphub.dark', dark ? '1' : '0') }, [dark])
  useEffect(() => { localStorage.setItem('equiphub.collapsed', collapsed ? '1' : '0') }, [collapsed])
  return (
    <Ctx.Provider value={{ dark, collapsed, toggleTheme: () => setDark((v) => !v), toggleSidebar: () => setCollapsed((v) => !v) }}>
      {children}
    </Ctx.Provider>
  )
}
export function useUi() { const c = useContext(Ctx); if (!c) throw new Error('useUi outside provider'); return c }
```

- [ ] **Step 2: Implement `src/context/AuthContext.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'
import { api, unwrap } from '@/lib/api'
import type { SessionUser, Role, LoginArgs } from '@shared/ipc'

interface AuthCtx {
  user: SessionUser | null
  role: Role
  isAdmin: boolean
  login(args: LoginArgs): Promise<void>
  logout(): Promise<void>
  toggleRole(): void
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [roleOverride, setRoleOverride] = useState<Role | null>(null)
  const role: Role = roleOverride ?? user?.role ?? 'staff'

  async function login(args: LoginArgs) {
    const res = await unwrap(api.auth.login(args))
    setUser(res.user); setRoleOverride(null)
  }
  async function logout() { await api.auth.logout(); setUser(null); setRoleOverride(null) }
  function toggleRole() { setRoleOverride((r) => (role === 'admin' ? 'staff' : 'admin')) }

  return (
    <Ctx.Provider value={{ user, role, isAdmin: role === 'admin', login, logout, toggleRole }}>
      {children}
    </Ctx.Provider>
  )
}
export function useAuth() { const c = useContext(Ctx); if (!c) throw new Error('useAuth outside provider'); return c }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add equipment-manager
git commit -m "feat: auth + ui context providers"
```

---

## Task 12: Icons + StatusBadge + Placeholder

**Files:**
- Create: `equipment-manager/src/lib/icons.tsx`, `src/components/StatusBadge.tsx`, `src/components/Placeholder.tsx`
- Test: `src/components/StatusBadge.test.tsx`

**Interfaces:**
- Consumes: `STATUS_LABELS`, `badgeStyle`.
- Produces:
  - `icons.tsx`: named icon components ported from the prototype `ICON`/inline SVGs (`IconDashboard, IconDevices, IconRequests, IconAllocate, IconReports, IconCatalog, IconSettings, IconBox, IconSearch, IconScan, IconView, IconEdit, IconSwap, IconPlus, IconBack, IconReturn, IconBell, IconLogout, IconSun, IconMoon, IconChevronsLeft, IconChevronsRight, IconBuilding, IconWrench, IconCheck, IconClock, IconAlert, IconDown`). Each: `(props: {size?: number}) => JSX.Element` rendering the exact SVG from `DevizeHub.dc.html` (stroke="currentColor").
  - `StatusBadge.tsx`: `<StatusBadge status={DeviceStatus} />` → pill with label + colors.
  - `Placeholder.tsx`: `<Placeholder title />` → centered "Tính năng đang phát triển".

- [ ] **Step 1: Port `src/lib/icons.tsx`** from the prototype SVGs

Copy each SVG string from `DevizeHub.dc.html` (the `ICON = {…}` map at ~line 635 and the inline `icon*` SVGs in `renderVals()` at ~lines 944-1004) into a React component. Pattern:
```tsx
type IconProps = { size?: number }
const svg = (size: number, children: React.ReactNode, sw = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
export const IconSearch = ({ size = 16 }: IconProps) =>
  svg(size, <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>)
// …one export per icon listed above, paths copied verbatim from the prototype.
```

- [ ] **Step 2: Write the failing test** `src/components/StatusBadge.test.tsx`

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the Vietnamese label for a status', () => {
    render(<StatusBadge status="available" />)
    expect(screen.getByText('Trong kho')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/StatusBadge.test.tsx`
Expected: FAIL — `./StatusBadge` not found (or vitest config missing — if so, create Task 16's `vitest.config.ts` now, then re-run).

- [ ] **Step 4: Implement `StatusBadge.tsx` and `Placeholder.tsx`**

```tsx
// src/components/StatusBadge.tsx
import type { DeviceStatus } from '@shared/ipc'
import { STATUS_LABELS, badgeStyle } from '@/lib/status'
export function StatusBadge({ status }: { status: DeviceStatus }) {
  const c = badgeStyle(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
      borderRadius: 999, fontSize: 12, fontWeight: 600, background: c.bg, color: c.fg
    }}>{STATUS_LABELS[status]}</span>
  )
}
```
```tsx
// src/components/Placeholder.tsx
export function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <div style={{ marginTop: 8 }}>Tính năng đang phát triển.</div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/StatusBadge.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add equipment-manager
git commit -m "feat: icons, StatusBadge, Placeholder components"
```

---

## Task 13: App Shell (Sidebar + Topbar) + router + login gate

**Files:**
- Create: `equipment-manager/src/components/Sidebar.tsx`, `src/components/Topbar.tsx`, `src/components/AppShell.tsx`, `src/router.tsx`, `src/pages/Login.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: `useAuth`, `useUi`, icons, `Placeholder`.
- Produces: full app frame. `App.tsx` wires providers (`QueryClientProvider`, `AuthProvider`, `UiProvider`) and renders `Login` when `!user`, else `AppShell` with routed `<Outlet/>`. Routes: `/` Dashboard, `/devices` Devices, `/devices/:sku` DeviceDetail, others → `Placeholder`.

- [ ] **Step 1: Implement `Login.tsx`** — port the prototype login card (lines 28-50 of `DevizeHub.dc.html`). Controlled `username` (default `'admin'`) + `password` inputs; on submit call `useAuth().login`; show error text on failure. Defaults: token-based inline styles.

```tsx
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
  const [error, setError] = useState('')
  async function submit() {
    setError('')
    try { await login({ username, password }) } catch (e) { setError((e as Error).message) }
  }
  // Render the 380px card per prototype lines 28-50; bind inputs; show {error};
  // button onClick={submit}. Use CSS vars for colors/radii.
  return (/* ...token-styled card... */ null as any)
}
```
Implementer: complete the JSX faithfully from the prototype markup (logo, title "Quản lý Thiết bị", subtitle, two inputs, remember checkbox, "Đăng nhập" button, version footer). Render `error` in `#dc2626` above the button when non-empty.

- [ ] **Step 2: Implement `Sidebar.tsx`** — port lines 56-80. Nav defs:
```ts
const NAV = [
  { to: '/', label: 'Tổng quan', icon: IconDashboard },
  { to: '/devices', label: 'Thiết bị', icon: IconDevices },
  { to: '/requests', label: 'Phiếu đề nghị', icon: IconRequests },
  { to: '/allocate', label: 'Cấp phát lẻ', icon: IconAllocate },
  { to: '/reports', label: 'Báo cáo', icon: IconReports },
  { to: '/catalog', label: 'Danh mục', icon: IconCatalog },
  { to: '/settings', label: 'Cài đặt', icon: IconSettings }
]
```
Use `NavLink` from react-router; active style = `--primary-tint` bg + primary text (match `navStyle`, treating `/devices/:sku` as active for Thiết bị). Width 232/68 from `useUi().collapsed`; hide labels when collapsed. Footer "Thu gọn" toggles `toggleSidebar`.

- [ ] **Step 3: Implement `Topbar.tsx`** — port lines 82-110. Props: `{ title, subtitle }`. Right side: role toggle (`useAuth().toggleRole`, dot color `#16a34a` admin / `#ca8a04` staff, label "Quản trị viên"/"Nhân viên"), theme toggle (`useUi().toggleTheme`, sun/moon), bell with red dot, divider, avatar (gradient, initials from `user.displayName`), name + role, logout (`useAuth().logout`).

- [ ] **Step 4: Implement `AppShell.tsx`** — flex layout: `<Sidebar/>` + main column (`<Topbar .../>` + `<main style={{flex:1,overflowY:'auto',padding:24}}><Outlet/></main>`). Derive title/subtitle from route via a `TITLES` map mirroring the prototype `titles` object.

- [ ] **Step 5: Implement `src/router.tsx`**

```tsx
import { createHashRouter } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import Dashboard from '@/pages/Dashboard'
import Devices from '@/pages/Devices'
import DeviceDetail from '@/pages/DeviceDetail'
import { Placeholder } from '@/components/Placeholder'

export const router = createHashRouter([
  {
    path: '/', element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'devices', element: <Devices /> },
      { path: 'devices/:sku', element: <DeviceDetail /> },
      { path: 'requests', element: <Placeholder title="Phiếu đề nghị" /> },
      { path: 'allocate', element: <Placeholder title="Cấp phát lẻ" /> },
      { path: 'reports', element: <Placeholder title="Báo cáo" /> },
      { path: 'catalog', element: <Placeholder title="Danh mục" /> },
      { path: 'settings', element: <Placeholder title="Cài đặt" /> }
    ]
  }
])
```
(Use `createHashRouter` — Electron loads via `file://`, so hash routing avoids path issues.)

- [ ] **Step 6: Wire `App.tsx`** (providers + login gate)

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { UiProvider, useUi } from '@/context/UiContext'
import { router } from '@/router'
import Login from '@/pages/Login'

function Shell() {
  const { user } = useAuth()
  const { dark } = useUi()
  return (
    <div className={`app-theme${dark ? ' dark' : ''}`}>
      {user ? <RouterProvider router={router} /> : <Login />}
    </div>
  )
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UiProvider><AuthProvider><Shell /></AuthProvider></UiProvider>
    </QueryClientProvider>
  )
}
```

Create minimal stub pages so the app compiles now (replaced in Tasks 14-15):
```tsx
// src/pages/Dashboard.tsx, Devices.tsx, DeviceDetail.tsx (temporary)
export default function Page() { return <div>…</div> }
```

- [ ] **Step 7: Verify login flow**

Run: `npm run dev`
Expected: Login card shows. Enter `admin`/`admin` → app shell with sidebar + topbar appears, landing on the (stub) Dashboard. Wrong password shows the Vietnamese error. Theme toggle flips dark mode; collapse toggles sidebar width; role toggle flips the label. Reload preserves theme/collapsed (localStorage).

- [ ] **Step 8: Commit**

```bash
git add equipment-manager
git commit -m "feat: app shell (sidebar/topbar), hash router, login gate"
```

---

## Task 14: Dashboard page

**Files:**
- Create: `equipment-manager/src/hooks/useDashboard.ts`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `api.dashboard.summary`, `DashboardSummary`, icons.
- Produces: `useDashboard()` (TanStack Query) and the full Dashboard UI (stat cards + dept grid with per-card chip + pagination).

- [ ] **Step 1: Implement `src/hooks/useDashboard.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => unwrap(api.dashboard.summary()) })
}
```

- [ ] **Step 2: Implement `Dashboard.tsx`** — port lines 114-200 of the prototype.
- 4 stat cards from `data.stats` with the prototype's labels/icons/colors: Tổng thiết bị (IconBox, primary), Đang cấp phát (IconCheck, green `#16a34a`), Đang bảo trì (IconWrench, yellow `#ca8a04`), Hỏng/Thanh lý (IconAlert, red `#dc2626`). Show the raw seeded counts (no `+144` fudge from the prototype — those were demo offsets; use real `data.stats`).
- Dept grid (2 cols) from `data.deptCards`. Local component state per card: `activeCode` (default first request) and `page` (default 1, 6 items/page). Chips = `card.requests` (active chip primary bg, white mono text; horizontal scroll `overflowX:'auto', flexWrap:'nowrap'`). Switching chip resets page to 1. Meta line `${req.requester} · ${req.date} · ${req.items.length} thiết bị` + status badge shown only when `req.status==='allocated'`. Item rows: name + datetime (mono) + "Mượn: {borrower}" + "Cấp: {lender}" + "Trả về" button (`IconReturn`) shown only when `item.returnable` — **onClick is a no-op in M1** (wired to Return dialog in M2; render it disabled-looking but harmless). Pager when >6 items.
- Loading state: render a simple "Đang tải…" while `isLoading`; error → red message `error.message`.

Use `useState` for the per-card maps, e.g. `const [tab, setTab] = useState<Record<string,string>>({})` and `const [page, setPage] = useState<Record<string,number>>({})`, mirroring the prototype's `deptTab`/`deptPage`.

- [ ] **Step 3: Verify**

Run: `npm run dev` → login → Dashboard shows 4 real stat counts and 4 dept cards. Click a request chip → device list switches and page resets. If a card has >6 items, pager appears and works.

- [ ] **Step 4: Commit**

```bash
git add equipment-manager
git commit -m "feat: dashboard page (stat cards + dept grid)"
```

---

## Task 15: Devices list + Device detail pages

**Files:**
- Create: `equipment-manager/src/hooks/useDevices.ts`, `src/hooks/useDevice.ts`
- Modify: `src/pages/Devices.tsx`, `src/pages/DeviceDetail.tsx`

**Interfaces:**
- Consumes: `api.devices.list/get`, `@tanstack/react-table`, `StatusBadge`, icons, `useAuth().isAdmin`.
- Produces: `useDevices(filter, query)` and `useDevice(sku)` hooks + both pages.

- [ ] **Step 1: Implement hooks**

```ts
// src/hooks/useDevices.ts
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { DeviceStatus } from '@shared/ipc'
export function useDevices(filter: 'all' | DeviceStatus, query: string) {
  return useQuery({
    queryKey: ['devices', filter, query],
    queryFn: () => unwrap(api.devices.list({ filter, query }))
  })
}
```
```ts
// src/hooks/useDevice.ts
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
export function useDevice(sku: string) {
  return useQuery({ queryKey: ['device', sku], queryFn: () => unwrap(api.devices.get({ sku })) })
}
```

- [ ] **Step 2: Implement `Devices.tsx`** — port lines 202-247.
- Search input (debounce optional) bound to local `query` state; barcode-scan icon affordance on the right. "Thêm thiết bị" button (admin-only) — no-op in M1.
- Filter chips from `data.counts` for keys `['all','available','allocated','maintenance','broken','decommissioned']`, labels via `{all:'Tất cả', ...STATUS_LABELS}`, active chip primary. Bound to local `filter` state.
- Table via `@tanstack/react-table` (`useReactTable`, `getCoreRowModel`) with columns SKU(mono)/Tên/Loại/Trạng thái(`StatusBadge`)/Phòng+Người giữ/Thao tác. "Xem" (IconView) → `navigate('/devices/'+sku)`. "Sửa"/"Đổi trạng thái" admin-only no-ops.
- Footer "Hiển thị {data.devices.length} / {data.total} thiết bị" + static pager (single page for 12 rows in M1).

- [ ] **Step 3: Implement `DeviceDetail.tsx`** — port lines 249-298.
- `const { sku } = useParams()`; `useDevice(sku!)`. Back link → `/devices`.
- Header: IconBox 56px tile, name (22/700), SKU (mono) + `StatusBadge`. Admin-only "Đổi trạng thái"/"Chỉnh sửa" no-ops.
- Tabs "Thông tin"/"Lịch sử" via local state (default 'info'). Info tab: key/value rows from `data.info` (render Trạng thái value as a `StatusBadge` — map its label back, or have the handler emit the enum; simplest: detail info has a dedicated status field; render badge using `data.device.status`). History tab: vertical timeline from `data.history` with the type→color/icon mapping (allocate=blue/IconCheck, return=green/IconDown, maintenance=yellow/IconWrench, create=gray/IconBox).

- [ ] **Step 4: Verify**

Run: `npm run dev` → Devices page lists 12 devices; status filter chips filter; search by `LAP-0012` narrows to one; click eye → detail page; Info shows fields, History shows timeline; back link returns. Toggle role to Nhân viên → admin-only buttons disappear.

- [ ] **Step 5: Commit**

```bash
git add equipment-manager
git commit -m "feat: devices list + device detail pages"
```

---

## Task 16: Vitest config, full test run, README, smoke check

**Files:**
- Create: `equipment-manager/vitest.config.ts`, `src/test/setup.ts`, `equipment-manager/README.md`

**Interfaces:**
- Produces: green test suite + run docs. (If `vitest.config.ts` was created earlier to unblock a component test, just verify it here.)

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
export default defineConfig({
  resolve: { alias: { '@': resolve('src'), '@shared': resolve('electron/shared') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts']
  }
})
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom'
```

> better-sqlite3 tests run under jsdom fine (it's a Node native module used directly). If any main-process test needs Node env specifically, add `// @vitest-environment node` at its file top.

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all test files PASS (migrate, seed, auth, devices, dashboard, handlers/index, status, StatusBadge).

- [ ] **Step 3: Typecheck both projects**

Run: `npm run typecheck`
Expected: PASS for node + web.

- [ ] **Step 4: Write `README.md`** documenting: prerequisites (Node 22), `npm install` + `npx electron-rebuild -f -w better-sqlite3`, `npm run dev`, default login `admin`/`admin`, `npm test`, where the DB lives (`app.getPath('userData')/equiphub.db`), and the milestone roadmap pointer to the spec.

- [ ] **Step 5: Manual smoke check** (record pass/fail in the commit message)

`npm run dev`, then verify the DoD list from the spec §11:
- login admin/admin works; wrong creds rejected
- Dashboard stats + dept grid (chips switch lists; pagination works)
- Devices filter + search + view→detail
- DeviceDetail Info + History tabs
- theme + collapse + role toggles; admin-only controls hide for staff

- [ ] **Step 6: Commit**

```bash
git add equipment-manager
git commit -m "test: vitest config + full green suite; docs: M1 README"
```

---

## Self-Review (completed during planning)

**Spec coverage check (spec §§):**
- §1 goal / §11 DoD → Tasks 13-16 (login, shell, dashboard, devices, smoke).
- §2 decisions (prototype dashboard, status-only maintenance, approach A, macOS dev) → Tasks 8/14 (no chart/alerts), schema keeps `maintenance_logs` (Task 3) with no nav item (Task 13), TanStack Query (Tasks 10/14/15), no packaging.
- §4 architecture (3 processes, typed IPC, shared types) → Tasks 1, 6, 9.
- §5 full schema + migrations + seed → Tasks 3, 4, 5.
- §6 IPC handlers (auth/devices/dashboard) → Tasks 7, 8, 9.
- §7 UI screens + role-based UI + StatusBadge → Tasks 12-15.
- §8 structure → Task 1 + per-file tasks.
- §9 testing → tests in Tasks 4,5,7,8,9,10,12 + suite in 16.
- §10 error handling → ApiResponse envelope (Task 6), login error (Tasks 7/13), unknown route Placeholder (Task 13), unknown sku (Task 8).

**Placeholder scan:** UI port steps reference exact prototype line ranges (an external design asset, not another task) and give the data wiring in full; no "TODO/TBD". Acceptable.

**Type consistency:** `ApiResponse<T>` envelope, `make*Handlers(db)` factory naming, `unwrap()`, `DeviceRow`/`DeviceListResult`/`DashboardSummary` used consistently across Tasks 6-15. Status enums English in DB/DTO, Vietnamese only at render via `STATUS_LABELS`. Canonical IPC envelope is `ApiResponse<T>` throughout.
