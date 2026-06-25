# Device Groups & Category Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional named-group layer (Category → Group → Device) managed in the Catalog page, plus a category dropdown filter on the Devices page.

**Architecture:** New `device_groups` SQLite table referenced by `devices.groupId` (nullable). All group CRUD goes through two new IPC channels wired into the existing catalog handler. The Catalog page's "Loại thiết bị" tab becomes a master-detail 2-column layout; the Devices page gets a category dropdown and a two-line "Loại / Nhóm" cell.

**Tech Stack:** Drizzle ORM (better-sqlite3), Electron IPC, React 18, TanStack Query, inline styles + CSS custom properties. All user-facing copy in Vietnamese.

## Global Constraints

- All user-facing labels and error messages must be in Vietnamese.
- Inline styles + CSS custom properties only (no Tailwind classes, no CSS modules).
- `groupId` is always nullable — existing devices that have no group must continue to work exactly as before.
- No changes to seed data (seed already runs migrations automatically via `runMigrations`).
- Run `npm run typecheck` before every commit; fix all errors before committing.
- Tests use `createDb(':memory:')` + `runMigrations(db)` + `seedIfEmpty(db)` — the in-memory DB runs all migrations including the new one.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/main/db/schema.ts` | Modify | Add `deviceGroups` table; add `groupId` to `devices` |
| `electron/main/db/migrations/<hash>.sql` | Create (generated) | SQL for new table + column |
| `electron/main/db/migrations/meta/_journal.json` | Modify (generated) | Drizzle migration index |
| `electron/shared/ipc.ts` | Modify | `GroupRow`, `SaveGroupArgs`, updated interfaces, new channels |
| `electron/main/handlers/catalog.ts` | Modify | `list`, `saveGroup`, `deleteGroup`, guard `deleteCategory` |
| `electron/main/handlers/catalog.test.ts` | Create | Tests for all 4 catalog changes |
| `electron/main/handlers/devices.ts` | Modify | `list` (group join + categoryId filter), `get`, `create`, `update` |
| `electron/main/handlers/devices.test.ts` | Modify | New tests for group and categoryId filter |
| `electron/main/handlers/index.ts` | Modify | Register `catalogSaveGroup`, `catalogDeleteGroup` |
| `electron/preload/index.ts` | Modify | Expose `saveGroup`, `deleteGroup` on `window.api.catalog` |
| `src/pages/Catalog.tsx` | Modify | 2-column master-detail inside "Loại thiết bị" tab |
| `src/components/DeviceFormDialog.tsx` | Modify | Add `groups` prop + "Nhóm" select field |
| `src/pages/Devices.tsx` | Modify | Category dropdown filter; "Loại / Nhóm" cell |

---

## Task 1: Schema + Migration

**Files:**
- Modify: `equipment-manager/electron/main/db/schema.ts`
- Create (auto): `equipment-manager/electron/main/db/migrations/<hash>.sql`

**Interfaces:**
- Produces: `deviceGroups` table export, `devices.groupId` column, `DeviceGroup` type — consumed by Tasks 3 and 4.

- [ ] **Step 1: Update schema.ts**

Insert the `deviceGroups` table **before** the `devices` table (so `devices` can reference it), then add `groupId` to `devices`:

```typescript
// After `categories` table definition, before `departments`:

export const deviceGroups = sqliteTable('device_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: text('created_at').notNull()
})
```

Then update the `devices` table (add `groupId` as the last column before closing):

```typescript
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
  updatedAt: text('updated_at').notNull(),
  groupId: integer('group_id').references(() => deviceGroups.id),
})
```

Add `deviceGroups` to the `schema` export and add the inferred type:

```typescript
export const schema = {
  categories, deviceGroups, departments, employees, appUsers,
  devices, requests, allocations, maintenanceLogs
}

export type DeviceGroup = typeof deviceGroups.$inferSelect
```

- [ ] **Step 2: Generate migration**

```bash
cd equipment-manager && npm run db:generate
```

Expected: a new `electron/main/db/migrations/<hash>.sql` file is created containing `CREATE TABLE device_groups` and `ALTER TABLE devices ADD COLUMN group_id`.

- [ ] **Step 3: Verify migration file**

```bash
cat equipment-manager/electron/main/db/migrations/*.sql | grep -E "device_groups|group_id"
```

Expected output includes:
```
CREATE TABLE `device_groups`
`group_id` integer
```

- [ ] **Step 4: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add equipment-manager/electron/main/db/schema.ts equipment-manager/electron/main/db/migrations/
git commit -m "feat: add device_groups table and devices.groupId column"
```

---

## Task 2: IPC Contract

**Files:**
- Modify: `equipment-manager/electron/shared/ipc.ts`

**Interfaces:**
- Produces: `GroupRow`, `SaveGroupArgs`, updated `CatalogListResult`, `DeviceRow`, `DeviceListArgs`, `DeviceCreateArgs`, `DeviceUpdateArgs`, new CHANNELS keys, updated `Api.catalog` — consumed by all subsequent tasks.

- [ ] **Step 1: Add GroupRow and SaveGroupArgs**

Add after the `CategoryRow` / `DepartmentRow` / `EmployeeRow` / `CatalogListResult` block:

```typescript
export interface GroupRow { id: number; name: string; categoryId: number; categoryName: string }
export interface SaveGroupArgs { id?: number; name: string; categoryId: number }
```

- [ ] **Step 2: Update CatalogListResult**

```typescript
export interface CatalogListResult {
  categories: CategoryRow[]
  departments: DepartmentRow[]
  employees: EmployeeRow[]
  groups: GroupRow[]
}
```

- [ ] **Step 3: Update DeviceRow**

```typescript
export interface DeviceRow {
  sku: string
  name: string
  category: string
  categoryId: number | null
  status: DeviceStatus
  department: string | null
  holder: string | null
  serialNumber: string | null
  notes: string | null
  activeAllocationId: number | null
  group: string | null
  groupId: number | null
}
```

- [ ] **Step 4: Update DeviceListArgs**

```typescript
export interface DeviceListArgs {
  filter: 'all' | DeviceStatus
  query: string
  page?: number
  pageSize?: number
  categoryId?: number | null
}
```

- [ ] **Step 5: Update DeviceCreateArgs and DeviceUpdateArgs**

```typescript
export interface DeviceCreateArgs {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
  groupId: number | null
}

export interface DeviceUpdateArgs {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
  groupId: number | null
}
```

- [ ] **Step 6: Add new channels to CHANNELS**

Add two entries inside the `CHANNELS` const object (e.g. after `catalogDeleteEmployee`):

```typescript
catalogSaveGroup: 'catalog.saveGroup',
catalogDeleteGroup: 'catalog.deleteGroup',
```

- [ ] **Step 7: Add methods to Api.catalog**

```typescript
catalog: {
  list(): Promise<ApiResponse<CatalogListResult>>
  saveCategory(args: SaveCategoryArgs): Promise<ApiResponse<CategoryRow>>
  deleteCategory(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
  saveDepartment(args: SaveDepartmentArgs): Promise<ApiResponse<DepartmentRow>>
  deleteDepartment(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
  saveEmployee(args: SaveEmployeeArgs): Promise<ApiResponse<EmployeeRow>>
  deleteEmployee(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
  saveGroup(args: SaveGroupArgs): Promise<ApiResponse<{ ok: true }>>
  deleteGroup(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
}
```

- [ ] **Step 8: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: errors only in handler/preload files that haven't been updated yet (not in `ipc.ts` itself). If errors appear in `ipc.ts`, fix them before continuing.

- [ ] **Step 9: Commit**

```bash
git add equipment-manager/electron/shared/ipc.ts
git commit -m "feat: IPC types for device groups (GroupRow, SaveGroupArgs, updated interfaces)"
```

---

## Task 3: Catalog Handler + Tests

**Files:**
- Modify: `equipment-manager/electron/main/handlers/catalog.ts`
- Create: `equipment-manager/electron/main/handlers/catalog.test.ts`

**Interfaces:**
- Consumes: `deviceGroups` from `schema.ts` (Task 1), `GroupRow`, `SaveGroupArgs`, `CatalogListResult`, `DeleteEntityArgs` from `ipc.ts` (Task 2).
- Produces: `makeCatalogHandlers` returning `list`, `saveGroup`, `deleteGroup`, `deleteCategory` (guarded) — consumed by Task 5.

- [ ] **Step 1: Write failing tests**

Create `equipment-manager/electron/main/handlers/catalog.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { devices } from '../db/schema'
import { makeCatalogHandlers } from './catalog'
import { makeDeviceHandlers } from './devices'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return { catalog: makeCatalogHandlers(db), devices: makeDeviceHandlers(db), db }
}

describe('catalog.list', () => {
  it('returns groups array (empty after seed)', async () => {
    const { catalog } = setup()
    const res = await catalog.list()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(Array.isArray(res.data.groups)).toBe(true)
    }
  })
})

describe('catalog.saveGroup', () => {
  it('creates a new group under a category', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id

    const res = await catalog.saveGroup({ name: 'Dell XPS 15', categoryId: catId })
    expect(res.ok).toBe(true)

    const after = await catalog.list()
    if (!after.ok) throw new Error('list failed')
    const group = after.data.groups.find((g) => g.name === 'Dell XPS 15')
    expect(group).toBeDefined()
    expect(group?.categoryId).toBe(catId)
  })

  it('updates an existing group name', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id

    await catalog.saveGroup({ name: 'Original', categoryId: catId })
    const after = await catalog.list()
    if (!after.ok) throw new Error('list failed')
    const group = after.data.groups.find((g) => g.name === 'Original')!

    const res = await catalog.saveGroup({ id: group.id, name: 'Updated', categoryId: catId })
    expect(res.ok).toBe(true)

    const final = await catalog.list()
    if (!final.ok) throw new Error('list failed')
    expect(final.data.groups.find((g) => g.name === 'Updated')).toBeDefined()
    expect(final.data.groups.find((g) => g.name === 'Original')).toBeUndefined()
  })

  it('rejects empty name', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id
    const res = await catalog.saveGroup({ name: '   ', categoryId: catId })
    expect(res.ok).toBe(false)
  })
})

describe('catalog.deleteGroup', () => {
  it('deletes group and detaches devices (sets groupId to null)', async () => {
    const { catalog, devices: devH, db } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id

    await catalog.saveGroup({ name: 'ToDelete', categoryId: catId })
    const after = await catalog.list()
    if (!after.ok) throw new Error('list failed')
    const group = after.data.groups.find((g) => g.name === 'ToDelete')!

    // Assign a device to this group
    const devList = await devH.list({ filter: 'all', query: '' })
    if (!devList.ok) throw new Error('list failed')
    const sku = devList.data.devices[0].sku
    await devH.update({ sku, name: devList.data.devices[0].name, categoryId: catId, serialNumber: null, notes: null, groupId: group.id })

    // Delete the group
    const delRes = await catalog.deleteGroup({ id: group.id })
    expect(delRes.ok).toBe(true)

    // Device should have groupId = null
    const devAfter = await devH.list({ filter: 'all', query: '' })
    if (!devAfter.ok) throw new Error('list failed')
    const dev = devAfter.data.devices.find((d) => d.sku === sku)
    expect(dev?.groupId).toBeNull()
  })
})

describe('catalog.deleteCategory', () => {
  it('blocks deletion when category has groups', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const cat = cats.data.categories[0]

    await catalog.saveGroup({ name: 'BlockerGroup', categoryId: cat.id })
    const res = await catalog.deleteCategory({ id: cat.id })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('CONFLICT')
  })

  it('allows deletion when category has no groups', async () => {
    const { catalog } = setup()
    // Add a fresh category with no groups
    const saved = await catalog.saveCategory({ name: 'EmptyCat', minStock: 0 })
    if (!saved.ok) throw new Error('save failed')
    const res = await catalog.deleteCategory({ id: saved.data.id })
    expect(res.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd equipment-manager && npx vitest run electron/main/handlers/catalog.test.ts
```

Expected: failures because `saveGroup`, `deleteGroup` don't exist yet, and `list` doesn't return `groups`.

- [ ] **Step 3: Update catalog.ts**

Replace the full `catalog.ts` with:

```typescript
import { eq, and } from 'drizzle-orm'
import type { AppDb } from '../db'
import { categories, departments, employees, deviceGroups, devices } from '../db/schema'
import type {
  ApiResponse,
  CatalogListResult,
  CategoryRow,
  DepartmentRow,
  EmployeeRow,
  GroupRow,
  SaveCategoryArgs,
  SaveDepartmentArgs,
  SaveEmployeeArgs,
  SaveGroupArgs,
  DeleteEntityArgs,
} from '@shared/ipc'

function now() { return new Date().toISOString() }

export function makeCatalogHandlers(db: AppDb) {
  return {
    async list(): Promise<ApiResponse<CatalogListResult>> {
      const cats = db.select().from(categories).all()
      const depts = db.select().from(departments).all()
      const emps = db
        .select({
          id: employees.id,
          name: employees.name,
          employeeCode: employees.employeeCode,
          departmentId: employees.departmentId,
          departmentName: departments.name,
        })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .all()
      const grps = db
        .select({
          id: deviceGroups.id,
          name: deviceGroups.name,
          categoryId: deviceGroups.categoryId,
          categoryName: categories.name,
        })
        .from(deviceGroups)
        .leftJoin(categories, eq(deviceGroups.categoryId, categories.id))
        .all()

      return {
        ok: true,
        data: {
          categories: cats.map<CategoryRow>((c) => ({ id: c.id, name: c.name, minStock: c.minStock })),
          departments: depts.map<DepartmentRow>((d) => ({ id: d.id, name: d.name })),
          employees: emps.map<EmployeeRow>((e) => ({
            id: e.id,
            name: e.name,
            employeeCode: e.employeeCode,
            departmentId: e.departmentId ?? null,
            departmentName: e.departmentName ?? '',
          })),
          groups: grps.map<GroupRow>((g) => ({
            id: g.id,
            name: g.name,
            categoryId: g.categoryId ?? 0,
            categoryName: g.categoryName ?? '',
          })),
        },
      }
    },

    async saveCategory(args: SaveCategoryArgs): Promise<ApiResponse<CategoryRow>> {
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên loại không được trống.' } }
      }
      if (args.id) {
        db.update(categories)
          .set({ name: args.name.trim(), minStock: args.minStock ?? 0 })
          .where(eq(categories.id, args.id))
          .run()
        return { ok: true, data: { id: args.id, name: args.name.trim(), minStock: args.minStock ?? 0 } }
      }
      const result = db.insert(categories)
        .values({ name: args.name.trim(), minStock: args.minStock ?? 0, createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name, minStock: result.minStock } }
    },

    async deleteCategory(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const hasGroups = db.select({ id: deviceGroups.id })
        .from(deviceGroups)
        .where(eq(deviceGroups.categoryId, args.id))
        .all()
      if (hasGroups.length > 0) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: 'Vui lòng xóa hoặc chuyển nhóm trước.' },
        }
      }
      db.delete(categories).where(eq(categories.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveDepartment(args: SaveDepartmentArgs): Promise<ApiResponse<DepartmentRow>> {
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên phòng ban không được trống.' } }
      }
      if (args.id) {
        db.update(departments).set({ name: args.name.trim() }).where(eq(departments.id, args.id)).run()
        return { ok: true, data: { id: args.id, name: args.name.trim() } }
      }
      const result = db.insert(departments)
        .values({ name: args.name.trim(), createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name } }
    },

    async deleteDepartment(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      db.delete(departments).where(eq(departments.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveEmployee(args: SaveEmployeeArgs): Promise<ApiResponse<EmployeeRow>> {
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên nhân viên không được trống.' } }
      }
      if (!args?.employeeCode?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Mã nhân viên không được trống.' } }
      }
      const deptName = args.departmentId
        ? (db.select({ name: departments.name }).from(departments).where(eq(departments.id, args.departmentId)).all()[0]?.name ?? '')
        : ''

      if (args.id) {
        db.update(employees)
          .set({ name: args.name.trim(), employeeCode: args.employeeCode.trim(), departmentId: args.departmentId ?? null })
          .where(eq(employees.id, args.id))
          .run()
        return { ok: true, data: { id: args.id, name: args.name.trim(), employeeCode: args.employeeCode.trim(), departmentId: args.departmentId ?? null, departmentName: deptName } }
      }
      const result = db.insert(employees)
        .values({ name: args.name.trim(), employeeCode: args.employeeCode.trim(), departmentId: args.departmentId ?? null, createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name, employeeCode: result.employeeCode, departmentId: result.departmentId ?? null, departmentName: deptName } }
    },

    async deleteEmployee(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      db.delete(employees).where(eq(employees.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async saveGroup(args: SaveGroupArgs): Promise<ApiResponse<{ ok: true }>> {
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên nhóm không được trống.' } }
      }
      if (args.id) {
        db.update(deviceGroups)
          .set({ name: args.name.trim(), categoryId: args.categoryId })
          .where(eq(deviceGroups.id, args.id))
          .run()
      } else {
        db.insert(deviceGroups)
          .values({ name: args.name.trim(), categoryId: args.categoryId, createdAt: now() })
          .run()
      }
      return { ok: true, data: { ok: true } }
    },

    async deleteGroup(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      db.update(devices)
        .set({ groupId: null })
        .where(eq(devices.groupId, args.id))
        .run()
      db.delete(deviceGroups).where(eq(deviceGroups.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd equipment-manager && npx vitest run electron/main/handlers/catalog.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors in catalog files (errors may still appear in handler index and preload — those are fixed in Task 5).

- [ ] **Step 6: Commit**

```bash
git add equipment-manager/electron/main/handlers/catalog.ts equipment-manager/electron/main/handlers/catalog.test.ts
git commit -m "feat: catalog handler — saveGroup, deleteGroup, group list, deleteCategory guard"
```

---

## Task 4: Devices Handler + Tests

**Files:**
- Modify: `equipment-manager/electron/main/handlers/devices.ts`
- Modify: `equipment-manager/electron/main/handlers/devices.test.ts`

**Interfaces:**
- Consumes: `deviceGroups` from schema (Task 1), updated `DeviceRow`, `DeviceListArgs`, `DeviceCreateArgs`, `DeviceUpdateArgs` (Task 2).
- Produces: updated `makeDeviceHandlers` with group join and categoryId filter — consumed by Task 5.

- [ ] **Step 1: Write new failing tests**

Add these test cases to the **bottom** of `devices.test.ts` (after existing tests):

```typescript
describe('devices.list — group and categoryId filter', () => {
  it('returns group: null for devices without a group (seed data)', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: '' })
    if (!res.ok) throw new Error('list failed')
    expect(res.data.devices.every((d) => d.group === null)).toBe(true)
    expect(res.data.devices.every((d) => d.groupId === null)).toBe(true)
  })

  it('filters by categoryId', async () => {
    const { db } = (() => {
      const { db } = require('../db').createDb(':memory:')
      require('../db/migrate').runMigrations(db)
      require('../db/seed').seedIfEmpty(db)
      return { db }
    })()
    const h = makeDeviceHandlers(db)
    // Get first device's categoryId
    const all = await h.list({ filter: 'all', query: '' })
    if (!all.ok) throw new Error('list failed')
    const catId = all.data.devices.find((d) => d.categoryId != null)?.categoryId ?? null
    if (catId == null) return // skip if no categorised devices in seed

    const res = await h.list({ filter: 'all', query: '', categoryId: catId })
    if (!res.ok) throw new Error('list failed')
    expect(res.data.devices.every((d) => d.categoryId === catId)).toBe(true)
  })
})

describe('devices.create / update — groupId', () => {
  it('create accepts groupId and stores it', async () => {
    const { db } = (() => {
      const { db } = require('../db').createDb(':memory:')
      require('../db/migrate').runMigrations(db)
      require('../db/seed').seedIfEmpty(db)
      return { db }
    })()
    const { makeCatalogHandlers } = require('./catalog')
    const catalogH = makeCatalogHandlers(db)
    const h = makeDeviceHandlers(db)

    const cats = await catalogH.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id
    await catalogH.saveGroup({ name: 'TestGroup', categoryId: catId })
    const after = await catalogH.list()
    if (!after.ok) throw new Error('list failed')
    const groupId = after.data.groups.find((g) => g.name === 'TestGroup')!.id

    await h.create({ sku: 'GRP-0001', name: 'Grouped Device', categoryId: catId, serialNumber: null, notes: null, groupId })
    const res = await h.list({ filter: 'all', query: 'GRP-0001' })
    if (!res.ok) throw new Error('list failed')
    expect(res.data.devices[0].groupId).toBe(groupId)
    expect(res.data.devices[0].group).toBe('TestGroup')
  })

  it('update auto-clears groupId when category changes', async () => {
    const { db } = (() => {
      const { db } = require('../db').createDb(':memory:')
      require('../db/migrate').runMigrations(db)
      require('../db/seed').seedIfEmpty(db)
      return { db }
    })()
    const { makeCatalogHandlers } = require('./catalog')
    const catalogH = makeCatalogHandlers(db)
    const h = makeDeviceHandlers(db)

    const cats = await catalogH.list()
    if (!cats.ok) throw new Error('list failed')
    const catA = cats.data.categories[0].id
    const catB = cats.data.categories[1]?.id
    if (catB == null) return // need 2 categories

    await catalogH.saveGroup({ name: 'GroupA', categoryId: catA })
    const after = await catalogH.list()
    if (!after.ok) throw new Error('list failed')
    const groupId = after.data.groups.find((g) => g.name === 'GroupA')!.id

    // Create device in catA with groupId
    await h.create({ sku: 'AUTOGRP-001', name: 'Test', categoryId: catA, serialNumber: null, notes: null, groupId })

    // Update to catB — groupId should be cleared
    await h.update({ sku: 'AUTOGRP-001', name: 'Test', categoryId: catB, serialNumber: null, notes: null, groupId })
    const res = await h.list({ filter: 'all', query: 'AUTOGRP-001' })
    if (!res.ok) throw new Error('list failed')
    expect(res.data.devices[0].groupId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd equipment-manager && npx vitest run electron/main/handlers/devices.test.ts
```

Expected: new tests fail because `groupId`/`group` fields don't exist and `categoryId` filter isn't implemented.

- [ ] **Step 3: Update devices.ts — imports**

Add `deviceGroups` to the schema import at the top of `devices.ts`:

```typescript
import {
  devices,
  categories,
  allocations,
  employees,
  departments,
  maintenanceLogs,
  deviceGroups,
} from '../db/schema'
```

- [ ] **Step 4: Update devices.ts — list handler**

In the `list` function, update the `devRows` query to join `deviceGroups`:

```typescript
const devRows = db
  .select({
    id: devices.id,
    sku: devices.sku,
    name: devices.name,
    status: devices.status,
    serialNumber: devices.serialNumber,
    categoryId: devices.categoryId,
    categoryName: categories.name,
    notes: devices.notes,
    groupId: devices.groupId,
    groupName: deviceGroups.name,
  })
  .from(devices)
  .leftJoin(categories, eq(devices.categoryId, categories.id))
  .leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))
  .all()
```

Update the `DeviceRow` shape inside `.map()`:

```typescript
let deviceRows: DeviceRow[] = devRows.map((r) => {
  const alloc = activeByDeviceId.get(r.id)
  return {
    sku: r.sku,
    name: r.name,
    category: r.categoryName ?? '',
    categoryId: r.categoryId ?? null,
    status: r.status as DeviceStatus,
    serialNumber: r.serialNumber ?? null,
    notes: r.notes ?? null,
    holder: alloc?.holderName ?? parseBorrowerName(alloc?.notes ?? null),
    department: alloc?.deptName ?? null,
    activeAllocationId: alloc?.allocationId ?? null,
    group: r.groupName ?? null,
    groupId: r.groupId ?? null,
  }
})
```

After the existing search-query block, add the categoryId filter (before computing `total`):

```typescript
// Apply categoryId filter
if (args.categoryId != null) {
  deviceRows = deviceRows.filter((d) => d.categoryId === args.categoryId)
}
```

- [ ] **Step 5: Update devices.ts — get handler**

In the `get` function, update the `deviceRow` SELECT query (the one that fetches the single device by SKU) to also join `deviceGroups` and include `groupId`/`groupName`:

```typescript
const deviceRow = db
  .select({
    id: devices.id,
    sku: devices.sku,
    name: devices.name,
    status: devices.status,
    serialNumber: devices.serialNumber,
    categoryId: devices.categoryId,
    categoryName: categories.name,
    notes: devices.notes,
    createdAt: devices.createdAt,
    groupId: devices.groupId,
    groupName: deviceGroups.name,
  })
  .from(devices)
  .leftJoin(categories, eq(devices.categoryId, categories.id))
  .leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))
  .where(eq(devices.sku, args.sku))
  .all()[0]
```

Then update `deviceRowOut` to include group fields using the device row (not `activeAlloc`):

```typescript
const deviceRowOut: DeviceDetailResult['device'] = {
  sku: deviceRow.sku,
  name: deviceRow.name,
  category: deviceRow.categoryName ?? '',
  categoryId: deviceRow.categoryId ?? null,
  status: deviceRow.status as DeviceStatus,
  serialNumber: deviceRow.serialNumber ?? null,
  holder: holderName,
  department: deptName,
  notes: deviceRow.notes ?? null,
  activeAllocationId: activeAlloc?.allocationId ?? null,
  group: deviceRow.groupName ?? null,
  groupId: deviceRow.groupId ?? null,
}
```

- [ ] **Step 6: Update devices.ts — create handler**

In the `create` function, add `groupId` to the insert:

```typescript
db.insert(devices).values({
  sku: args.sku.trim(),
  name: args.name.trim(),
  categoryId: args.categoryId ?? null,
  serialNumber: args.serialNumber?.trim() || null,
  status: 'available',
  notes: args.notes?.trim() || null,
  groupId: args.groupId ?? null,
  createdAt: now,
  updatedAt: now,
}).run()
```

- [ ] **Step 7: Update devices.ts — update handler**

Replace the `update` function body to auto-clear `groupId` when category changes:

```typescript
async update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>> {
  if (!args?.name?.trim()) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên thiết bị không được để trống.' } }
  }
  const device = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku)).all()[0]
  if (!device) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
  }

  // Auto-clear groupId if the group belongs to a different category
  let resolvedGroupId: number | null = args.groupId ?? null
  if (resolvedGroupId != null) {
    const grp = db.select({ categoryId: deviceGroups.categoryId })
      .from(deviceGroups)
      .where(eq(deviceGroups.id, resolvedGroupId))
      .all()[0]
    if (!grp || grp.categoryId !== args.categoryId) {
      resolvedGroupId = null
    }
  }

  db.update(devices)
    .set({
      name: args.name.trim(),
      categoryId: args.categoryId ?? null,
      serialNumber: args.serialNumber?.trim() || null,
      notes: args.notes?.trim() || null,
      groupId: resolvedGroupId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(devices.sku, args.sku))
    .run()
  return { ok: true, data: { ok: true } }
},
```

- [ ] **Step 8: Run all tests**

```bash
cd equipment-manager && npx vitest run electron/main/handlers/devices.test.ts electron/main/handlers/catalog.test.ts
```

Expected: all tests pass.

- [ ] **Step 9: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

- [ ] **Step 10: Commit**

```bash
git add equipment-manager/electron/main/handlers/devices.ts equipment-manager/electron/main/handlers/devices.test.ts
git commit -m "feat: devices handler — group join, categoryId filter, groupId in create/update"
```

---

## Task 5: Preload + Handler Registration

**Files:**
- Modify: `equipment-manager/electron/preload/index.ts`
- Modify: `equipment-manager/electron/main/handlers/index.ts`

**Interfaces:**
- Consumes: `CHANNELS.catalogSaveGroup`, `CHANNELS.catalogDeleteGroup` (Task 2), `makeCatalogHandlers` returning `saveGroup` and `deleteGroup` (Task 3).

- [ ] **Step 1: Update preload/index.ts**

Add `saveGroup` and `deleteGroup` to the `catalog` section:

```typescript
catalog: {
  list: () => ipcRenderer.invoke(CHANNELS.catalogList),
  saveCategory: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveCategory, args),
  deleteCategory: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteCategory, args),
  saveDepartment: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveDepartment, args),
  deleteDepartment: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteDepartment, args),
  saveEmployee: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveEmployee, args),
  deleteEmployee: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteEmployee, args),
  saveGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveGroup, args),
  deleteGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteGroup, args),
},
```

- [ ] **Step 2: Update handlers/index.ts**

Add two `ipcMain.handle` lines after `catalogDeleteEmployee`:

```typescript
ipcMain.handle(CHANNELS.catalogSaveGroup, (_e, args) => auth_guard(() => catalogH.saveGroup(args)))
ipcMain.handle(CHANNELS.catalogDeleteGroup, (_e, args) => auth_guard(() => catalogH.deleteGroup(args)))
```

- [ ] **Step 3: Run full test suite**

```bash
cd equipment-manager && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add equipment-manager/electron/preload/index.ts equipment-manager/electron/main/handlers/index.ts
git commit -m "feat: wire saveGroup and deleteGroup channels through preload and handler registry"
```

---

## Task 6: Catalog Page — 2-Column Master-Detail

**Files:**
- Modify: `equipment-manager/src/pages/Catalog.tsx`

**Interfaces:**
- Consumes: `GroupRow`, `SaveGroupArgs` from `ipc.ts` (Task 2); `api.catalog.saveGroup`, `api.catalog.deleteGroup` from preload (Task 5).

- [ ] **Step 1: Replace CategoriesTab in Catalog.tsx**

Replace the entire `CategoriesTab` component (lines 82–155) with this 2-column master-detail version. Keep all other components (`DepartmentsTab`, `Catalog` page, etc.) unchanged.

```typescript
// ── Categories tab (master-detail) ───────────────────────────────────────────
function CategoriesTab({ rows, groups, isAdmin }: { rows: CategoryRow[]; groups: GroupRow[]; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editMin, setEditMin] = useState(0)
  const [newName, setNewName] = useState('')
  const [newMin, setNewMin] = useState(0)
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null)

  // Group editing state
  const [editGroupId, setEditGroupId] = useState<number | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')

  const saveCatMut = useMutation({
    mutationFn: (args: { id?: number; name: string; minStock: number }) =>
      unwrap(api.catalog.saveCategory(args)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); setEditId(null); setNewName(''); setNewMin(0) },
  })
  const delCatMut = useMutation({
    mutationFn: (id: number) => unwrap(api.catalog.deleteCategory({ id })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); setSelectedCatId(null) },
    onError: (e: Error) => alert(e.message),
  })
  const saveGroupMut = useMutation({
    mutationFn: (args: { id?: number; name: string; categoryId: number }) =>
      unwrap(api.catalog.saveGroup(args)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); setEditGroupId(null); setNewGroupName('') },
  })
  const delGroupMut = useMutation({
    mutationFn: (id: number) => unwrap(api.catalog.deleteGroup({ id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog'] }),
  })

  const selectedGroups = selectedCatId != null ? groups.filter((g) => g.categoryId === selectedCatId) : []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* ── Left: categories ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rad-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 100px 88px' : '1fr 100px', padding: '0 16px', height: 42, alignItems: 'center', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>Tên loại</div>
          <div>Tồn kho tối thiểu</div>
          {isAdmin && <div />}
        </div>

        {rows.map(row => (
          <div key={row.id}
            onClick={() => setSelectedCatId(row.id === selectedCatId ? null : row.id)}
            style={{
              display: 'grid', gridTemplateColumns: isAdmin ? '1fr 100px 88px' : '1fr 100px',
              padding: '0 16px', minHeight: 48, alignItems: 'center',
              borderBottom: '1px solid var(--border)', fontSize: 14, cursor: 'pointer',
              background: selectedCatId === row.id ? 'var(--primary-soft)' : '',
            }}
            onMouseEnter={e => { if (selectedCatId !== row.id) e.currentTarget.style.background = 'var(--hoverbg)' }}
            onMouseLeave={e => { if (selectedCatId !== row.id) e.currentTarget.style.background = '' }}
          >
            {editId === row.id ? (
              <>
                <InlineInput value={editName} onChange={e => setEditName(e.target.value)} onClick={e => e.stopPropagation()} style={{ width: '90%' }} />
                <InlineInput type="number" value={editMin} onChange={e => setEditMin(Number(e.target.value))} onClick={e => e.stopPropagation()} style={{ width: 72 }} />
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => saveCatMut.mutate({ id: row.id, name: editName, minStock: editMin })} style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>Lưu</button>
                  <button onClick={() => setEditId(null)} style={{ height: 28, padding: '0 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Hủy</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 500, color: selectedCatId === row.id ? 'var(--primary)' : 'var(--text)' }}>{row.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>{row.minStock}</div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <IconBtn title="Sửa" onClick={() => { setEditId(row.id); setEditName(row.name); setEditMin(row.minStock) }}><IconEdit size={13} /></IconBtn>
                    <IconBtn title="Xóa" onClick={() => delCatMut.mutate(row.id)}><IconTrash size={13} /></IconBtn>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 88px', padding: '10px 16px', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
            <InlineInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tên loại thiết bị mới" style={{ width: '90%' }} />
            <InlineInput type="number" value={newMin} onChange={e => setNewMin(Number(e.target.value))} style={{ width: 72 }} />
            <button onClick={() => { if (newName.trim()) saveCatMut.mutate({ name: newName, minStock: newMin }) }} style={{ height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <IconPlus size={13} />Thêm
            </button>
          </div>
        )}
      </div>

      {/* ── Right: groups ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rad-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 60px' : '1fr', padding: '0 16px', height: 42, alignItems: 'center', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>
            {selectedCatId != null
              ? `Nhóm — ${rows.find((r) => r.id === selectedCatId)?.name ?? ''}`
              : 'Nhóm'}
          </div>
          {isAdmin && selectedCatId != null && <div />}
        </div>

        {selectedCatId == null ? (
          <div style={{ padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            Chọn một loại thiết bị để xem nhóm
          </div>
        ) : (
          <>
            {selectedGroups.map(grp => (
              <div key={grp.id} style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 60px' : '1fr', padding: '0 16px', minHeight: 48, alignItems: 'center', borderBottom: '1px solid var(--border)', fontSize: 14 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                {editGroupId === grp.id ? (
                  <>
                    <InlineInput value={editGroupName} onChange={e => setEditGroupName(e.target.value)} style={{ width: '90%' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => saveGroupMut.mutate({ id: grp.id, name: editGroupName, categoryId: selectedCatId })} style={{ height: 28, padding: '0 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>Lưu</button>
                      <button onClick={() => setEditGroupId(null)} style={{ height: 28, padding: '0 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Hủy</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 500 }}>{grp.name}</div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <IconBtn title="Sửa" onClick={() => { setEditGroupId(grp.id); setEditGroupName(grp.name) }}><IconEdit size={13} /></IconBtn>
                        <IconBtn title="Xóa" onClick={() => delGroupMut.mutate(grp.id)}><IconTrash size={13} /></IconBtn>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {selectedGroups.length === 0 && (
              <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Chưa có nhóm nào.</div>
            )}

            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', padding: '10px 16px', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
                <InlineInput value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Tên nhóm mới" style={{ width: '90%' }} />
                <button onClick={() => { if (newGroupName.trim()) saveGroupMut.mutate({ name: newGroupName, categoryId: selectedCatId }) }} style={{ height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <IconPlus size={13} />Thêm
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update imports in Catalog.tsx**

Add `GroupRow` and `api` to the imports:

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { IconEdit, IconPlus } from '@/lib/icons'
import type { CategoryRow, DepartmentRow, GroupRow } from '@shared/ipc'
```

- [ ] **Step 3: Update CategoriesTab usage in the Catalog page**

In the `Catalog` component (bottom of the file), update the `CategoriesTab` call to pass `groups`:

```typescript
{tab === 'categories' && (
  <CategoriesTab rows={data?.categories ?? []} groups={data?.groups ?? []} isAdmin={isAdmin} />
)}
```

- [ ] **Step 4: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add equipment-manager/src/pages/Catalog.tsx
git commit -m "feat: Catalog page — 2-column master-detail for categories and groups"
```

---

## Task 7: Devices Page + DeviceFormDialog

**Files:**
- Modify: `equipment-manager/src/components/DeviceFormDialog.tsx`
- Modify: `equipment-manager/src/pages/Devices.tsx`

**Interfaces:**
- Consumes: `GroupRow` (Task 2), updated `DeviceCreateArgs` / `DeviceUpdateArgs` with `groupId` (Task 2), `DeviceRow.group` / `DeviceRow.groupId` (Task 4).

- [ ] **Step 1: Update DeviceFormDialog.tsx**

Replace the full file content:

```typescript
import { useState, useEffect } from 'react'
import type { DeviceCreateArgs, DeviceUpdateArgs, CategoryRow, GroupRow } from '@shared/ipc'

export interface DeviceFormInitial {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
  groupId: number | null
}

export interface DeviceFormDialogProps {
  mode: 'create' | 'edit'
  initial?: DeviceFormInitial
  categories: CategoryRow[]
  groups: GroupRow[]
  loading: boolean
  error: string
  onClose(): void
  onSubmit(args: DeviceCreateArgs | DeviceUpdateArgs): void
}

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function DeviceFormDialog({
  mode, initial, categories, groups, loading, error, onClose, onSubmit,
}: DeviceFormDialogProps) {
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null)
  const [groupId, setGroupId] = useState<number | null>(initial?.groupId ?? null)
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [localError, setLocalError] = useState('')

  const availableGroups = categoryId != null ? groups.filter((g) => g.categoryId === categoryId) : []

  useEffect(() => {
    if (initial) {
      setSku(initial.sku)
      setName(initial.name)
      setCategoryId(initial.categoryId)
      setGroupId(initial.groupId)
      setSerialNumber(initial.serialNumber ?? '')
      setNotes(initial.notes ?? '')
    }
  }, [initial?.sku])

  function handleCategoryChange(val: string) {
    setCategoryId(val ? Number(val) : null)
    setGroupId(null)
  }

  function submit() {
    if (!sku.trim()) { setLocalError('SKU không được để trống.'); return }
    if (!name.trim()) { setLocalError('Tên thiết bị không được để trống.'); return }
    setLocalError('')
    onSubmit({ sku: sku.trim(), name: name.trim(), categoryId, serialNumber: serialNumber.trim() || null, notes: notes.trim() || null, groupId })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }
  const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = 'var(--primary)')
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = 'var(--border)')

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 110,
      background: 'rgba(15,23,42,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
        boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {mode === 'create' ? 'Thêm thiết bị mới' : 'Chỉnh sửa thiết bị'}
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            borderRadius: 'var(--rad-sm)',
          }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* SKU */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              SKU <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              value={sku}
              onChange={e => setSku(e.target.value)}
              disabled={mode === 'edit'}
              placeholder="VD: LAP-0013"
              style={{
                ...inputStyle,
                fontFamily: "'Consolas',monospace",
                opacity: mode === 'edit' ? 0.6 : 1,
                cursor: mode === 'edit' ? 'not-allowed' : 'text',
              }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Tên thiết bị <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Laptop Dell XPS 13"
              style={inputStyle}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {/* Category */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Loại thiết bị
            </label>
            <select
              value={categoryId ?? ''}
              onChange={e => handleCategoryChange(e.target.value)}
              style={{ ...inputStyle, appearance: 'auto' as React.CSSProperties['appearance'] }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            >
              <option value="">— Không phân loại —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Group (only when category selected) */}
          {categoryId != null && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Nhóm
              </label>
              <select
                value={groupId ?? ''}
                onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
                style={{ ...inputStyle, appearance: 'auto' as React.CSSProperties['appearance'] }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              >
                <option value="">— Không có nhóm —</option>
                {availableGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Serial */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Số serial
            </label>
            <input
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              placeholder="VD: SN-12345678"
              style={inputStyle}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ghi chú
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Ghi chú (tùy chọn)"
              style={{
                ...inputStyle, height: 64, padding: '8px 12px',
                resize: 'none', fontFamily: 'inherit',
              }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>

          {(localError || error) && (
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
              {localError || error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
        }}>
          <button onClick={onClose} style={{
            height: 38, padding: '0 16px', border: '1px solid var(--border)',
            borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Hủy</button>
          <button onClick={submit} disabled={loading} style={{
            height: 38, padding: '0 16px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Đang lưu…' : mode === 'create' ? 'Thêm thiết bị' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update Devices.tsx — category dropdown state**

Add `categoryId` filter state after the `filter` state declaration:

```typescript
const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
```

Update the `useEffect` that resets page to also reset on `categoryFilter`:

```typescript
useEffect(() => { setPage(1) }, [filter, query, categoryFilter])
```

- [ ] **Step 3: Update Devices.tsx — pass categoryId to useDevices**

Update the `useDevices` call to pass the new filter:

```typescript
const { data, isLoading, error } = useDevices(filter, query, page, PAGE_SIZE, categoryFilter)
```

Then open `src/hooks/useDevices.ts` (or wherever `useDevices` is defined) and add `categoryId` as the 5th parameter, passing it into the `api.devices.list` call:

```typescript
export function useDevices(
  filter: 'all' | DeviceStatus,
  query: string,
  page: number,
  pageSize: number,
  categoryId?: number | null
) {
  return useQuery({
    queryKey: ['devices', filter, query, page, pageSize, categoryId ?? null],
    queryFn: () => unwrap(api.devices.list({ filter, query, page, pageSize, categoryId: categoryId ?? null })),
  })
}
```

- [ ] **Step 4: Update Devices.tsx — toolbar dropdown**

In the toolbar JSX (after the search input `<div>` and before the "Thêm thiết bị" button), add:

```tsx
<select
  value={categoryFilter ?? ''}
  onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : null)}
  style={{
    height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
    background: 'var(--surface)', color: categoryFilter == null ? 'var(--text-muted)' : 'var(--text)',
    fontSize: 14, outline: 'none', cursor: 'pointer',
    appearance: 'auto' as React.CSSProperties['appearance'],
    minWidth: 140,
  }}
>
  <option value="">Tất cả loại</option>
  {(catalogData?.categories ?? []).map(c => (
    <option key={c.id} value={c.id}>{c.name}</option>
  ))}
</select>
```

- [ ] **Step 5: Update Devices.tsx — "Loại / Nhóm" column**

Replace the `colHelper.accessor('category', ...)` column definition with:

```typescript
colHelper.display({
  id: 'categoryGroup',
  header: 'Loại / Nhóm',
  cell: ({ row }) => (
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ color: 'var(--text)', fontWeight: 500 }}>{row.original.category || '—'}</div>
      {row.original.group && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.original.group}</div>
      )}
    </div>
  )
}),
```

- [ ] **Step 6: Update Devices.tsx — pass groups to DeviceFormDialog**

Update the `DeviceFormDialog` call to pass `groups`:

```tsx
{formDialog && (
  <DeviceFormDialog
    mode={formDialog.mode}
    initial={formDialog.mode === 'edit' ? {
      sku: formDialog.device.sku,
      name: formDialog.device.name,
      categoryId: formDialog.device.categoryId,
      serialNumber: formDialog.device.serialNumber,
      notes: formDialog.device.notes,
      groupId: formDialog.device.groupId,
    } : undefined}
    categories={categories}
    groups={catalogData?.groups ?? []}
    loading={formDialog.mode === 'create' ? createMutation.isPending : updateMutation.isPending}
    error={formDialog.mode === 'create'
      ? (createMutation.isError ? (createMutation.error as Error).message : '')
      : (updateMutation.isError ? (updateMutation.error as Error).message : '')}
    onClose={() => {
      setFormDialog(null)
      createMutation.reset()
      updateMutation.reset()
    }}
    onSubmit={args => {
      if (formDialog.mode === 'create') createMutation.mutate(args)
      else updateMutation.mutate(args)
    }}
  />
)}
```

- [ ] **Step 7: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Run full test suite**

```bash
cd equipment-manager && npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add equipment-manager/src/components/DeviceFormDialog.tsx equipment-manager/src/pages/Devices.tsx equipment-manager/src/hooks/useDevices.ts
git commit -m "feat: Devices page — category filter dropdown, Loại/Nhóm column, group field in form"
```
