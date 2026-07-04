# Configurable Daily Auto-Logout Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin configure a single daily `HH:mm` time; whoever is logged in when the app's clock crosses that time gets automatically logged out.

**Architecture:** A new singleton `app_config` DB row stores `{ autoLogoutEnabled, autoLogoutTime }`, exposed via two new IPC channels (`settings.getAutoLogout` / `settings.saveAutoLogout`). The renderer polls this config every 20s against the wall clock (mirroring the existing `Timer.tsx` `setInterval` pattern) and calls the existing `AuthContext.logout()` when the configured time is crossed while a session is active. Enforcement is entirely client-side — there is no main-process push event.

**Tech Stack:** Electron + React 18, TanStack Query, Drizzle ORM over `better-sqlite3`, Vitest.

Full design rationale: `docs/superpowers/specs/2026-07-04-auto-logout-schedule-design.md`.

## Global Constraints

- All user-facing strings are Vietnamese, matching the rest of the app.
- Time format is 24-hour `HH:mm`, validated with `/^([01]\d|2[0-3]):([0-5]\d)$/` — device-local time, no timezone handling, no new date library (matches `Timer.tsx`'s manual-formatting convention).
- One global setting — not per-user, not per-role.
- Backend authorization for saving the config is hard-coded to `session.current?.role === 'admin'` — it must NOT be added to the delegable `Permission` enum (`ALL_PERMISSIONS` in `electron/shared/ipc.ts`).
- No new main→renderer IPC push channel (no `webContents.send`/`ipcRenderer.on`) — enforcement must be renderer-side polling only.
- The trigger fires at most once per calendar day and only on the transition across the boundary — never retroactively (logging in after the configured time has already passed today must not immediately log the user back out).

---

### Task 1: Database schema for auto-logout config

**Files:**
- Modify: `equipment-manager/electron/main/db/schema.ts`
- Modify: `equipment-manager/electron/main/db/migrate.test.ts`
- Generated (via command, do not hand-write): `equipment-manager/electron/main/db/migrations/*.sql` + `equipment-manager/electron/main/db/migrations/meta/*`

**Interfaces:**
- Produces: `appConfig` table (Drizzle table object) and `AppConfig = typeof appConfig.$inferSelect` type, both exported from `schema.ts`, for Task 2 to import.

- [ ] **Step 1: Write the failing test**

In `equipment-manager/electron/main/db/migrate.test.ts`, add `'app_config'` to the list of expected table names in the first test:

```ts
    for (const t of ['categories','departments','employees','app_users','devices','requests','allocations','maintenance_logs','app_config']) {
      expect(names).toContain(t)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd equipment-manager && npx vitest run electron/main/db/migrate.test.ts`
Expected: FAIL — `app_config` not found in `names`.

- [ ] **Step 3: Add the schema table**

In `equipment-manager/electron/main/db/schema.ts`, add after the `maintenanceLogs` table definition (before the `schema` export object):

```ts
export const appConfig = sqliteTable('app_config', {
  id: integer('id').primaryKey(),
  autoLogoutEnabled: integer('auto_logout_enabled').notNull().default(0),
  autoLogoutTime: text('auto_logout_time').notNull().default('07:30'),
})
```

Update the `schema` export object to include it:

```ts
export const schema = {
  categories, deviceGroups, departments, employees, appUsers,
  userPermissions, userGroups,
  devices, requests, allocations, maintenanceLogs,
  groupFieldTemplates, groupFieldValues,
  appConfig,
}
```

Add the inferred type next to the other type exports at the bottom of the file:

```ts
export type AppConfig = typeof appConfig.$inferSelect
```

- [ ] **Step 4: Generate the migration**

Run: `cd equipment-manager && npm run db:generate`
Expected: a new file appears under `electron/main/db/migrations/` (e.g. `0009_<name>.sql`) containing a `CREATE TABLE` for `app_config`, and `electron/main/db/migrations/meta/_journal.json` gets a new entry plus a new snapshot file. Confirm with:

`ls equipment-manager/electron/main/db/migrations/`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd equipment-manager && npx vitest run electron/main/db/migrate.test.ts`
Expected: PASS (both tests in the file).

- [ ] **Step 6: Commit**

```bash
git add equipment-manager/electron/main/db/schema.ts equipment-manager/electron/main/db/migrate.test.ts equipment-manager/electron/main/db/migrations
git commit -m "feat(db): add app_config table for auto-logout settings"
```

---

### Task 2: Backend IPC — get/save auto-logout config

**Files:**
- Modify: `equipment-manager/electron/shared/ipc.ts`
- Modify: `equipment-manager/electron/main/handlers/settings.ts`
- Modify: `equipment-manager/electron/main/handlers/settings.test.ts`
- Modify: `equipment-manager/electron/main/handlers/index.ts`
- Modify: `equipment-manager/electron/preload/index.ts`

**Interfaces:**
- Consumes: `appConfig` table + `AppConfig` type from Task 1 (`electron/main/db/schema.ts`).
- Produces: `AutoLogoutConfig` type (`{ enabled: boolean; time: string }`) from `@shared/ipc`, `CHANNELS.settingsGetAutoLogout` / `CHANNELS.settingsSaveAutoLogout`, and `makeSettingsHandlers(db, dbPath)` gaining `getAutoLogoutConfig(): Promise<ApiResponse<AutoLogoutConfig>>` and `saveAutoLogoutConfig(args: AutoLogoutConfig): Promise<ApiResponse<{ ok: true }>>` — both consumed by the frontend in Task 6/7 via `api.settings.getAutoLogoutConfig()` / `api.settings.saveAutoLogoutConfig(args)`.

- [ ] **Step 1: Write the failing tests**

In `equipment-manager/electron/main/handlers/settings.test.ts`, add at the end of the file:

```ts
describe('settings.getAutoLogoutConfig / saveAutoLogoutConfig', () => {
  beforeEach(() => {
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
  })

  it('returns a disabled default when no config has been saved', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    const res = await h.getAutoLogoutConfig()
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toEqual({ enabled: false, time: '07:30' })
  })

  it('saves and reads back the config', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    const save = await h.saveAutoLogoutConfig({ enabled: true, time: '07:30' })
    expect(save.ok).toBe(true)
    const res = await h.getAutoLogoutConfig()
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toEqual({ enabled: true, time: '07:30' })
  })

  it('overwrites the previous value on a second save (upsert)', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    await h.saveAutoLogoutConfig({ enabled: true, time: '07:30' })
    await h.saveAutoLogoutConfig({ enabled: false, time: '22:00' })
    const res = await h.getAutoLogoutConfig()
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toEqual({ enabled: false, time: '22:00' })
  })

  it('rejects a malformed time', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    const res = await h.saveAutoLogoutConfig({ enabled: true, time: '7:30' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })

  it('rejects a non-admin caller even with every permission granted', async () => {
    const db = freshDb()
    session.current = { id: 2, username: 'staff', role: 'staff', displayName: 'Staff', permissions: ALL_PERMISSIONS, groupIds: [] }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = await h.saveAutoLogoutConfig({ enabled: true, time: '07:30' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd equipment-manager && npx vitest run electron/main/handlers/settings.test.ts`
Expected: FAIL — `h.getAutoLogoutConfig is not a function` (TypeScript/runtime error, since the method doesn't exist yet).

- [ ] **Step 3: Add the IPC contract**

In `equipment-manager/electron/shared/ipc.ts`, add to the `CHANNELS` object, right after `settingsDeleteUser: 'settings.deleteUser',`:

```ts
  settingsGetAutoLogout: 'settings.getAutoLogout',
  settingsSaveAutoLogout: 'settings.saveAutoLogout',
```

Add the new type right after `export interface DbInfoResult { ... }`:

```ts
export interface AutoLogoutConfig { enabled: boolean; time: string } // time: "HH:mm", 24h, device-local
```

Add the two methods to `Api.settings`, right after `deleteUser(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>`:

```ts
    getAutoLogoutConfig(): Promise<ApiResponse<AutoLogoutConfig>>
    saveAutoLogoutConfig(args: AutoLogoutConfig): Promise<ApiResponse<{ ok: true }>>
```

- [ ] **Step 4: Implement the handlers**

In `equipment-manager/electron/main/handlers/settings.ts`, add `appConfig` to the schema import at the top:

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
  appConfig,
} from '../db/schema'
```

Add `AutoLogoutConfig` to the type import:

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
  DeleteEntityArgs,
  AutoLogoutConfig,
} from '@shared/ipc'
```

Add a module-level regex next to the `now()` helper:

```ts
const AUTO_LOGOUT_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
```

Add the two handlers inside the object returned by `makeSettingsHandlers`, after `dbInfo`:

```ts
    async getAutoLogoutConfig(): Promise<ApiResponse<AutoLogoutConfig>> {
      const row = db.select().from(appConfig).where(eq(appConfig.id, 1)).all()[0]
      return {
        ok: true,
        data: row
          ? { enabled: row.autoLogoutEnabled === 1, time: row.autoLogoutTime }
          : { enabled: false, time: '07:30' },
      }
    },

    async saveAutoLogoutConfig(args: AutoLogoutConfig): Promise<ApiResponse<{ ok: true }>> {
      if (session.current?.role !== 'admin') {
        return { ok: false, error: { code: 'FORBIDDEN', message: 'Chỉ quản trị viên mới có thể thay đổi cấu hình này.' } }
      }
      if (!AUTO_LOGOUT_TIME_RE.test(args?.time ?? '')) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Giờ không hợp lệ (định dạng HH:mm).' } }
      }
      db.insert(appConfig)
        .values({ id: 1, autoLogoutEnabled: args.enabled ? 1 : 0, autoLogoutTime: args.time })
        .onConflictDoUpdate({
          target: appConfig.id,
          set: { autoLogoutEnabled: args.enabled ? 1 : 0, autoLogoutTime: args.time },
        })
        .run()
      return { ok: true, data: { ok: true } }
    },
```

- [ ] **Step 5: Register the channels**

In `equipment-manager/electron/main/handlers/index.ts`, add after `ipcMain.handle(CHANNELS.settingsDeleteUser, ...)`:

```ts
  ipcMain.handle(CHANNELS.settingsGetAutoLogout, () => auth_guard(() => settingsH.getAutoLogoutConfig()))
  ipcMain.handle(CHANNELS.settingsSaveAutoLogout, (_e, args) => auth_guard(() => settingsH.saveAutoLogoutConfig(args)))
```

- [ ] **Step 6: Expose on the preload bridge**

In `equipment-manager/electron/preload/index.ts`, add inside the `settings: { ... }` object, after `deleteUser: (args) => ipcRenderer.invoke(CHANNELS.settingsDeleteUser, args),`:

```ts
    getAutoLogoutConfig: () => ipcRenderer.invoke(CHANNELS.settingsGetAutoLogout),
    saveAutoLogoutConfig: (args) => ipcRenderer.invoke(CHANNELS.settingsSaveAutoLogout, args),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd equipment-manager && npx vitest run electron/main/handlers/settings.test.ts`
Expected: PASS (all tests in the file, including the 5 new ones).

- [ ] **Step 8: Typecheck**

Run: `cd equipment-manager && npm run typecheck:node`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add equipment-manager/electron/shared/ipc.ts equipment-manager/electron/main/handlers/settings.ts equipment-manager/electron/main/handlers/settings.test.ts equipment-manager/electron/main/handlers/index.ts equipment-manager/electron/preload/index.ts
git commit -m "feat(settings): add get/save auto-logout config IPC endpoints"
```

---

### Task 3: Auto-logout flash message in AuthContext + Login banner

**Files:**
- Modify: `equipment-manager/src/context/AuthContext.tsx`
- Modify: `equipment-manager/src/pages/Login.tsx`

**Interfaces:**
- Produces: `useAuth()` gains `autoLogoutMessage: string | null` and `setAutoLogoutMessage(msg: string | null): void`, consumed by the watcher hook in Task 5 and displayed by `Login.tsx` here.

No automated test for this task — `AuthContext.tsx` and `Login.tsx` have no existing test files in this codebase (context/page-level rendering isn't unit-tested elsewhere here); this is verified in Task 7's manual pass.

- [ ] **Step 1: Add the state to `AuthContext`**

In `equipment-manager/src/context/AuthContext.tsx`, add to the `AuthCtx` interface:

```ts
interface AuthCtx {
  user: SessionUser | null
  role: Role
  isAdmin: boolean
  permissions: string[]
  groupIds: number[]
  hasPermission(key: Permission): boolean
  login(args: LoginArgs): Promise<void>
  logout(): Promise<void>
  toggleRole(): void
  autoLogoutMessage: string | null
  setAutoLogoutMessage(msg: string | null): void
}
```

Inside `AuthProvider`, add the state and clear it at the start of `login`:

```ts
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [roleOverride, setRoleOverride] = useState<Role | null>(null)
  const [autoLogoutMessage, setAutoLogoutMessage] = useState<string | null>(null)
  const role: Role = roleOverride ?? user?.role ?? 'staff'
  const permissions = user?.permissions ?? []
  const groupIds = user?.groupIds ?? []
  // Admin role always has full access, regardless of explicit permission rows.
  const hasPermission = (key: Permission) => role === 'admin' || permissions.includes(key)

  async function login(args: LoginArgs) {
    setAutoLogoutMessage(null)
    const res = await unwrap(api.auth.login(args))
    setUser(res.user); setRoleOverride(null)
  }
```

Add the two new fields to the context value:

```ts
  return (
    <Ctx.Provider value={{ user, role, isAdmin: role === 'admin', permissions, groupIds, hasPermission, login, logout, toggleRole, autoLogoutMessage, setAutoLogoutMessage }}>
      {children}
    </Ctx.Provider>
  )
```

- [ ] **Step 2: Show the banner on the Login page**

In `equipment-manager/src/pages/Login.tsx`, destructure the new field:

```ts
  const { login, autoLogoutMessage } = useAuth()
```

Render it right after the logo/title block (immediately before the `{/* Username */}` comment):

```tsx
        {autoLogoutMessage && (
          <div style={{
            fontSize: 13, color: 'var(--text-muted)', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
            padding: '10px 12px', marginBottom: 18, textAlign: 'center'
          }}>
            {autoLogoutMessage}
          </div>
        )}

```

- [ ] **Step 3: Typecheck**

Run: `cd equipment-manager && npm run typecheck:web`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add equipment-manager/src/context/AuthContext.tsx equipment-manager/src/pages/Login.tsx
git commit -m "feat(auth): add auto-logout flash message shown on the login screen"
```

---

### Task 4: Pure auto-logout time-comparison logic

**Files:**
- Create: `equipment-manager/src/lib/autoLogout.ts`
- Test: `equipment-manager/src/lib/autoLogout.test.ts`

**Interfaces:**
- Produces: `minutesSinceMidnight(d: Date): number`, `parseTimeToMinutes(time: string): number`, `dateKey(d: Date): string`, `shouldTriggerLogout(nowMinutes: number, targetMinutes: number, alreadyHandledToday: boolean): boolean` — all consumed by the watcher hook in Task 5.

- [ ] **Step 1: Write the failing test**

Create `equipment-manager/src/lib/autoLogout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { minutesSinceMidnight, parseTimeToMinutes, dateKey, shouldTriggerLogout } from './autoLogout'

describe('minutesSinceMidnight', () => {
  it('converts a time to minutes since midnight', () => {
    expect(minutesSinceMidnight(new Date(2026, 6, 4, 7, 30))).toBe(450)
  })
  it('handles midnight', () => {
    expect(minutesSinceMidnight(new Date(2026, 6, 4, 0, 0))).toBe(0)
  })
})

describe('parseTimeToMinutes', () => {
  it('parses an HH:mm string to minutes since midnight', () => {
    expect(parseTimeToMinutes('07:30')).toBe(450)
  })
  it('parses midnight and end-of-day', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0)
    expect(parseTimeToMinutes('23:59')).toBe(1439)
  })
})

describe('dateKey', () => {
  it('is stable within the same calendar day', () => {
    expect(dateKey(new Date(2026, 6, 4, 0, 0))).toBe(dateKey(new Date(2026, 6, 4, 23, 59)))
  })
  it('differs across a day boundary', () => {
    expect(dateKey(new Date(2026, 6, 4, 23, 59))).not.toBe(dateKey(new Date(2026, 6, 5, 0, 0)))
  })
})

describe('shouldTriggerLogout', () => {
  it('fires once the clock reaches the target and it has not fired yet today', () => {
    expect(shouldTriggerLogout(450, 450, false)).toBe(true)
    expect(shouldTriggerLogout(451, 450, false)).toBe(true)
  })
  it('does not fire before the target time', () => {
    expect(shouldTriggerLogout(449, 450, false)).toBe(false)
  })
  it('does not fire again once already handled today', () => {
    expect(shouldTriggerLogout(500, 450, true)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd equipment-manager && npx vitest run src/lib/autoLogout.test.ts`
Expected: FAIL — cannot find module `./autoLogout`.

- [ ] **Step 3: Implement**

Create `equipment-manager/src/lib/autoLogout.ts`:

```ts
export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function shouldTriggerLogout(nowMinutes: number, targetMinutes: number, alreadyHandledToday: boolean): boolean {
  return !alreadyHandledToday && nowMinutes >= targetMinutes
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd equipment-manager && npx vitest run src/lib/autoLogout.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add equipment-manager/src/lib/autoLogout.ts equipment-manager/src/lib/autoLogout.test.ts
git commit -m "feat(auth): add pure time-comparison logic for auto-logout"
```

---

### Task 5: Auto-logout watcher hook, mounted in App

**Files:**
- Create: `equipment-manager/src/hooks/useAutoLogoutWatcher.ts`
- Modify: `equipment-manager/src/App.tsx`

**Interfaces:**
- Consumes: `AutoLogoutConfig` type + `api.settings.getAutoLogoutConfig()` (Task 2), `useAuth()`'s `user`, `logout`, `setAutoLogoutMessage` (Task 3), `minutesSinceMidnight`/`parseTimeToMinutes`/`dateKey`/`shouldTriggerLogout` (Task 4).
- Produces: `useAutoLogoutWatcher(): void`, called once from `Shell` in `App.tsx`.

No automated test for this task — it is a thin `useQuery`/`setInterval` wiring hook with no existing precedent for hook-level testing in this codebase (`useReports.ts`, `useDashboard.ts`, etc. are untested; only pure `lib/` logic is unit-tested, per Task 4). Verified manually in Task 7.

- [ ] **Step 1: Create the hook**

Create `equipment-manager/src/hooks/useAutoLogoutWatcher.ts`:

```ts
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { dateKey, minutesSinceMidnight, parseTimeToMinutes, shouldTriggerLogout } from '@/lib/autoLogout'

const POLL_INTERVAL_MS = 20_000

export function useAutoLogoutWatcher(): void {
  const { user, logout, setAutoLogoutMessage } = useAuth()
  const dayState = useRef<{ date: string; handled: boolean } | null>(null)

  const { data: config } = useQuery({
    queryKey: ['settings', 'autoLogout'],
    queryFn: () => unwrap(api.settings.getAutoLogoutConfig()),
    enabled: !!user,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!user || !config?.enabled) return

    dayState.current = null
    const targetMinutes = parseTimeToMinutes(config.time)

    function tick() {
      const now = new Date()
      const today = dateKey(now)
      const nowMinutes = minutesSinceMidnight(now)

      if (dayState.current?.date !== today) {
        dayState.current = { date: today, handled: nowMinutes >= targetMinutes }
        return
      }
      if (shouldTriggerLogout(nowMinutes, targetMinutes, dayState.current.handled)) {
        dayState.current.handled = true
        logout()
        setAutoLogoutMessage(`Đã tự động đăng xuất lúc ${config.time} theo cấu hình hệ thống.`)
      }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user, config?.enabled, config?.time, logout, setAutoLogoutMessage])
}
```

- [ ] **Step 2: Mount it in `App.tsx`**

In `equipment-manager/src/App.tsx`, import the hook:

```ts
import { useAutoLogoutWatcher } from '@/hooks/useAutoLogoutWatcher'
```

Call it inside `Shell`, before the `return`:

```tsx
function Shell() {
  const { user } = useAuth()
  const { dark } = useUi()
  useAutoLogoutWatcher()
  return (
    <div className={`app-theme${dark ? ' dark' : ''}`}>
      {user ? <RouterProvider router={router} /> : <Login />}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd equipment-manager && npm run typecheck:web`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add equipment-manager/src/hooks/useAutoLogoutWatcher.ts equipment-manager/src/App.tsx
git commit -m "feat(auth): watch the clock and auto-logout at the configured time"
```

---

### Task 6: Settings UI — auto-logout configuration section

**Files:**
- Modify: `equipment-manager/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `api.settings.getAutoLogoutConfig()` / `api.settings.saveAutoLogoutConfig(args)` (Task 2), the shared `inputStyle`/`focusOn`/`focusOff`/`SectionCard` already defined in this file.

No automated test for this task — `Settings.tsx` has no existing test file (its other admin sections, e.g. `UsersSection`/`ResetDataSection`, are likewise untested here); verified manually in Task 7.

- [ ] **Step 1: Add `useEffect` to the React import**

In `equipment-manager/src/pages/Settings.tsx`, change the first line:

```ts
import { useState, useEffect } from 'react'
```

- [ ] **Step 2: Add the section component**

Add this new function in `equipment-manager/src/pages/Settings.tsx`, after `DbInfoSection` and before `// ── Reset data section (admin only) ───`:

```tsx
// ── Auto-logout section (admin only) ──────────────────────────────────────────
function useAutoLogoutConfig() {
  return useQuery({ queryKey: ['settings', 'autoLogout'], queryFn: () => unwrap(api.settings.getAutoLogoutConfig()) })
}

function AutoLogoutSection() {
  const { data } = useAutoLogoutConfig()
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('07:30')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      setTime(data.time)
    }
  }, [data])

  const mut = useMutation({
    mutationFn: () => unwrap(api.settings.saveAutoLogoutConfig({ enabled, time })),
    onSuccess: () => {
      setOk(true)
      setErr('')
      qc.invalidateQueries({ queryKey: ['settings', 'autoLogout'] })
    },
    onError: (e) => { setErr((e as Error).message); setOk(false) },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Toàn bộ tài khoản đang đăng nhập sẽ tự động đăng xuất vào giờ này mỗi ngày.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => { setEnabled(e.target.checked); setOk(false) }}
        />
        Bật tự động đăng xuất theo giờ
      </label>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Giờ đăng xuất</label>
        <input
          type="time"
          value={time}
          disabled={!enabled}
          onChange={e => { setTime(e.target.value); setOk(false) }}
          style={{ ...inputStyle, maxWidth: 160, opacity: enabled ? 1 : 0.5 }}
          onFocus={focusOn}
          onBlur={focusOff}
        />
      </div>
      {err && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{err}</div>}
      {ok && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>Đã lưu cấu hình!</div>}
      <div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          style={{
            height: 38, padding: '0 18px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: mut.isPending ? 'not-allowed' : 'pointer', opacity: mut.isPending ? 0.7 : 1
          }}
        >
          {mut.isPending ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Render the section**

In the main `Settings()` component in the same file, add the new `SectionCard` inside the `isAdmin` block, right after the `"Quản lý tài khoản"` card:

```tsx
      {isAdmin && (
        <SectionCard title="Quản lý tài khoản">
          <UsersSection />
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard title="Tự động đăng xuất">
          <AutoLogoutSection />
        </SectionCard>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd equipment-manager && npm run typecheck:web`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add equipment-manager/src/pages/Settings.tsx
git commit -m "feat(settings): add admin UI for configuring auto-logout time"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `cd equipment-manager && npx vitest run`
Expected: all tests pass, including the new ones from Tasks 1, 2, and 4.

(If `better-sqlite3` fails to load with a NODE_MODULE_VERSION mismatch, this is the known Electron/Node ABI issue — re-run `npm install` in `equipment-manager/` to restore the Node-ABI build before testing, per `equipment-manager/CLAUDE.md`.)

- [ ] **Step 2: Full typecheck**

Run: `cd equipment-manager && npm run typecheck`
Expected: no errors on either side.

- [ ] **Step 3: Manual verification in the running app**

Run: `cd equipment-manager && npm run dev` (already prefixed with `env -u ELECTRON_RUN_AS_NODE` in `package.json` — do not invoke `electron-vite dev` directly).

1. Log in as `admin` / `admin`.
2. Go to **Cài đặt** (Settings) → confirm the new "Tự động đăng xuất" card is visible (admin-only).
3. Enable it and set the time to 2 minutes from the current device time. Save — confirm the "Đã lưu cấu hình!" success message appears.
4. Wait for the configured time to pass (up to ~20s polling delay after it). Confirm the app automatically returns to the Login screen with the banner "Đã tự động đăng xuất lúc HH:mm theo cấu hình hệ thống."
5. Log back in immediately. Confirm you are **not** immediately logged out again (transition-only firing, already handled today).
6. Log in as a `staff` user (if one exists with `active: 1`) and confirm the "Tự động đăng xuất" card does **not** appear in Settings for that account.
7. As `staff`, confirm calling the save endpoint would be rejected — this is already covered by the automated `FORBIDDEN` test in Task 2; no separate manual step needed beyond confirming the UI hides the section.

- [ ] **Step 4: Report results**

No commit for this task — it's verification only. If any step fails, return to the relevant task and fix before considering the feature complete.
