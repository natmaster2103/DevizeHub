# Device Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Add Device, Edit Device, Change Status dialogs và fix pagination trên màn hình Quản lý thiết bị.

**Architecture:** Thêm 3 IPC channels + backend handlers, 2 shared dialog components (`DeviceFormDialog`, `ChangeStatusDialog`), wire vào `Devices.tsx` và `DeviceDetail.tsx`. Pagination server-side. Không thay đổi DB schema.

**Tech Stack:** Electron + React 18, Drizzle ORM / SQLite (better-sqlite3), TypeScript, Vitest, electron-vite

## Global Constraints

- Label tiếng Việt cho tất cả UI text
- `changeStatus` chỉ nhận `available | maintenance | broken | decommissioned` — không `allocated`
- Thiết bị đang `allocated` (có active allocation) không được đổi trạng thái thủ công
- Run tests: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run`
- Run typecheck: `cd equipment-manager && npm run typecheck`
- Working dir: `/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager`

---

## File Map

| File | Thay đổi |
|---|---|
| `electron/shared/ipc.ts` | Thêm channels, types, cập nhật `DeviceRow`, `DeviceListArgs`, `DeviceListResult`, `Api.devices` |
| `electron/main/handlers/devices.ts` | Thêm `create`, `update`, `changeStatus`; cập nhật `list` (pagination + categoryId), `get` (categoryId) |
| `electron/main/handlers/devices.test.ts` | Thêm tests cho 3 handlers mới; cập nhật assertions sau pagination |
| `electron/main/handlers/index.ts` | Register 3 channel mới |
| `electron/preload/index.ts` | Thêm 3 method vào `api.devices` |
| `src/hooks/useDevices.ts` | Thêm `page`, `pageSize` param |
| `src/components/DeviceFormDialog.tsx` | **Mới**: Add + Edit dialog |
| `src/components/ChangeStatusDialog.tsx` | **Mới**: Change status dialog |
| `src/pages/Devices.tsx` | Wire 2 dialogs + pagination thật |
| `src/pages/DeviceDetail.tsx` | Wire 2 dialogs |

---

## Task 1: IPC Layer — channels, types, Api interface

**Files:**
- Modify: `electron/shared/ipc.ts`

**Interfaces:**
- Produces: `DeviceCreateArgs`, `DeviceUpdateArgs`, `DeviceChangeStatusArgs` — dùng ở Task 2, 4, 5, 6, 7
- Produces: `DeviceRow.categoryId`, `DeviceListArgs.page/pageSize`, `DeviceListResult.total` (filtered) — dùng ở Task 2, 3

- [ ] **Step 1: Thêm channels vào `CHANNELS`**

Mở `electron/shared/ipc.ts`. Tìm dòng `devicesGet: 'devices.get',` và thêm sau nó:
```ts
  devicesCreate: 'devices.create',
  devicesUpdate: 'devices.update',
  devicesChangeStatus: 'devices.changeStatus',
```

- [ ] **Step 2: Cập nhật `DeviceRow` — thêm `categoryId`**

Tìm:
```ts
export interface DeviceRow {
  sku: string
  name: string
  category: string
  status: DeviceStatus
  department: string | null
  holder: string | null
  serialNumber: string | null
}
```
Sửa thành:
```ts
export interface DeviceRow {
  sku: string
  name: string
  category: string
  categoryId: number | null
  status: DeviceStatus
  department: string | null
  holder: string | null
  serialNumber: string | null
}
```

- [ ] **Step 3: Cập nhật `DeviceListArgs` và `DeviceListResult`**

Tìm:
```ts
export interface DeviceListArgs { filter: 'all' | DeviceStatus; query: string }
export interface DeviceListResult { devices: DeviceRow[]; counts: StatusCount[]; total: number }
```
Sửa thành:
```ts
export interface DeviceListArgs {
  filter: 'all' | DeviceStatus
  query: string
  page?: number      // 1-based, default 1
  pageSize?: number  // default 20
}
export interface DeviceListResult {
  devices: DeviceRow[]   // đã slice theo page
  counts: StatusCount[]  // tính trên toàn bộ devices (không bị filter/query ảnh hưởng)
  total: number          // tổng sau filter+search, trước slice — dùng tính totalPages
}
```

- [ ] **Step 4: Thêm arg types mới**

Tìm dòng `export interface DeviceGetArgs { sku: string }` và thêm sau:
```ts
export interface DeviceCreateArgs {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
}

export interface DeviceUpdateArgs {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
}

export interface DeviceChangeStatusArgs {
  sku: string
  status: 'available' | 'maintenance' | 'broken' | 'decommissioned'
  notes: string | null
}
```

- [ ] **Step 5: Cập nhật `Api.devices` interface**

Tìm:
```ts
  devices: {
    list(args: DeviceListArgs): Promise<ApiResponse<DeviceListResult>>
    get(args: DeviceGetArgs): Promise<ApiResponse<DeviceDetailResult>>
  }
```
Sửa thành:
```ts
  devices: {
    list(args: DeviceListArgs): Promise<ApiResponse<DeviceListResult>>
    get(args: DeviceGetArgs): Promise<ApiResponse<DeviceDetailResult>>
    create(args: DeviceCreateArgs): Promise<ApiResponse<{ sku: string }>>
    update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>>
    changeStatus(args: DeviceChangeStatusArgs): Promise<ApiResponse<{ ok: true }>>
  }
```

- [ ] **Step 6: Chạy typecheck để xác nhận không lỗi**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | head -30
```

Expected: Có lỗi TypeScript ở các files chưa implement (devices.ts, preload, useDevices) — đây là bình thường ở bước này vì chúng ta chưa cập nhật các file đó. Chỉ cần `ipc.ts` không có lỗi nội tại.

- [ ] **Step 7: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/shared/ipc.ts
git commit -m "feat: add device create/update/changeStatus IPC types and channels"
```

---

## Task 2: Backend — handlers + tests

**Files:**
- Modify: `electron/main/handlers/devices.ts`
- Modify: `electron/main/handlers/devices.test.ts`
- Modify: `electron/main/handlers/index.ts`

**Interfaces:**
- Consumes: `DeviceCreateArgs`, `DeviceUpdateArgs`, `DeviceChangeStatusArgs`, `DeviceRow.categoryId`, `DeviceListArgs.page/pageSize` từ Task 1
- Produces: `makeDeviceHandlers(db).create/update/changeStatus` — dùng ở `index.ts`

- [ ] **Step 1: Viết failing tests trước**

Mở `electron/main/handlers/devices.test.ts`. Thêm vào cuối file:

```ts
describe('devices.create', () => {
  it('inserts a new device and returns its sku', async () => {
    const h = setup()
    const res = await h.create({
      sku: 'NEW-001',
      name: 'Thiết bị mới',
      categoryId: null,
      serialNumber: null,
      notes: null,
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.sku).toBe('NEW-001')
  })

  it('returns CONFLICT when SKU already exists', async () => {
    const h = setup()
    await h.create({ sku: 'DUP-001', name: 'A', categoryId: null, serialNumber: null, notes: null })
    const res = await h.create({ sku: 'DUP-001', name: 'B', categoryId: null, serialNumber: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('CONFLICT')
  })
})

describe('devices.update', () => {
  it('updates name and notes of an existing device', async () => {
    const h = setup()
    await h.create({ sku: 'UPD-001', name: 'Old Name', categoryId: null, serialNumber: null, notes: null })
    const res = await h.update({ sku: 'UPD-001', name: 'New Name', categoryId: null, serialNumber: 'SN-99', notes: 'updated' })
    expect(res.ok).toBe(true)
    const detail = await h.get({ sku: 'UPD-001' })
    if (detail.ok) {
      expect(detail.data.device.name).toBe('New Name')
      expect(detail.data.device.serialNumber).toBe('SN-99')
    }
  })

  it('returns NOT_FOUND for unknown sku', async () => {
    const h = setup()
    const res = await h.update({ sku: 'NOPE', name: 'X', categoryId: null, serialNumber: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })
})

describe('devices.changeStatus', () => {
  it('changes status from available to maintenance', async () => {
    const h = setup()
    await h.create({ sku: 'CS-001', name: 'Device', categoryId: null, serialNumber: null, notes: null })
    const res = await h.changeStatus({ sku: 'CS-001', status: 'maintenance', notes: null })
    expect(res.ok).toBe(true)
    const detail = await h.get({ sku: 'CS-001' })
    if (detail.ok) expect(detail.data.device.status).toBe('maintenance')
  })

  it('returns BAD_REQUEST when target status is allocated', async () => {
    const h = setup()
    await h.create({ sku: 'CS-002', name: 'Device', categoryId: null, serialNumber: null, notes: null })
    // @ts-expect-error intentional invalid status
    const res = await h.changeStatus({ sku: 'CS-002', status: 'allocated', notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })

  it('returns CONFLICT when device has active allocation', async () => {
    const h = setup()
    // LAP-0001 is seeded as allocated
    const list = await h.list({ filter: 'allocated', query: '' })
    if (!list.ok || list.data.devices.length === 0) return
    const allocatedSku = list.data.devices[0].sku
    const res = await h.changeStatus({ sku: allocatedSku, status: 'maintenance', notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('CONFLICT')
  })
})

describe('devices.list — pagination', () => {
  it('returns first page of 5 when pageSize=5', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: '', page: 1, pageSize: 5 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.devices.length).toBe(5)
      expect(res.data.total).toBe(12)
    }
  })

  it('returns correct second page', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: '', page: 2, pageSize: 5 })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.devices.length).toBe(5)
  })

  it('counts array still reflects all devices regardless of page', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: '', page: 1, pageSize: 2 })
    if (res.ok) {
      const all = res.data.counts.find(c => c.key === 'all')
      expect(all?.count).toBe(12)
    }
  })
})
```

- [ ] **Step 2: Chạy tests để xác nhận fail**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/devices.test.ts 2>&1 | tail -20
```

Expected: fail vì `create`, `update`, `changeStatus` chưa tồn tại.

- [ ] **Step 3: Implement `list` — thêm pagination và `categoryId`**

Mở `electron/main/handlers/devices.ts`. Tìm dòng `import { eq, isNull, and } from 'drizzle-orm'` và sửa:
```ts
import { eq, isNull, and, isNotNull } from 'drizzle-orm'
```

Tìm block `devRows`:
```ts
      const devRows = db
        .select({
          id: devices.id,
          sku: devices.sku,
          name: devices.name,
          status: devices.status,
          serialNumber: devices.serialNumber,
          categoryName: categories.name,
        })
```
Sửa thành:
```ts
      const devRows = db
        .select({
          id: devices.id,
          sku: devices.sku,
          name: devices.name,
          status: devices.status,
          serialNumber: devices.serialNumber,
          categoryId: devices.categoryId,
          categoryName: categories.name,
        })
```

Tìm block `Shape into DeviceRow`:
```ts
      let deviceRows: DeviceRow[] = devRows.map((r) => {
        const alloc = activeByDeviceId.get(r.id)
        return {
          sku: r.sku,
          name: r.name,
          category: r.categoryName ?? '',
          status: r.status as DeviceStatus,
          serialNumber: r.serialNumber ?? null,
          holder: alloc?.holderName ?? null,
          department: alloc?.deptName ?? null,
        }
      })
```
Sửa thành:
```ts
      let deviceRows: DeviceRow[] = devRows.map((r) => {
        const alloc = activeByDeviceId.get(r.id)
        return {
          sku: r.sku,
          name: r.name,
          category: r.categoryName ?? '',
          categoryId: r.categoryId ?? null,
          status: r.status as DeviceStatus,
          serialNumber: r.serialNumber ?? null,
          holder: alloc?.holderName ?? null,
          department: alloc?.deptName ?? null,
        }
      })
```

Tìm đoạn `return { ok: true, data: ...}` ở cuối `list`:
```ts
      return {
        ok: true,
        data: { devices: deviceRows, counts, total: devRows.length },
      }
```
Thay bằng:
```ts
      const total = deviceRows.length
      const page = args.page ?? 1
      const pageSize = args.pageSize ?? 20
      const paged = deviceRows.slice((page - 1) * pageSize, page * pageSize)

      return {
        ok: true,
        data: { devices: paged, counts, total },
      }
```

- [ ] **Step 4: Implement `get` — thêm `categoryId` vào device row**

Trong `get`, tìm block `deviceRow`:
```ts
      const deviceRow = db
        .select({
          id: devices.id,
          sku: devices.sku,
          name: devices.name,
          status: devices.status,
          serialNumber: devices.serialNumber,
          notes: devices.notes,
          createdAt: devices.createdAt,
          categoryName: categories.name,
        })
```
Sửa thành:
```ts
      const deviceRow = db
        .select({
          id: devices.id,
          sku: devices.sku,
          name: devices.name,
          status: devices.status,
          serialNumber: devices.serialNumber,
          notes: devices.notes,
          createdAt: devices.createdAt,
          categoryId: devices.categoryId,
          categoryName: categories.name,
        })
```

Tìm `const deviceRowOut`:
```ts
      const deviceRowOut: DeviceDetailResult['device'] = {
        sku: deviceRow.sku,
        name: deviceRow.name,
        category: deviceRow.categoryName ?? '',
        status: deviceRow.status as DeviceStatus,
        serialNumber: deviceRow.serialNumber ?? null,
        holder: holderName,
        department: deptName,
        notes: deviceRow.notes ?? null,
      }
```
Sửa thành:
```ts
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
      }
```

- [ ] **Step 5: Thêm 3 handler mới vào `makeDeviceHandlers`**

Cuối object `return { ... }` trong `makeDeviceHandlers` (trước dấu `}`), thêm 3 methods:

```ts
    async create(args: DeviceCreateArgs): Promise<ApiResponse<{ sku: string }>> {
      if (!args?.sku?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'SKU không được để trống.' } }
      }
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên thiết bị không được để trống.' } }
      }
      const existing = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku.trim())).all()[0]
      if (existing) {
        return { ok: false, error: { code: 'CONFLICT', message: `SKU "${args.sku.trim()}" đã tồn tại.` } }
      }
      const now = new Date().toISOString()
      db.insert(devices).values({
        sku: args.sku.trim(),
        name: args.name.trim(),
        categoryId: args.categoryId ?? null,
        serialNumber: args.serialNumber?.trim() || null,
        status: 'available',
        notes: args.notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      }).run()
      return { ok: true, data: { sku: args.sku.trim() } }
    },

    async update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>> {
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên thiết bị không được để trống.' } }
      }
      const device = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku)).all()[0]
      if (!device) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
      }
      db.update(devices)
        .set({
          name: args.name.trim(),
          categoryId: args.categoryId ?? null,
          serialNumber: args.serialNumber?.trim() || null,
          notes: args.notes?.trim() || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(devices.sku, args.sku))
        .run()
      return { ok: true, data: { ok: true } }
    },

    async changeStatus(args: DeviceChangeStatusArgs): Promise<ApiResponse<{ ok: true }>> {
      const allowed: string[] = ['available', 'maintenance', 'broken', 'decommissioned']
      if (!allowed.includes(args.status)) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Không thể đổi sang trạng thái này thủ công.' } }
      }
      const device = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku)).all()[0]
      if (!device) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
      }
      const activeAlloc = db.select({ id: allocations.id })
        .from(allocations)
        .where(and(eq(allocations.deviceId, device.id), isNull(allocations.returnedAt)))
        .all()[0]
      if (activeAlloc) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: 'Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi đổi trạng thái.' },
        }
      }
      db.update(devices)
        .set({ status: args.status, updatedAt: new Date().toISOString() })
        .where(eq(devices.sku, args.sku))
        .run()
      return { ok: true, data: { ok: true } }
    },
```

Thêm import `DeviceCreateArgs, DeviceUpdateArgs, DeviceChangeStatusArgs` vào top import:
```ts
import type {
  ApiResponse,
  DeviceListArgs,
  DeviceListResult,
  DeviceGetArgs,
  DeviceDetailResult,
  DeviceRow,
  StatusCount,
  DeviceHistoryEntry,
  DeviceInfoField,
  DeviceStatus,
  DeviceCreateArgs,
  DeviceUpdateArgs,
  DeviceChangeStatusArgs,
} from '@shared/ipc'
```

- [ ] **Step 6: Register 3 channel mới trong `index.ts`**

Mở `electron/main/handlers/index.ts`. Tìm dòng:
```ts
  ipcMain.handle(CHANNELS.devicesGet, (_e, args) => auth_guard(() => devicesH.get(args)))
```
Thêm sau:
```ts
  ipcMain.handle(CHANNELS.devicesCreate, (_e, args) => auth_guard(() => devicesH.create(args)))
  ipcMain.handle(CHANNELS.devicesUpdate, (_e, args) => auth_guard(() => devicesH.update(args)))
  ipcMain.handle(CHANNELS.devicesChangeStatus, (_e, args) => auth_guard(() => devicesH.changeStatus(args)))
```

- [ ] **Step 7: Chạy tests — xác nhận tất cả pass**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/devices.test.ts 2>&1 | tail -25
```

Expected: tất cả tests PASS (bao gồm 3 existing + 12 mới).

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck 2>&1 | grep -E "devices\.(ts|test)" | head -20
```

Expected: không lỗi ở `devices.ts` và `devices.test.ts`. Có thể còn lỗi ở `preload` và `useDevices` — sẽ fix ở Task 3.

- [ ] **Step 9: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/main/handlers/devices.ts \
        equipment-manager/electron/main/handlers/devices.test.ts \
        equipment-manager/electron/main/handlers/index.ts
git commit -m "feat: add device create/update/changeStatus handlers with pagination"
```

---

## Task 3: Preload + useDevices hook

**Files:**
- Modify: `electron/preload/index.ts`
- Modify: `src/hooks/useDevices.ts`

**Interfaces:**
- Consumes: `DeviceCreateArgs`, `DeviceUpdateArgs`, `DeviceChangeStatusArgs`, `CHANNELS.devicesCreate/Update/ChangeStatus` từ Task 1
- Produces: `api.devices.create/update/changeStatus` — dùng ở Task 6, 7

- [ ] **Step 1: Cập nhật `electron/preload/index.ts`**

Tìm:
```ts
  devices: {
    list: (args) => ipcRenderer.invoke(CHANNELS.devicesList, args),
    get: (args) => ipcRenderer.invoke(CHANNELS.devicesGet, args)
  },
```
Sửa thành:
```ts
  devices: {
    list: (args) => ipcRenderer.invoke(CHANNELS.devicesList, args),
    get: (args) => ipcRenderer.invoke(CHANNELS.devicesGet, args),
    create: (args) => ipcRenderer.invoke(CHANNELS.devicesCreate, args),
    update: (args) => ipcRenderer.invoke(CHANNELS.devicesUpdate, args),
    changeStatus: (args) => ipcRenderer.invoke(CHANNELS.devicesChangeStatus, args),
  },
```

- [ ] **Step 2: Cập nhật `src/hooks/useDevices.ts`**

Sửa toàn bộ file thành:
```ts
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { DeviceStatus } from '@shared/ipc'

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

- [ ] **Step 3: Chạy typecheck — xác nhận không còn lỗi liên quan preload/hooks**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | head -30
```

Expected: Lỗi chỉ còn (nếu có) ở `Devices.tsx` và `DeviceDetail.tsx` — chưa updated. `preload/index.ts` và `hooks/useDevices.ts` sạch.

- [ ] **Step 4: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claire/worktrees/elated-brown-e34abc" 2>/dev/null || cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/preload/index.ts \
        equipment-manager/src/hooks/useDevices.ts
git commit -m "feat: wire device create/update/changeStatus in preload and update useDevices hook"
```

---

## Task 4: DeviceFormDialog component

**Files:**
- Create: `src/components/DeviceFormDialog.tsx`

**Interfaces:**
- Consumes: `DeviceCreateArgs`, `DeviceUpdateArgs`, `CategoryRow` từ `@shared/ipc` (Task 1)
- Produces: `DeviceFormDialog` component — dùng ở Task 6, 7

- [ ] **Step 1: Tạo `src/components/DeviceFormDialog.tsx`**

```tsx
import { useState, useEffect } from 'react'
import type { DeviceCreateArgs, DeviceUpdateArgs, CategoryRow } from '@shared/ipc'

export interface DeviceFormInitial {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
}

export interface DeviceFormDialogProps {
  mode: 'create' | 'edit'
  initial?: DeviceFormInitial
  categories: CategoryRow[]
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
  mode, initial, categories, loading, error, onClose, onSubmit,
}: DeviceFormDialogProps) {
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null)
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (initial) {
      setSku(initial.sku)
      setName(initial.name)
      setCategoryId(initial.categoryId)
      setSerialNumber(initial.serialNumber ?? '')
      setNotes(initial.notes ?? '')
    }
  }, [initial?.sku])

  function submit() {
    if (!sku.trim()) { setLocalError('SKU không được để trống.'); return }
    if (!name.trim()) { setLocalError('Tên thiết bị không được để trống.'); return }
    setLocalError('')
    onSubmit({ sku: sku.trim(), name: name.trim(), categoryId, serialNumber: serialNumber.trim() || null, notes: notes.trim() || null })
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
              onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}
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

- [ ] **Step 2: Chạy typecheck**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | grep "DeviceFormDialog" | head -10
```

Expected: không lỗi liên quan `DeviceFormDialog.tsx`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/components/DeviceFormDialog.tsx
git commit -m "feat: add DeviceFormDialog shared component (create/edit)"
```

---

## Task 5: ChangeStatusDialog component

**Files:**
- Create: `src/components/ChangeStatusDialog.tsx`

**Interfaces:**
- Consumes: `DeviceChangeStatusArgs`, `DeviceStatus` từ Task 1
- Produces: `ChangeStatusDialog` component — dùng ở Task 6, 7

- [ ] **Step 1: Tạo `src/components/ChangeStatusDialog.tsx`**

```tsx
import { useState } from 'react'
import type { DeviceChangeStatusArgs, DeviceStatus } from '@shared/ipc'

export interface ChangeStatusDialogProps {
  sku: string
  deviceName: string
  currentStatus: DeviceStatus
  isAllocated: boolean
  loading: boolean
  error: string
  onClose(): void
  onConfirm(args: DeviceChangeStatusArgs): void
}

const STATUS_OPTIONS: Array<{ value: DeviceChangeStatusArgs['status']; label: string }> = [
  { value: 'available',      label: 'Trong kho' },
  { value: 'maintenance',    label: 'Đang bảo trì' },
  { value: 'broken',         label: 'Hỏng' },
  { value: 'decommissioned', label: 'Thanh lý' },
]

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function ChangeStatusDialog({
  sku, deviceName, currentStatus, isAllocated, loading, error, onClose, onConfirm,
}: ChangeStatusDialogProps) {
  const defaultStatus = STATUS_OPTIONS.find(o => o.value !== currentStatus)?.value ?? 'maintenance'
  const [status, setStatus] = useState<DeviceChangeStatusArgs['status']>(defaultStatus)
  const [notes, setNotes] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 110,
      background: 'rgba(15,23,42,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 440, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
        boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Đổi trạng thái thiết bị</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {deviceName} · <span style={{ fontFamily: "'Consolas',monospace" }}>{sku}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            borderRadius: 'var(--rad-sm)',
          }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Allocated warning */}
        {isAllocated && (
          <div style={{
            margin: '12px 20px 0', padding: '10px 14px',
            background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.25)',
            borderRadius: 'var(--rad-sm)', fontSize: 13, color: '#dc2626', fontWeight: 500,
          }}>
            Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi đổi trạng thái.
          </div>
        )}

        {/* Form */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Trạng thái mới
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as DeviceChangeStatusArgs['status'])}
              disabled={isAllocated}
              style={{
                ...inputStyle,
                appearance: 'auto' as React.CSSProperties['appearance'],
                opacity: isAllocated ? 0.5 : 1,
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            >
              {STATUS_OPTIONS
                .filter(o => o.value !== currentStatus)
                .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ghi chú
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              disabled={isAllocated}
              placeholder="Ghi chú thêm (tùy chọn)"
              style={{
                ...inputStyle, height: 64, padding: '8px 12px',
                resize: 'none', fontFamily: 'inherit',
                opacity: isAllocated ? 0.5 : 1,
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
          {error && (
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</div>
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
          <button
            onClick={() => onConfirm({ sku, status, notes: notes.trim() || null })}
            disabled={loading || isAllocated}
            style={{
              height: 38, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading || isAllocated ? 'not-allowed' : 'pointer',
              opacity: loading || isAllocated ? 0.5 : 1,
            }}
          >
            {loading ? 'Đang lưu…' : 'Xác nhận đổi trạng thái'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Chạy typecheck**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | grep "ChangeStatusDialog" | head -10
```

Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/components/ChangeStatusDialog.tsx
git commit -m "feat: add ChangeStatusDialog shared component"
```

---

## Task 6: Wire vào Devices.tsx

**Files:**
- Modify: `src/pages/Devices.tsx`

**Interfaces:**
- Consumes: `DeviceFormDialog` (Task 4), `ChangeStatusDialog` (Task 5), `useDevices` với pagination (Task 3), `api.devices.create/update/changeStatus` (Task 3)

- [ ] **Step 1: Cập nhật imports**

Mở `src/pages/Devices.tsx`. Thêm/sửa imports (giữ các imports cũ, thêm mới):

```ts
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  useReactTable, getCoreRowModel, createColumnHelper, flexRender
} from '@tanstack/react-table'
import { useDevices } from '@/hooks/useDevices'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/StatusBadge'
import { STATUS_LABELS } from '@/lib/status'
import { IconScan, IconSearch, IconPlus, IconView, IconEdit, IconSwap } from '@/lib/icons'
import { DeviceFormDialog } from '@/components/DeviceFormDialog'
import { ChangeStatusDialog } from '@/components/ChangeStatusDialog'
import { api, unwrap } from '@/lib/api'
import type { DeviceRow, DeviceStatus } from '@shared/ipc'
```

- [ ] **Step 2: Thêm state và mutations vào component `Devices`**

Trong `export default function Devices()`, sau khai báo `useDevices` hiện có, thêm:

```ts
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  // Reset về trang 1 khi filter hoặc query thay đổi
  useEffect(() => { setPage(1) }, [filter, query])

  const { data, isLoading, error } = useDevices(filter, query, page, PAGE_SIZE)
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
  })
  const categories = catalogData?.categories ?? []

  const [formDialog, setFormDialog] = useState<
    null | { mode: 'create' } | { mode: 'edit'; device: DeviceRow }
  >(null)
  const [statusDialog, setStatusDialog] = useState<DeviceRow | null>(null)

  const createMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.create>[0]) => unwrap(api.devices.create(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setFormDialog(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.update>[0]) => unwrap(api.devices.update(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setFormDialog(null)
    },
  })

  const changeStatusMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.changeStatus>[0]) => unwrap(api.devices.changeStatus(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setStatusDialog(null)
    },
  })
```

Thêm `const queryClient = useQueryClient()` sau `const { isAdmin } = useAuth()`.

Xóa dòng `const { data, isLoading, error } = useDevices(filter, query)` cũ (đã thay thế ở trên).

- [ ] **Step 3: Wire nút "Thêm thiết bị"**

Tìm:
```tsx
            onClick={() => { /* no-op M1 */ }}
```
(trong nút "Thêm thiết bị" ở toolbar)
Sửa thành:
```tsx
            onClick={() => setFormDialog({ mode: 'create' })}
```

- [ ] **Step 4: Wire nút "Sửa" và "Đổi trạng thái" trong bảng**

Tìm nút Sửa:
```tsx
                title="Sửa"
                onClick={() => { /* no-op M1 */ }}
```
Sửa thành:
```tsx
                title="Sửa"
                onClick={() => setFormDialog({ mode: 'edit', device: row.original })}
```

Tìm nút Đổi trạng thái:
```tsx
                title="Đổi trạng thái"
                onClick={() => { /* no-op M1 */ }}
```
Sửa thành:
```tsx
                title="Đổi trạng thái"
                onClick={() => setStatusDialog(row.original)}
```

- [ ] **Step 5: Fix pagination footer**

Tìm block `{/* Footer */}` (khoảng dòng 251-271):
```tsx
          <div style={{
            padding: '12px 18px', fontSize: 13, color: 'var(--text-muted)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>Hiển thị {data?.devices.length ?? 0} / {data?.total ?? 0} thiết bị</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', cursor: 'pointer'
              }}>‹</div>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--primary)', background: 'var(--primary-soft)',
                color: 'var(--primary)', borderRadius: 'var(--rad-sm)', fontWeight: 600
              }}>1</div>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)', cursor: 'pointer'
              }}>›</div>
            </div>
          </div>
```
Sửa thành:
```tsx
          <div style={{
            padding: '12px 18px', fontSize: 13, color: 'var(--text-muted)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>
              Trang {page}/{totalPages || 1} · {data?.total ?? 0} thiết bị
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'none', cursor: page === 1 ? 'default' : 'pointer',
                  color: page === 1 ? 'var(--text-muted)' : 'var(--text)',
                }}
              >‹</button>
              <div style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--primary)', background: 'var(--primary-soft)',
                color: 'var(--primary)', borderRadius: 'var(--rad-sm)', fontWeight: 600,
                fontSize: 13,
              }}>{page}</div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'none', cursor: page >= totalPages ? 'default' : 'pointer',
                  color: page >= totalPages ? 'var(--text-muted)' : 'var(--text)',
                }}
              >›</button>
            </div>
          </div>
```

- [ ] **Step 6: Render dialogs ở cuối return**

Trong `return (...)` của `Devices`, trước dấu `</div>` cuối cùng, thêm:

```tsx
      {formDialog && (
        <DeviceFormDialog
          mode={formDialog.mode}
          initial={formDialog.mode === 'edit' ? {
            sku: formDialog.device.sku,
            name: formDialog.device.name,
            categoryId: formDialog.device.categoryId,
            serialNumber: formDialog.device.serialNumber,
            notes: null,
          } : undefined}
          categories={categories}
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
      {statusDialog && (
        <ChangeStatusDialog
          sku={statusDialog.sku}
          deviceName={statusDialog.name}
          currentStatus={statusDialog.status}
          isAllocated={statusDialog.status === 'allocated'}
          loading={changeStatusMutation.isPending}
          error={changeStatusMutation.isError ? (changeStatusMutation.error as Error).message : ''}
          onClose={() => { setStatusDialog(null); changeStatusMutation.reset() }}
          onConfirm={args => changeStatusMutation.mutate(args)}
        />
      )}
```

- [ ] **Step 7: Chạy typecheck**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | grep "Devices.tsx" | head -20
```

Expected: không lỗi ở `Devices.tsx`.

- [ ] **Step 8: Chạy toàn bộ tests**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -15
```

Expected: tất cả PASS.

- [ ] **Step 9: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/pages/Devices.tsx
git commit -m "feat: wire add/edit/change-status dialogs and real pagination in Devices page"
```

---

## Task 7: Wire vào DeviceDetail.tsx

**Files:**
- Modify: `src/pages/DeviceDetail.tsx`

**Interfaces:**
- Consumes: `DeviceFormDialog` (Task 4), `ChangeStatusDialog` (Task 5), `api.devices.update/changeStatus` (Task 3)

- [ ] **Step 1: Cập nhật imports**

Mở `src/pages/DeviceDetail.tsx`. Sửa imports:
```ts
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useDevice } from '@/hooks/useDevice'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/StatusBadge'
import { IconBox, IconBack, IconSwap, IconEdit, IconCheck, IconDown, IconWrench } from '@/lib/icons'
import { DeviceFormDialog } from '@/components/DeviceFormDialog'
import { ChangeStatusDialog } from '@/components/ChangeStatusDialog'
import { api, unwrap } from '@/lib/api'
import type { DeviceHistoryEntry } from '@shared/ipc'
```

- [ ] **Step 2: Thêm state, queries, và mutations**

Trong `export default function DeviceDetail()`, sau `const { isAdmin } = useAuth()`, thêm:

```ts
  const queryClient = useQueryClient()
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)

  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
    enabled: showFormDialog,
  })
  const categories = catalogData?.categories ?? []

  const updateMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.update>[0]) => unwrap(api.devices.update(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', sku] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setShowFormDialog(false)
    },
  })

  const changeStatusMutation = useMutation({
    mutationFn: (args: Parameters<typeof api.devices.changeStatus>[0]) => unwrap(api.devices.changeStatus(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', sku] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setShowStatusDialog(false)
    },
  })
```

- [ ] **Step 3: Wire nút "Đổi trạng thái" và "Chỉnh sửa"**

Tìm nút "Đổi trạng thái":
```tsx
              onClick={() => { /* no-op M1 */ }}
```
(nút đầu tiên trong `isAdmin` block của header)
Sửa thành:
```tsx
              onClick={() => setShowStatusDialog(true)}
```

Tìm nút "Chỉnh sửa":
```tsx
              onClick={() => { /* no-op M1 */ }}
```
(nút thứ hai)
Sửa thành:
```tsx
              onClick={() => setShowFormDialog(true)}
```

- [ ] **Step 4: Render dialogs trước `</div>` cuối return**

Ngay trước dấu `</div>` đóng ngoài cùng trong return:
```tsx
      {showFormDialog && data && (
        <DeviceFormDialog
          mode="edit"
          initial={{
            sku: data.device.sku,
            name: data.device.name,
            categoryId: data.device.categoryId,
            serialNumber: data.device.serialNumber,
            notes: data.device.notes,
          }}
          categories={categories}
          loading={updateMutation.isPending}
          error={updateMutation.isError ? (updateMutation.error as Error).message : ''}
          onClose={() => { setShowFormDialog(false); updateMutation.reset() }}
          onSubmit={args => updateMutation.mutate(args)}
        />
      )}
      {showStatusDialog && data && (
        <ChangeStatusDialog
          sku={data.device.sku}
          deviceName={data.device.name}
          currentStatus={data.device.status}
          isAllocated={data.device.status === 'allocated'}
          loading={changeStatusMutation.isPending}
          error={changeStatusMutation.isError ? (changeStatusMutation.error as Error).message : ''}
          onClose={() => { setShowStatusDialog(false); changeStatusMutation.reset() }}
          onConfirm={args => changeStatusMutation.mutate(args)}
        />
      )}
```

- [ ] **Step 5: Chạy typecheck**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | head -20
```

Expected: không lỗi.

- [ ] **Step 6: Chạy toàn bộ tests lần cuối**

```bash
/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run 2>&1 | tail -15
```

Expected: tất cả tests PASS.

- [ ] **Step 7: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/pages/DeviceDetail.tsx
git commit -m "feat: wire edit and change-status dialogs on DeviceDetail page"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `DeviceCreateArgs`, `DeviceUpdateArgs`, `DeviceChangeStatusArgs` types | Task 1 |
| `DeviceRow.categoryId` | Task 1, 2 |
| `DeviceListArgs.page/pageSize` | Task 1, 2, 3 |
| `DeviceListResult.total` = filtered count | Task 1, 2 |
| Backend `create` — validate SKU unique | Task 2 |
| Backend `update` — name/categoryId/serial/notes | Task 2 |
| Backend `changeStatus` — chặn `allocated` target | Task 2 |
| Backend `changeStatus` — chặn device có active alloc | Task 2 |
| Register 3 channels mới | Task 2 |
| Preload 3 methods mới | Task 3 |
| `useDevices` nhận page/pageSize | Task 3 |
| `DeviceFormDialog` — mode create/edit, SKU disabled khi edit | Task 4 |
| `ChangeStatusDialog` — banner + disabled khi allocated | Task 5 |
| Wire Add/Edit/ChangeStatus trong `Devices.tsx` | Task 6 |
| Pagination thật trong `Devices.tsx` | Task 6 |
| Wire Edit/ChangeStatus trong `DeviceDetail.tsx` | Task 7 |
| Invalidate `['device', sku]` sau update/changeStatus | Task 7 |

Tất cả requirements đều có task. ✓

### Type consistency check

- `DeviceRow.categoryId: number | null` — định nghĩa Task 1, implement Task 2 (list+get), đọc Task 4 (initial prop), Task 6 (formDialog.device.categoryId), Task 7 (data.device.categoryId) ✓
- `DeviceCreateArgs/UpdateArgs/ChangeStatusArgs` — định nghĩa Task 1, implement Task 2, dùng Task 3 (preload), Task 4, Task 5, Task 6, Task 7 ✓
- `DeviceFormDialogProps.initial.categoryId: number | null` — định nghĩa Task 4, truyền từ Task 6 (DeviceRow.categoryId) và Task 7 (data.device.categoryId) ✓
- `ChangeStatusDialogProps.currentStatus: DeviceStatus` — định nghĩa Task 5, truyền từ Task 6 (row.status) và Task 7 (data.device.status) ✓
