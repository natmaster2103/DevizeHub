# Configurable Daily Auto-Logout Time — Design

## Goal

Let an admin configure a single daily time (e.g. `07:30`). When the app is left open across that time, whoever is currently logged in is automatically logged out — no admin action needed at that moment, and no manual "kick" required.

## Context

- Auth has no token: `session.current` (`electron/main/session.ts`) is an in-memory singleton, set on `auth.login`, cleared on `auth.logout`, and reset to `null` on every process restart.
- Because the session doesn't survive a restart, "the app wasn't running at the scheduled time" is a non-issue — a fresh launch already forces a fresh login regardless of this feature. This feature only matters for a session left open **across** the boundary (logged in yesterday, app still open past today's scheduled time).
- All existing IPC is request/response (`ipcMain.handle` / `ipcRenderer.invoke`); there is no main→renderer push mechanism (`webContents.send` / `ipcRenderer.on`) anywhere in the codebase.
- The renderer already ticks a live clock every second in `src/components/Timer.tsx` via `setInterval`, so client-side polling of wall-clock time is an established pattern here.
- `src/App.tsx`'s `Shell` renders `<Login />` when `useAuth().user` is `null` and `<RouterProvider>` otherwise — calling the existing `logout()` from `AuthContext` is sufficient to bounce back to the login screen.
- Settings page (`src/pages/Settings.tsx`) already has an admin-gated (`isAdmin`) section pattern (`SectionCard`), and its handlers (`electron/main/handlers/settings.ts`) use `requirePermission(perm)` for granular, delegable permissions (`electron/main/handlers/settings.ts:34`), where `admin` role always passes regardless of explicit grants.

## Decisions

- **Scope: one global time, not per-user/per-role.** There is only ever one active session at a time (single in-memory `session.current`), so a global setting matches the architecture. No per-user override.
- **Enforcement: renderer-side polling**, not a new main-process push channel. A hook polls the wall clock every 20s and compares it against the fetched config; on crossing the boundary it calls `AuthContext.logout()`. This reuses the existing tick pattern from `Timer.tsx` instead of introducing new IPC plumbing for a single feature.
- **Transition-only trigger, not retroactive.** The watcher only fires on the moment the clock crosses the configured time while already logged in. Logging in at 9am with the target set to 7:30 does **not** immediately log the user back out. It fires at most once per calendar day, and re-arms automatically at the next local midnight.
- **Backend authorization is hard-coded to `role === 'admin'`**, not added to the delegable `Permission` enum (`ALL_PERMISSIONS` in `electron/shared/ipc.ts`). This is a security/policy setting, unlike the operational permissions in that list (allocate, edit_device, etc.), so it should not be grantable to staff.
- **Time format:** 24-hour `HH:mm`, validated with `/^([01]\d|2[0-3]):([0-5]\d)$/`, device-local time (matches the existing `Timer.tsx` convention — no timezone handling).

## Data model

New singleton table in `electron/main/db/schema.ts`, single row with fixed `id = 1`:

```ts
export const appConfig = sqliteTable('app_config', {
  id: integer('id').primaryKey(),
  autoLogoutEnabled: integer('auto_logout_enabled').notNull().default(0),
  autoLogoutTime: text('auto_logout_time').notNull().default('07:30'),
})
```

Migration generated via `npm run db:generate` (drizzle-kit). No seed step needed — `getAutoLogoutConfig` falls back to `{ enabled: false, time: '07:30' }` when the row doesn't exist yet; `saveAutoLogoutConfig` upserts row `id = 1`.

## IPC contract (`electron/shared/ipc.ts`)

- New channels: `CHANNELS.settingsGetAutoLogout` (`'settings.getAutoLogout'`), `CHANNELS.settingsSaveAutoLogout` (`'settings.saveAutoLogout'`).
- New type:
  ```ts
  export interface AutoLogoutConfig { enabled: boolean; time: string } // time: "HH:mm"
  ```
- `Api.settings` gains `getAutoLogoutConfig(): Promise<ApiResponse<AutoLogoutConfig>>` and `saveAutoLogoutConfig(args: AutoLogoutConfig): Promise<ApiResponse<{ ok: true }>>`.
- Both registered in `handlers/index.ts` wrapped in the existing `auth_guard` (must be logged in to read/write, same as every other non-auth channel).

## Backend (`electron/main/handlers/settings.ts`)

- `getAutoLogoutConfig()`: `select` row `id=1` from `appConfig`; return its values mapped to `{ enabled, time }`, or the default if no row exists. No permission check beyond `auth_guard` — any logged-in user can read the current policy (needed so the renderer watcher can enforce it regardless of who's logged in).
- `saveAutoLogoutConfig(args)`:
  - Reject with `{ code: 'FORBIDDEN' }` unless `session.current?.role === 'admin'`.
  - Validate `args.time` against the `HH:mm` regex; reject with `{ code: 'BAD_REQUEST' }` on mismatch.
  - Upsert row `id = 1` with `autoLogoutEnabled` / `autoLogoutTime`.

## Frontend

### Settings UI (`src/pages/Settings.tsx`)

New `SectionCard title="Tự động đăng xuất"`, rendered only when `isAdmin` (same gating as `UsersSection`/`ResetDataSection`):

- Checkbox: "Bật tự động đăng xuất theo giờ".
- `<input type="time">` bound to the configured time, disabled when the checkbox is off.
- Helper text under the controls: "Toàn bộ tài khoản đang đăng nhập sẽ tự động đăng xuất vào giờ này mỗi ngày."
- Save button, same visual treatment as `ChangePasswordSection`'s submit button; shows inline success/error like the other sections in this file.
- Backed by a `useQuery`/`useMutation` pair analogous to `useDbInfo()` / the existing settings mutations, invalidating on save.

### Watcher hook (new: `src/hooks/useAutoLogoutWatcher.ts`)

- Fetches `AutoLogoutConfig` via `useQuery` (reasonable `staleTime`, e.g. re-fetched on window focus — default TanStack Query behavior is fine).
- Runs only while a user is logged in (mounted from `Shell` in `App.tsx`, alongside the `user ? <RouterProvider> : <Login>` branch — active in the authenticated branch only, so it naturally stops polling after logout and restarts fresh on next login).
- On mount/config-change, computes whether "today's boundary" has already passed (`nowMinutes >= targetMinutes`) and initializes an internal "already handled today" flag accordingly — this is what prevents the retroactive-logout case from the Decisions section.
- `setInterval` every 20s: recompute current date string and minute-of-day.
  - If the date string changed since the last tick, reset the "already handled today" flag.
  - If not yet handled today, `enabled` is true, and `nowMinutes >= targetMinutes`: call `AuthContext.logout()`, set an "auto-logout" flash message, mark handled.
- Cleans up interval on unmount (mirrors `Timer.tsx`).

### Post-logout message

- `AuthContext` gains a small piece of state, e.g. `autoLogoutMessage: string | null`, settable by the watcher and cleared on the next `login()` call.
- `src/pages/Login.tsx` renders a banner when `autoLogoutMessage` is set: "Đã tự động đăng xuất lúc HH:mm theo cấu hình hệ thống." (time interpolated from the config used to trigger it).

## Testing

- Backend: unit tests in `electron/main/handlers/settings.test.ts` for `getAutoLogoutConfig` (default when no row, returns saved row when present) and `saveAutoLogoutConfig` (rejects non-admin, rejects malformed time, upserts correctly).
- Frontend: unit test for the watcher's pure time-comparison logic (extract a small pure function, e.g. `shouldTriggerLogout(nowMinutes, targetMinutes, alreadyHandledToday)`, and test it directly rather than through `setInterval` timing).
- Manual verification: run the app, set the time a couple of minutes in the future, confirm the session is force-logged-out at that time with the banner shown on `Login`, and confirm logging back in immediately after does not immediately re-trigger.

## Out of scope

- Per-user or per-role logout times.
- Any main-process push/IPC event mechanism.
- Handling the "app wasn't running at the scheduled time" case — moot given the in-memory, restart-resets session model.
- Timezone selection — device-local time only, consistent with `Timer.tsx`.
