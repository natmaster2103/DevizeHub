# Group Enhancements & RBAC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend device groups with `minStock` and a cascading filter, add user–group assignment, and replace the binary `admin | staff` role check with a fine-grained `user_permissions` table so any capability can be granted independently to any user.

**Architecture:** Two new SQLite tables (`user_permissions`, `user_groups`) join to `app_users`. `SessionUser` gains `permissions: string[]` and `groupIds: number[]` populated at login. A `requirePermission(key)` helper replaces the single `role === 'admin'` check in `resetData` and gates all write handlers. The renderer's `AuthContext` gains `hasPermission(key)` and all UI write-gates switch from `isAdmin` to it. Group minStock is a schema column addition + UI field. The group filter on Devices cascades from the existing category filter.

**Tech Stack:** Drizzle ORM (better-sqlite3), Electron IPC, React 18, TanStack Query, inline styles + CSS custom properties. All user-facing copy Vietnamese.

## Global Constraints

- All user-facing labels and error messages in Vietnamese.
- Inline styles + CSS custom properties (no Tailwind, no CSS modules).
- `groupId` on devices is always nullable — devices without a group keep working.
- Run typecheck: `cd equipment-manager && npm run typecheck`
- Run tests: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run`
- Working dir for commands below: `/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager`

---

## File Map

| File | Action |
|---|---|
| `electron/main/db/schema.ts` | Add `min_stock` to `device_groups`; add `userPermissions` and `userGroups` tables |
| `electron/main/db/migrations/0002_*.sql` | Generated migration |
| `electron/shared/ipc.ts` | Add `Permission` type, `ALL_PERMISSIONS`, extend `SessionUser`, `GroupRow`, `SaveGroupArgs`, `DeviceListArgs`, new channels + `Api` methods |
| `electron/main/db/seed.ts` | Seed `user_permissions` for admin and staff after seeding `appUsers` |
| `electron/main/handlers/auth.ts` | Load `permissions[]` and `groupIds[]` from DB at login |
| `electron/main/handlers/auth.test.ts` | Assert `permissions` present after login |
| `electron/main/handlers/catalog.ts` | `list` returns `minStock` on groups; `saveGroup` reads/writes `minStock` |
| `electron/main/handlers/catalog.test.ts` | Tests for updated saveGroup/list |
| `electron/main/handlers/devices.ts` | Apply `groupId` filter in `list` |
| `electron/main/handlers/devices.test.ts` | Test groupId filter |
| `electron/main/handlers/settings.ts` | Add `requirePermission` helper; add `saveUserPermissions`, `saveUserGroups`; change `resetData` to permission-check; update existing session setups to include `permissions`/`groupIds` |
| `electron/main/handlers/settings.test.ts` | Tests for new handlers; update session setup shape |
| `electron/main/handlers/devices.ts` | Add `requirePermission` calls to `create`, `update`, `changeStatus`, `delete` |
| `electron/main/handlers/devices.test.ts` | Update session setups; add permission-rejection tests |
| `electron/main/handlers/requests.ts` | Add `requirePermission` to `create` and `returnDevice` |
| `electron/main/handlers/requests.test.ts` | Update session setups |
| `electron/main/handlers/allocate.ts` | Add `requirePermission` to `create` and `quickAllocate` |
| `electron/main/handlers/catalog.ts` | Add `requirePermission` to all save/delete methods |
| `electron/main/handlers/index.ts` | Register `settingsSaveUserPermissions`, `settingsSaveUserGroups` |
| `electron/preload/index.ts` | Expose `saveUserPermissions`, `saveUserGroups` on `window.api.settings` |
| `src/hooks/useDevices.ts` | Add `groupId?: number \| null` parameter |
| `src/context/AuthContext.tsx` | Add `permissions`, `groupIds`, `hasPermission(key)` |
| `src/pages/Devices.tsx` | Add cascading group dropdown; pass `groupId` to `useDevices` |
| `src/pages/Catalog.tsx` | Show `minStock` field in group edit form |
| `src/pages/Settings.tsx` | Add permission checklist + group picker to `UserModal` |

---

## Task 1: DB Schema + Migration

**Files:**
- Modify: `electron/main/db/schema.ts`
- Create (generated): `electron/main/db/migrations/0002_*.sql`

**Interfaces:**
- Produces: `deviceGroups.minStock`, `userPermissions` table, `userGroups` table — consumed by Tasks 3, 4, 5, 7

- [ ] **Step 1: Update `schema.ts` — add minStock to deviceGroups**

Open `electron/main/db/schema.ts`. Find:
```ts
export const deviceGroups = sqliteTable('device_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: text('created_at').notNull()
})
```
Replace with:
```ts
export const deviceGroups = sqliteTable('device_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  minStock: integer('min_stock').notNull().default(0),
  createdAt: text('created_at').notNull()
})
```

- [ ] **Step 2: Add `userPermissions` and `userGroups` tables to `schema.ts`**

Add the `uniqueIndex` import:
```ts
import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
```

Then add both tables after `appUsers` and before `devices`:
```ts
export const userPermissions = sqliteTable('user_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
}, (t) => ({
  uniq: uniqueIndex('uq_user_perm').on(t.userId, t.permission),
}))

export const userGroups = sqliteTable('user_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => deviceGroups.id, { onDelete: 'cascade' }),
}, (t) => ({
  uniq: uniqueIndex('uq_user_group').on(t.userId, t.groupId),
}))
```

Also add them to the `schema` export at the bottom:
```ts
export const schema = {
  categories, deviceGroups, departments, employees, appUsers,
  userPermissions, userGroups,
  devices, requests, allocations, maintenanceLogs
}
```

Add inferred types at the bottom:
```ts
export type UserPermission = typeof userPermissions.$inferSelect
export type UserGroup = typeof userGroups.$inferSelect
```

- [ ] **Step 3: Generate migration**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run db:generate 2>&1
```

Expected: a new `electron/main/db/migrations/0002_*.sql` file is created. Inspect it to confirm it contains `ALTER TABLE device_groups ADD min_stock`, `CREATE TABLE user_permissions`, and `CREATE TABLE user_groups`.

- [ ] **Step 4: Verify tests still pass (migration runs on in-memory DB)**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -10
```

Expected: all existing tests pass. The new tables exist after migration but are empty (seed doesn't populate them yet — that's Task 3).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors from schema.ts. May see errors in other files that reference `GroupRow` (missing `minStock`) — those are fixed in Task 2.

- [ ] **Step 6: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/db/schema.ts \
        equipment-manager/electron/main/db/migrations/ \
        equipment-manager/package-lock.json
git commit -m "feat: add minStock to device_groups, user_permissions and user_groups tables"
```

---

## Task 2: IPC Contract

**Files:**
- Modify: `electron/shared/ipc.ts`

**Interfaces:**
- Produces: `Permission` type, `ALL_PERMISSIONS`, updated `SessionUser`, `GroupRow`, `SaveGroupArgs`, `DeviceListArgs`, `SaveUserPermissionsArgs`, `SaveUserGroupsArgs`, new CHANNELS, updated `Api` — consumed by all later tasks

- [ ] **Step 1: Add `Permission` type and `ALL_PERMISSIONS` constant**

Open `electron/shared/ipc.ts`. After the `export type Role = 'admin' | 'staff'` line, add:

```ts
export type Permission =
  | 'allocate'
  | 'return_device'
  | 'create_request'
  | 'edit_device'
  | 'change_status'
  | 'delete_device'
  | 'manage_catalog'
  | 'manage_users'
  | 'reset_data'
  | 'view_reports'

export const ALL_PERMISSIONS: Permission[] = [
  'allocate', 'return_device', 'create_request', 'edit_device',
  'change_status', 'delete_device', 'manage_catalog', 'manage_users',
  'reset_data', 'view_reports',
]
```

- [ ] **Step 2: Extend `SessionUser` with `permissions` and `groupIds`**

Find:
```ts
export interface SessionUser {
  id: number
  username: string
  role: Role
  displayName: string
}
```
Replace with:
```ts
export interface SessionUser {
  id: number
  username: string
  role: Role
  displayName: string
  permissions: string[]
  groupIds: number[]
}
```

- [ ] **Step 3: Fix `auth.ts` to avoid immediate typecheck failure**

Open `electron/main/handlers/auth.ts`. Find:
```ts
      const user: SessionUser = { id: row.id, username: row.username, role: row.role, displayName: row.displayName }
```
Replace with (temporary empty arrays — Task 4 loads real data):
```ts
      const user: SessionUser = {
        id: row.id, username: row.username, role: row.role as Role,
        displayName: row.displayName, permissions: [], groupIds: [],
      }
```

- [ ] **Step 4: Extend `GroupRow` and `SaveGroupArgs`**

Find:
```ts
export interface GroupRow { id: number; name: string; categoryId: number; categoryName: string }
```
Replace with:
```ts
export interface GroupRow { id: number; name: string; categoryId: number; categoryName: string; minStock: number }
```

Find:
```ts
export interface SaveGroupArgs { id?: number; name: string; categoryId: number }
```
Replace with:
```ts
export interface SaveGroupArgs { id?: number; name: string; categoryId: number; minStock: number }
```

- [ ] **Step 5: Extend `DeviceListArgs`**

Find:
```ts
export interface DeviceListArgs {
  filter: 'all' | DeviceStatus
  query: string
  page?: number      // 1-based, default 1
  pageSize?: number  // default 20
  categoryId?: number | null
}
```
Add `groupId`:
```ts
export interface DeviceListArgs {
  filter: 'all' | DeviceStatus
  query: string
  page?: number
  pageSize?: number
  categoryId?: number | null
  groupId?: number | null
}
```

- [ ] **Step 6: Add new arg types**

After `export interface DeleteEntityArgs { id: number }` add:
```ts
export interface SaveUserPermissionsArgs { userId: number; permissions: Permission[] }
export interface SaveUserGroupsArgs { userId: number; groupIds: number[] }
```

Also update `AppUserRow` to expose permissions and group assignments:
Find:
```ts
export interface AppUserRow { id: number; username: string; displayName: string; role: Role; active: boolean }
```
Replace with:
```ts
export interface AppUserRow {
  id: number
  username: string
  displayName: string
  role: Role
  active: boolean
  permissions: string[]
  groupIds: number[]
}
```

And `SaveUserArgs` already handles user create/edit — no changes needed there.

- [ ] **Step 7: Add new channels**

In the `CHANNELS` object, after `settingsResetData: 'settings.resetData',` add:
```ts
  settingsSaveUserPermissions: 'settings.saveUserPermissions',
  settingsSaveUserGroups: 'settings.saveUserGroups',
```

- [ ] **Step 8: Update `Api` interface**

In the `settings` block of `Api`, after `resetData(): Promise<ApiResponse<{ ok: true }>>` add:
```ts
    saveUserPermissions(args: SaveUserPermissionsArgs): Promise<ApiResponse<{ ok: true }>>
    saveUserGroups(args: SaveUserGroupsArgs): Promise<ApiResponse<{ ok: true }>>
```

In the `catalog` block, update `saveGroup` signature to match new `SaveGroupArgs` (already typed via the interface — no Api change needed since it uses the type).

- [ ] **Step 9: Update existing test session setups**

The settings.test.ts sets `session.current` without the new fields. Open `electron/main/handlers/settings.test.ts`. Find and replace every occurrence of `session.current = { id: N, username: '...', role: '...', displayName: '...' }` with the expanded form. There are two:

```ts
// Line ~18: admin setup
session.current = {
  id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
  permissions: [], groupIds: [],
}
```

```ts
// Line ~46: staff setup
session.current = {
  id: 2, username: 'staff', role: 'staff', displayName: 'Staff',
  permissions: [], groupIds: [],
}
```

Open `electron/main/handlers/requests.test.ts`. Find all four occurrences of `session.current = { id: 1, ...}` and add `permissions: [], groupIds: []` to each. Example:
```ts
session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: [], groupIds: [] }
```

- [ ] **Step 10: Typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: errors only in `catalog.ts` (GroupRow missing `minStock`) and `settings.ts` (`AppUserRow` missing `permissions`/`groupIds`). All fixed in Tasks 5 and 7.

- [ ] **Step 11: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claire/worktrees/elated-brown-e34abc" 2>/dev/null || cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/shared/ipc.ts \
        equipment-manager/electron/main/handlers/auth.ts \
        equipment-manager/electron/main/handlers/settings.test.ts \
        equipment-manager/electron/main/handlers/requests.test.ts
git commit -m "feat: extend IPC contract — Permission type, SessionUser permissions/groupIds, GroupRow minStock, DeviceListArgs groupId"
```

---

## Task 3: Seed — Populate user_permissions

**Files:**
- Modify: `electron/main/db/seed.ts`

**Interfaces:**
- Consumes: `userPermissions` table from Task 1; `ALL_PERMISSIONS` from Task 2
- Produces: admin seeded with all permissions; staff seeded with `view_reports`

- [ ] **Step 1: Add import of `userPermissions` and `ALL_PERMISSIONS`**

Open `electron/main/db/seed.ts`. Find:
```ts
import {
  categories,
  departments,
  employees,
  appUsers,
  devices,
  requests,
  allocations,
} from './schema'
```
Add `userPermissions` and `userGroups`:
```ts
import {
  categories,
  departments,
  employees,
  appUsers,
  userPermissions,
  userGroups,
  devices,
  requests,
  allocations,
} from './schema'
```

Also import `ALL_PERMISSIONS` from ipc:
```ts
import { ALL_PERMISSIONS } from '@shared/ipc'
```

- [ ] **Step 2: Seed permissions after users are inserted**

In `seedIfEmpty`, after the admin user is inserted (after `const [adminUser] = tx.insert(appUsers)...`) and after the staff users insert block, add:

```ts
    // ── 4b. Seed permissions ──────────────────────────────────────────────────
    // Admin gets all permissions; staff gets view_reports only
    for (const perm of ALL_PERMISSIONS) {
      tx.insert(userPermissions).values({ userId: adminUser.id, permission: perm }).run()
    }

    // Get staff user IDs to seed view_reports
    const staffUsers = tx.select({ id: appUsers.id }).from(appUsers)
      .where(eq(appUsers.role, 'staff')).all()
    for (const u of staffUsers) {
      tx.insert(userPermissions).values({ userId: u.id, permission: 'view_reports' }).run()
    }
```

You'll need to import `eq` — check if it's already imported at the top of seed.ts. If not, add it:
```ts
import { eq } from 'drizzle-orm'
```

- [ ] **Step 3: Run tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/auth.test.ts 2>&1 | tail -15
```

Expected: all auth tests pass. The auth handler still returns `permissions: []` (placeholder from Task 2) but the seed is now inserting permissions to the DB — Task 4 will load them.

Also run settings test to ensure resetData re-seeds correctly:
```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/settings.test.ts 2>&1 | tail -10
```

Expected: all pass. The `resetData` wipe+reseed cycle will also reseed `user_permissions` now.

- [ ] **Step 4: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/db/seed.ts
git commit -m "feat: seed user_permissions — admin gets all, staff gets view_reports"
```

---

## Task 4: Auth Handler — Load permissions & groupIds at Login

**Files:**
- Modify: `electron/main/handlers/auth.ts`
- Modify: `electron/main/handlers/auth.test.ts`

**Interfaces:**
- Consumes: `userPermissions`, `userGroups` tables; `SessionUser.permissions`, `SessionUser.groupIds` from Task 2
- Produces: `session.current.permissions` and `session.current.groupIds` populated from DB on every login

- [ ] **Step 1: Write failing test**

Open `electron/main/handlers/auth.test.ts`. Add after the existing tests:

```ts
  it('sets permissions on session after login', async () => {
    const h = setup()
    const res = await h.login({ username: 'admin', password: 'admin' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.user.permissions).toContain('allocate')
      expect(res.data.user.permissions).toContain('manage_users')
      expect(res.data.user.permissions.length).toBeGreaterThan(0)
    }
  })

  it('staff user gets only view_reports permission', async () => {
    const h = setup()
    const res = await h.login({ username: 'hang.le', password: 'admin' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.user.permissions).toEqual(['view_reports'])
      expect(res.data.user.groupIds).toEqual([])
    }
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/auth.test.ts 2>&1 | tail -15
```

Expected: the two new tests FAIL (permissions is `[]` because auth.ts returns placeholder empty arrays).

- [ ] **Step 3: Update `auth.ts` to load permissions and groupIds**

Open `electron/main/handlers/auth.ts`. Add imports for the new tables:
```ts
import { eq } from 'drizzle-orm'
import type { AppDb } from '../db'
import { appUsers, userPermissions, userGroups } from '../db/schema'
import { session } from '../session'
import type { LoginArgs, ApiResponse, LoginResult, SessionUser, Role } from '@shared/ipc'
```

Replace the login handler body (after `bcrypt.compareSync` passes) with:
```ts
      const perms = db.select({ permission: userPermissions.permission })
        .from(userPermissions)
        .where(eq(userPermissions.userId, row.id))
        .all()
        .map((p) => p.permission)

      const gids = db.select({ groupId: userGroups.groupId })
        .from(userGroups)
        .where(eq(userGroups.userId, row.id))
        .all()
        .map((g) => g.groupId)

      const user: SessionUser = {
        id: row.id, username: row.username, role: row.role as Role,
        displayName: row.displayName, permissions: perms, groupIds: gids,
      }
      session.current = user
      return { ok: true, data: { user } }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/auth.test.ts 2>&1 | tail -15
```

Expected: all 6 auth tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | grep "auth.ts" | head -10
```

Expected: no errors in `auth.ts`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/auth.ts \
        equipment-manager/electron/main/handlers/auth.test.ts
git commit -m "feat: load permissions and groupIds from DB at login"
```

---

## Task 5: Catalog Handler — Group minStock

**Files:**
- Modify: `electron/main/handlers/catalog.ts`
- Modify: `electron/main/handlers/catalog.test.ts`

**Interfaces:**
- Consumes: `deviceGroups.minStock` from Task 1; `GroupRow.minStock`, `SaveGroupArgs.minStock` from Task 2
- Produces: `catalog.list` returns `minStock` on groups; `catalog.saveGroup` reads/writes `minStock`

- [ ] **Step 1: Write failing tests**

Open `electron/main/handlers/catalog.test.ts`. Add:

```ts
describe('catalog.saveGroup — minStock', () => {
  function setup() {
    const { db } = createDb(':memory:')
    runMigrations(db)
    seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: [], groupIds: [] }
    return makeCatalogHandlers(db)
  }

  it('creates a group with minStock and list returns it', async () => {
    const h = setup()
    // Need a category id — get one from list
    const listRes = await h.list()
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    const catId = listRes.data.categories[0].id

    await h.saveGroup({ name: 'Test Group', categoryId: catId, minStock: 3 })
    const res2 = await h.list()
    if (!res2.ok) return
    const grp = res2.data.groups.find((g) => g.name === 'Test Group')
    expect(grp).toBeDefined()
    expect(grp?.minStock).toBe(3)
  })

  it('updates minStock on existing group', async () => {
    const h = setup()
    const listRes = await h.list()
    if (!listRes.ok) return
    const catId = listRes.data.categories[0].id

    await h.saveGroup({ name: 'Grp A', categoryId: catId, minStock: 2 })
    const mid = await h.list()
    if (!mid.ok) return
    const grp = mid.data.groups.find((g) => g.name === 'Grp A')!

    await h.saveGroup({ id: grp.id, name: 'Grp A', categoryId: catId, minStock: 7 })
    const final = await h.list()
    if (!final.ok) return
    expect(final.data.groups.find((g) => g.id === grp.id)?.minStock).toBe(7)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/catalog.test.ts 2>&1 | tail -15
```

Expected: the new tests FAIL (minStock missing from GroupRow mapping and saveGroup).

- [ ] **Step 3: Update `catalog.ts` — list returns minStock**

In `catalog.ts`, find the `grps` select block:
```ts
      const grps = db
        .select({
          id: deviceGroups.id,
          name: deviceGroups.name,
          categoryId: deviceGroups.categoryId,
          categoryName: categories.name,
        })
```
Add `minStock`:
```ts
      const grps = db
        .select({
          id: deviceGroups.id,
          name: deviceGroups.name,
          categoryId: deviceGroups.categoryId,
          minStock: deviceGroups.minStock,
          categoryName: categories.name,
        })
```

Find the groups mapping:
```ts
          groups: grps.map<GroupRow>((g) => ({
            id: g.id,
            name: g.name,
            categoryId: g.categoryId ?? 0,
            categoryName: g.categoryName ?? '',
          })),
```
Add `minStock`:
```ts
          groups: grps.map<GroupRow>((g) => ({
            id: g.id,
            name: g.name,
            categoryId: g.categoryId ?? 0,
            categoryName: g.categoryName ?? '',
            minStock: g.minStock ?? 0,
          })),
```

- [ ] **Step 4: Update `catalog.ts` — saveGroup writes minStock**

Find the `saveGroup` update branch:
```ts
        db.update(deviceGroups)
          .set({ name: args.name.trim(), categoryId: args.categoryId })
          .where(eq(deviceGroups.id, args.id))
          .run()
```
Add `minStock`:
```ts
        db.update(deviceGroups)
          .set({ name: args.name.trim(), categoryId: args.categoryId, minStock: args.minStock ?? 0 })
          .where(eq(deviceGroups.id, args.id))
          .run()
```

Find the insert branch:
```ts
        db.insert(deviceGroups)
          .values({ name: args.name.trim(), categoryId: args.categoryId, createdAt: now() })
          .run()
```
Add `minStock`:
```ts
        db.insert(deviceGroups)
          .values({ name: args.name.trim(), categoryId: args.categoryId, minStock: args.minStock ?? 0, createdAt: now() })
          .run()
```

- [ ] **Step 5: Run tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/catalog.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck 2>&1 | grep "catalog" | head -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/catalog.ts \
        equipment-manager/electron/main/handlers/catalog.test.ts
git commit -m "feat: add minStock to device group create/update and catalog list"
```

---

## Task 6: Devices Handler — Group Filter

**Files:**
- Modify: `electron/main/handlers/devices.ts`
- Modify: `electron/main/handlers/devices.test.ts`

**Interfaces:**
- Consumes: `DeviceListArgs.groupId` from Task 2
- Produces: `devices.list` filters by `groupId` when supplied, composing with category + status + search filters

- [ ] **Step 1: Write failing test**

Open `electron/main/handlers/devices.test.ts`. Add after the existing pagination describe block:

```ts
describe('devices.list — groupId filter', () => {
  it('returns empty list when filtering by a groupId with no devices', async () => {
    const h = setup()
    // First create a group via catalog handler to get a valid groupId.
    // Use a groupId that definitely has no devices (9999 — doesn't exist).
    // Handler should return empty result, not error.
    const res = await h.list({ filter: 'all', query: '', groupId: 9999 })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.devices.length).toBe(0)
  })

  it('composes groupId filter with status filter', async () => {
    const h = setup()
    // groupId null returns all devices (same as no groupId)
    const all = await h.list({ filter: 'all', query: '', groupId: null })
    const noArg = await h.list({ filter: 'all', query: '' })
    expect(all.ok && noArg.ok).toBe(true)
    if (all.ok && noArg.ok) {
      expect(all.data.total).toBe(noArg.data.total)
    }
  })
})
```

- [ ] **Step 2: Run tests to confirm second test passes and first passes** (groupId=9999 returns empty — depends on implementation, may already pass if handler ignores unknown groupId)

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/devices.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Update `devices.ts` — apply groupId filter**

Open `electron/main/handlers/devices.ts`. Find the section that applies `categoryId` filter (around "Apply categoryId filter FIRST"):

```ts
      // Apply categoryId filter FIRST so counts are scoped to the selected category
      if (args.categoryId != null) {
        deviceRows = deviceRows.filter((d) => d.categoryId === args.categoryId)
      }
```

Add the group filter immediately after (group filter applies within the category scope):
```ts
      // Apply categoryId filter FIRST so counts are scoped to the selected category
      if (args.categoryId != null) {
        deviceRows = deviceRows.filter((d) => d.categoryId === args.categoryId)
      }

      // Apply groupId filter within the category scope; also affects counts
      if (args.groupId != null) {
        deviceRows = deviceRows.filter((d) => d.groupId === args.groupId)
      }
```

- [ ] **Step 4: Run all tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/devices.test.ts 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/devices.ts \
        equipment-manager/electron/main/handlers/devices.test.ts
git commit -m "feat: add groupId filter to devices.list"
```

---

## Task 7: Settings Handler — requirePermission + saveUserPermissions + saveUserGroups

**Files:**
- Modify: `electron/main/handlers/settings.ts`
- Modify: `electron/main/handlers/settings.test.ts`

**Interfaces:**
- Consumes: `userPermissions`, `userGroups` tables; `Permission`, `SaveUserPermissionsArgs`, `SaveUserGroupsArgs`, `ALL_PERMISSIONS`, `AppUserRow.permissions/groupIds` from Task 2
- Produces: `requirePermission(key)` helper (exported); `saveUserPermissions`, `saveUserGroups` handlers; `listUsers` returns `permissions` and `groupIds`; `resetData` uses `requirePermission('reset_data')`

- [ ] **Step 1: Write failing tests**

Open `electron/main/handlers/settings.test.ts`. Add imports and new describe blocks:

```ts
import { userPermissions, userGroups } from '../db/schema'
import { ALL_PERMISSIONS } from '@shared/ipc'
```

Add at the end of the file:

```ts
describe('settings.listUsers — includes permissions', () => {
  beforeEach(() => {
    session.current = {
      id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
      permissions: ALL_PERMISSIONS, groupIds: [],
    }
  })

  it('returns permissions for each user', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    const res = await h.listUsers()
    expect(res.ok).toBe(true)
    if (res.ok) {
      const admin = res.data.find((u) => u.username === 'admin')
      expect(admin?.permissions).toContain('allocate')
      const staff = res.data.find((u) => u.username === 'hang.le')
      expect(staff?.permissions).toEqual(['view_reports'])
    }
  })
})

describe('settings.saveUserPermissions', () => {
  beforeEach(() => {
    session.current = {
      id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
      permissions: ALL_PERMISSIONS, groupIds: [],
    }
  })

  it('replaces all permissions for a user', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    // Get staff user id
    const listRes = await h.listUsers()
    if (!listRes.ok) return
    const staff = listRes.data.find((u) => u.role === 'staff' && u.active)!

    const res = await h.saveUserPermissions({ userId: staff.id, permissions: ['allocate', 'return_device'] })
    expect(res.ok).toBe(true)

    const updated = await h.listUsers()
    if (!updated.ok) return
    const u = updated.data.find((x) => x.id === staff.id)
    expect(u?.permissions).toEqual(expect.arrayContaining(['allocate', 'return_device']))
    expect(u?.permissions).not.toContain('view_reports')
  })

  it('rejects caller without manage_users permission', async () => {
    const db = freshDb()
    session.current = { id: 2, username: 'staff', role: 'staff', displayName: 'Staff', permissions: [], groupIds: [] }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = await h.saveUserPermissions({ userId: 1, permissions: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })
})

describe('settings.saveUserGroups', () => {
  beforeEach(() => {
    session.current = {
      id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
      permissions: ALL_PERMISSIONS, groupIds: [],
    }
  })

  it('assigns groups to a user and replaces on re-save', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    const listRes = await h.listUsers()
    if (!listRes.ok) return
    const staff = listRes.data.find((u) => u.role === 'staff' && u.active)!

    // Need a real group id — create one via catalog handler
    const { makeCatalogHandlers } = await import('./catalog')
    const catalogH = makeCatalogHandlers(db)
    const catList = await catalogH.list()
    if (!catList.ok) return
    const catId = catList.data.categories[0].id
    await catalogH.saveGroup({ name: 'Test Grp', categoryId: catId, minStock: 0 })
    const updated = await catalogH.list()
    if (!updated.ok) return
    const grpId = updated.data.groups.find((g) => g.name === 'Test Grp')!.id

    const res = await h.saveUserGroups({ userId: staff.id, groupIds: [grpId] })
    expect(res.ok).toBe(true)

    const u2 = await h.listUsers()
    if (!u2.ok) return
    expect(u2.data.find((x) => x.id === staff.id)?.groupIds).toContain(grpId)
  })
})

describe('settings.resetData — permission check', () => {
  it('rejects caller without reset_data permission', () => {
    const db = freshDb()
    session.current = {
      id: 2, username: 'staff', role: 'staff', displayName: 'Staff',
      permissions: ['view_reports'], groupIds: [],
    }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = h.resetData()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })

  it('allows caller with reset_data permission regardless of role', () => {
    const db = freshDb()
    session.current = {
      id: 2, username: 'staff', role: 'staff', displayName: 'Staff',
      permissions: ['reset_data'], groupIds: [],
    }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = h.resetData()
    expect(res.ok).toBe(true)
  })
})
```

Also update the existing `resetData` test session setups (they currently use the old shape):
Find both session.current assignments in the existing `settings.resetData` describe block and expand them:
```ts
// admin setup
session.current = {
  id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
  permissions: ALL_PERMISSIONS, groupIds: [],
}
// staff setup (in 'rejects non-admin callers' test)
session.current = {
  id: 2, username: 'staff', role: 'staff', displayName: 'Staff',
  permissions: [], groupIds: [],
}
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/settings.test.ts 2>&1 | tail -20
```

Expected: new tests FAIL; existing tests PASS.

- [ ] **Step 3: Update `settings.ts` — imports + requirePermission helper**

Open `electron/main/handlers/settings.ts`. Add to imports:
```ts
import {
  appUsers,
  allocations,
  maintenanceLogs,
  requests,
  devices,
  employees,
  categories,
  departments,
  userPermissions,
  userGroups,
} from '../db/schema'
```

Add the `Permission` import:
```ts
import type {
  ApiResponse,
  AppUserRow,
  SaveUserArgs,
  SaveUserPermissionsArgs,
  SaveUserGroupsArgs,
  ChangePasswordArgs,
  DbInfoResult,
  Role,
  Permission,
} from '@shared/ipc'
```

Add the helper function before `makeSettingsHandlers`:
```ts
function requirePermission(perm: Permission): ApiResponse<never> | null {
  if (!session.current?.permissions.includes(perm)) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } }
  }
  return null
}
```

Export it for use by other handlers:
```ts
export function requirePermission(perm: Permission): ApiResponse<never> | null {
  if (!session.current?.permissions.includes(perm)) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } }
  }
  return null
}
```

- [ ] **Step 4: Update `listUsers` to return permissions and groupIds**

In `listUsers`, replace the mapping:
```ts
      return {
        ok: true,
        data: rows.map<AppUserRow>((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          role: u.role as Role,
          active: u.active === 1,
        })),
      }
```

With:
```ts
      return {
        ok: true,
        data: rows.map<AppUserRow>((u) => {
          const perms = db.select({ permission: userPermissions.permission })
            .from(userPermissions)
            .where(eq(userPermissions.userId, u.id))
            .all()
            .map((p) => p.permission)
          const gids = db.select({ groupId: userGroups.groupId })
            .from(userGroups)
            .where(eq(userGroups.userId, u.id))
            .all()
            .map((g) => g.groupId)
          return {
            id: u.id, username: u.username, displayName: u.displayName,
            role: u.role as Role, active: u.active === 1,
            permissions: perms, groupIds: gids,
          }
        }),
      }
```

- [ ] **Step 5: Update `resetData` to use requirePermission**

Find:
```ts
      if (session.current?.role !== 'admin') {
        return { ok: false, error: { code: 'FORBIDDEN', message: 'Chỉ quản trị viên mới được làm mới dữ liệu.' } }
      }
```
Replace with:
```ts
      const forbidden = requirePermission('reset_data')
      if (forbidden) return forbidden
```

- [ ] **Step 6: Add `saveUserPermissions` handler**

In the returned object of `makeSettingsHandlers`, add:

```ts
    async saveUserPermissions(args: SaveUserPermissionsArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_users')
      if (forbidden) return forbidden
      if (!args?.userId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'userId không hợp lệ.' } }
      }
      db.delete(userPermissions).where(eq(userPermissions.userId, args.userId)).run()
      for (const perm of (args.permissions ?? [])) {
        db.insert(userPermissions).values({ userId: args.userId, permission: perm }).run()
      }
      return { ok: true, data: { ok: true } }
    },
```

- [ ] **Step 7: Add `saveUserGroups` handler**

```ts
    async saveUserGroups(args: SaveUserGroupsArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_users')
      if (forbidden) return forbidden
      if (!args?.userId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'userId không hợp lệ.' } }
      }
      db.delete(userGroups).where(eq(userGroups.userId, args.userId)).run()
      for (const gid of (args.groupIds ?? [])) {
        db.insert(userGroups).values({ userId: args.userId, groupId: gid }).run()
      }
      return { ok: true, data: { ok: true } }
    },
```

- [ ] **Step 8: Run all tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/settings.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 9: Typecheck**

```bash
npm run typecheck 2>&1 | grep "settings" | head -10
```

- [ ] **Step 10: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/settings.ts \
        equipment-manager/electron/main/handlers/settings.test.ts
git commit -m "feat: add requirePermission helper, saveUserPermissions, saveUserGroups; enforce reset_data permission"
```

---

## Task 8: Handler Enforcement Sweep

**Files:**
- Modify: `electron/main/handlers/devices.ts`
- Modify: `electron/main/handlers/devices.test.ts`
- Modify: `electron/main/handlers/requests.ts`
- Modify: `electron/main/handlers/allocate.ts`
- Modify: `electron/main/handlers/catalog.ts`

**Interfaces:**
- Consumes: `requirePermission` from Task 7; `Permission` type from Task 2
- Produces: all write handlers require a specific permission; a staff user with no permissions gets FORBIDDEN on every write

- [ ] **Step 1: Update devices.ts — wire requirePermission**

Open `electron/main/handlers/devices.ts`. Add import:
```ts
import { requirePermission } from './settings'
```

Add the permission check as the **first line** of each write handler:

In `create`:
```ts
    async create(args: DeviceCreateArgs): Promise<ApiResponse<{ sku: string }>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
      // ...existing validation...
```

In `update`:
```ts
    async update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
```

In `changeStatus`:
```ts
    async changeStatus(args: DeviceChangeStatusArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('change_status')
      if (forbidden) return forbidden
```

In `delete`:
```ts
    async delete(args: DeviceDeleteArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('delete_device')
      if (forbidden) return forbidden
```

- [ ] **Step 2: Update devices.test.ts — add permission test + update session setups**

Open `electron/main/handlers/devices.test.ts`. Find the `setup()` function near the top that sets `session.current`. If it sets session directly, update it to include `permissions: ALL_PERMISSIONS, groupIds: []`. Add import `ALL_PERMISSIONS` from `@shared/ipc`.

Add a describe block:
```ts
describe('devices — permission enforcement', () => {
  it('rejects devices.create for session without edit_device', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db)
    seedIfEmpty(db)
    session.current = {
      id: 2, username: 'staff', role: 'staff', displayName: 'Staff',
      permissions: ['view_reports'], groupIds: [],
    }
    const h = makeDeviceHandlers(db)
    const res = await h.create({ sku: 'X-001', name: 'Test', categoryId: null, serialNumber: null, notes: null, groupId: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })
})
```

- [ ] **Step 3: Update requests.ts — wire requirePermission**

Open `electron/main/handlers/requests.ts`. Add import:
```ts
import { requirePermission } from './settings'
```

In `returnDevice` (find the handler that returns a device from allocation):
```ts
      const forbidden = requirePermission('return_device')
      if (forbidden) return forbidden
```

In `create` (the request creation handler):
```ts
      const forbidden = requirePermission('create_request')
      if (forbidden) return forbidden
```

- [ ] **Step 4: Update allocate.ts — wire requirePermission**

Open `electron/main/handlers/allocate.ts`. Add import:
```ts
import { requirePermission } from './settings'
```

In `create`:
```ts
      const forbidden = requirePermission('allocate')
      if (forbidden) return forbidden
```

In `quickAllocate`:
```ts
      const forbidden = requirePermission('allocate')
      if (forbidden) return forbidden
```

- [ ] **Step 5: Update catalog.ts — wire requirePermission on all write methods**

Open `electron/main/handlers/catalog.ts`. Add import:
```ts
import { requirePermission } from './settings'
```

Add `requirePermission('manage_catalog')` as the first line of: `saveCategory`, `deleteCategory`, `saveDepartment`, `deleteDepartment`, `saveEmployee`, `deleteEmployee`, `saveGroup`, `deleteGroup`.

Example for `saveCategory`:
```ts
    async saveCategory(args: SaveCategoryArgs): Promise<ApiResponse<CategoryRow>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      // ...existing code...
```

Repeat the same pattern for the other 7 write methods.

- [ ] **Step 6: Run all tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -20
```

Expected: all tests PASS. The existing test setups with `permissions: []` will now get FORBIDDEN on write operations — check whether any existing tests call write handlers. If they do, update those tests to use `permissions: ALL_PERMISSIONS` in their session setup.

If any test fails because of the permission check on a write handler, find the `session.current` setup for that test and add `permissions: ALL_PERMISSIONS`:
```ts
session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/devices.ts \
        equipment-manager/electron/main/handlers/devices.test.ts \
        equipment-manager/electron/main/handlers/requests.ts \
        equipment-manager/electron/main/handlers/allocate.ts \
        equipment-manager/electron/main/handlers/catalog.ts
git commit -m "feat: enforce permissions on all write handlers (edit_device, change_status, delete_device, allocate, return_device, create_request, manage_catalog)"
```

---

## Task 9: Register Channels + Preload

**Files:**
- Modify: `electron/main/handlers/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `CHANNELS.settingsSaveUserPermissions`, `CHANNELS.settingsSaveUserGroups` from Task 2; `settingsH.saveUserPermissions`, `settingsH.saveUserGroups` from Task 7
- Produces: `window.api.settings.saveUserPermissions` and `window.api.settings.saveUserGroups` available to renderer

- [ ] **Step 1: Register in `index.ts`**

Open `electron/main/handlers/index.ts`. Find:
```ts
  ipcMain.handle(CHANNELS.settingsResetData, () => auth_guard(() => settingsH.resetData()))
```
Add after it:
```ts
  ipcMain.handle(CHANNELS.settingsSaveUserPermissions, (_e, args) => auth_guard(() => settingsH.saveUserPermissions(args)))
  ipcMain.handle(CHANNELS.settingsSaveUserGroups, (_e, args) => auth_guard(() => settingsH.saveUserGroups(args)))
```

- [ ] **Step 2: Expose in `preload/index.ts`**

Open `electron/preload/index.ts`. Find the `settings` block. It looks like:
```ts
  settings: {
    listUsers: (args) => ipcRenderer.invoke(CHANNELS.settingsListUsers, args),
    saveUser: (args) => ipcRenderer.invoke(CHANNELS.settingsSaveUser, args),
    changePassword: (args) => ipcRenderer.invoke(CHANNELS.settingsChangePassword, args),
    dbInfo: () => ipcRenderer.invoke(CHANNELS.settingsDbInfo),
    resetData: () => ipcRenderer.invoke(CHANNELS.settingsResetData),
  },
```
Add the two new methods:
```ts
  settings: {
    listUsers: (args) => ipcRenderer.invoke(CHANNELS.settingsListUsers, args),
    saveUser: (args) => ipcRenderer.invoke(CHANNELS.settingsSaveUser, args),
    changePassword: (args) => ipcRenderer.invoke(CHANNELS.settingsChangePassword, args),
    dbInfo: () => ipcRenderer.invoke(CHANNELS.settingsDbInfo),
    resetData: () => ipcRenderer.invoke(CHANNELS.settingsResetData),
    saveUserPermissions: (args) => ipcRenderer.invoke(CHANNELS.settingsSaveUserPermissions, args),
    saveUserGroups: (args) => ipcRenderer.invoke(CHANNELS.settingsSaveUserGroups, args),
  },
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/index.ts \
        equipment-manager/electron/preload/index.ts
git commit -m "feat: register and expose saveUserPermissions and saveUserGroups channels"
```

---

## Task 10: useDevices Hook — groupId Param

**Files:**
- Modify: `src/hooks/useDevices.ts`

**Interfaces:**
- Consumes: `DeviceListArgs.groupId` from Task 2
- Produces: `useDevices(filter, query, page, pageSize, groupId?)` — consumed by Devices page in Task 13

- [ ] **Step 1: Update `useDevices.ts`**

Open `src/hooks/useDevices.ts`. Find the current signature:
```ts
export function useDevices(
  filter: 'all' | DeviceStatus,
  query: string,
  page = 1,
  pageSize = 20,
) {
  return useQuery({
    queryKey: ['devices', filter, query, page, pageSize],
    queryFn: () => unwrap(api.devices.list({ filter, query, page, pageSize })),
  })
}
```
Replace with:
```ts
export function useDevices(
  filter: 'all' | DeviceStatus,
  query: string,
  page = 1,
  pageSize = 20,
  groupId: number | null = null,
) {
  return useQuery({
    queryKey: ['devices', filter, query, page, pageSize, groupId],
    queryFn: () => unwrap(api.devices.list({ filter, query, page, pageSize, groupId: groupId ?? undefined })),
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | grep "useDevices" | head -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claire/worktrees/elated-brown-e34abc" 2>/dev/null || cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/hooks/useDevices.ts
git commit -m "feat: add groupId param to useDevices hook"
```

---

## Task 11: AuthContext — hasPermission + Update All Write Gates

**Files:**
- Modify: `src/context/AuthContext.tsx`
- Modify: multiple `src/pages/*.tsx` files that use `isAdmin` for write gates

**Interfaces:**
- Consumes: `SessionUser.permissions`, `SessionUser.groupIds`, `Permission` from Task 2
- Produces: `useAuth().hasPermission(key)`, `useAuth().permissions`, `useAuth().groupIds` — consumed by all pages

- [ ] **Step 1: Update `AuthContext.tsx`**

Open `src/context/AuthContext.tsx`. Find where it reads from `SessionUser` and exposes `isAdmin`. Add:

```ts
import type { Permission } from '@shared/ipc'
```

In the context value, add:
```ts
  const permissions = user?.permissions ?? []
  const groupIds = user?.groupIds ?? []
  const hasPermission = (key: Permission) => permissions.includes(key)
```

Expose them in the context object:
```ts
  return (
    <AuthContext.Provider value={{
      user, isAdmin: user?.role === 'admin', isLoggedIn: !!user,
      permissions, groupIds, hasPermission,
      login, logout,
    }}>
```

Update the context type to include the new fields. Find the interface/type for `AuthContextValue` and add:
```ts
  permissions: string[]
  groupIds: number[]
  hasPermission(key: Permission): boolean
```

- [ ] **Step 2: Update write-gated UI elements across pages**

Find every `isAdmin &&` guard on a write action (button, section, etc.) and replace with `hasPermission(key)`. Read-only display sections (`isAdmin` for the Users section in Settings) stay as `isAdmin`.

Check which pages use `isAdmin`:
```bash
grep -rn "isAdmin" "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager/src/" | grep -v "\.d\.ts"
```

For each write-action gate found, replace `isAdmin` with `hasPermission('relevant_key')`:

| UI Element | Permission |
|---|---|
| "Thêm thiết bị" button | `edit_device` |
| "Sửa" device button | `edit_device` |
| "Đổi trạng thái" button | `change_status` |
| "Xóa" device button | `delete_device` |
| Allocation actions (Cấp phát) | `allocate` |
| "Thu hồi" (return) button | `return_device` |
| "Tạo phiếu" button | `create_request` |
| Catalog save/delete buttons | `manage_catalog` |

The Settings "Quản lý tài khoản" section should stay gated by `isAdmin` (display-only role label; the actual save goes through `manage_users` permission enforcement in the handler).

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/context/AuthContext.tsx \
        equipment-manager/src/pages/
git commit -m "feat: add hasPermission to AuthContext; switch all write gates from isAdmin to hasPermission"
```

---

## Task 12: Catalog UI — Group minStock Field

**Files:**
- Modify: `src/pages/Catalog.tsx`

**Interfaces:**
- Consumes: `GroupRow.minStock`, `SaveGroupArgs.minStock` from Task 2; `catalog.saveGroup` accepting `minStock`
- Produces: group edit form shows "Tồn kho tối thiểu" field; value is saved and reflected in the list

- [ ] **Step 1: Update `CategoriesTab` in `Catalog.tsx`**

Open `src/pages/Catalog.tsx`. Find the group editing state:
```ts
  const [editGroupName, setEditGroupName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
```
Add minStock state:
```ts
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupMin, setEditGroupMin] = useState(0)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupMin, setNewGroupMin] = useState(0)
```

Find where `editGroupId` is set (when user clicks edit on a group row). Add `setEditGroupMin(g.minStock)` alongside `setEditGroupName(g.name)`.

Find the group save mutation call. It currently passes `{ id, name, categoryId }`. Update to pass `minStock`:
```ts
saveGroupMut.mutate({ id: editGroupId, name: editGroupName, categoryId: selectedCatId!, minStock: editGroupMin })
```
And for the new group save:
```ts
saveGroupMut.mutate({ name: newGroupName, categoryId: selectedCatId!, minStock: newGroupMin })
```

Find the group edit form fields (the inline row where name is edited). After the name input, add a minStock number input. Match the existing `InlineInput` style:

```tsx
<InlineInput
  type="number"
  min={0}
  value={editGroupMin}
  onChange={e => setEditGroupMin(Number(e.target.value))}
  style={{ width: 64 }}
  placeholder="Min"
/>
```

Similarly, in the new-group row, add:
```tsx
<InlineInput
  type="number"
  min={0}
  value={newGroupMin}
  onChange={e => setNewGroupMin(Number(e.target.value))}
  style={{ width: 64 }}
  placeholder="Min"
/>
```

Update the group table column header to include a "Min" column aligned with the new input.

After `setEditGroupId(null)` and `setNewGroupName('')`, reset the minStock fields:
```ts
setEditGroupMin(0)
setNewGroupMin(0)
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | grep "Catalog" | head -10
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/pages/Catalog.tsx
git commit -m "feat: add minStock field to group edit form in Catalog"
```

---

## Task 13: Devices UI — Cascading Group Filter

**Files:**
- Modify: `src/pages/Devices.tsx`

**Interfaces:**
- Consumes: `useDevices(filter, query, page, pageSize, groupId)` from Task 10; `CatalogListResult.groups` (already fetched via existing `useQuery(['catalog'])`)
- Produces: when a category is selected, a second "Nhóm" dropdown appears showing groups in that category; selecting a group filters the device list

- [ ] **Step 1: Update `Devices.tsx` — add groupId state and cascading dropdown**

Open `src/pages/Devices.tsx`.

After the existing `filter` and `query` state declarations, add:
```ts
  const [groupId, setGroupId] = useState<number | null>(null)
```

When `filter` changes reset `groupId`, and when `categoryId` changes also reset `groupId`. Find the `useEffect` that resets `page` when filter/query changes:
```ts
  useEffect(() => { setPage(1) }, [filter, query])
```
Change it to also reset `groupId` when `categoryId` (the existing category filter state variable) changes:
```ts
  useEffect(() => { setPage(1); setGroupId(null) }, [filter, query])
```
Add another effect:
```ts
  useEffect(() => { setGroupId(null); setPage(1) }, [categoryId])
```
(where `categoryId` is the existing category filter state variable — check its actual name in the file)

Update the `useDevices` call:
```ts
  const { data, isLoading, error } = useDevices(filter, query, page, PAGE_SIZE, groupId)
```

Add a query for catalog data (if not already present for DeviceFormDialog categories):
```ts
  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
  })
```

Compute groups for the selected category:
```ts
  const selectedCategoryId = /* the existing state variable for category filter */
  const groupsForCategory = (catalogData?.groups ?? []).filter(
    (g) => g.categoryId === selectedCategoryId
  )
```

In the JSX, after the category filter dropdown and before the search input, add the group dropdown. Only render it when `selectedCategoryId != null` and `groupsForCategory.length > 0`:

```tsx
{selectedCategoryId != null && groupsForCategory.length > 0 && (
  <select
    value={groupId ?? ''}
    onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
    style={{
      height: 34, padding: '0 10px', fontSize: 13,
      border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
      background: 'var(--surface)', color: 'var(--text)', outline: 'none',
    }}
    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
  >
    <option value="">Tất cả nhóm</option>
    {groupsForCategory.map(g => (
      <option key={g.id} value={g.id}>{g.name}</option>
    ))}
  </select>
)}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | grep "Devices" | head -10
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/pages/Devices.tsx
git commit -m "feat: add cascading group filter dropdown to Devices page"
```

---

## Task 14: Settings UI — Permission Checklist + Group Picker

**Files:**
- Modify: `src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `AppUserRow.permissions`, `AppUserRow.groupIds`; `api.settings.saveUserPermissions`, `api.settings.saveUserGroups`; `CatalogListResult.groups`; `ALL_PERMISSIONS`, `Permission` from `@shared/ipc`
- Produces: user-edit modal has permission checklist and group multi-select; saving calls `saveUser` then `saveUserPermissions` then `saveUserGroups`

- [ ] **Step 1: Update imports in `Settings.tsx`**

Open `src/pages/Settings.tsx`. Add:
```ts
import type { AppUserRow, SaveUserArgs, Role, Permission } from '@shared/ipc'
import { ALL_PERMISSIONS } from '@shared/ipc'
import { useQuery } from '@tanstack/react-query'
```

The `useQuery` import may already exist. Add it if not.

- [ ] **Step 2: Add permission labels map**

Near the top of `Settings.tsx` (after imports):
```ts
const PERMISSION_LABELS: Record<Permission, string> = {
  allocate: 'Cấp phát thiết bị',
  return_device: 'Thu hồi thiết bị',
  create_request: 'Tạo phiếu đề nghị',
  edit_device: 'Sửa thông tin thiết bị',
  change_status: 'Đổi trạng thái thiết bị',
  delete_device: 'Xóa thiết bị',
  manage_catalog: 'Quản lý danh mục',
  manage_users: 'Quản lý tài khoản',
  reset_data: 'Làm mới dữ liệu',
  view_reports: 'Xem báo cáo',
}
```

- [ ] **Step 3: Update `UserModal` state + save flow**

In `UserModal`, add state for permissions and groups:
```ts
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>((user?.permissions ?? []) as Permission[])
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(user?.groupIds ?? [])
```

Add a catalog query to get available groups:
```ts
  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
  })
  const availableGroups = catalogData?.groups ?? []
```

Update the `save` function to call `saveUserPermissions` and `saveUserGroups` after `saveUser` succeeds. Replace the existing `mut.mutate(...)` call with a sequential flow:

```ts
  const permMut = useMutation({
    mutationFn: (args: { userId: number; permissions: Permission[] }) =>
      unwrap(api.settings.saveUserPermissions(args)),
  })
  const groupMut = useMutation({
    mutationFn: (args: { userId: number; groupIds: number[] }) =>
      unwrap(api.settings.saveUserGroups(args)),
  })

  const mut = useMutation({
    mutationFn: (args: SaveUserArgs) => unwrap(api.settings.saveUser(args)),
    onSuccess: async (saved) => {
      await permMut.mutateAsync({ userId: saved.id, permissions: selectedPerms })
      await groupMut.mutateAsync({ userId: saved.id, groupIds: selectedGroupIds })
      qc.invalidateQueries({ queryKey: ['settings', 'users'] })
      onClose()
    },
    onError: (e) => setErr((e as Error).message),
  })
```

Get the current user id from the saved result. Note: `saveUser` returns `AppUserRow` which has `id`.

- [ ] **Step 4: Add permission checklist to modal JSX**

In the modal form JSX (before the footer), add a permission section:

```tsx
<div>
  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
    Quyền hạn
  </div>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
    {ALL_PERMISSIONS.map(perm => {
      const isSelfLocked = !isNew && user?.id === currentUserId && (perm === 'manage_users' || perm === 'reset_data')
      return (
        <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isSelfLocked ? 'not-allowed' : 'pointer', fontSize: 13, opacity: isSelfLocked ? 0.5 : 1 }}>
          <input
            type="checkbox"
            checked={selectedPerms.includes(perm)}
            disabled={isSelfLocked}
            onChange={e => {
              if (e.target.checked) setSelectedPerms(prev => [...prev, perm])
              else setSelectedPerms(prev => prev.filter(p => p !== perm))
            }}
          />
          {PERMISSION_LABELS[perm]}
        </label>
      )
    })}
  </div>
</div>
```

You need `currentUserId` — get it from `useAuth()`:
```ts
  const { user: currentUser } = useAuth()
  const currentUserId = currentUser?.id
```

- [ ] **Step 5: Add group picker to modal JSX**

After the permission checklist, add a group multi-select (only show when there are groups):

```tsx
{availableGroups.length > 0 && (
  <div>
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
      Nhóm phụ trách
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {availableGroups.map(g => (
        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: selectedGroupIds.includes(g.id) ? 'var(--primary-soft)' : 'var(--surface)' }}>
          <input
            type="checkbox"
            checked={selectedGroupIds.includes(g.id)}
            onChange={e => {
              if (e.target.checked) setSelectedGroupIds(prev => [...prev, g.id])
              else setSelectedGroupIds(prev => prev.filter(id => id !== g.id))
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 2 }}>{g.categoryName}</span>
          {g.name}
        </label>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck 2>&1 | grep "Settings" | head -10
```

- [ ] **Step 7: Run all tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/pages/Settings.tsx
git commit -m "feat: add permission checklist and group picker to user edit modal"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `minStock` on `device_groups` | Task 1, 5, 12 |
| Cascading group filter on Devices page | Task 2, 6, 10, 13 |
| `user_groups` table (user–group assignment) | Task 1, 7, 9, 14 |
| `user_permissions` junction table | Task 1, 3, 4, 7, 9 |
| `Permission` type + `ALL_PERMISSIONS` | Task 2 |
| `SessionUser.permissions`, `SessionUser.groupIds` | Task 2, 4 |
| `requirePermission` helper | Task 7 |
| `resetData` enforces `reset_data` permission | Task 7 |
| Write handlers enforce specific permissions | Task 8 |
| `saveUserPermissions`, `saveUserGroups` channels | Task 7, 9 |
| `listUsers` returns `permissions` + `groupIds` | Task 7 |
| `AuthContext.hasPermission` | Task 11 |
| All UI write gates → `hasPermission` | Task 11 |
| Catalog UI: group minStock field | Task 12 |
| Settings UI: permission checklist | Task 14 |
| Settings UI: group picker | Task 14 |
| Self-lockout: admin cannot remove own `manage_users`/`reset_data` | Task 14 |
| Seed: admin gets all, staff gets `view_reports` | Task 3 |
| Acceptance: staff with no perms gets FORBIDDEN on all writes | Task 8 |
| Acceptance: group filter composes with status + search | Task 6 |

### Type consistency check

- `GroupRow.minStock: number` — defined Task 2, populated in `catalog.list` Task 5, read in Catalog UI Task 12. ✓
- `SaveGroupArgs.minStock: number` — defined Task 2, used in catalog.saveGroup Task 5, sent from Catalog UI Task 12. ✓
- `SessionUser.permissions: string[]` / `SessionUser.groupIds: number[]` — defined Task 2, populated in auth.ts Task 4, used by `requirePermission` Task 7, exposed via AuthContext Task 11. ✓
- `AppUserRow.permissions` / `AppUserRow.groupIds` — defined Task 2, populated in `listUsers` Task 7, consumed in Settings UI Task 14. ✓
- `SaveUserPermissionsArgs` / `SaveUserGroupsArgs` — defined Task 2, implemented in Task 7, called from Settings UI Task 14. ✓
- `useDevices(..., groupId)` — signature updated Task 10, consumed by Devices page Task 13. ✓
- `requirePermission` — exported from `settings.ts` Task 7, imported by devices, requests, allocate, catalog in Task 8. ✓
