# Device Groups & Category Filter — Design Spec

**Date:** 2026-06-25  
**Scope:** Add optional device grouping (Category → Group → Device hierarchy) and a category dropdown filter to the Devices page.

---

## 1. Overview

Two features shipped together because they share the same data (groups belong to categories):

1. **Device groups** — users can define named groups under a category (e.g. "Dell XPS 15" under "Laptop") and optionally assign devices to a group.
2. **Category filter** — a dropdown on the Devices page to narrow the list to one category.

---

## 2. Database Schema

### New table: `device_groups`

```sql
CREATE TABLE device_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  categoryId INTEGER REFERENCES categories(id),
  createdAt  TEXT    NOT NULL
);
```

### Modified table: `devices`

```sql
ALTER TABLE devices ADD COLUMN groupId INTEGER REFERENCES device_groups(id);
```

`groupId` is nullable — devices without a group continue to work exactly as before.

**Migration:** one new Drizzle migration file covering both the new table and the new column.

---

## 3. IPC Contract (`electron/shared/ipc.ts`)

### New type

```ts
export interface GroupRow {
  id: number
  name: string
  categoryId: number
  categoryName: string
}
```

### Updated types

| Type | Change |
|------|--------|
| `CatalogListResult` | add `groups: GroupRow[]` |
| `DeviceRow` | add `group: string \| null`, `groupId: number \| null` |
| `DeviceListArgs` | add `categoryId?: number \| null` |

### New channels

| Channel | Args | Result |
|---------|------|--------|
| `catalog.saveGroup` | `{ id?: number; name: string; categoryId: number }` | `{ ok: true }` |
| `catalog.deleteGroup` | `{ id: number }` | `{ ok: true }` |

---

## 4. Main-Process Handlers

### `catalog` handler

- `catalog.list`: extend query to also return all `device_groups` joined with `categories.name`.
- `catalog.saveGroup`: upsert into `device_groups`.
- `catalog.deleteGroup`: delete the group row, then `UPDATE devices SET groupId = NULL WHERE groupId = id` (soft-detach).

### `devices` handler

- `list`: 
  - Left-join `device_groups` to get `groupName`.
  - Apply `WHERE devices.categoryId = ?` when `args.categoryId` is set (before filter/search/pagination).
  - Populate `DeviceRow.group` and `DeviceRow.groupId`.
- `get`: same join for the active allocation query.
- `create` / `update`: accept and persist `groupId`.

### Constraints

- **Deleting a category that still has groups:** return `CONFLICT` error — "Vui lòng xóa hoặc chuyển nhóm trước." (existing pattern for categories with devices).
- **Changing a device's category via update:** if the existing `groupId` belongs to a different category, auto-clear `groupId` to `NULL` in the handler.

---

## 5. Preload (`electron/preload/index.ts`)

Expose two new methods on `window.api.catalog`:

```ts
saveGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveGroup, args)
deleteGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteGroup, args)
```

---

## 6. Catalog Page (`src/pages/Catalog.tsx`)

### Tab "Loại thiết bị" → extended to 2-column master-detail

```
┌──────────────────────┬──────────────────────────────────┐
│ Loại thiết bị        │ Nhóm — [Tên danh mục được chọn]  │
├──────────────────────┼──────────────────────────────────┤
│  Laptop        [✎✕]  │  Dell XPS 15              [✎✕]   │
│▶ Máy in        [✎✕]  │  MacBook Pro              [✎✕]   │
│  Màn hình      [✎✕]  │  ──────────────────────────────  │
│                      │  + Thêm nhóm…                    │
└──────────────────────┴──────────────────────────────────┘
```

- Left panel: existing category list with highlight on selected row.
- Right panel: groups belonging to the selected category; inline add/edit/delete (admin only).
- When no category is selected: right panel shows placeholder "Chọn một loại thiết bị để xem nhóm".
- Groups tab is removed — groups live inside this tab.

---

## 7. Devices Page (`src/pages/Devices.tsx`)

### Toolbar

```
[🔍 Tìm theo SKU, tên...  🔳]  [Danh mục ▾]  [+ Thêm thiết bị]
```

- "Danh mục" dropdown: option "Tất cả" + one option per category from `catalog.list`.
- Changing selection resets to page 1 (same pattern as status filter and query).

### "Loại / Nhóm" column (formerly "Loại")

- Header renamed "Loại / Nhóm".
- Cell: two lines when group is present — category name (bold) / group name (muted, 12px) — matching the "Phòng / Người giữ" column style.
- Falls back to single-line category name when no group.

### `DeviceFormDialog`

- Add optional "Nhóm" select field, rendered after the "Loại" field.
- Groups dropdown is populated from `catalog.list` filtered to `categoryId`.
- Resetting the "Loại" field clears the "Nhóm" field.
- Passes `groupId` in create/update args.

---

## 8. Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Xóa nhóm có thiết bị | Cho phép; set `groupId = NULL` trên thiết bị liên quan |
| Xóa danh mục có nhóm | Block; yêu cầu xóa nhóm trước |
| Đổi danh mục thiết bị (form) | Reset `groupId = null` khi categoryId thay đổi |
| Đổi danh mục thiết bị (handler) | Auto-clear `groupId` nếu nhóm không thuộc danh mục mới |
| Tìm kiếm | Không tìm theo tên nhóm (giữ đơn giản) |
| Phân trang | `categoryId` filter áp dụng trước đếm `total` và slice |

---

## 9. Out of Scope

- Tìm kiếm theo tên nhóm trong ô search
- Hiển thị nhóm trên trang Dashboard
- Import/export nhóm
