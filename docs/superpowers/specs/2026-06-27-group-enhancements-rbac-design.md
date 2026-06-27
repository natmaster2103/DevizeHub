# Group Enhancements & RBAC — Design Spec

**Date:** 2026-06-27  
**Scope:** (1) Extend device groups with `minStock`, a cascading group filter on the Devices page, and optional user–group assignment; (2) Replace binary role enforcement with a fine-grained permission system.

---

## 1. Overview

Two coordinated features:

1. **Group enhancements** — add `minStock` to `device_groups`, surface a cascading group-filter dropdown on the Devices page, and (optionally) assign groups to users for scoped access.
2. **Fine-grained RBAC** — replace the single `admin | staff` role check with an explicit, per-user permission set stored in a `user_permissions` junction table. `role` is kept on `appUsers` for display only; capability enforcement moves entirely to permission keys.

---

## 2. Group Enhancements

### 2.1 `minStock` on `device_groups`

Add `min_stock INTEGER NOT NULL DEFAULT 0` to the `device_groups` table. This mirrors `categories.min_stock` and lets reports flag groups that are under-stocked independently of their parent category threshold.

```sql
ALTER TABLE device_groups ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0;
```

**IPC changes:**

| Type | Change |
|---|---|
| `GroupRow` | add `minStock: number` |
| `SaveGroupArgs` | add `minStock: number` |

The Catalog page group-edit form gains a "Tồn kho tối thiểu" number field (same UX as the category min-stock field).

### 2.2 Cascading group filter on Devices page

When the user selects a category in the category-filter dropdown, a second dropdown appears listing groups in that category. Selecting a group adds `groupId` to `DeviceListArgs` and filters the device list server-side.

```ts
// DeviceListArgs (addition)
groupId?: number | null
```

Handler change: extend the `WHERE` clause in `devices.list` to filter by `devices.groupId = :groupId` when supplied.

The group dropdown is hidden/disabled when no category is selected or when the selected category has no groups. It resets to "Tất cả nhóm" when the category changes.

### 2.3 User–group assignment (optional scoping)

A user can be assigned zero or more groups. This is a supporting data structure for RBAC (§3) — if a future permission like `manage_own_groups` is added, it checks both the permission key *and* whether the device's group is in the user's assigned groups.

```sql
CREATE TABLE user_groups (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  userId  INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  groupId INTEGER NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  UNIQUE(userId, groupId)
);
```

**IPC changes:**

```ts
// New field on AppUserRow
groupIds: number[]

// New args type
export interface SaveUserGroupsArgs { userId: number; groupIds: number[] }
```

New channel: `settingsSaveUserGroups: 'settings.saveUserGroups'`.  
The Settings user-edit modal adds a multi-select group picker (only shown to admins).

`SessionUser` gains `groupIds: number[]` populated at login from `user_groups`.

---

## 3. Fine-grained RBAC

### 3.1 Permission keys

All capabilities are named string constants. The full set:

| Key | Nhãn (VN) | Seeded for admin | Seeded for staff |
|---|---|---|---|
| `allocate` | Cấp phát thiết bị | ✓ | — |
| `return_device` | Thu hồi thiết bị | ✓ | — |
| `create_request` | Tạo phiếu đề nghị | ✓ | — |
| `edit_device` | Sửa thông tin thiết bị | ✓ | — |
| `change_status` | Đổi trạng thái thiết bị | ✓ | — |
| `delete_device` | Xóa thiết bị | ✓ | — |
| `manage_catalog` | Quản lý danh mục | ✓ | — |
| `manage_users` | Quản lý tài khoản | ✓ | — |
| `reset_data` | Làm mới dữ liệu | ✓ | — |
| `view_reports` | Xem báo cáo | ✓ | ✓ |

Staff starts with view-only access (read everything, write nothing). Admin starts with all permissions. Permissions are then granted or revoked per user.

### 3.2 Database schema

```sql
CREATE TABLE user_permissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  userId     INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  permission TEXT    NOT NULL,
  UNIQUE(userId, permission)
);
```

Seed inserts the full permission set for the initial admin user and `view_reports` for any seeded staff.

### 3.3 Session & IPC

```ts
// Updated SessionUser
export interface SessionUser {
  id: number
  username: string
  role: Role           // kept for display
  displayName: string
  permissions: string[]
  groupIds: number[]
}

// New type exported from ipc.ts
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

// New args type
export interface SaveUserPermissionsArgs {
  userId: number
  permissions: Permission[]
}
```

New channel: `settingsSaveUserPermissions: 'settings.saveUserPermissions'`.

`auth.login` and `auth.me` load `permissions` and `groupIds` from their respective junction tables and set them on `session.current`.

### 3.4 Handler enforcement

Handlers currently checking `session.current?.role !== 'admin'` switch to checking `!session.current?.permissions.includes(key)`. A small helper replaces the ad-hoc check:

```ts
function requirePermission(perm: Permission): ApiResponse<never> | null {
  if (!session.current?.permissions.includes(perm)) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } }
  }
  return null
}
```

**Handler → permission mapping:**

| Handler | Permission required |
|---|---|
| `devices.create` | `edit_device` |
| `devices.update` | `edit_device` |
| `devices.changeStatus` | `change_status` |
| `devices.delete` | `delete_device` |
| `allocate.create`, `allocate.quick` | `allocate` |
| `requests.return` | `return_device` |
| `requests.create` | `create_request` |
| `catalog.saveCategory/Department/Employee/Group` | `manage_catalog` |
| `catalog.deleteCategory/Department/Employee/Group` | `manage_catalog` |
| `settings.listUsers`, `settings.saveUser` | `manage_users` |
| `settings.resetData` | `reset_data` |
| `settings.saveUserPermissions` | `manage_users` |
| `settings.saveUserGroups` | `manage_users` |

`auth.*` and read-only endpoints (`devices.list`, `devices.get`, `dashboard.summary`, `requests.list`, `requests.get`, `catalog.list`, `allocate.formData`, `requests.availableDevices`, `settings.dbInfo`) require only a valid session (existing `auth_guard`).

### 3.5 Renderer — `useAuth` changes

```ts
// AuthContext additions
const hasPermission = (key: Permission) =>
  session?.permissions.includes(key) ?? false

// Deprecated but kept for display gating only:
const isAdmin = session?.role === 'admin'
```

All UI capability gates switch from `isAdmin` to `hasPermission('...')`. The `isAdmin` field stays for cosmetic label rendering (role badge in header/settings).

### 3.6 Settings UI — permission checklist

The user-edit modal (`UserModal` in `Settings.tsx`) adds a section below the role selector: a grid of checkboxes, one per permission key, with Vietnamese labels. Admins cannot deselect permissions from their own account (`manage_users` and `manage_users` remain locked for self). The save action calls `saveUser` (existing — name/role/password/active) then `saveUserPermissions` (new — permissions array) in sequence.

---

## 4. Data flow summary

```
Login
  → auth.login handler
  → load user row + permissions[] from user_permissions
  → load groupIds[] from user_groups
  → set session.current = { id, username, role, displayName, permissions, groupIds }
  → return SessionUser to renderer

Renderer
  → AuthContext stores SessionUser
  → hasPermission('allocate') gates the Cấp phát button
  → hasPermission('manage_users') gates the Settings user section

Mutation (e.g. allocate.create)
  → handler calls requirePermission('allocate')
  → if null → proceed; if error → return FORBIDDEN
```

---

## 5. Migration strategy

1. Add `min_stock` to `device_groups` (ALTER TABLE — backward-safe default 0).
2. Add `groupId` to `DeviceListArgs` (optional arg — backward-safe).
3. Create `user_permissions` table and seed admin with all permissions + staff with `view_reports`.
4. Create `user_groups` table (empty seed — no default group assignments).
5. Update `SessionUser` in IPC; update `auth.login` and `auth.me` handlers to populate new fields.
6. Update all handler enforcement checks.
7. Update `AuthContext` with `hasPermission`.
8. Update all UI gates.
9. Update Settings modal with permission checklist + group picker.

One Drizzle migration covers steps 1, 3, and 4.

---

## 6. Acceptance criteria

- A staff user with no permissions granted can view all pages but all write actions are disabled in the UI and return FORBIDDEN from handlers.
- A staff user granted `allocate` can open the Allocation Drawer and complete an allocation; all other write actions remain disabled.
- Admin can grant/revoke any permission on any user except cannot remove their own `manage_users` permission.
- Selecting a category on the Devices page surfaces a group dropdown; selecting a group filters the list; both filters compose with the status filter and search.
- Groups in the Catalog show and save a `minStock` value.
- All existing tests pass after handler enforcement changes (seed admin gets all permissions in in-memory test DB).
