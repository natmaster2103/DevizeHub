# Device Group Thumbnail & Custom Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm thumbnail (lưu file trên disk) và custom fields (template toàn cục + giá trị riêng từng nhóm) cho Device Groups; đồng thời xóa `minStock` khỏi device_groups.

**Architecture:** Migration thủ công recreate `device_groups` (bỏ `min_stock`, thêm `thumbnail_path`) + 2 bảng mới (`group_field_templates`, `group_field_values`). IPC layer mở rộng với 6 channel mới. Catalog handler nhận `userDataPath` để copy ảnh vào `<userData>/thumbnails/`. UI: 3-cột trong Catalog (categories | groups | GroupEditPanel), template management section bên dưới groups.

**Tech Stack:** Electron + React 18, Drizzle ORM / SQLite (better-sqlite3), TypeScript, Vitest, electron-vite

## Global Constraints

- UI text toàn bộ tiếng Việt
- Working dir: `/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager`
- Run tests: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run`
- Run typecheck: `npm run typecheck`
- Permission `manage_catalog` bảo vệ tất cả write operations (pattern `requirePermission` hiện tại)
- `dialog.openFile` không cần `auth_guard`
- Thumbnail chỉ chấp nhận extensions: `['jpg', 'jpeg', 'png', 'gif', 'webp']`

---

## File Map

| File | Thay đổi |
|---|---|
| `electron/main/db/migrations/0004_group_thumbnail_fields.sql` | **Mới**: recreate device_groups + 2 bảng mới |
| `electron/main/db/migrations/meta/_journal.json` | Thêm entry cho migration 0004 |
| `electron/main/db/schema.ts` | Bỏ `minStock` từ `deviceGroups`; thêm `thumbnailPath`; thêm 2 bảng mới |
| `electron/shared/ipc.ts` | Cập nhật `GroupRow`, `SaveGroupArgs`; thêm types + channels + Api entries |
| `electron/main/handlers/catalog.ts` | Cập nhật `saveGroup`, `deleteGroup`; thêm 5 methods mới; nhận `userDataPath` |
| `electron/main/handlers/catalog.test.ts` | Cập nhật tests loại bỏ `minStock`; thêm tests mới |
| `electron/main/handlers/dialog.ts` | **Mới**: `makeDialogHandlers` |
| `electron/main/handlers/index.ts` | Import dialog handler; register 6 channels mới; pass `userDataPath` |
| `electron/preload/index.ts` | Thêm 5 catalog methods + `dialog` namespace |
| `src/components/GroupEditPanel.tsx` | **Mới**: Panel chỉnh sửa nhóm (name, thumbnail, field values) |
| `src/pages/Catalog.tsx` | 3-cột layout; thay inline edit bằng `GroupEditPanel`; thêm template management section; bỏ minStock |

---

## Task 1: DB Migration + Drizzle Schema

**Files:**
- Create: `electron/main/db/migrations/0004_group_thumbnail_fields.sql`
- Modify: `electron/main/db/migrations/meta/_journal.json`
- Modify: `electron/main/db/schema.ts`

**Interfaces:**
- Produces: bảng `device_groups` (không có `min_stock`, có `thumbnail_path`), `group_field_templates`, `group_field_values` — dùng ở Task 3
- Produces: Drizzle types `GroupFieldTemplate`, `GroupFieldValue` — dùng ở Task 3

- [ ] **Step 1: Tạo file migration SQL**

Tạo file `electron/main/db/migrations/0004_group_thumbnail_fields.sql`:

```sql
-- Recreate device_groups: drop min_stock, add thumbnail_path
CREATE TABLE `device_groups_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `category_id` integer REFERENCES `categories`(`id`),
  `thumbnail_path` text,
  `created_at` text NOT NULL
);
INSERT INTO `device_groups_new` (`id`, `name`, `category_id`, `created_at`)
  SELECT `id`, `name`, `category_id`, `created_at` FROM `device_groups`;
DROP TABLE `device_groups`;
ALTER TABLE `device_groups_new` RENAME TO `device_groups`;

-- Global field templates
CREATE TABLE `group_field_templates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `display_order` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL
);

-- Per-group field values
CREATE TABLE `group_field_values` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `group_id` integer NOT NULL REFERENCES `device_groups`(`id`) ON DELETE CASCADE,
  `template_id` integer NOT NULL REFERENCES `group_field_templates`(`id`) ON DELETE CASCADE,
  `value` text NOT NULL DEFAULT '',
  UNIQUE(`group_id`, `template_id`)
);
```

- [ ] **Step 2: Cập nhật `_journal.json`**

Mở `electron/main/db/migrations/meta/_journal.json`. Thêm entry mới vào mảng `"entries"`:

```json
{
  "idx": 4,
  "version": "6",
  "when": 1751030400000,
  "tag": "0004_group_thumbnail_fields",
  "breakpoints": true
}
```

- [ ] **Step 3: Cập nhật `electron/main/db/schema.ts`**

Tìm dòng import đầu tiên:
```ts
import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
```
Giữ nguyên.

Tìm block `deviceGroups`:
```ts
export const deviceGroups = sqliteTable('device_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  minStock: integer('min_stock').notNull().default(0),
  createdAt: text('created_at').notNull()
})
```
Sửa thành:
```ts
export const deviceGroups = sqliteTable('device_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  thumbnailPath: text('thumbnail_path'),
  createdAt: text('created_at').notNull()
})
```

Tìm dòng `export const maintenanceLogs` và thêm 2 bảng mới **trước** nó:

```ts
export const groupFieldTemplates = sqliteTable('group_field_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: text('created_at').notNull()
})

export const groupFieldValues = sqliteTable('group_field_values', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id').notNull().references(() => deviceGroups.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').notNull().references(() => groupFieldTemplates.id, { onDelete: 'cascade' }),
  value: text('value').notNull().default(''),
}, (t) => ({
  uniq: uniqueIndex('uq_group_field').on(t.groupId, t.templateId),
}))
```

Tìm block `export const schema`:
```ts
export const schema = {
  categories, deviceGroups, departments, employees, appUsers,
  userPermissions, userGroups,
  devices, requests, allocations, maintenanceLogs
}
```
Sửa thành:
```ts
export const schema = {
  categories, deviceGroups, departments, employees, appUsers,
  userPermissions, userGroups,
  devices, requests, allocations, maintenanceLogs,
  groupFieldTemplates, groupFieldValues,
}
```

Tìm block types ở cuối file, thêm 2 types mới sau `export type UserGroup`:
```ts
export type GroupFieldTemplate = typeof groupFieldTemplates.$inferSelect
export type GroupFieldValue = typeof groupFieldValues.$inferSelect
```

- [ ] **Step 4: Chạy typecheck để xác nhận schema hợp lệ**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | grep -i "schema\|migration" | head -20
```

Expected: lỗi chỉ ở các file chưa cập nhật (catalog.ts, ipc.ts) — không có lỗi nội tại trong `schema.ts`.

- [ ] **Step 5: Chạy tests — migration chạy được trên in-memory DB**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/catalog.test.ts 2>&1 | tail -20
```

Expected: Tests liên quan đến `minStock` sẽ fail vì `SaveGroupArgs` chưa cập nhật — bình thường. Điều quan trọng: không có lỗi `migration failed` hay `no such table`. Nếu có lỗi migration, kiểm tra file SQL và _journal.json.

- [ ] **Step 6: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/db/migrations/0004_group_thumbnail_fields.sql \
        equipment-manager/electron/main/db/migrations/meta/_journal.json \
        equipment-manager/electron/main/db/schema.ts
git commit -m "feat: add group_field_templates, group_field_values tables; drop min_stock from device_groups"
```

---

## Task 2: IPC Types + Channels

**Files:**
- Modify: `electron/shared/ipc.ts`

**Interfaces:**
- Consumes: schema types từ Task 1
- Produces: `GroupFieldTemplate`, `GroupDetailResult`, `SaveGroupTemplateArgs`, `SaveGroupDetailArgs`, `OpenFileResult`; channels mới; `Api.catalog.*` + `Api.dialog` — dùng ở Task 3, 4, 5

- [ ] **Step 1: Cập nhật `CHANNELS` — thêm 6 channel mới**

Mở `electron/shared/ipc.ts`. Tìm dòng `catalogDeleteGroup: 'catalog.deleteGroup',` và thêm sau:

```ts
  catalogListGroupTemplates: 'catalog.listGroupTemplates',
  catalogSaveGroupTemplate: 'catalog.saveGroupTemplate',
  catalogDeleteGroupTemplate: 'catalog.deleteGroupTemplate',
  catalogGetGroupDetail: 'catalog.getGroupDetail',
  catalogSaveGroupDetail: 'catalog.saveGroupDetail',
  dialogOpenFile: 'dialog.openFile',
```

- [ ] **Step 2: Cập nhật `GroupRow` — bỏ `minStock`, thêm `thumbnailPath`**

Tìm:
```ts
export interface GroupRow { id: number; name: string; categoryId: number; categoryName: string; minStock: number }
```
Sửa thành:
```ts
export interface GroupRow { id: number; name: string; categoryId: number; categoryName: string; thumbnailPath: string | null }
```

- [ ] **Step 3: Cập nhật `SaveGroupArgs` — bỏ `minStock`**

Tìm:
```ts
export interface SaveGroupArgs { id?: number; name: string; categoryId: number; minStock: number }
```
Sửa thành:
```ts
export interface SaveGroupArgs { id?: number; name: string; categoryId: number }
```

- [ ] **Step 4: Thêm types mới**

Tìm dòng `export interface SaveUserGroupsArgs` và thêm **trước** nó:

```ts
export interface GroupFieldTemplate { id: number; name: string; displayOrder: number }
export interface GroupDetailResult {
  thumbnailPath: string | null
  fields: Array<{ templateId: number; name: string; value: string }>
}
export interface SaveGroupTemplateArgs { id?: number; name: string; displayOrder?: number }
export interface SaveGroupDetailArgs {
  groupId: number
  thumbnailSourcePath: string | null  // null = không đổi; '' = xóa; string path = file mới
  fields: Array<{ templateId: number; value: string }>
}
export interface OpenFileResult { canceled: boolean; filePath: string | null }
```

- [ ] **Step 5: Cập nhật `Api.catalog` interface**

Tìm:
```ts
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
Sửa thành:
```ts
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

- [ ] **Step 6: Typecheck — chỉ có lỗi ở catalog.ts và preload**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | head -30
```

Expected: lỗi ở `catalog.ts` (minStock), `catalog.test.ts`, `preload/index.ts`, `Catalog.tsx` — bình thường. `ipc.ts` không có lỗi nội tại.

- [ ] **Step 7: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claire/worktrees/elated-brown-e34abc" 2>/dev/null || cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/shared/ipc.ts
git commit -m "feat: update GroupRow/SaveGroupArgs; add group template/detail IPC types and channels"
```

---

## Task 3: Backend — Catalog Handler + Dialog Handler + Tests

**Files:**
- Modify: `electron/main/handlers/catalog.ts`
- Modify: `electron/main/handlers/catalog.test.ts`
- Create: `electron/main/handlers/dialog.ts`
- Modify: `electron/main/handlers/index.ts`

**Interfaces:**
- Consumes: `groupFieldTemplates`, `groupFieldValues` từ schema (Task 1); `GroupFieldTemplate`, `GroupDetailResult`, `SaveGroupTemplateArgs`, `SaveGroupDetailArgs`, `OpenFileResult` từ ipc.ts (Task 2)
- Produces: `makeCatalogHandlers(db, userDataPath?).listGroupTemplates/saveGroupTemplate/deleteGroupTemplate/getGroupDetail/saveGroupDetail`; `makeDialogHandlers().openFile` — dùng ở Task 4

- [ ] **Step 1: Viết failing tests cho các method mới**

Mở `electron/main/handlers/catalog.test.ts`. **Trước tiên** cập nhật các test hiện có để bỏ `minStock`.

Tìm TẤT CẢ `minStock: 0` trong file và xóa tham số đó (có 6 chỗ). Ví dụ:
```ts
// Trước:
await catalog.saveGroup({ name: 'Dell XPS 15', categoryId: catId, minStock: 0 })
// Sau:
await catalog.saveGroup({ name: 'Dell XPS 15', categoryId: catId })
```

Tìm describe block `catalog.saveGroup — minStock` (dòng ~128) và **xóa toàn bộ** describe block đó (từ `describe('catalog.saveGroup — minStock'` đến dấu `}` đóng tương ứng).

Thêm vào cuối file:

```ts
describe('catalog.listGroupTemplates', () => {
  it('returns empty array when no templates', async () => {
    const { catalog } = setup()
    const res = await catalog.listGroupTemplates()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.templates).toEqual([])
    }
  })
})

describe('catalog.saveGroupTemplate', () => {
  it('creates a new template and returns it', async () => {
    const { catalog } = setup()
    const res = await catalog.saveGroupTemplate({ name: 'Thương hiệu' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.id).toBeGreaterThan(0)
      expect(res.data.name).toBe('Thương hiệu')
    }
  })

  it('updates an existing template name', async () => {
    const { catalog } = setup()
    const created = await catalog.saveGroupTemplate({ name: 'Cũ' })
    if (!created.ok) throw new Error('create failed')
    const updated = await catalog.saveGroupTemplate({ id: created.data.id, name: 'Mới' })
    expect(updated.ok).toBe(true)
    const list = await catalog.listGroupTemplates()
    if (list.ok) {
      expect(list.data.templates.find(t => t.name === 'Mới')).toBeDefined()
      expect(list.data.templates.find(t => t.name === 'Cũ')).toBeUndefined()
    }
  })

  it('rejects empty name', async () => {
    const { catalog } = setup()
    const res = await catalog.saveGroupTemplate({ name: '   ' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })
})

describe('catalog.deleteGroupTemplate', () => {
  it('deletes template and cascades to field values', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id

    await catalog.saveGroup({ name: 'G1', categoryId: catId })
    const listAfter = await catalog.list()
    if (!listAfter.ok) throw new Error()
    const group = listAfter.data.groups.find(g => g.name === 'G1')!

    const tmpl = await catalog.saveGroupTemplate({ name: 'Hãng' })
    if (!tmpl.ok) throw new Error()

    // Save a value
    await catalog.saveGroupDetail({ groupId: group.id, thumbnailSourcePath: null, fields: [{ templateId: tmpl.data.id, value: 'Dell' }] })

    // Delete template
    const del = await catalog.deleteGroupTemplate({ id: tmpl.data.id })
    expect(del.ok).toBe(true)

    // Detail should have no fields
    const detail = await catalog.getGroupDetail({ groupId: group.id })
    if (detail.ok) expect(detail.data.fields).toHaveLength(0)
  })
})

describe('catalog.getGroupDetail', () => {
  it('returns null thumbnail and empty fields for new group', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id
    await catalog.saveGroup({ name: 'G2', categoryId: catId })
    const groups = await catalog.list()
    if (!groups.ok) throw new Error()
    const group = groups.data.groups.find(g => g.name === 'G2')!

    const res = await catalog.getGroupDetail({ groupId: group.id })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.thumbnailPath).toBeNull()
      expect(res.data.fields).toEqual([])
    }
  })

  it('returns NOT_FOUND for unknown group', async () => {
    const { catalog } = setup()
    const res = await catalog.getGroupDetail({ groupId: 99999 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })
})

describe('catalog.saveGroupDetail', () => {
  it('upserts field values for a group', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id
    await catalog.saveGroup({ name: 'G3', categoryId: catId })
    const groups = await catalog.list()
    if (!groups.ok) throw new Error()
    const group = groups.data.groups.find(g => g.name === 'G3')!

    const tmpl = await catalog.saveGroupTemplate({ name: 'Bảo hành' })
    if (!tmpl.ok) throw new Error()

    const res = await catalog.saveGroupDetail({
      groupId: group.id,
      thumbnailSourcePath: null,
      fields: [{ templateId: tmpl.data.id, value: '2 năm' }],
    })
    expect(res.ok).toBe(true)

    const detail = await catalog.getGroupDetail({ groupId: group.id })
    if (detail.ok) {
      const field = detail.data.fields.find(f => f.templateId === tmpl.data.id)
      expect(field?.value).toBe('2 năm')
    }
  })

  it('overwrites existing value on second call', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id
    await catalog.saveGroup({ name: 'G4', categoryId: catId })
    const groups = await catalog.list()
    if (!groups.ok) throw new Error()
    const group = groups.data.groups.find(g => g.name === 'G4')!

    const tmpl = await catalog.saveGroupTemplate({ name: 'Model' })
    if (!tmpl.ok) throw new Error()

    await catalog.saveGroupDetail({ groupId: group.id, thumbnailSourcePath: null, fields: [{ templateId: tmpl.data.id, value: 'v1' }] })
    await catalog.saveGroupDetail({ groupId: group.id, thumbnailSourcePath: null, fields: [{ templateId: tmpl.data.id, value: 'v2' }] })

    const detail = await catalog.getGroupDetail({ groupId: group.id })
    if (detail.ok) {
      expect(detail.data.fields.find(f => f.templateId === tmpl.data.id)?.value).toBe('v2')
    }
  })
})
```

- [ ] **Step 2: Chạy tests để xác nhận fail đúng chỗ**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/catalog.test.ts 2>&1 | tail -30
```

Expected: Các test hiện có fail vì `minStock` không còn trong type; tests mới fail vì methods chưa tồn tại.

- [ ] **Step 3: Cập nhật imports trong `catalog.ts`**

Mở `electron/main/handlers/catalog.ts`. Thay dòng import schema:
```ts
import { categories, departments, employees, deviceGroups, devices } from '../db/schema'
```
Thành:
```ts
import { categories, departments, employees, deviceGroups, devices, groupFieldTemplates, groupFieldValues } from '../db/schema'
```

Thêm Node.js imports ở đầu file (trước import drizzle):
```ts
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { extname, join } from 'path'
```

Cập nhật import drizzle để thêm `sql`:
```ts
import { eq } from 'drizzle-orm'
```
Giữ nguyên (không cần thêm).

Thêm tham số `userDataPath` vào function signature:
```ts
export function makeCatalogHandlers(db: AppDb) {
```
Sửa thành:
```ts
export function makeCatalogHandlers(db: AppDb, userDataPath?: string) {
```

Thêm import types vào block import from `@shared/ipc`:
```ts
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
  GroupFieldTemplate,
  GroupDetailResult,
  SaveGroupTemplateArgs,
  SaveGroupDetailArgs,
} from '@shared/ipc'
```

- [ ] **Step 4: Cập nhật `list()` — bỏ `minStock`, thêm `thumbnailPath`**

Tìm block select groups trong `list()`:
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
Sửa thành:
```ts
      const grps = db
        .select({
          id: deviceGroups.id,
          name: deviceGroups.name,
          categoryId: deviceGroups.categoryId,
          thumbnailPath: deviceGroups.thumbnailPath,
          categoryName: categories.name,
        })
```

Tìm block map groups:
```ts
          groups: grps.map<GroupRow>((g) => ({
            id: g.id,
            name: g.name,
            categoryId: g.categoryId ?? 0,
            categoryName: g.categoryName ?? '',
            minStock: g.minStock ?? 0,
          })),
```
Sửa thành:
```ts
          groups: grps.map<GroupRow>((g) => ({
            id: g.id,
            name: g.name,
            categoryId: g.categoryId ?? 0,
            categoryName: g.categoryName ?? '',
            thumbnailPath: g.thumbnailPath ?? null,
          })),
```

- [ ] **Step 5: Cập nhật `saveGroup()` — bỏ `minStock`**

Tìm trong `saveGroup`:
```ts
        db.update(deviceGroups)
          .set({ name: args.name.trim(), categoryId: args.categoryId, minStock: args.minStock ?? 0 })
          .where(eq(deviceGroups.id, args.id))
          .run()
```
Sửa thành:
```ts
        db.update(deviceGroups)
          .set({ name: args.name.trim(), categoryId: args.categoryId })
          .where(eq(deviceGroups.id, args.id))
          .run()
```

Tìm:
```ts
        db.insert(deviceGroups)
          .values({ name: args.name.trim(), categoryId: args.categoryId, minStock: args.minStock ?? 0, createdAt: now() })
          .run()
```
Sửa thành:
```ts
        db.insert(deviceGroups)
          .values({ name: args.name.trim(), categoryId: args.categoryId, createdAt: now() })
          .run()
```

- [ ] **Step 6: Cập nhật `deleteGroup()` — thêm thumbnail cleanup**

Tìm:
```ts
    async deleteGroup(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      db.update(devices)
        .set({ groupId: null })
        .where(eq(devices.groupId, args.id))
        .run()
      db.delete(deviceGroups).where(eq(deviceGroups.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },
```
Sửa thành:
```ts
    async deleteGroup(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      const group = db.select({ thumbnailPath: deviceGroups.thumbnailPath })
        .from(deviceGroups).where(eq(deviceGroups.id, args.id)).all()[0]
      db.update(devices).set({ groupId: null }).where(eq(devices.groupId, args.id)).run()
      db.delete(deviceGroups).where(eq(deviceGroups.id, args.id)).run()
      if (group?.thumbnailPath) {
        try { unlinkSync(group.thumbnailPath) } catch {}
      }
      return { ok: true, data: { ok: true } }
    },
```

- [ ] **Step 7: Thêm 5 methods mới vào `return { ... }` trong `makeCatalogHandlers`**

Thêm trước dấu `}` cuối của object return:

```ts
    async listGroupTemplates(): Promise<ApiResponse<{ templates: GroupFieldTemplate[] }>> {
      const rows = db.select().from(groupFieldTemplates).orderBy(groupFieldTemplates.displayOrder).all()
      return {
        ok: true,
        data: {
          templates: rows.map(r => ({ id: r.id, name: r.name, displayOrder: r.displayOrder })),
        },
      }
    },

    async saveGroupTemplate(args: SaveGroupTemplateArgs): Promise<ApiResponse<GroupFieldTemplate>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên trường không được để trống.' } }
      }
      if (args.id) {
        db.update(groupFieldTemplates)
          .set({ name: args.name.trim(), displayOrder: args.displayOrder ?? 0 })
          .where(eq(groupFieldTemplates.id, args.id))
          .run()
        return { ok: true, data: { id: args.id, name: args.name.trim(), displayOrder: args.displayOrder ?? 0 } }
      }
      const result = db.insert(groupFieldTemplates)
        .values({ name: args.name.trim(), displayOrder: args.displayOrder ?? 0, createdAt: now() })
        .returning()
        .all()[0]
      return { ok: true, data: { id: result.id, name: result.name, displayOrder: result.displayOrder } }
    },

    async deleteGroupTemplate(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      db.delete(groupFieldTemplates).where(eq(groupFieldTemplates.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },

    async getGroupDetail(args: { groupId: number }): Promise<ApiResponse<GroupDetailResult>> {
      const group = db.select({ thumbnailPath: deviceGroups.thumbnailPath })
        .from(deviceGroups).where(eq(deviceGroups.id, args.groupId)).all()[0]
      if (!group) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy nhóm.' } }
      }
      const values = db
        .select({
          templateId: groupFieldValues.templateId,
          name: groupFieldTemplates.name,
          value: groupFieldValues.value,
        })
        .from(groupFieldValues)
        .innerJoin(groupFieldTemplates, eq(groupFieldValues.templateId, groupFieldTemplates.id))
        .where(eq(groupFieldValues.groupId, args.groupId))
        .all()
      return {
        ok: true,
        data: {
          thumbnailPath: group.thumbnailPath ?? null,
          fields: values.map(v => ({ templateId: v.templateId, name: v.name, value: v.value })),
        },
      }
    },

    async saveGroupDetail(args: SaveGroupDetailArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_catalog')
      if (forbidden) return forbidden
      const group = db.select({ thumbnailPath: deviceGroups.thumbnailPath })
        .from(deviceGroups).where(eq(deviceGroups.id, args.groupId)).all()[0]
      if (!group) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy nhóm.' } }
      }

      if (args.thumbnailSourcePath === '') {
        if (group.thumbnailPath) { try { unlinkSync(group.thumbnailPath) } catch {} }
        db.update(deviceGroups).set({ thumbnailPath: null }).where(eq(deviceGroups.id, args.groupId)).run()
      } else if (args.thumbnailSourcePath !== null && userDataPath) {
        const thumbDir = join(userDataPath, 'thumbnails')
        if (!existsSync(thumbDir)) mkdirSync(thumbDir, { recursive: true })
        const ext = extname(args.thumbnailSourcePath)
        const destPath = join(thumbDir, `${args.groupId}-${Date.now()}${ext}`)
        copyFileSync(args.thumbnailSourcePath, destPath)
        if (group.thumbnailPath) { try { unlinkSync(group.thumbnailPath) } catch {} }
        db.update(deviceGroups).set({ thumbnailPath: destPath }).where(eq(deviceGroups.id, args.groupId)).run()
      }

      for (const field of args.fields) {
        const existing = db.select({ id: groupFieldValues.id })
          .from(groupFieldValues)
          .where(eq(groupFieldValues.groupId, args.groupId))
          .all()
          .find(r => {
            const val = db.select({ templateId: groupFieldValues.templateId })
              .from(groupFieldValues).where(eq(groupFieldValues.id, r.id)).all()[0]
            return val?.templateId === field.templateId
          })

        if (existing) {
          db.update(groupFieldValues)
            .set({ value: field.value })
            .where(eq(groupFieldValues.id, existing.id))
            .run()
        } else {
          db.insert(groupFieldValues)
            .values({ groupId: args.groupId, templateId: field.templateId, value: field.value })
            .run()
        }
      }

      return { ok: true, data: { ok: true } }
    },
```

**Lưu ý:** Logic upsert trên hơi phức tạp. Thay bằng cách đơn giản hơn dùng INSERT OR REPLACE (raw SQL) hoặc DELETE+INSERT. Sửa phần `for (const field of args.fields)` thành:

```ts
      for (const field of args.fields) {
        const found = db.select({ id: groupFieldValues.id })
          .from(groupFieldValues)
          .where(eq(groupFieldValues.groupId, args.groupId))
          .all()
        const existingRow = found.find(r => {
          const row = db.select({ templateId: groupFieldValues.templateId })
            .from(groupFieldValues).where(eq(groupFieldValues.id, r.id)).all()[0]
          return row?.templateId === field.templateId
        })
        if (existingRow) {
          db.update(groupFieldValues).set({ value: field.value }).where(eq(groupFieldValues.id, existingRow.id)).run()
        } else {
          db.insert(groupFieldValues).values({ groupId: args.groupId, templateId: field.templateId, value: field.value }).run()
        }
      }
```

Thực ra cách đơn giản nhất trong SQLite: dùng `INSERT OR REPLACE`. Thay toàn bộ `for` loop bằng:

```ts
      for (const field of args.fields) {
        db.run(
          `INSERT INTO group_field_values (group_id, template_id, value)
           VALUES (?, ?, ?)
           ON CONFLICT(group_id, template_id) DO UPDATE SET value = excluded.value`,
          [args.groupId, field.templateId, field.value]
        )
      }
```

Chú ý: `db.run()` ở đây là better-sqlite3 raw SQL. Drizzle wrapper có thể không expose `run()` trực tiếp. Dùng `db.$client.prepare(...).run(...)` hoặc drizzle's `sql` tagged template:

```ts
import { sql } from 'drizzle-orm'

// trong for loop:
      for (const field of args.fields) {
        db.run(sql`
          INSERT INTO group_field_values (group_id, template_id, value)
          VALUES (${args.groupId}, ${field.templateId}, ${field.value})
          ON CONFLICT(group_id, template_id) DO UPDATE SET value = excluded.value
        `)
      }
```

Thêm `sql` vào import drizzle-orm:
```ts
import { eq, sql } from 'drizzle-orm'
```

- [ ] **Step 8: Tạo `electron/main/handlers/dialog.ts`**

```ts
import { dialog } from 'electron'
import type { ApiResponse, OpenFileResult } from '@shared/ipc'

export function makeDialogHandlers() {
  return {
    async openFile(args: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<ApiResponse<OpenFileResult>> {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: args?.filters ?? [],
      })
      return {
        ok: true,
        data: { canceled: result.canceled, filePath: result.filePaths[0] ?? null },
      }
    },
  }
}
```

- [ ] **Step 9: Cập nhật `handlers/index.ts` — register 6 channels mới**

Thêm import:
```ts
import { makeDialogHandlers } from './dialog'
```

Trong `registerHandlers`, thêm `app` import và `userDataPath` — nhưng `index.ts` không nhận `app` hiện tại. Thay vào đó, lấy `userDataPath` từ `app` trực tiếp:

Thêm import ở đầu `index.ts`:
```ts
import { app } from 'electron'
```

Trong hàm `registerHandlers`, sau `const catalogH = makeCatalogHandlers(db)`:
```ts
  const catalogH = makeCatalogHandlers(db, app.getPath('userData'))
  const dialogH = makeDialogHandlers()
```

Sau dòng `ipcMain.handle(CHANNELS.catalogDeleteGroup, ...)` thêm:
```ts
  ipcMain.handle(CHANNELS.catalogListGroupTemplates, () => auth_guard(() => catalogH.listGroupTemplates()))
  ipcMain.handle(CHANNELS.catalogSaveGroupTemplate, (_e, args) => auth_guard(() => catalogH.saveGroupTemplate(args)))
  ipcMain.handle(CHANNELS.catalogDeleteGroupTemplate, (_e, args) => auth_guard(() => catalogH.deleteGroupTemplate(args)))
  ipcMain.handle(CHANNELS.catalogGetGroupDetail, (_e, args) => auth_guard(() => catalogH.getGroupDetail(args)))
  ipcMain.handle(CHANNELS.catalogSaveGroupDetail, (_e, args) => auth_guard(() => catalogH.saveGroupDetail(args)))
  ipcMain.handle(CHANNELS.dialogOpenFile, (_e, args) => dialogH.openFile(args))
```

- [ ] **Step 10: Chạy tests — xác nhận tất cả catalog tests PASS**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/catalog.test.ts 2>&1 | tail -30
```

Expected: tất cả tests PASS, bao gồm tests mới cho listGroupTemplates/saveGroupTemplate/deleteGroupTemplate/getGroupDetail/saveGroupDetail.

- [ ] **Step 11: Chạy toàn bộ tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -15
```

Expected: tất cả PASS.

- [ ] **Step 12: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/catalog.ts \
        equipment-manager/electron/main/handlers/catalog.test.ts \
        equipment-manager/electron/main/handlers/dialog.ts \
        equipment-manager/electron/main/handlers/index.ts
git commit -m "feat: add group template/detail catalog handlers; add dialog openFile handler"
```

---

## Task 4: Preload

**Files:**
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `CHANNELS.*` từ Task 2; handler signatures từ Task 3
- Produces: `window.api.catalog.listGroupTemplates/saveGroupTemplate/deleteGroupTemplate/getGroupDetail/saveGroupDetail`; `window.api.dialog.openFile` — dùng ở Task 5

- [ ] **Step 1: Cập nhật preload**

Mở `electron/preload/index.ts`. Tìm:
```ts
    saveGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveGroup, args),
    deleteGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteGroup, args),
  },
```
Sửa thành:
```ts
    saveGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveGroup, args),
    deleteGroup: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteGroup, args),
    listGroupTemplates: () => ipcRenderer.invoke(CHANNELS.catalogListGroupTemplates),
    saveGroupTemplate: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveGroupTemplate, args),
    deleteGroupTemplate: (args) => ipcRenderer.invoke(CHANNELS.catalogDeleteGroupTemplate, args),
    getGroupDetail: (args) => ipcRenderer.invoke(CHANNELS.catalogGetGroupDetail, args),
    saveGroupDetail: (args) => ipcRenderer.invoke(CHANNELS.catalogSaveGroupDetail, args),
  },
  dialog: {
    openFile: (args) => ipcRenderer.invoke(CHANNELS.dialogOpenFile, args),
  },
```

- [ ] **Step 2: Typecheck — không còn lỗi ở preload**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | grep "preload" | head -10
```

Expected: không lỗi ở preload.

- [ ] **Step 3: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/preload/index.ts
git commit -m "feat: expose group template/detail and dialog methods in preload"
```

---

## Task 5: GroupEditPanel Component + Catalog.tsx Update

**Files:**
- Create: `src/components/GroupEditPanel.tsx`
- Modify: `src/pages/Catalog.tsx`

**Interfaces:**
- Consumes: `api.catalog.listGroupTemplates/getGroupDetail/saveGroup/saveGroupDetail/saveGroupTemplate/deleteGroupTemplate`; `api.dialog.openFile`; `GroupRow`, `GroupFieldTemplate`, `GroupDetailResult` từ `@shared/ipc`
- Produces: `GroupEditPanel` component; updated 3-column `CategoriesTab`

- [ ] **Step 1: Tạo `src/components/GroupEditPanel.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { GroupRow, GroupFieldTemplate } from '@shared/ipc'

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

interface Props {
  group: GroupRow
  templates: GroupFieldTemplate[]
  onClose(): void
}

export function GroupEditPanel({ group, templates, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState(group.name)
  const [pendingThumbPath, setPendingThumbPath] = useState<string | null | ''>(null)
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({})
  const [error, setError] = useState('')

  const { data: detail } = useQuery({
    queryKey: ['groupDetail', group.id],
    queryFn: () => unwrap(api.catalog.getGroupDetail({ groupId: group.id })),
  })

  useEffect(() => {
    if (detail) {
      const vals: Record<number, string> = {}
      for (const f of detail.fields) vals[f.templateId] = f.value
      setFieldValues(vals)
    }
  }, [detail])

  useEffect(() => {
    setName(group.name)
    setPendingThumbPath(null)
    setError('')
  }, [group.id])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Tên nhóm không được để trống.')
      await unwrap(api.catalog.saveGroup({ id: group.id, name: name.trim(), categoryId: group.categoryId }))
      await unwrap(api.catalog.saveGroupDetail({
        groupId: group.id,
        thumbnailSourcePath: pendingThumbPath,
        fields: templates.map(t => ({ templateId: t.id, value: fieldValues[t.id] ?? '' })),
      }))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog'] })
      qc.invalidateQueries({ queryKey: ['groupDetail', group.id] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  async function pickThumbnail() {
    const res = await api.dialog.openFile({
      filters: [{ name: 'Ảnh', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    })
    if (res.ok && !res.data.canceled && res.data.filePath) {
      setPendingThumbPath(res.data.filePath)
    }
  }

  const currentThumbPath = pendingThumbPath === null
    ? detail?.thumbnailPath ?? null
    : pendingThumbPath === '' ? null : pendingThumbPath

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 10px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      width: 300, borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Chỉnh sửa nhóm</div>
        <button onClick={onClose} style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
        }}>
          <IconX size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Tên nhóm */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
            Tên nhóm <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Thumbnail */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Ảnh đại diện</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {currentThumbPath ? (
              <img
                src={`file://${currentThumbPath}`}
                alt=""
                style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }}
              />
            ) : (
              <div style={{
                width: 64, height: 64, borderRadius: 6, border: '1px dashed var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: 'var(--text-muted)',
              }}>🖼</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={pickThumbnail}
                style={{
                  height: 30, padding: '0 10px', fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'none', color: 'var(--text)', cursor: 'pointer',
                }}
              >Chọn ảnh</button>
              {currentThumbPath && (
                <button
                  onClick={() => setPendingThumbPath('')}
                  style={{
                    height: 30, padding: '0 10px', fontSize: 12, fontWeight: 600,
                    border: '1px solid rgba(220,38,38,.3)', borderRadius: 'var(--rad-sm)',
                    background: 'none', color: '#dc2626', cursor: 'pointer',
                  }}
                >Xóa ảnh</button>
              )}
            </div>
          </div>
        </div>

        {/* Field values */}
        {templates.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Thông tin bổ sung
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(t => (
                <div key={t.id}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t.name}</label>
                  <input
                    value={fieldValues[t.id] ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [t.id]: e.target.value }))}
                    placeholder="Chưa điền"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>{error}</div>}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 8,
        padding: '12px 14px', borderTop: '1px solid var(--border)',
      }}>
        <button onClick={onClose} style={{
          height: 34, padding: '0 14px', border: '1px solid var(--border)',
          borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>Hủy</button>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          style={{
            height: 34, padding: '0 14px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: saveMut.isPending ? 'not-allowed' : 'pointer',
            opacity: saveMut.isPending ? 0.7 : 1,
          }}
        >{saveMut.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật `src/pages/Catalog.tsx` — `CategoriesTab`**

Mở `src/pages/Catalog.tsx`. Thêm imports mới ở đầu file (sau các imports hiện có):

```ts
import { GroupEditPanel } from '@/components/GroupEditPanel'
import type { GroupFieldTemplate } from '@shared/ipc'
```

Trong `CategoriesTab`, thêm vào imports useQuery:
- Đã có `useMutation, useQueryClient` — thêm `useQuery` nếu chưa có.

Trong `function CategoriesTab`, thêm state cho editing và templates:
```ts
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null)
```

Thêm query cho templates:
```ts
  const { data: templateData } = useQuery({
    queryKey: ['groupTemplates'],
    queryFn: () => unwrap(api.catalog.listGroupTemplates()),
  })
  const templates: GroupFieldTemplate[] = templateData?.templates ?? []
```

Thêm mutations cho template management:
```ts
  const [newTemplateName, setNewTemplateName] = useState('')
  const saveTemplateMut = useMutation({
    mutationFn: (name: string) => unwrap(api.catalog.saveGroupTemplate({ name })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groupTemplates'] }); setNewTemplateName('') },
  })
  const deleteTemplateMut = useMutation({
    mutationFn: (id: number) => unwrap(api.catalog.deleteGroupTemplate({ id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groupTemplates'] }),
  })
  const [confirmDeleteTemplateId, setConfirmDeleteTemplateId] = useState<number | null>(null)
```

Tìm nút "Sửa" nhóm trong `selectedGroups.map` — hiện là `IconBtn` với onClick `setEditGroupId`. Sửa handler:
```tsx
// Tìm nút Sửa trong groups list (hiện có setEditGroupId):
<IconBtn title="Sửa" onClick={() => { setEditGroupId(grp.id); setEditGroupName(grp.name); setEditGroupMin(grp.minStock) }}>
```
Sửa thành:
```tsx
<IconBtn title="Sửa" onClick={() => setEditingGroup(grp)}>
```

Xóa toàn bộ inline-edit section trong groups row (block `{editGroupId === grp.id ? (...)  : ...}`) — thay bằng chỉ hiển thị tên nhóm:
```tsx
{selectedGroups.map(grp => (
  <div key={grp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 'var(--rad-sm)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {grp.thumbnailPath && (
        <img src={`file://${grp.thumbnailPath}`} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
      )}
      <span style={{ fontSize: 13 }}>{grp.name}</span>
    </div>
    <div style={{ display: 'flex', gap: 4 }}>
      <IconBtn title="Sửa" onClick={() => setEditingGroup(grp)}><IconEdit size={13} /></IconBtn>
      <IconBtn title="Xóa" onClick={() => delGroupMut.mutate(grp.id)}><IconTrash size={13} /></IconBtn>
    </div>
  </div>
))}
```

Xóa state variables không còn dùng: `editGroupId`, `editGroupName`, `editGroupMin`.

Tìm form "thêm nhóm mới" bên dưới groups list — bỏ `InlineInput` cho `newGroupMin`:
```tsx
// Tìm:
<InlineInput type="number" min={0} value={newGroupMin} onChange={e => setNewGroupMin(Number(e.target.value))} style={{ width: 64 }} />
// Xóa dòng này.
```

Sửa `saveGroupMut.mutate({ name: newGroupName, categoryId: selectedCatId, minStock: newGroupMin })` thành:
```tsx
saveGroupMut.mutate({ name: newGroupName, categoryId: selectedCatId })
```

Bỏ `newGroupMin` state và `setNewGroupMin`.

Thêm **section Template Management** bên dưới groups panel (sau closing div của `{/* Right: groups */}`):

```tsx
{/* ── Template fields section ── */}
<div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
    Trường thông tin nhóm
  </div>
  {templates.map(t => (
    <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontSize: 13 }}>{t.name}</span>
      {isAdmin && (
        <IconBtn title="Xóa" onClick={() => setConfirmDeleteTemplateId(t.id)}><IconTrash size={12} /></IconBtn>
      )}
    </div>
  ))}
  {isAdmin && (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <InlineInput
        value={newTemplateName}
        onChange={e => setNewTemplateName(e.target.value)}
        placeholder="Tên trường mới"
        style={{ flex: 1 }}
        onKeyDown={e => { if (e.key === 'Enter' && newTemplateName.trim()) saveTemplateMut.mutate(newTemplateName.trim()) }}
      />
      <button
        onClick={() => { if (newTemplateName.trim()) saveTemplateMut.mutate(newTemplateName.trim()) }}
        style={{ height: 30, padding: '0 10px', border: 'none', borderRadius: 'var(--rad-sm)', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >+</button>
    </div>
  )}
  {confirmDeleteTemplateId !== null && (
    <div style={{ marginTop: 10, padding: '10px', background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.2)', borderRadius: 'var(--rad-sm)', fontSize: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 600, color: '#dc2626' }}>Xóa trường này sẽ xóa dữ liệu của tất cả nhóm. Tiếp tục?</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => { deleteTemplateMut.mutate(confirmDeleteTemplateId); setConfirmDeleteTemplateId(null) }} style={{ height: 28, padding: '0 10px', border: 'none', borderRadius: 'var(--rad-sm)', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Xóa</button>
        <button onClick={() => setConfirmDeleteTemplateId(null)} style={{ height: 28, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>Hủy</button>
      </div>
    </div>
  )}
</div>
```

Cập nhật layout chính trong return của `CategoriesTab` — bọc groups panel + edit panel trong flex row:

Tìm `{/* ── Right: groups ── */}` và bọc nó cùng với GroupEditPanel trong một container:

```tsx
{/* ── Right: groups + edit panel ── */}
<div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
  <div style={{ flex: 1, /* existing groups panel styles... */ }}>
    {/* ... existing groups panel content ... */}
  </div>
  {editingGroup && (
    <GroupEditPanel
      group={editingGroup}
      templates={templates}
      onClose={() => setEditingGroup(null)}
    />
  )}
</div>
```

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claire/worktrees/elated-brown-e34abc" 2>/dev/null || cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | head -30
```

Expected: không lỗi.

- [ ] **Step 4: Chạy toàn bộ tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -15
```

Expected: tất cả PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/components/GroupEditPanel.tsx \
        equipment-manager/src/pages/Catalog.tsx
git commit -m "feat: add GroupEditPanel with thumbnail/fields; update CategoriesTab to 3-col layout"
```

---

## Task 6: Devices.tsx — Thumbnail trong cột Group

**Files:**
- Modify: `src/pages/Devices.tsx`

**Interfaces:**
- Consumes: `GroupRow.thumbnailPath` từ `catalog` data (đã có trong state)

- [ ] **Step 1: Thêm thumbnail nhỏ vào cột group**

Mở `src/pages/Devices.tsx`. Tìm block hiển thị group trong cột `categoryGroup` (khoảng dòng nơi có `row.original.group`):

```tsx
          {row.original.group && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.original.group}</div>
          )}
```

Cần thumbnail path của group. `DeviceRow` có `groupId` nhưng không có `thumbnailPath`. Lấy từ `catalogData?.groups`:

Tìm nơi `groupsForCategory` được tính (dùng `catalogData`). Thêm helper:
```ts
  const groupById = useMemo(
    () => new Map((catalogData?.groups ?? []).map(g => [g.id, g])),
    [catalogData?.groups]
  )
```

Thêm `useMemo` vào import từ `react` nếu chưa có.

Sửa cell render cột group:
```tsx
          {row.original.group && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {(() => {
                const grp = row.original.groupId ? groupById.get(row.original.groupId) : null
                return grp?.thumbnailPath ? (
                  <img src={`file://${grp.thumbnailPath}`} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                ) : null
              })()}
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.original.group}</div>
            </div>
          )}
```

- [ ] **Step 2: Typecheck + tests**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | grep "Devices" | head -10
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -10
```

Expected: không lỗi, tất cả tests PASS.

- [ ] **Step 3: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/pages/Devices.tsx
git commit -m "feat: show group thumbnail in Devices table group column"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Migration: drop `min_stock`, add `thumbnail_path` | Task 1 |
| Bảng `group_field_templates` | Task 1 |
| Bảng `group_field_values` với FK CASCADE | Task 1 |
| `GroupRow` bỏ `minStock`, thêm `thumbnailPath` | Task 2 |
| `SaveGroupArgs` bỏ `minStock` | Task 2 |
| Channels: `catalogListGroupTemplates/SaveGroupTemplate/DeleteGroupTemplate/GetGroupDetail/SaveGroupDetail` | Task 2 |
| Channel: `dialogOpenFile` | Task 2 |
| Types: `GroupFieldTemplate`, `GroupDetailResult`, `SaveGroupTemplateArgs`, `SaveGroupDetailArgs`, `OpenFileResult` | Task 2 |
| `catalog.saveGroup` bỏ minStock | Task 3 |
| `catalog.deleteGroup` cleanup thumbnail file | Task 3 |
| 5 catalog methods mới | Task 3 |
| `dialog.openFile` handler | Task 3 |
| `makeCatalogHandlers(db, userDataPath?)` — copy file vào `<userData>/thumbnails/` | Task 3 |
| Preload expose methods mới | Task 4 |
| `GroupEditPanel`: name, thumbnail pick/delete, field values | Task 5 |
| 3-cột layout khi editing | Task 5 |
| Template management section (thêm/xóa + confirm) | Task 5 |
| Devices.tsx thumbnail 24×24 trong cột group | Task 6 |

Tất cả requirements có task. ✓

### Type consistency check

- `GroupRow.thumbnailPath: string | null` — định nghĩa Task 2, trả về Task 3 (`list()`), đọc Task 5 (`GroupEditPanel`), Task 6 (`groupById.get(...)`) ✓
- `SaveGroupArgs` không có `minStock` — định nghĩa Task 2, implement Task 3 (`saveGroup`), dùng Task 5 (`GroupEditPanel.saveMut`) ✓
- `SaveGroupDetailArgs.thumbnailSourcePath: string | null | ''` — định nghĩa Task 2, implement Task 3 (`saveGroupDetail`), dùng Task 5 (`setPendingThumbPath`) ✓
- `GroupFieldTemplate.id/name/displayOrder` — định nghĩa Task 2, trả về Task 3 (`listGroupTemplates`, `saveGroupTemplate`), dùng Task 5 ✓
- `GroupDetailResult.fields[].templateId/name/value` — định nghĩa Task 2, trả về Task 3 (`getGroupDetail`), đọc Task 5 ✓
