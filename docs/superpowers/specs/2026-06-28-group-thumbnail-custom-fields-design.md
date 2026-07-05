# Device Group Thumbnail & Custom Fields — Design

**Date:** 2026-06-28  
**Status:** Approved

## Goal

Thêm 2 tính năng cho Nhóm thiết bị (device groups):
1. **Thumbnail** — ảnh đại diện, upload từ local, lưu file trên disk
2. **Custom fields** — template trường toàn cục (admin định nghĩa tên trường) + giá trị riêng từng nhóm

Đồng thời xóa cột `min_stock` khỏi `device_groups` (không còn dùng).

---

## Database

### Migration mới (0005)

```sql
-- Xóa min_stock khỏi device_groups
-- SQLite không hỗ trợ DROP COLUMN trực tiếp trước 3.35.0,
-- dùng recreate-table pattern hoặc kiểm tra phiên bản:
CREATE TABLE device_groups_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  thumbnail_path TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO device_groups_new SELECT id, name, category_id, NULL, created_at FROM device_groups;
DROP TABLE device_groups;
ALTER TABLE device_groups_new RENAME TO device_groups;

-- Template trường toàn cục
CREATE TABLE group_field_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Giá trị trường của từng nhóm
CREATE TABLE group_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES group_field_templates(id) ON DELETE CASCADE,
  value TEXT NOT NULL DEFAULT '',
  UNIQUE(group_id, template_id)
);
```

### Drizzle Schema changes

- `deviceGroups`: bỏ `minStock`, thêm `thumbnailPath text` (nullable)
- Thêm bảng `groupFieldTemplates(id, name, displayOrder, createdAt)`
- Thêm bảng `groupFieldValues(id, groupId, templateId, value)` với uniqueIndex `(groupId, templateId)`

---

## Thumbnail Storage

- Khi user chọn ảnh → main process nhận đường dẫn file gốc → copy vào `<userData>/thumbnails/<groupId>-<timestamp>.<ext>`
- Path tuyệt đối được lưu vào `device_groups.thumbnail_path`
- File cũ bị xóa khi: thay thumbnail mới, xóa thumbnail, xóa nhóm
- Renderer dùng path trực tiếp làm `src` của `<img>` — Electron hỗ trợ absolute path qua `file://` protocol

---

## IPC Layer

### Channels mới

```ts
// Trong CHANNELS:
catalogListGroupTemplates:  'catalog.listGroupTemplates'
catalogSaveGroupTemplate:   'catalog.saveGroupTemplate'
catalogDeleteGroupTemplate: 'catalog.deleteGroupTemplate'
catalogGetGroupDetail:      'catalog.getGroupDetail'
catalogSaveGroupDetail:     'catalog.saveGroupDetail'
dialogOpenFile:             'dialog.openFile'
```

### Types mới

```ts
interface GroupFieldTemplate {
  id: number
  name: string
  displayOrder: number
}

interface GroupDetailResult {
  thumbnailPath: string | null
  fields: Array<{ templateId: number; name: string; value: string }>
}

interface SaveGroupTemplateArgs {
  id?: number
  name: string
  displayOrder?: number
}

interface SaveGroupDetailArgs {
  groupId: number
  // null = không đổi; '' = xóa thumbnail; path string = thay bằng file mới
  thumbnailSourcePath: string | null | ''
  fields: Array<{ templateId: number; value: string }>
}

interface OpenFileResult {
  canceled: boolean
  filePath: string | null
}
```

### GroupRow — cập nhật

```ts
interface GroupRow {
  id: number
  name: string
  categoryId: number
  categoryName: string
  thumbnailPath: string | null   // thêm; bỏ minStock
}
```

### SaveGroupArgs — cập nhật

```ts
interface SaveGroupArgs {
  id?: number
  name: string
  categoryId: number
  // bỏ minStock
}
```

### Api interface additions

```ts
catalog: {
  // ... existing
  listGroupTemplates(): Promise<ApiResponse<{ templates: GroupFieldTemplate[] }>>
  saveGroupTemplate(args: SaveGroupTemplateArgs): Promise<ApiResponse<GroupFieldTemplate>>
  deleteGroupTemplate(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
  getGroupDetail(args: { groupId: number }): Promise<ApiResponse<GroupDetailResult>>
  saveGroupDetail(args: SaveGroupDetailArgs): Promise<ApiResponse<{ ok: true }>>
}
dialog: {
  openFile(args: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<ApiResponse<OpenFileResult>>
}
```

---

## Backend Handlers

### `catalog` handler additions

- `listGroupTemplates` — `SELECT * FROM group_field_templates ORDER BY display_order ASC`
- `saveGroupTemplate` — upsert; nếu `id` thì UPDATE, không thì INSERT
- `deleteGroupTemplate` — DELETE template + cascade xóa values (FK)
- `getGroupDetail(groupId)` — lấy `thumbnailPath` từ `device_groups` + LEFT JOIN `group_field_values` với `group_field_templates`
- `saveGroupDetail(args)`:
  1. Xử lý thumbnail: nếu `thumbnailSourcePath` là string path → copy file vào userData/thumbnails, xóa file cũ; nếu `''` → xóa file cũ + set NULL; nếu `null` → không đổi
  2. UPSERT từng field value (`INSERT OR REPLACE INTO group_field_values`)
  3. UPDATE `device_groups.thumbnail_path` nếu có thay đổi
- `saveGroup` — bỏ `minStock` khỏi insert/update
- `deleteGroup` — thêm: xóa thumbnail file nếu tồn tại trước khi DELETE row

### `dialog` handler (module mới)

```ts
// electron/main/handlers/dialog.ts
import { dialog } from 'electron'
export function makeDialogHandlers() {
  return {
    async openFile(args): Promise<ApiResponse<OpenFileResult>> {
      const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: args?.filters ?? [] })
      return { ok: true, data: { canceled: result.canceled, filePath: result.filePaths[0] ?? null } }
    }
  }
}
```

Không cần `auth_guard` cho `openFile` — đây là native OS dialog.

---

## UI

### Catalog — Tab Categories: layout 3 cột

```
┌─────────────────┬──────────────────┬─────────────────────┐
│  Danh sách      │  Nhóm của        │  Edit Panel         │
│  Categories     │  category đang   │  (hiện khi click    │
│                 │  chọn            │  Sửa một nhóm)      │
│  [+ Thêm loại]  │  [+ Thêm nhóm]   │                     │
│                 │                  │  ×  Tên nhóm        │
│                 │                  │  ─────────────────  │
│                 │                  │  🖼 Thumbnail       │
│                 │                  │  ─────────────────  │
│                 │                  │  📋 Trường TT       │
│                 │                  │  ─────────────────  │
│                 │                  │  [Hủy] [Lưu]        │
└─────────────────┴──────────────────┴─────────────────────┘
```

Khi không có nhóm nào đang được sửa, cột 3 ẩn (layout 2 cột như hiện tại).

**Edit Panel sections:**

1. **Tên nhóm** — input text
2. **Thumbnail** — preview 80×80 (bo tròn, object-fit: cover) + nút "Chọn ảnh" + nút "Xóa" (nếu đang có)
3. **Trường thông tin** — render danh sách templates; mỗi trường: label + input text; empty → placeholder "Chưa điền"

### Catalog — Section "Trường thông tin nhóm" (global templates)

Đặt bên dưới panel groups (cột 2), tách biệt bằng divider. Admin có thể:
- Thêm tên trường mới (input + nút "+")
- Đổi tên inline (click để edit)
- Xóa trường (nút trash) — hiển thị confirm dialog trước khi xóa; backend xóa hard (không soft-delete); cascade xóa values của tất cả nhóm

### Devices page — cột Group

Nếu nhóm có `thumbnailPath` → hiển thị ảnh nhỏ 24×24 (bo tròn) trước tên nhóm trong cột `categoryGroup`.

---

## File Map

| File | Thay đổi |
|---|---|
| `electron/main/db/schema.ts` | Bỏ `minStock` khỏi `deviceGroups`; thêm `thumbnailPath`; thêm 2 bảng mới |
| `electron/main/db/migrations/0005_*.sql` | Migration recreate + 2 bảng mới |
| `electron/shared/ipc.ts` | Cập nhật `GroupRow`, `SaveGroupArgs`; thêm types + channels mới |
| `electron/main/handlers/catalog.ts` | Cập nhật `saveGroup`, `deleteGroup`; thêm 5 methods mới |
| `electron/main/handlers/dialog.ts` | **Mới**: `makeDialogHandlers` |
| `electron/main/handlers/index.ts` | Register 6 channels mới |
| `electron/preload/index.ts` | Expose methods mới |
| `src/pages/Catalog.tsx` | Layout 3 cột; thay inline edit bằng Edit Panel; thêm template management section |
| `src/pages/Devices.tsx` | Cột group: hiển thị thumbnail nhỏ nếu có |
| `src/components/DeviceFormDialog.tsx` | Bỏ hiển thị minStock nếu có |

---

## Constraints

- Permission `manage_catalog` bảo vệ tất cả write operations (catalog handlers giữ nguyên pattern `requirePermission`)
- `openFile` không cần permission guard
- Thumbnail chỉ chấp nhận image files: `['jpg', 'jpeg', 'png', 'gif', 'webp']`
- Khi copy thumbnail: nếu `<userData>/thumbnails/` chưa tồn tại → tạo trước
- Xóa nhóm → xóa thumbnail file (nếu có) trước khi DELETE row (cascade xóa field values tự động qua FK)
