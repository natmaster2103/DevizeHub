# Batch Import Devices via Excel/CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users bulk-import devices from an Excel/CSV file via a two-step preview-and-confirm dialog on the Settings page.

**Architecture:** The `xlsx` (SheetJS) library runs in the Electron main process alongside the DB. Three new IPC channels handle template download, file parsing+validation, and batch insert. The renderer shows a two-step dialog: Step 1 picks a file; Step 2 shows a per-row preview (green = valid, red = error). Only valid rows are submitted on confirm.

**Tech Stack:** `xlsx` (SheetJS), Electron `dialog`, Drizzle ORM, React, TanStack Query, inline styles + CSS tokens (no CSS modules, no Tailwind classes).

## Global Constraints

- All user-facing text in Vietnamese.
- Inline styles using CSS custom properties (`var(--primary)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-muted)`, `var(--surface-2)`, `var(--rad-lg)`, `var(--rad-md)`, `var(--rad-sm)`).
- TypeScript strict; no `any` except casting Electron `require` result.
- New IPC channels follow the pattern in `electron/shared/ipc.ts` — add to `CHANNELS`, add arg/result types, add to `Api` interface.
- Main-process handlers follow the factory pattern `makeDeviceHandlers(db)` in `electron/main/handlers/devices.ts`.
- Tests use `createDb(':memory:')` + `runMigrations` + `seedIfEmpty` + `session.current = { ... ALL_PERMISSIONS ... }` (see `devices.test.ts`).
- Run tests under Node 22 directly with vitest (not `npm test`) due to ABI mismatch: `npx vitest run electron/main/handlers/devices.test.ts`

---

### Task 1: Install xlsx and extend IPC contract

**Files:**
- Modify: `package.json`
- Modify: `electron/shared/ipc.ts`

**Interfaces:**
- Produces:
  - `CHANNELS.devicesDownloadTemplate = 'devices.downloadTemplate'`
  - `CHANNELS.devicesPreviewImport = 'devices.previewImport'`
  - `CHANNELS.devicesImportBatch = 'devices.importBatch'`
  - `interface DownloadTemplateResult { saved: boolean }`
  - `interface PreviewImportArgs { filePath: string }`
  - `interface PreviewRow { rowNum: number; sku: string; name: string; category: string; group: string; categoryId: number | null; groupId: number | null; serialNumber: string | null; notes: string | null; valid: boolean; error: string | null }`
  - `interface PreviewImportResult { rows: PreviewRow[] }`
  - `interface ImportBatchArgs { rows: Array<{ sku: string; name: string; categoryId: number | null; groupId: number | null; serialNumber: string | null; notes: string | null }> }`
  - `interface ImportBatchResult { imported: number }`
  - `Api.devices.downloadTemplate`, `Api.devices.previewImport`, `Api.devices.importBatch`

- [ ] **Step 1: Install xlsx**

```bash
cd equipment-manager && npm install xlsx
```

Expected: `xlsx` appears in `node_modules/xlsx` and `package.json` dependencies.

- [ ] **Step 2: Add channels to CHANNELS in `electron/shared/ipc.ts`**

After line 10 (`devicesDelete: 'devices.delete',`), insert:

```ts
  devicesDownloadTemplate: 'devices.downloadTemplate',
  devicesPreviewImport: 'devices.previewImport',
  devicesImportBatch: 'devices.importBatch',
```

- [ ] **Step 3: Add type definitions to `electron/shared/ipc.ts`**

After the `DeviceDeleteArgs` interface (around line 153), insert:

```ts
export interface DownloadTemplateResult { saved: boolean }

export interface PreviewImportArgs { filePath: string }
export interface PreviewRow {
  rowNum: number
  sku: string
  name: string
  category: string
  group: string
  categoryId: number | null
  groupId: number | null
  serialNumber: string | null
  notes: string | null
  valid: boolean
  error: string | null
}
export interface PreviewImportResult { rows: PreviewRow[] }

export interface ImportBatchArgs {
  rows: Array<{
    sku: string
    name: string
    categoryId: number | null
    groupId: number | null
    serialNumber: string | null
    notes: string | null
  }>
}
export interface ImportBatchResult { imported: number }
```

- [ ] **Step 4: Add methods to `Api` interface in `electron/shared/ipc.ts`**

Inside the `devices` block of the `Api` interface (after `delete`), add:

```ts
    downloadTemplate(): Promise<ApiResponse<DownloadTemplateResult>>
    previewImport(args: PreviewImportArgs): Promise<ApiResponse<PreviewImportResult>>
    importBatch(args: ImportBatchArgs): Promise<ApiResponse<ImportBatchResult>>
```

- [ ] **Step 5: Verify no type errors**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd equipment-manager && git add package.json package-lock.json electron/shared/ipc.ts
git commit -m "feat(import): install xlsx, add IPC contract for batch device import"
```

---

### Task 2: Main process handlers (TDD)

**Files:**
- Modify: `electron/main/handlers/devices.ts`
- Modify: `electron/main/handlers/devices.test.ts`

**Interfaces:**
- Consumes: types from Task 1 (`PreviewImportArgs`, `PreviewImportResult`, `PreviewRow`, `ImportBatchArgs`, `ImportBatchResult`, `DownloadTemplateResult`)
- Consumes: `categories`, `deviceGroups`, `devices` from `../db/schema`
- Produces: `devicesH.downloadTemplate()`, `devicesH.previewImport(args)`, `devicesH.importBatch(args)` in the factory return object

- [ ] **Step 1: Add failing tests for `previewImport` to `devices.test.ts`**

After the last existing `describe` block, append:

```ts
import * as XLSX from 'xlsx'
import * as os from 'node:os'
import * as nodePath from 'node:path'
import * as fs from 'node:fs'

function makeTempXlsx(rows: (string | number | null)[][]): string {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  const p = nodePath.join(os.tmpdir(), `test-import-${Date.now()}.xlsx`)
  XLSX.writeFile(wb, p)
  return p
}

const HEADERS = ['SKU', 'Tên thiết bị', 'Loại', 'Nhóm', 'Số serial', 'Ghi chú']

describe('devices.previewImport', () => {
  it('returns valid row for a correct new device', async () => {
    const h = setup()
    const p = makeTempXlsx([HEADERS, ['IMP-001', 'Laptop Test', '', '', '', '']])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows.length).toBe(1)
      expect(res.data.rows[0].valid).toBe(true)
      expect(res.data.rows[0].error).toBeNull()
      expect(res.data.rows[0].sku).toBe('IMP-001')
      expect(res.data.rows[0].rowNum).toBe(2)
    } finally { fs.unlinkSync(p) }
  })

  it('marks row with empty SKU as invalid', async () => {
    const h = setup()
    const p = makeTempXlsx([HEADERS, ['', 'Laptop Test', '', '', '', '']])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows[0].valid).toBe(false)
      expect(res.data.rows[0].error).toMatch(/SKU/)
    } finally { fs.unlinkSync(p) }
  })

  it('marks row with empty name as invalid', async () => {
    const h = setup()
    const p = makeTempXlsx([HEADERS, ['IMP-002', '', '', '', '', '']])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows[0].valid).toBe(false)
      expect(res.data.rows[0].error).toMatch(/Tên/)
    } finally { fs.unlinkSync(p) }
  })

  it('marks duplicate SKU within file as invalid', async () => {
    const h = setup()
    const p = makeTempXlsx([
      HEADERS,
      ['DUP-001', 'Device A', '', '', '', ''],
      ['DUP-001', 'Device B', '', '', '', ''],
    ])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows[0].valid).toBe(true)
      expect(res.data.rows[1].valid).toBe(false)
      expect(res.data.rows[1].error).toMatch(/trùng lặp/)
    } finally { fs.unlinkSync(p) }
  })

  it('marks SKU that already exists in DB as invalid', async () => {
    const h = setup()
    // LAP-0012 exists in seed data
    const p = makeTempXlsx([HEADERS, ['LAP-0012', 'Some Name', '', '', '', '']])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows[0].valid).toBe(false)
      expect(res.data.rows[0].error).toMatch(/tồn tại/)
    } finally { fs.unlinkSync(p) }
  })

  it('resolves a known category name to categoryId', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
    // Get a real category name from seed
    const cats = db.select({ name: categories.name, id: categories.id }).from(categories).all()
    if (cats.length === 0) return
    const cat = cats[0]
    const h = makeDeviceHandlers(db)
    const p = makeTempXlsx([HEADERS, ['CAT-001', 'Device', cat.name, '', '', '']])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows[0].valid).toBe(true)
      expect(res.data.rows[0].categoryId).toBe(cat.id)
    } finally { fs.unlinkSync(p) }
  })

  it('marks non-existent category name as invalid', async () => {
    const h = setup()
    const p = makeTempXlsx([HEADERS, ['CAT-002', 'Device', 'LoạiKhôngTồnTại', '', '', '']])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows[0].valid).toBe(false)
      expect(res.data.rows[0].error).toMatch(/Loại thiết bị không tồn tại/)
    } finally { fs.unlinkSync(p) }
  })

  it('returns ok with empty rows for header-only file', async () => {
    const h = setup()
    const p = makeTempXlsx([HEADERS])
    try {
      const res = await h.previewImport({ filePath: p })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.rows.length).toBe(0)
    } finally { fs.unlinkSync(p) }
  })

  it('returns error for a non-existent file path', async () => {
    const h = setup()
    const res = await h.previewImport({ filePath: '/no/such/file.xlsx' })
    expect(res.ok).toBe(false)
  })
})

describe('devices.importBatch', () => {
  it('inserts all valid rows and returns count', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
    const h = makeDeviceHandlers(db)
    const res = await h.importBatch({
      rows: [
        { sku: 'BATCH-001', name: 'Device 1', categoryId: null, groupId: null, serialNumber: null, notes: null },
        { sku: 'BATCH-002', name: 'Device 2', categoryId: null, groupId: null, serialNumber: 'SN-X', notes: 'note' },
      ]
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.imported).toBe(2)
    const rows = db.select({ sku: devices.sku }).from(devices).where(eq(devices.sku, 'BATCH-001')).all()
    expect(rows.length).toBe(1)
  })

  it('returns imported=0 and succeeds for empty rows array', async () => {
    const h = setup()
    const res = await h.importBatch({ rows: [] })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.imported).toBe(0)
  })

  it('rejects importBatch without edit_device permission', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 2, username: 'staff', role: 'staff', displayName: 'Staff', permissions: ['view_reports'], groupIds: [] }
    const h = makeDeviceHandlers(db)
    const res = await h.importBatch({ rows: [{ sku: 'X', name: 'X', categoryId: null, groupId: null, serialNumber: null, notes: null }] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })
})
```

Also update the existing schema import at the top of `devices.test.ts` to include `categories`:

```ts
// Change this line:
import { devices, allocations } from '../db/schema'
// To:
import { devices, allocations, categories } from '../db/schema'
```

- [ ] **Step 2: Run tests — confirm they all fail with "not a function"**

```bash
cd equipment-manager && npx vitest run electron/main/handlers/devices.test.ts
```

Expected: new `previewImport` and `importBatch` tests fail with `TypeError: h.previewImport is not a function`.

- [ ] **Step 3: Add xlsx import and the three new handlers to `devices.ts`**

After the existing imports at the top of `electron/main/handlers/devices.ts`, add:

```ts
import * as XLSX from 'xlsx'
```

Also add to the existing destructured ipc imports:

```ts
import type {
  // ... existing types ...
  DownloadTemplateResult,
  PreviewImportArgs,
  PreviewImportResult,
  PreviewRow,
  ImportBatchArgs,
  ImportBatchResult,
} from '@shared/ipc'
```

- [ ] **Step 4: Add `downloadTemplate`, `previewImport`, `importBatch` to the factory return object in `devices.ts`**

Inside `makeDeviceHandlers`, after the `delete` method (before the final `}` of the return object), add:

```ts
    async downloadTemplate(): Promise<ApiResponse<DownloadTemplateResult>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
      // Lazy require so module stays unit-testable (dialog is Electron-only runtime)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dialog } = require('electron') as typeof import('electron')

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([
        ['SKU', 'Tên thiết bị', 'Loại', 'Nhóm', 'Số serial', 'Ghi chú'],
        ['TB-001', 'Laptop Dell XPS 15', 'Laptop', 'Dell', 'SN123456', 'Ghi chú tùy chọn'],
      ])
      ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Thiết bị')

      const result = await dialog.showSaveDialog({
        title: 'Lưu template nhập thiết bị',
        defaultPath: 'template_nhap_thiet_bi.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      })
      if (result.canceled || !result.filePath) return { ok: true, data: { saved: false } }
      XLSX.writeFile(wb, result.filePath)
      return { ok: true, data: { saved: true } }
    },

    async previewImport(args: PreviewImportArgs): Promise<ApiResponse<PreviewImportResult>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden

      let workbook: XLSX.WorkBook
      try {
        workbook = XLSX.readFile(args.filePath)
      } catch {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Không thể đọc file. Vui lòng kiểm tra định dạng file (.xlsx, .xls, .csv).' } }
      }

      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      const allCats = db.select({ id: categories.id, name: categories.name }).from(categories).all()
      const allGroups = db.select({ id: deviceGroups.id, name: deviceGroups.name, categoryId: deviceGroups.categoryId }).from(deviceGroups).all()
      const catByName = new Map(allCats.map(c => [c.name.trim().toLowerCase(), c]))
      const grpByName = new Map(allGroups.map(g => [g.name.trim().toLowerCase(), g]))

      const skusInFile = new Map<string, number>() // lowercase sku → first rowNum

      const rows: PreviewRow[] = rawRows.map((raw, idx) => {
        const rowNum = idx + 2
        const sku = String(raw['SKU'] ?? '').trim()
        const name = String(raw['Tên thiết bị'] ?? '').trim()
        const categoryName = String(raw['Loại'] ?? '').trim()
        const groupName = String(raw['Nhóm'] ?? '').trim()
        const serialNumber = String(raw['Số serial'] ?? '').trim() || null
        const notes = String(raw['Ghi chú'] ?? '').trim() || null

        let categoryId: number | null = null
        let groupId: number | null = null
        let error: string | null = null

        if (!sku) {
          error = 'SKU không được để trống'
        } else if (!name) {
          error = 'Tên thiết bị không được để trống'
        } else if (skusInFile.has(sku.toLowerCase())) {
          error = `SKU bị trùng lặp trong file (dòng ${skusInFile.get(sku.toLowerCase())})`
        } else {
          skusInFile.set(sku.toLowerCase(), rowNum)
          const existing = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, sku)).all()[0]
          if (existing) {
            error = `SKU đã tồn tại trong hệ thống`
          }
        }

        if (!error && categoryName) {
          const cat = catByName.get(categoryName.toLowerCase())
          if (!cat) {
            error = `Loại thiết bị không tồn tại: "${categoryName}"`
          } else {
            categoryId = cat.id
          }
        }

        if (!error && groupName) {
          const grp = grpByName.get(groupName.toLowerCase())
          if (!grp) {
            error = `Nhóm không tồn tại: "${groupName}"`
          } else if (categoryId != null && grp.categoryId !== categoryId) {
            error = `Nhóm không thuộc loại đã chọn: "${groupName}"`
          } else {
            groupId = grp.id
          }
        }

        return { rowNum, sku, name, category: categoryName, group: groupName, categoryId, groupId, serialNumber, notes, valid: error === null, error }
      })

      return { ok: true, data: { rows } }
    },

    async importBatch(args: ImportBatchArgs): Promise<ApiResponse<ImportBatchResult>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
      if (!args?.rows?.length) return { ok: true, data: { imported: 0 } }

      const now = new Date().toISOString()
      let imported = 0
      db.transaction((tx) => {
        for (const row of args.rows) {
          tx.insert(devices).values({
            sku: row.sku.trim(),
            name: row.name.trim(),
            categoryId: row.categoryId,
            serialNumber: row.serialNumber?.trim() || null,
            notes: row.notes?.trim() || null,
            groupId: row.groupId,
            status: 'available',
            createdAt: now,
            updatedAt: now,
          }).run()
          imported++
        }
      })
      return { ok: true, data: { imported } }
    },
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd equipment-manager && npx vitest run electron/main/handlers/devices.test.ts
```

Expected: all tests PASS including the new `previewImport` and `importBatch` suites.

- [ ] **Step 6: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd equipment-manager && git add electron/main/handlers/devices.ts electron/main/handlers/devices.test.ts
git commit -m "feat(import): add previewImport, importBatch, downloadTemplate handlers"
```

---

### Task 3: Wire handlers into Electron runtime

**Files:**
- Modify: `electron/main/handlers/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `CHANNELS.devicesDownloadTemplate`, `CHANNELS.devicesPreviewImport`, `CHANNELS.devicesImportBatch` from Task 1
- Consumes: `devicesH.downloadTemplate`, `devicesH.previewImport`, `devicesH.importBatch` from Task 2

- [ ] **Step 1: Register channels in `electron/main/handlers/index.ts`**

After the line `ipcMain.handle(CHANNELS.devicesDelete, ...)` (around line 38), add:

```ts
  ipcMain.handle(CHANNELS.devicesDownloadTemplate, () => auth_guard(() => devicesH.downloadTemplate()))
  ipcMain.handle(CHANNELS.devicesPreviewImport, (_e, args) => auth_guard(() => devicesH.previewImport(args)))
  ipcMain.handle(CHANNELS.devicesImportBatch, (_e, args) => auth_guard(() => devicesH.importBatch(args)))
```

- [ ] **Step 2: Expose methods in `electron/preload/index.ts`**

Inside the `devices:` block (after `delete:`), add:

```ts
    downloadTemplate: () => ipcRenderer.invoke(CHANNELS.devicesDownloadTemplate),
    previewImport: (args) => ipcRenderer.invoke(CHANNELS.devicesPreviewImport, args),
    importBatch: (args) => ipcRenderer.invoke(CHANNELS.devicesImportBatch, args),
```

- [ ] **Step 3: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd equipment-manager && git add electron/main/handlers/index.ts electron/preload/index.ts
git commit -m "feat(import): register and expose batch-import IPC channels"
```

---

### Task 4: ImportDevicesDialog component

**Files:**
- Create: `src/components/ImportDevicesDialog.tsx`

**Interfaces:**
- Consumes: `api.dialog.openFile`, `api.devices.downloadTemplate`, `api.devices.previewImport`, `api.devices.importBatch` from `@/lib/api`
- Consumes: `PreviewRow`, `PreviewImportResult`, `ImportBatchResult` from `@shared/ipc`
- Produces: `<ImportDevicesDialog onClose={() => void} onImported={() => void} />`

- [ ] **Step 1: Create `src/components/ImportDevicesDialog.tsx`**

```tsx
import { useState } from 'react'
import { api, unwrap } from '@/lib/api'
import type { PreviewRow } from '@shared/ipc'

interface Props {
  onClose(): void
  onImported(): void
}

export function ImportDevicesDialog({ onClose, onImported }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownloadTemplate() {
    try {
      await unwrap(api.devices.downloadTemplate())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleSelectFile() {
    setError(null)
    let filePath: string | null = null
    try {
      const r = await unwrap(api.dialog.openFile({
        filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }],
      }))
      if (r.canceled || !r.filePath) return
      filePath = r.filePath
    } catch (e) {
      setError((e as Error).message)
      return
    }

    setLoading(true)
    try {
      const preview = await unwrap(api.devices.previewImport({ filePath }))
      setRows(preview.rows)
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    setError(null)
    const validRows = rows.filter(r => r.valid)
    if (!validRows.length) return
    setImporting(true)
    try {
      await unwrap(api.devices.importBatch({
        rows: validRows.map(r => ({
          sku: r.sku,
          name: r.name,
          categoryId: r.categoryId,
          groupId: r.groupId,
          serialNumber: r.serialNumber,
          notes: r.notes,
        })),
      }))
      onImported()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function resetToStep1() {
    setStep(1)
    setRows([])
    setError(null)
  }

  const validCount = rows.filter(r => r.valid).length
  const errorCount = rows.length - validCount

  const btnBase: React.CSSProperties = {
    height: 36, padding: '0 16px', border: 'none',
    borderRadius: 'var(--rad-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
        width: step === 1 ? 420 : 800, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {step === 1 ? 'Nhập thiết bị hàng loạt' : 'Xem trước dữ liệu'}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, flex: 1, overflowY: 'auto' }}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Tải file template mẫu, điền thông tin vào Excel, rồi chọn file để nhập hàng loạt.
                Cột <b>Loại</b> và <b>Nhóm</b> phải khớp chính xác với tên đã tạo trong Danh mục.
              </p>
              <div>
                <button
                  onClick={handleDownloadTemplate}
                  style={{
                    height: 36, padding: '0 14px',
                    border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
                    background: 'var(--surface-2)', color: 'var(--text)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
                >
                  ↓ Tải template mẫu (.xlsx)
                </button>
              </div>
              {error && <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ marginBottom: 10, fontSize: 13 }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>{validCount} dòng hợp lệ</span>
                {errorCount > 0 && (
                  <span> · <span style={{ color: '#dc2626', fontWeight: 600 }}>{errorCount} dòng lỗi</span></span>
                )}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rad-md)', overflow: 'hidden' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 110px 1fr 110px 110px 1fr',
                  padding: '0 12px', height: 34, alignItems: 'center',
                  background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                }}>
                  <div>#</div><div>SKU</div><div>Tên thiết bị</div>
                  <div>Loại</div><div>Nhóm</div><div>Lỗi</div>
                </div>
                {rows.map(row => (
                  <div
                    key={row.rowNum}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 110px 1fr 110px 110px 1fr',
                      padding: '0 12px', minHeight: 38, alignItems: 'center',
                      borderBottom: '1px solid var(--border)', fontSize: 13,
                      background: row.valid ? 'transparent' : 'rgba(220,38,38,.04)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.rowNum}</div>
                    <div style={{ fontFamily: "'Consolas','SF Mono',monospace", fontWeight: 600 }}>{row.sku || '—'}</div>
                    <div>{row.name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.category || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.group || '—'}</div>
                    <div style={{ fontSize: 12, color: '#dc2626' }}>{row.error ?? ''}</div>
                  </div>
                ))}
                {rows.length === 0 && (
                  <div style={{ padding: '20px 12px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    File không có dữ liệu.
                  </div>
                )}
              </div>
              {error && <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          {step === 1 ? (
            <>
              <button onClick={onClose} style={{ ...btnBase, border: '1px solid var(--border)', background: 'none', color: 'var(--text)' }}>
                Huỷ
              </button>
              <button
                onClick={handleSelectFile}
                disabled={loading}
                style={{ ...btnBase, background: 'var(--primary)', color: '#fff', opacity: loading ? 0.7 : 1, cursor: loading ? 'default' : 'pointer' }}
              >
                {loading ? 'Đang đọc…' : 'Chọn file Excel / CSV'}
              </button>
            </>
          ) : (
            <>
              <button onClick={resetToStep1} style={{ ...btnBase, border: '1px solid var(--border)', background: 'none', color: 'var(--text)' }}>
                Chọn file khác
              </button>
              <button
                onClick={handleImport}
                disabled={validCount === 0 || importing}
                style={{ ...btnBase, background: 'var(--primary)', color: '#fff', opacity: (validCount === 0 || importing) ? 0.7 : 1, cursor: (validCount === 0 || importing) ? 'default' : 'pointer' }}
              >
                {importing ? 'Đang nhập…' : `Nhập ${validCount} thiết bị`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd equipment-manager && git add src/components/ImportDevicesDialog.tsx
git commit -m "feat(import): add ImportDevicesDialog two-step component"
```

---

### Task 5: Settings page integration

**Files:**
- Modify: `src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `<ImportDevicesDialog>` from `@/components/ImportDevicesDialog`
- Consumes: `useQueryClient` from `@tanstack/react-query` (already imported)
- Consumes: `useAuth` hook (already imported)

- [ ] **Step 1: Add import and new section to `src/pages/Settings.tsx`**

Add the `ImportDevicesDialog` import after the existing component imports at the top of the file:

```ts
import { ImportDevicesDialog } from '@/components/ImportDevicesDialog'
```

Add an `ImportSection` component before the `Settings` default export:

```tsx
function ImportSection() {
  const { hasPermission } = useAuth()
  const qc = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)

  if (!hasPermission('edit_device')) return null

  function handleImported() {
    qc.invalidateQueries({ queryKey: ['devices'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    setShowDialog(false)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Nhập thiết bị hàng loạt</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Tải template Excel, điền thông tin và nhập nhiều thiết bị cùng lúc.
          </div>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          style={{
            height: 36, padding: '0 14px',
            border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
            background: 'none', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
        >
          ↑ Nhập Excel / CSV
        </button>
      </div>
      {showDialog && (
        <ImportDevicesDialog
          onClose={() => setShowDialog(false)}
          onImported={handleImported}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Add the section into the `Settings` page render**

Inside the `Settings` default export, add a new `SectionCard` after the "Cơ sở dữ liệu" card:

```tsx
      <SectionCard title="Nhập dữ liệu">
        <ImportSection />
      </SectionCard>
```

Full updated `Settings` return:

```tsx
  return (
    <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {isAdmin && (
        <SectionCard title="Quản lý tài khoản">
          <UsersSection />
        </SectionCard>
      )}

      <SectionCard title="Đổi mật khẩu">
        <ChangePasswordSection />
      </SectionCard>

      <SectionCard title="Cơ sở dữ liệu">
        <DbInfoSection />
        {isAdmin && <ResetDataSection />}
      </SectionCard>

      <SectionCard title="Nhập dữ liệu">
        <ImportSection />
      </SectionCard>
    </div>
  )
```

- [ ] **Step 3: Typecheck**

```bash
cd equipment-manager && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests to confirm no regressions**

```bash
cd equipment-manager && npx vitest run electron/main/handlers/devices.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd equipment-manager && git add src/pages/Settings.tsx src/components/ImportDevicesDialog.tsx
git commit -m "feat(import): add batch import section to Settings page"
```

---

## Manual Verification Checklist

Start the app with `npm run dev` and verify:

1. **Settings page** → section "Nhập dữ liệu" is visible when logged in with `edit_device` permission; hidden for a user without it.
2. **Download template** → click "Tải template mẫu (.xlsx)" → save dialog appears → file saved with 6 correct columns and 1 sample row.
3. **Import happy path** → fill in a few valid rows (with an existing category name) → click "Chọn file" → preview shows green rows → "Nhập N thiết bị" button is enabled → click → dialog closes → new devices appear on the Devices page.
4. **Import with errors** → include a row with blank SKU, a duplicate SKU, and an unknown category → preview shows those rows in red with correct Vietnamese error messages → valid rows still import on confirm.
5. **Permission gate** → log in as a staff user without `edit_device` → "Nhập dữ liệu" section is absent.
