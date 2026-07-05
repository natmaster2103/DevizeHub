# Hoàn thiện Cấp phát & Phiếu đề nghị — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện 4 tính năng: (1) status phiếu đề nghị 3 trạng thái, (2) extract ReturnDialog thành shared component, (3) wire nút "Trả về" trên Dashboard, (4) in phiếu đề nghị dạng HTML template.

**Architecture:** Sửa IPC types trước để cả frontend và backend đồng bộ, sau đó fix backend handler, rồi frontend theo thứ tự: shared component → consumer pages. Không thay đổi DB schema (status vẫn được tính toán runtime).

**Tech Stack:** Electron + React 18, Drizzle ORM / SQLite (better-sqlite3), TypeScript, Vitest (test runner), electron-vite

## Global Constraints

- Tất cả label tiếng Việt: `pending` → "Chưa cấp phát", `allocated` → "Đang trang bị", `completed` → "Hoàn tất"
- Chạy test: `cd equipment-manager && npm run test` (vitest run)
- Chạy typecheck: `cd equipment-manager && npm run typecheck`
- File test backend: `electron/main/handlers/*.test.ts`
- File test frontend: `src/lib/*.test.ts`
- Working directory: `/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager`

---

## File Map

| File | Thay đổi |
|---|---|
| `electron/shared/ipc.ts` | Sửa: `RequestStatus` thêm `'pending'`; `DeptCardItem` thêm `allocationId`, `deviceSku` |
| `electron/main/handlers/requests.ts` | Sửa: hàm `deriveStatus` — thêm nhánh `totalLines === 0 → 'pending'` |
| `electron/main/handlers/requests.test.ts` | Sửa: thêm test `status = 'pending'` cho phiếu mới |
| `electron/main/handlers/dashboard.ts` | Sửa: query device sku; trả `allocationId` và `deviceSku` trong `DeptCardItem` |
| `electron/main/handlers/dashboard.test.ts` | Sửa: assert `allocationId` tồn tại trong item |
| `src/lib/status.ts` | Sửa: thêm `pending` vào `REQUEST_STATUS_LABELS` và `REQ_COLORS` |
| `src/lib/status.test.ts` | Sửa: thêm test badge `pending` |
| `src/lib/icons.tsx` | Sửa: thêm `IconPrint` |
| `src/lib/print.ts` | **Mới**: `printRequest()` + `buildPrintHTML()` (exported để test) |
| `src/components/ReturnDialog.tsx` | **Mới**: shared ReturnDialog component |
| `src/components/AllocationDrawer.tsx` | Sửa: filter phiếu liên kết gồm `pending \| allocated` |
| `src/pages/RequestDetail.tsx` | Sửa: dùng shared `ReturnDialog`; thêm nút "In phiếu" |
| `src/pages/Dashboard.tsx` | Sửa: state + mutation trả về; wire nút "Trả về"; render `ReturnDialog` |

---

## Task 1: Fix RequestStatus + deriveStatus + status labels

**Files:**
- Modify: `electron/shared/ipc.ts`
- Modify: `electron/main/handlers/requests.ts`
- Modify: `electron/main/handlers/requests.test.ts`
- Modify: `src/lib/status.ts`
- Modify: `src/lib/status.test.ts`
- Modify: `src/components/AllocationDrawer.tsx`

**Interfaces:**
- Produces: `RequestStatus = 'pending' | 'allocated' | 'completed'` — dùng ở tất cả tasks sau

- [ ] **Step 1: Sửa `RequestStatus` type trong ipc.ts**

Mở `electron/shared/ipc.ts`, tìm dòng:
```ts
export type RequestStatus = 'allocated' | 'completed'
```
Sửa thành:
```ts
export type RequestStatus = 'pending' | 'allocated' | 'completed'
```

- [ ] **Step 2: Sửa `deriveStatus` trong requests.ts**

Mở `electron/main/handlers/requests.ts`, tìm hàm:
```ts
function deriveStatus(totalLines: number, activeLines: number): RequestStatus {
  if (activeLines > 0) return 'allocated'
  return 'completed'
}
```
Sửa thành:
```ts
function deriveStatus(totalLines: number, activeLines: number): RequestStatus {
  if (totalLines === 0) return 'pending'
  if (activeLines > 0) return 'allocated'
  return 'completed'
}
```

- [ ] **Step 3: Viết test `deriveStatus` via `list` handler**

Mở `electron/main/handlers/requests.test.ts`, thêm test block mới ở cuối:

```ts
describe('requests.list — status derivation', () => {
  it('returns pending for a newly created request with no devices', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin' }

    const deptId = db.select({ id: departments.id }).from(departments).all()[0]?.id ?? 1
    const handlers = makeRequestHandlers(db)
    await handlers.create({ code: 'NEW-001', departmentId: deptId, createdAt: null, notes: null })

    const res = await handlers.list({ query: 'NEW-001' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const req = res.data.requests.find(r => r.code === 'NEW-001')
      expect(req).toBeDefined()
      expect(req?.status).toBe('pending')
    }
    session.current = null
  })
})
```

- [ ] **Step 4: Chạy test mới để xác nhận fail trước khi fix**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run test -- --reporter=verbose 2>&1 | grep -A 5 "status derivation"
```

Expected: FAIL vì `deriveStatus` cũ trả `'completed'` thay vì `'pending'`.

> Nếu test pass ngay (không fail), kiểm tra lại Step 3 đã được viết đúng chưa — test phải assert `'pending'` trong khi code cũ trả `'completed'`.

- [ ] **Step 5: Chạy lại sau khi đã sửa `deriveStatus` (Step 2)**

```bash
npm run test 2>&1 | tail -20
```

Expected: tất cả tests PASS.

- [ ] **Step 6: Sửa `status.ts` — thêm pending vào labels và colors**

Mở `src/lib/status.ts`. Thay toàn bộ phần request status:

```ts
export function requestStatusLabel(s: RequestStatus): string {
  if (s === 'pending') return 'Chưa cấp phát'
  if (s === 'allocated') return 'Đang trang bị'
  return 'Hoàn tất'
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Chưa cấp phát',
  allocated: 'Đang trang bị',
  completed: 'Hoàn tất',
}

const REQ_COLORS: Record<RequestStatus, { bg: string; fg: string }> = {
  pending: { bg: 'rgba(100,116,139,.18)', fg: '#64748b' },
  allocated: { bg: 'rgba(37,99,235,.14)', fg: '#2563eb' },
  completed: { bg: 'rgba(22,163,74,.14)', fg: '#16a34a' },
}
export function requestBadgeStyle(status: RequestStatus) { return REQ_COLORS[status] }
```

- [ ] **Step 7: Thêm test cho `pending` badge vào `status.test.ts`**

Mở `src/lib/status.test.ts`, thêm vào cuối file:

```ts
import { REQUEST_STATUS_LABELS, requestBadgeStyle } from './status'

describe('request status', () => {
  it('maps pending to Chưa cấp phát with grey color', () => {
    expect(REQUEST_STATUS_LABELS.pending).toBe('Chưa cấp phát')
    expect(requestBadgeStyle('pending').fg).toBe('#64748b')
  })
  it('maps allocated to Đang trang bị with blue', () => {
    expect(REQUEST_STATUS_LABELS.allocated).toBe('Đang trang bị')
    expect(requestBadgeStyle('allocated').fg).toBe('#2563eb')
  })
  it('maps completed to Hoàn tất with green', () => {
    expect(REQUEST_STATUS_LABELS.completed).toBe('Hoàn tất')
    expect(requestBadgeStyle('completed').fg).toBe('#16a34a')
  })
})
```

- [ ] **Step 8: Sửa `AllocationDrawer.tsx` — filter phiếu liên kết**

Mở `src/components/AllocationDrawer.tsx`, tìm:
```ts
select: d => d.requests.filter(r => r.status === 'allocated'),
```
Sửa thành:
```ts
select: d => d.requests.filter(r => r.status !== 'completed'),
```

- [ ] **Step 9: Chạy typecheck + toàn bộ tests**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck && npm run test
```

Expected: không có TypeScript error, tất cả tests PASS.

- [ ] **Step 10: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/shared/ipc.ts \
        equipment-manager/electron/main/handlers/requests.ts \
        equipment-manager/electron/main/handlers/requests.test.ts \
        equipment-manager/src/lib/status.ts \
        equipment-manager/src/lib/status.test.ts \
        equipment-manager/src/components/AllocationDrawer.tsx
git commit -m "feat: add pending status for requests with no allocated devices"
```

---

## Task 2: Extract ReturnDialog thành shared component

**Files:**
- Create: `src/components/ReturnDialog.tsx`
- Modify: `src/pages/RequestDetail.tsx`

**Interfaces:**
- Consumes: `ReturnDeviceArgs` từ `@shared/ipc`
- Produces: `ReturnDialog` component với props:
  ```ts
  interface ReturnDialogProps {
    allocationId: number
    deviceName: string
    deviceSku: string
    recipient: string
    contextLabel: string   // "Phiếu liên kết: DX-302" hoặc "Phòng ban: IT"
    onClose(): void
    onConfirm(args: ReturnDeviceArgs): void
    loading: boolean
  }
  ```

- [ ] **Step 1: Tạo `src/components/ReturnDialog.tsx`**

```tsx
import { useState } from 'react'
import type { ReturnDeviceArgs } from '@shared/ipc'

export interface ReturnDialogProps {
  allocationId: number
  deviceName: string
  deviceSku: string
  recipient: string
  contextLabel: string
  onClose(): void
  onConfirm(args: ReturnDeviceArgs): void
  loading: boolean
}

const RETURN_CONDITIONS = ['Tốt', 'Trầy xước nhẹ', 'Cần bảo trì', 'Hỏng']

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function ReturnDialog({
  allocationId, deviceName, deviceSku, recipient, contextLabel,
  onClose, onConfirm, loading,
}: ReturnDialogProps) {
  const [condition, setCondition] = useState('Tốt')
  const [notes, setNotes] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
          boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Trả thiết bị về kho</div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              borderRadius: 'var(--rad-sm)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Device info */}
        <div style={{ padding: '14px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px 0', fontSize: 13 }}>
            {[
              ['Thiết bị', deviceName],
              ['SKU', deviceSku],
              ['Người đang giữ', recipient],
              [contextLabel.split(':')[0], contextLabel.split(':').slice(1).join(':').trim()],
            ].map(([k, v]) => (
              <><div key={`k-${k}`} style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{k}</div>
              <div key={`v-${k}`} style={{ fontWeight: 600 }}>{v}</div></>
            ))}
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Tình trạng khi trả
            </label>
            <select
              value={condition}
              onChange={e => setCondition(e.target.value)}
              style={{ ...inputStyle, appearance: 'auto' as any }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            >
              {RETURN_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ghi chú
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Ghi chú thêm (tùy chọn)"
              style={{
                ...inputStyle, height: 80, padding: '10px 12px',
                resize: 'vertical', fontFamily: 'inherit',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={onClose}
            style={{
              height: 38, padding: '0 16px', border: '1px solid var(--border)',
              borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            Hủy
          </button>
          <button
            onClick={() => onConfirm({ allocationId, condition, notes })}
            disabled={loading}
            style={{
              height: 38, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = 'var(--primary-hover)') }}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            {loading ? 'Đang xử lý…' : 'Xác nhận trả về'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật `RequestDetail.tsx` để dùng shared ReturnDialog**

Mở `src/pages/RequestDetail.tsx`.

**2a.** Xóa toàn bộ inline `ReturnDialog` component (từ dòng `// ── Return Dialog ─` đến hết function `ReturnDialog` ~140 dòng).

**2b.** Thêm import mới sau các import hiện có:
```ts
import { ReturnDialog } from '@/components/ReturnDialog'
```

**2c.** Xóa dòng `const RETURN_CONDITIONS = [...]` (không còn cần trong file này).

**2d.** Xóa interface `ReturnDialogProps` nếu còn sót.

**2e.** Tìm đoạn render `ReturnDialog` trong `return` statement của `RequestDetail` (khoảng dòng 575):
```tsx
{returnTarget && (
  <ReturnDialog
    line={returnTarget}
    requestCode={data.code}
    onClose={() => setReturnTarget(null)}
    onConfirm={args => returnMutation.mutate(args)}
    loading={returnMutation.isPending}
  />
)}
```
Sửa thành:
```tsx
{returnTarget && (
  <ReturnDialog
    allocationId={returnTarget.allocationId}
    deviceName={returnTarget.deviceName}
    deviceSku={returnTarget.deviceSku}
    recipient={returnTarget.recipient}
    contextLabel={`Phiếu liên kết: ${data.code}`}
    onClose={() => setReturnTarget(null)}
    onConfirm={args => returnMutation.mutate(args)}
    loading={returnMutation.isPending}
  />
)}
```

**2f.** Sửa state `returnTarget` từ `RequestDeviceLine | null` sang:
```ts
const [returnTarget, setReturnTarget] = useState<{
  allocationId: number
  deviceName: string
  deviceSku: string
  recipient: string
} | null>(null)
```

**2g.** Sửa `onReturn` call ở `DeviceTable` — tìm nơi gọi `onReturn(line)` và cập nhật `onReturn` type. Trong function `DeviceTable`, prop `onReturn` nhận `RequestDeviceLine`. Cập nhật để `Dashboard.tsx` (Task 4) dùng được type mới. Tìm component `DeviceTable` và sửa prop type:
```ts
function DeviceTable({
  lines,
  onReturn,
}: {
  lines: RequestDeviceLine[]
  onReturn(line: RequestDeviceLine): void
})
```
Giữ nguyên — chỉ sửa phần `setReturnTarget` bên trong `RequestDetail`:

Tìm `onReturn={line => setReturnTarget(line)}` và sửa thành:
```tsx
onReturn={line => setReturnTarget({
  allocationId: line.allocationId,
  deviceName: line.deviceName,
  deviceSku: line.deviceSku,
  recipient: line.recipient,
})}
```

- [ ] **Step 3: Chạy typecheck để phát hiện lỗi compile**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | head -40
```

Expected: không có error. Nếu có lỗi về `ReturnDeviceArgs` hoặc `RequestDeviceLine`, kiểm tra các import đã đúng chưa.

- [ ] **Step 4: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claire/worktrees/elated-brown-e34abc" 2>/dev/null || cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/components/ReturnDialog.tsx \
        equipment-manager/src/pages/RequestDetail.tsx
git commit -m "refactor: extract ReturnDialog to shared component"
```

---

## Task 3: Thêm allocationId + deviceSku vào DeptCardItem

**Files:**
- Modify: `electron/shared/ipc.ts`
- Modify: `electron/main/handlers/dashboard.ts`
- Modify: `electron/main/handlers/dashboard.test.ts`

**Interfaces:**
- Sửa `DeptCardItem`:
  ```ts
  export interface DeptCardItem {
    allocationId: number   // ← mới
    deviceSku: string      // ← mới
    name: string
    datetime: string
    borrower: string
    lender: string
    returnable: boolean
  }
  ```

- [ ] **Step 1: Sửa `DeptCardItem` trong `ipc.ts`**

Mở `electron/shared/ipc.ts`, tìm:
```ts
export interface DeptCardItem { name: string; datetime: string; borrower: string; lender: string; returnable: boolean }
```
Sửa thành:
```ts
export interface DeptCardItem {
  allocationId: number
  deviceSku: string
  name: string
  datetime: string
  borrower: string
  lender: string
  returnable: boolean
}
```

- [ ] **Step 2: Sửa `dashboard.ts` — thêm sku vào device query và trả về allocationId + deviceSku**

Mở `electron/main/handlers/dashboard.ts`.

**2a.** Tìm dòng:
```ts
const allDevicesInfo = db.select({ id: devices.id, name: devices.name }).from(devices).all()
const deviceById = new Map(allDevicesInfo.map((d) => [d.id, d.name]))
```
Sửa thành:
```ts
const allDevicesInfo = db.select({ id: devices.id, name: devices.name, sku: devices.sku }).from(devices).all()
const deviceById = new Map(allDevicesInfo.map((d) => [d.id, d.name]))
const deviceSkuById = new Map(allDevicesInfo.map((d) => [d.id, d.sku]))
```

**2b.** Tìm block `items: DeptCardItem[]`:
```ts
const items: DeptCardItem[] = reqAllocs.map((a) => {
  const lenderId = lenderByAllocId.get(a.allocId) ?? null
  const lenderName = lenderId != null ? (userById.get(lenderId) ?? '') : ''
  return {
    name: deviceById.get(a.deviceId) ?? '',
    datetime: fmtDateTime(a.issuedAt),
    borrower: a.employeeName ?? '',
    lender: lenderName,
    returnable: a.returnedAt === null,
  }
})
```
Sửa thành:
```ts
const items: DeptCardItem[] = reqAllocs.map((a) => {
  const lenderId = lenderByAllocId.get(a.allocId) ?? null
  const lenderName = lenderId != null ? (userById.get(lenderId) ?? '') : ''
  return {
    allocationId: a.allocId,
    deviceSku: deviceSkuById.get(a.deviceId) ?? '',
    name: deviceById.get(a.deviceId) ?? '',
    datetime: fmtDateTime(a.issuedAt),
    borrower: a.employeeName ?? '',
    lender: lenderName,
    returnable: a.returnedAt === null,
  }
})
```

- [ ] **Step 3: Thêm assertion vào `dashboard.test.ts`**

Mở `electron/main/handlers/dashboard.test.ts`. Sửa test hiện có:
```ts
describe('dashboard.summary', () => {
  it('returns stat counts consistent with the seeded devices', async () => {
    const h = setup()
    const res = await h.summary()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.stats.total).toBe(12)
      expect(res.data.stats.allocated).toBeGreaterThan(0)
      expect(res.data.deptCards.length).toBeGreaterThan(0)
      expect(res.data.deptCards[0].requests.length).toBeGreaterThan(0)
      // ← thêm:
      const firstItem = res.data.deptCards[0].requests[0].items[0]
      expect(typeof firstItem.allocationId).toBe('number')
      expect(typeof firstItem.deviceSku).toBe('string')
      expect(firstItem.deviceSku.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 4: Chạy typecheck + tests**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck && npm run test
```

Expected: không có error, tất cả PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/electron/shared/ipc.ts \
        equipment-manager/electron/main/handlers/dashboard.ts \
        equipment-manager/electron/main/handlers/dashboard.test.ts
git commit -m "feat: add allocationId and deviceSku to DeptCardItem for dashboard return"
```

---

## Task 4: Wire nút "Trả về" trên Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `ReturnDialog` từ `@/components/ReturnDialog` (Task 2)
- Consumes: `DeptCardItem.allocationId`, `DeptCardItem.deviceSku` (Task 3)
- Consumes: `api.requests.returnDevice(args: ReturnDeviceArgs)` từ `@/lib/api`

- [ ] **Step 1: Thêm import ReturnDialog vào Dashboard.tsx**

Mở `src/pages/Dashboard.tsx`, thêm import:
```ts
import { ReturnDialog } from '@/components/ReturnDialog'
import type { ReturnDeviceArgs } from '@shared/ipc'
```

- [ ] **Step 2: Thêm state và mutation cho return vào component `Dashboard`**

Trong function `Dashboard()`, sau khai báo `quickAllocMutation`, thêm:

```tsx
const [returnTarget, setReturnTarget] = useState<{
  allocationId: number
  deviceName: string
  deviceSku: string
  recipient: string
  dept: string
} | null>(null)

const returnMutation = useMutation({
  mutationFn: (args: ReturnDeviceArgs) => unwrap(api.requests.returnDevice(args)),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['devices'] })
    setReturnTarget(null)
  },
})
```

- [ ] **Step 3: Truyền `onReturnItem` xuống `DeptCardPanel`**

**3a.** Thêm prop `onReturnItem` vào interface `DeptCardPanel`:
```tsx
function DeptCardPanel({
  card,
  isDrop,
  onDragOver,
  onDrop,
  onDragLeave,
  onReturnItem,
}: {
  card: DeptCard
  isDrop?: boolean
  onDragOver?(): void
  onDrop?(): void
  onDragLeave?(): void
  onReturnItem?(item: DeptCardItem): void  // ← thêm
})
```

**3b.** Trong `DeptCardPanel`, tìm nút "Trả về" (có comment `// TODO: wire Return Dialog in Task 7`):
```tsx
<button
  onClick={() => { /* TODO: wire Return Dialog in Task 7 */ }}
  ...
>
```
Sửa thành:
```tsx
<button
  onClick={() => onReturnItem?.(item)}
  ...
>
```

**3c.** Trong render `Dashboard`, truyền prop xuống từng card:
```tsx
{data.deptCards.map(card => (
  <DeptCardPanel
    key={card.dept}
    card={card}
    isDrop={dropDept === card.dept}
    onDragOver={() => setDropDept(card.dept)}
    onDragLeave={() => setDropDept(null)}
    onDrop={() => {
      setDropDept(null)
      if (dragStateRef.current) {
        setLendModal({
          devices: dragStateRef.current.devices,
          dept: card.dept,
          deptId: card.deptId,
          requestId: dragStateRef.current.requestId,
        })
        dragStateRef.current = null
      }
    }}
    onReturnItem={item => setReturnTarget({   // ← thêm
      allocationId: item.allocationId,
      deviceName: item.name,
      deviceSku: item.deviceSku,
      recipient: item.borrower,
      dept: card.dept,
    })}
  />
))}
```

- [ ] **Step 4: Render ReturnDialog trong Dashboard**

Trong `return` của `Dashboard`, sau `</AllocationDrawer>` và `{lendModal && ...}`, thêm:

```tsx
{returnTarget && (
  <ReturnDialog
    allocationId={returnTarget.allocationId}
    deviceName={returnTarget.deviceName}
    deviceSku={returnTarget.deviceSku}
    recipient={returnTarget.recipient}
    contextLabel={`Phòng ban: ${returnTarget.dept}`}
    onClose={() => { setReturnTarget(null); returnMutation.reset() }}
    onConfirm={args => returnMutation.mutate(args)}
    loading={returnMutation.isPending}
  />
)}
{returnMutation.isError && (
  <div style={{
    position: 'fixed', bottom: 24, right: 24, zIndex: 200,
    background: '#dc2626', color: '#fff', padding: '12px 18px',
    borderRadius: 'var(--rad-md)', fontSize: 13, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(0,0,0,.2)'
  }}>
    {(returnMutation.error as Error).message}
  </div>
)}
```

- [ ] **Step 5: Chạy typecheck**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck 2>&1 | head -40
```

Expected: không có TypeScript error.

- [ ] **Step 6: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/pages/Dashboard.tsx
git commit -m "feat: wire return-device button on Dashboard dept cards"
```

---

## Task 5: In phiếu đề nghị

**Files:**
- Modify: `src/lib/icons.tsx`
- Create: `src/lib/print.ts`
- Modify: `src/pages/RequestDetail.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function printRequest(data: RequestDetail): void
  export function buildPrintHTML(data: RequestDetail): string  // exported để test
  ```

- [ ] **Step 1: Thêm `IconPrint` vào `src/lib/icons.tsx`**

Mở `src/lib/icons.tsx`, thêm vào cuối file (trước EOF):
```tsx
export const IconPrint = ({ size = 16 }: IconProps) =>
  svg(size, <>
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </>)
```

- [ ] **Step 2: Tạo `src/lib/print.ts`**

```ts
import type { RequestDetail } from '@shared/ipc'

export function printRequest(data: RequestDetail): void {
  const win = window.open('', '_blank', 'width=794,height=1123')
  if (!win) return
  win.document.write(buildPrintHTML(data))
  win.document.close()
  win.focus()
  win.print()
}

export function buildPrintHTML(data: RequestDetail): string {
  const rows = data.lines
    .map((l, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td style="font-family:'Courier New',monospace">${escHtml(l.deviceSku)}</td>
        <td>${escHtml(l.deviceName)}</td>
        <td>${escHtml(l.category)}</td>
        <td>${escHtml(l.recipient || '—')}</td>
        <td style="text-align:center">${l.isReturned ? 'Đã trả' : 'Đang cấp phát'}</td>
      </tr>`)
    .join('')

  const emptyRow = data.lines.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:16px;color:#666">Chưa có thiết bị nào trong phiếu này.</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Phiếu ${escHtml(data.code)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 13px; padding: 24px 32px; color: #111; }
    h1 { font-size: 15px; text-align: center; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
    .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 20px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 24px; margin-bottom: 18px; font-size: 13px; }
    .meta-row { display: flex; gap: 6px; }
    .meta-label { font-weight: bold; min-width: 96px; }
    .meta-full { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #f4f4f4; font-weight: bold; border: 1px solid #aaa; padding: 6px 8px; }
    td { border: 1px solid #aaa; padding: 6px 8px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 36px; }
    .sig-box { text-align: center; }
    .sig-label { font-weight: bold; font-size: 13px; margin-bottom: 4px; }
    .sig-date { font-size: 12px; color: #555; margin-bottom: 48px; }
    .sig-name { font-size: 12px; color: #555; font-style: italic; border-top: 1px solid #aaa; padding-top: 4px; }
    @media print {
      @page { size: A4; margin: 14mm 18mm; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>Phiếu đề nghị cấp phát thiết bị</h1>
  <div class="subtitle">Mã phiếu: <strong>${escHtml(data.code)}</strong></div>
  <div class="meta">
    <div class="meta-row"><span class="meta-label">Phòng ban:</span><span>${escHtml(data.department || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">Ngày lập:</span><span>${escHtml(data.createdAt)}</span></div>
    <div class="meta-row"><span class="meta-label">Số thiết bị:</span><span>${data.deviceCount}</span></div>
    <div class="meta-row"><span class="meta-label">Trạng thái:</span><span>${statusLabel(data.status)}</span></div>
    ${data.notes ? `<div class="meta-row meta-full"><span class="meta-label">Ghi chú:</span><span>${escHtml(data.notes)}</span></div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">STT</th>
        <th style="width:100px">SKU</th>
        <th>Tên thiết bị</th>
        <th style="width:120px">Loại</th>
        <th style="width:140px">Người nhận</th>
        <th style="width:110px">Trạng thái</th>
      </tr>
    </thead>
    <tbody>${rows}${emptyRow}</tbody>
  </table>
  <div class="signatures">
    <div class="sig-box">
      <div class="sig-label">Người lập phiếu</div>
      <div class="sig-date">Ngày &nbsp;&nbsp;&nbsp; tháng &nbsp;&nbsp;&nbsp; năm</div>
      <div class="sig-name">(Ký tên, ghi rõ họ tên)</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Người nhận thiết bị</div>
      <div class="sig-date">Ngày &nbsp;&nbsp;&nbsp; tháng &nbsp;&nbsp;&nbsp; năm</div>
      <div class="sig-name">(Ký tên, ghi rõ họ tên)</div>
    </div>
  </div>
</body>
</html>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function statusLabel(s: string): string {
  if (s === 'pending') return 'Chưa cấp phát'
  if (s === 'allocated') return 'Đang trang bị'
  return 'Hoàn tất'
}
```

- [ ] **Step 3: Viết test cho `buildPrintHTML`**

Tạo file `src/lib/print.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildPrintHTML } from './print'
import type { RequestDetail } from '@shared/ipc'

const mockRequest: RequestDetail = {
  id: 1,
  code: 'DX-302',
  department: 'IT',
  createdAt: '22/06/2026',
  deviceCount: 2,
  status: 'allocated',
  notes: null,
  lines: [
    {
      allocationId: 10,
      deviceSku: 'LT-001',
      deviceName: 'Laptop Dell XPS',
      category: 'Laptop',
      recipient: 'Nguyễn Văn A',
      isReturned: false,
    },
    {
      allocationId: 11,
      deviceSku: 'LT-002',
      deviceName: 'Laptop ThinkPad',
      category: 'Laptop',
      recipient: 'Trần Thị B',
      isReturned: true,
    },
  ],
}

describe('buildPrintHTML', () => {
  it('includes the request code in output', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('DX-302')
  })

  it('includes department name', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('IT')
  })

  it('includes all device rows', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('LT-001')
    expect(html).toContain('Laptop Dell XPS')
    expect(html).toContain('Nguyễn Văn A')
  })

  it('shows Đã trả for returned devices', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('Đã trả')
  })

  it('escapes HTML special characters', () => {
    const html = buildPrintHTML({
      ...mockRequest,
      code: '<script>alert(1)</script>',
      lines: [],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 4: Chạy test mới**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run test -- --reporter=verbose 2>&1 | grep -A 10 "buildPrintHTML"
```

Expected: tất cả 5 test PASS.

- [ ] **Step 5: Thêm nút "In phiếu" vào `RequestDetail.tsx`**

Mở `src/pages/RequestDetail.tsx`.

**5a.** Thêm imports:
```ts
import { IconPrint } from '@/lib/icons'
import { printRequest } from '@/lib/print'
```

**5b.** Tìm block header card top row (nơi có nút "Thêm thiết bị"):
```tsx
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    {/* code + badge */}
  </div>
  {isAdmin && (
    <button onClick={() => setShowAddDialog(true)} ...>
      <IconPlus size={14} />
      Thêm thiết bị
    </button>
  )}
</div>
```

Sửa thành (thêm nút In phiếu sau nút Thêm thiết bị):
```tsx
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    {/* code + badge */}
  </div>
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <button
      onClick={() => printRequest(data)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 38, padding: '0 14px',
        border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
        background: 'none', color: 'var(--text)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <IconPrint size={14} />
      In phiếu
    </button>
    {isAdmin && (
      <button
        onClick={() => setShowAddDialog(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 38, padding: '0 14px',
          border: '2px dashed var(--primary)', borderRadius: 'var(--rad-sm)',
          background: 'none', color: 'var(--primary)',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-soft2, rgba(37,99,235,.06))')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <IconPlus size={14} />
        Thêm thiết bị
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 6: Chạy typecheck + toàn bộ tests**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc/equipment-manager"
npm run typecheck && npm run test
```

Expected: không có error, tất cả PASS.

- [ ] **Step 7: Commit**

```bash
cd "/Users/natmaster/My Projects/CODING/ClaudeCode/.claude/worktrees/elated-brown-e34abc"
git add equipment-manager/src/lib/icons.tsx \
        equipment-manager/src/lib/print.ts \
        equipment-manager/src/lib/print.test.ts \
        equipment-manager/src/pages/RequestDetail.tsx
git commit -m "feat: add print phiếu đề nghị with HTML template"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `pending` status khi 0 dòng thiết bị | Task 1 |
| Badge label + màu cho `pending` | Task 1 |
| AllocationDrawer filter `!== 'completed'` | Task 1 |
| Extract `ReturnDialog` shared component | Task 2 |
| `RequestDetail` dùng shared component | Task 2 |
| `allocationId` + `deviceSku` trong `DeptCardItem` | Task 3 |
| Dashboard handler trả về các field mới | Task 3 |
| Wire nút Trả về trên Dashboard | Task 4 |
| Return mutation + invalidate dashboard | Task 4 |
| `IconPrint` | Task 5 |
| `printRequest` + `buildPrintHTML` | Task 5 |
| Nút "In phiếu" trên RequestDetail | Task 5 |
| XSS escape trong HTML template | Task 5 (hàm `escHtml`) |

Tất cả requirements đều có task.

### Type consistency check

- `ReturnDialogProps.allocationId: number` — định nghĩa Task 2, dùng Task 2 + Task 4 ✓
- `DeptCardItem.allocationId: number` — định nghĩa Task 3, đọc Task 4 ✓
- `DeptCardItem.deviceSku: string` — định nghĩa Task 3, đọc Task 4 ✓
- `RequestStatus` thêm `'pending'` — định nghĩa Task 1, `status.ts` Task 1, `buildPrintHTML` Task 5 ✓
- `buildPrintHTML(data: RequestDetail): string` — định nghĩa Task 5 step 2, test Task 5 step 3 ✓
