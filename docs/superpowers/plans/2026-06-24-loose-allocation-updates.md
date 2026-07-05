# Cấp phát lẻ / Xoá thiết bị / Phòng ban mặc định — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm card "Cấp phát lẻ" trên Dashboard, xoá thiết bị ở trang chi tiết (admin), nhập tay người nhận ở trang Cấp phát lẻ, đặt lại 4 phòng ban mặc định và gỡ tab Nhân viên.

**Architecture:** Electron + React + better-sqlite3/drizzle. IPC qua `CHANNELS` (preload → main handlers). "Allocation lẻ" = `allocations.requestId IS NULL`. Backend handler trả về `DeptCard[]` cho Dashboard; thêm một card đặc biệt `kind: 'loose'`. Tất cả thao tác ghi đi qua `quickAllocate`/handler hiện có.

**Tech Stack:** TypeScript, React 18, @tanstack/react-query, drizzle-orm, better-sqlite3, vitest.

## Global Constraints

- Chạy test bằng Node 22 (better-sqlite3 ABI). Lệnh test trong plan dùng đường dẫn tuyệt đối: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run <path>`, chạy từ thư mục `equipment-manager`.
- Typecheck: `npm run typecheck` (chạy từ `equipment-manager`).
- Mọi thư mục lệnh dưới đây gốc là `equipment-manager/` trừ khi nói rõ.
- `ApiResponse<T>` là kiểu trả về chuẩn của mọi handler: `{ ok: true; data: T } | { ok: false; error: { code; message } }`.
- Enum trạng thái thiết bị: `available | allocated | maintenance | broken | decommissioned`.
- Đổi tên/đường dẫn import dùng alias `@shared/ipc` (= `electron/shared/ipc.ts`).

---

## File Structure

- `electron/shared/ipc.ts` — thêm channel `devicesDelete`, type `DeviceDeleteArgs`, sửa `QuickAllocateArgs.departmentId`, sửa `DeptCard` (kind + looseItems), thêm `Api.devices.delete`.
- `electron/main/handlers/allocate.ts` — `quickAllocate` chấp nhận `departmentId` null.
- `electron/main/handlers/allocate.test.ts` — **mới**, test quickAllocate loose.
- `electron/main/handlers/dashboard.ts` — dựng card `kind:'loose'`.
- `electron/main/handlers/dashboard.test.ts` — cập nhật + thêm test loose card.
- `electron/main/handlers/devices.ts` — handler `delete`.
- `electron/main/handlers/devices.test.ts` — test `delete`.
- `electron/main/handlers/index.ts` — đăng ký `devicesDelete`.
- `electron/preload/index.ts` — expose `devices.delete`.
- `electron/main/db/seed.ts` — 4 phòng ban Đội 1–4 + reshape dữ liệu mẫu.
- `electron/main/db/seed.test.ts` — cập nhật kỳ vọng 4 phòng ban.
- `src/pages/Dashboard.tsx` — render loose card + luật kéo-thả.
- `src/components/ConfirmDeleteDialog.tsx` — **mới**.
- `src/pages/DeviceDetail.tsx` — nút Xoá + dialog.
- `src/pages/Allocate.tsx` — nhập tay người nhận, bỏ liên kết phiếu + ngày hẹn trả.
- `src/pages/Catalog.tsx` — gỡ tab Nhân viên.

---

## Task 1: quickAllocate chấp nhận departmentId null

**Files:**
- Modify: `electron/shared/ipc.ts` (`QuickAllocateArgs`)
- Modify: `electron/main/handlers/allocate.ts` (`quickAllocate`)
- Test: `electron/main/handlers/allocate.test.ts` (mới)

**Interfaces:**
- Produces: `QuickAllocateArgs { deviceSkus: string[]; departmentId: number | null; borrowerName: string; requestId: number | null; notes: string | null }`. Handler `quickAllocate(args)` tạo allocation với `departmentId = args.departmentId ?? null`, `requestId = args.requestId ?? null`.

- [ ] **Step 1: Viết test thất bại**

Tạo `electron/main/handlers/allocate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isNull, eq, and } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { allocations, devices } from '../db/schema'
import { makeAllocateHandlers } from './allocate'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return { db, alloc: makeAllocateHandlers(db) }
}

describe('allocate.quickAllocate', () => {
  it('creates a loose allocation when departmentId and requestId are null', async () => {
    const { db, alloc } = setup()
    const res = await alloc.quickAllocate({
      deviceSkus: ['LAP-0024'],
      departmentId: null,
      borrowerName: 'Nguyễn Văn Lẻ',
      requestId: null,
      notes: null,
    })
    expect(res.ok).toBe(true)

    const dev = db.select({ id: devices.id, status: devices.status })
      .from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    expect(dev!.status).toBe('allocated')

    const alc = db.select().from(allocations)
      .where(and(eq(allocations.deviceId, dev!.id), isNull(allocations.returnedAt))).get()
    expect(alc).toBeDefined()
    expect(alc!.departmentId).toBeNull()
    expect(alc!.requestId).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/allocate.test.ts`
Expected: FAIL — handler trả về lỗi `BAD_REQUEST` "Thiếu thông tin phòng ban." (vì `departmentId` null bị chặn) → `res.ok` là `false`.

- [ ] **Step 3: Sửa type `QuickAllocateArgs`**

Trong `electron/shared/ipc.ts`, đổi:

```ts
export interface QuickAllocateArgs {
  deviceSkus: string[]
  departmentId: number | null
  borrowerName: string
  requestId: number | null
  notes: string | null
}
```

- [ ] **Step 4: Sửa handler `quickAllocate`**

Trong `electron/main/handlers/allocate.ts`, **xoá** khối:

```ts
      if (!args.departmentId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Thiếu thông tin phòng ban.' } }
      }
```

và đổi dòng insert `departmentId: args.departmentId,` thành:

```ts
            departmentId: args.departmentId ?? null,
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/allocate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/shared/ipc.ts electron/main/handlers/allocate.ts electron/main/handlers/allocate.test.ts
git commit -m "feat: allow quickAllocate without department (loose allocation)"
```

---

## Task 2: Dashboard backend — card "Cấp phát lẻ"

**Files:**
- Modify: `electron/shared/ipc.ts` (`DeptCard`)
- Modify: `electron/main/handlers/dashboard.ts` (`summary`)
- Test: `electron/main/handlers/dashboard.test.ts`

**Interfaces:**
- Consumes: `QuickAllocateArgs` từ Task 1 (test dùng `quickAllocate({ departmentId: null, requestId: null })`).
- Produces: `DeptCard { dept: string; deptId: number | null; kind: 'department' | 'loose'; count: number; share: number; requests: DeptCardRequest[]; looseItems?: DeptCardItem[] }`. `summary()` trả `deptCards` gồm các card phòng ban (`kind:'department'`) rồi **một** card `kind:'loose'` (`dept:'Cấp phát lẻ'`, `deptId:null`) ở cuối.

- [ ] **Step 1: Cập nhật type `DeptCard`**

Trong `electron/shared/ipc.ts`, đổi `DeptCard`:

```ts
export interface DeptCard {
  dept: string
  deptId: number | null
  kind: 'department' | 'loose'
  count: number
  share: number
  requests: DeptCardRequest[]
  looseItems?: DeptCardItem[]
}
```

- [ ] **Step 2: Viết test thất bại (loose card)**

Trong `electron/main/handlers/dashboard.test.ts`, thêm vào trong `describe('dashboard.summary', ...)`:

```ts
  it('groups requestId-null active allocations into the loose card, not a department card', async () => {
    const { dash, alloc } = setup()
    const res0 = await alloc.quickAllocate({
      deviceSkus: ['LAP-0024'], departmentId: null,
      borrowerName: 'Người Lẻ', requestId: null, notes: null,
    })
    expect(res0.ok).toBe(true)

    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const loose = res.data.deptCards.find((c) => c.kind === 'loose')
    expect(loose).toBeDefined()
    expect(loose!.dept).toBe('Cấp phát lẻ')
    expect(loose!.deptId).toBeNull()
    const looseSkus = (loose!.looseItems ?? []).map((i) => i.deviceSku)
    expect(looseSkus).toContain('LAP-0024')

    const deptItemSkus = res.data.deptCards
      .filter((c) => c.kind === 'department')
      .flatMap((c) => c.requests.flatMap((r) => r.items.map((i) => i.deviceSku)))
    expect(deptItemSkus).not.toContain('LAP-0024')
  })

  it('always returns exactly one loose card even when empty', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const looseCards = res.data.deptCards.filter((c) => c.kind === 'loose')
    expect(looseCards.length).toBe(1)
    expect(looseCards[0].count).toBe(0)
    expect(looseCards[0].looseItems).toEqual([])
  })
```

- [ ] **Step 3: Cập nhật các assertion phụ thuộc số lượng card**

Trong `dashboard.test.ts`, đổi test `'returns a card for every department, including ones with no active allocations'` — thay:

```ts
    expect(res.data.deptCards.length).toBe(7)
```
bằng:
```ts
    const deptOnly = res.data.deptCards.filter((c) => c.kind === 'department')
    expect(deptOnly.length).toBe(7)
```

Trong test `'orders departments by active allocation count, highest first'`, thay:

```ts
    const counts = res.data.deptCards.map((c) => c.count)
```
bằng:
```ts
    const counts = res.data.deptCards.filter((c) => c.kind === 'department').map((c) => c.count)
```

- [ ] **Step 4: Chạy test để xác nhận FAIL**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/dashboard.test.ts`
Expected: FAIL — chưa có card `kind:'loose'`; `find(c => c.kind === 'loose')` trả `undefined`. (TypeScript trong test cũng đã biết `kind` nhờ Step 1.)

- [ ] **Step 5: Dựng loose card trong handler**

Trong `electron/main/handlers/dashboard.ts`:

(a) Trong `.map` tạo `deptCards` từ `sortedGroups`, thêm `kind` — đổi:

```ts
      const deptCards: DeptCard[] = sortedGroups.map((g) => ({
        dept: g.deptName,
        deptId: g.deptId,
        count: g.activeCount,
        share: deptAllocTotal > 0 ? Math.round((g.activeCount / deptAllocTotal) * 100) : 0,
        requests: g.requestCards,
      }))
```
thành (đổi tên biến để chừa tên `deptCards` cho mảng cuối):

```ts
      const departmentCards: DeptCard[] = sortedGroups.map((g) => ({
        dept: g.deptName,
        deptId: g.deptId,
        kind: 'department' as const,
        count: g.activeCount,
        share: deptAllocTotal > 0 ? Math.round((g.activeCount / deptAllocTotal) * 100) : 0,
        requests: g.requestCards,
      }))
```

(b) Ngay **trên** dòng `const deptAllocTotal = ...`, dựng loose items từ `allocRows` (đã chứa `requestId`, `returnedAt`):

```ts
      // Active allocations with no request link → loose ("Cấp phát lẻ") card
      const looseItems: DeptCardItem[] = allocRows
        .filter((a) => a.requestId == null && a.returnedAt === null)
        .map((a) => {
          const lenderId = lenderByAllocId.get(a.allocId) ?? null
          const lenderName = lenderId != null ? (userById.get(lenderId) ?? '') : ''
          return {
            allocationId: a.allocId,
            deviceSku: deviceSkuById.get(a.deviceId) ?? '',
            name: deviceById.get(a.deviceId) ?? '',
            datetime: fmtDateTime(a.issuedAt),
            borrowerName: a.employeeName ?? parseBorrowerFromNotes(a.allocNotes),
            lender: lenderName,
            returnable: true,
          }
        })
```

(c) Gộp loose vào tổng — đổi:

```ts
      const deptAllocTotal = sortedGroups.reduce((sum, g) => sum + g.activeCount, 0)
```
thành:
```ts
      const deptAllocTotal =
        sortedGroups.reduce((sum, g) => sum + g.activeCount, 0) + looseItems.length
```

(d) Sau `departmentCards`, tạo loose card và mảng `deptCards`:

```ts
      const looseCard: DeptCard = {
        dept: 'Cấp phát lẻ',
        deptId: null,
        kind: 'loose',
        count: looseItems.length,
        share: deptAllocTotal > 0 ? Math.round((looseItems.length / deptAllocTotal) * 100) : 0,
        requests: [],
        looseItems,
      }
      const deptCards: DeptCard[] = [...departmentCards, looseCard]
```

(e) Đảm bảo import có `DeptCardItem` (đã import `DeptCardRequest`, `DeptCard`, `DeptCardItem` ở đầu file — kiểm tra; nếu thiếu `DeptCardItem` thì thêm vào danh sách import từ `@shared/ipc`).

> Lưu ý thứ tự khai báo: `looseItems` (b) phải đứng **trước** `deptAllocTotal` (c) vì (c) tham chiếu `looseItems.length`. `departmentCards` (a) và `looseCard` (d) dùng `deptAllocTotal` nên phải đứng **sau** (c). Sắp xếp: (b) → (c) → (a) → (d).

- [ ] **Step 6: Chạy test để xác nhận PASS**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/dashboard.test.ts`
Expected: PASS (tất cả, gồm 2 test mới).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 8: Commit**

```bash
git add electron/shared/ipc.ts electron/main/handlers/dashboard.ts electron/main/handlers/dashboard.test.ts
git commit -m "feat: dashboard loose-allocation card (requestId NULL)"
```

---

## Task 3: Dashboard frontend — render loose card + luật kéo-thả

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `DeptCard` (Task 2) với `kind`, `deptId: number | null`, `looseItems`. `QuickAllocateArgs.departmentId: number | null` (Task 1).
- Produces: (UI) không có interface mới.

- [ ] **Step 1: Nới kiểu state `lendModal` + `LendConfirmDialog` cho deptId null**

Trong `src/pages/Dashboard.tsx`:

(a) `LendConfirmDialog` props: đổi `deptId: number` → `deptId: number | null`. (Component không dùng `deptId` trong thân, chỉ nới kiểu.)

(b) State `lendModal`: đổi `deptId: number` → `deptId: number | null`:

```ts
  const [lendModal, setLendModal] = useState<{
    devices: AvailableDeviceRow[]
    dept: string
    deptId: number | null
    requestId: number | null
  } | null>(null)
```

- [ ] **Step 2: Áp luật kéo-thả ở map card**

Thay block `data.deptCards.map(card => (<DeptCardPanel ... />))` bằng:

```tsx
            {data.deptCards.map(card => {
              const validDrop = () => {
                const reqId = dragStateRef.current?.requestId ?? null
                return card.kind === 'loose' ? reqId == null : reqId != null
              }
              return (
                <DeptCardPanel
                  key={card.dept}
                  card={card}
                  isDrop={dropDept === card.dept}
                  onDragOver={() => setDropDept(validDrop() ? card.dept : null)}
                  onDragLeave={() => setDropDept(null)}
                  onDrop={() => {
                    setDropDept(null)
                    const drag = dragStateRef.current
                    dragStateRef.current = null
                    if (!drag) return
                    const reqId = drag.requestId ?? null
                    const ok = card.kind === 'loose' ? reqId == null : reqId != null
                    if (!ok) return
                    setLendModal({
                      devices: drag.devices,
                      dept: card.dept,
                      deptId: card.deptId,
                      requestId: reqId,
                    })
                  }}
                  onReturnItem={item => setReturnTarget({
                    allocationId: item.allocationId,
                    deviceName: item.name,
                    deviceSku: item.deviceSku,
                    recipient: item.borrowerName,
                    dept: card.dept,
                  })}
                />
              )
            })}
```

- [ ] **Step 3: Render loose card trong `DeptCardPanel`**

Trong `DeptCardPanel`, ngay sau dòng `const firstCode = ...` và các state/`req`/`items`, thay khối tính toán items để hỗ trợ loose. Đổi:

```ts
  const req: DeptCardRequest | undefined =
    card.requests.find(r => r.code === activeCode) ?? card.requests[0]

  const items = req?.items ?? []
```
thành:
```ts
  const isLoose = card.kind === 'loose'

  const req: DeptCardRequest | undefined =
    isLoose ? undefined : (card.requests.find(r => r.code === activeCode) ?? card.requests[0])

  const items = isLoose ? (card.looseItems ?? []) : (req?.items ?? [])
```

- [ ] **Step 4: Header phụ đề + nhánh body cho loose**

(a) Trong header card, đổi dòng subtitle:

```tsx
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {card.share}% tổng cấp phát
          </div>
```
thành:
```tsx
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {isLoose ? 'Cấp phát không qua phiếu' : `${card.share}% tổng cấp phát`}
          </div>
```

(b) Đổi điều kiện gate body. Hiện tại:

```tsx
      {card.requests.length === 0 ? (
        /* Empty department ... */
        <div ...>...«Không có thiết bị đang trang bị»...</div>
      ) : (
        <>
        ...chips + meta + items + pager...
        </>
      )}
```

Đổi dòng mở `{card.requests.length === 0 ? (` thành `{!isLoose && card.requests.length === 0 ? (` để loose **không** rơi vào empty-state phòng ban.

(c) Trong nhánh `<>...</>`, bọc các phần chỉ-dành-cho-phòng-ban bằng `{!isLoose && ( ... )}`:
- Khối "Chips label" (`<div ...>{`Phiếu đề nghị (...)`}</div>`)
- Khối "Request chips" (`<div ...>{card.requests.map(...)}</div>`)
- Khối "Meta line" (`{req && (<div ...>...</div>)}`) — đã có điều kiện `req`; vì khi loose `req` là `undefined` nên khối này tự ẩn, **không cần** sửa.

Ví dụ bọc chips label:
```tsx
      {!isLoose && (
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '.03em'
        }}>{`Phiếu đề nghị (${String(card.requests.length).padStart(2, '0')})`}</div>
      )}
```
và tương tự bọc nguyên khối "Request chips".

(d) Trong danh sách items, đổi text empty-state để phân biệt loose. Tìm:

```tsx
            <span style={{ fontSize: 13 }}>Không có thiết bị được cấp phát</span>
```
đổi thành:
```tsx
            <span style={{ fontSize: 13 }}>{isLoose ? 'Chưa có thiết bị cấp phát lẻ' : 'Không có thiết bị được cấp phát'}</span>
```

(Phần render `pageItems`, nút "Trả về", và Pager giữ nguyên — chúng đọc `items`/`pageItems` đã trỏ về `looseItems` khi loose.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: render loose-allocation card and enforce drop rules on dashboard"
```

---

## Task 4: Xoá thiết bị — backend

**Files:**
- Modify: `electron/shared/ipc.ts` (channel + type + `Api.devices`)
- Modify: `electron/main/handlers/devices.ts` (`delete`)
- Modify: `electron/main/handlers/index.ts` (đăng ký)
- Modify: `electron/preload/index.ts` (expose)
- Test: `electron/main/handlers/devices.test.ts`

**Interfaces:**
- Produces: `DeviceDeleteArgs { sku: string }`; `api.devices.delete(args): Promise<ApiResponse<{ ok: true }>>`. Handler: NOT_FOUND nếu sku sai; CONFLICT nếu device đang `allocated` (active alloc); ngược lại xoá `maintenanceLogs` + `allocations` + `devices` trong transaction.

- [ ] **Step 1: Viết test thất bại**

Trong `electron/main/handlers/devices.test.ts`, thêm các import còn thiếu ở đầu file (kiểm tra cái nào đã có, chỉ thêm cái thiếu):
```ts
import { eq } from 'drizzle-orm'
import { devices, allocations } from '../db/schema'
import { makeAllocateHandlers } from './allocate'
```
(`createDb`, `runMigrations`, `seedIfEmpty`, `makeDeviceHandlers` đã được import sẵn.) Rồi thêm một `describe` mới ở cuối file:

```ts
describe('devices.delete', () => {
  it('deletes a device that has never been allocated', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const h = makeDeviceHandlers(db)

    // PRJ-0003 (Epson) is 'Trong kho' and never allocated in seed
    const res = await h.delete({ sku: 'PRJ-0003' })
    expect(res.ok).toBe(true)

    const gone = db.select().from(devices).where(eq(devices.sku, 'PRJ-0003')).all()
    expect(gone.length).toBe(0)
  })

  it('blocks deletion when the device is currently allocated', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const h = makeDeviceHandlers(db)
    const alloc = makeAllocateHandlers(db)

    // LAP-0024 available → allocate it loosely so it has an active allocation
    await alloc.quickAllocate({
      deviceSkus: ['LAP-0024'], departmentId: null,
      borrowerName: 'X', requestId: null, notes: null,
    })

    const res = await h.delete({ sku: 'LAP-0024' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('CONFLICT')

    // Still present
    const still = db.select().from(devices).where(eq(devices.sku, 'LAP-0024')).all()
    expect(still.length).toBe(1)
  })

  it('cascade-deletes returned allocation history with the device', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const h = makeDeviceHandlers(db)

    // NET-0002 (TP-Link Switch) belongs to DX-298 ('Hoàn tất' → allocation has returnedAt set),
    // so it has history but NO active allocation → deletion is allowed and cascades the history.
    const dev = db.select({ id: devices.id })
      .from(devices).where(eq(devices.sku, 'NET-0002')).get()
    expect(dev).toBeDefined()

    const res = await h.delete({ sku: 'NET-0002' })
    expect(res.ok).toBe(true)

    const allocsLeft = db.select().from(allocations)
      .where(eq(allocations.deviceId, dev!.id)).all()
    expect(allocsLeft.length).toBe(0)
  })
})
```

> Ghi chú dữ liệu seed: device status lấy từ `vnStatus` (không từ request). `NET-0002` có `vnStatus: 'Đang trang bị'` nên status `allocated`, **nhưng** allocation duy nhất của nó thuộc DX-298 ('Hoàn tất') đã có `returnedAt` ≠ null → không phải active alloc. Handler chỉ chặn khi có active alloc (`returnedAt IS NULL`), nên xoá được và cascade lịch sử.

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/devices.test.ts`
Expected: FAIL — `h.delete` không tồn tại (TypeScript/runtime error).

- [ ] **Step 3: Thêm channel + type + Api**

Trong `electron/shared/ipc.ts`:
(a) Trong `CHANNELS`, sau `devicesChangeStatus: 'devices.changeStatus',` thêm:
```ts
  devicesDelete: 'devices.delete',
```
(b) Gần các `Device*Args` khác, thêm:
```ts
export interface DeviceDeleteArgs { sku: string }
```
(c) Trong `Api.devices`, sau `changeStatus(...)` thêm:
```ts
    delete(args: DeviceDeleteArgs): Promise<ApiResponse<{ ok: true }>>
```

- [ ] **Step 4: Viết handler `delete`**

Trong `electron/main/handlers/devices.ts`:
(a) Thêm `DeviceDeleteArgs` vào import type từ `@shared/ipc`.
(b) Đảm bảo `maintenanceLogs` đã import (đã có). Thêm handler trong object trả về, sau `changeStatus`:

```ts
    async delete(args: DeviceDeleteArgs): Promise<ApiResponse<{ ok: true }>> {
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
          error: { code: 'CONFLICT', message: 'Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi xoá.' },
        }
      }
      db.transaction((tx) => {
        tx.delete(maintenanceLogs).where(eq(maintenanceLogs.deviceId, device.id)).run()
        tx.delete(allocations).where(eq(allocations.deviceId, device.id)).run()
        tx.delete(devices).where(eq(devices.id, device.id)).run()
      })
      return { ok: true, data: { ok: true } }
    },
```

- [ ] **Step 5: Đăng ký channel ở main**

Trong `electron/main/handlers/index.ts`, sau dòng `devicesChangeStatus`:
```ts
  ipcMain.handle(CHANNELS.devicesDelete, (_e, args) => auth_guard(() => devicesH.delete(args)))
```

- [ ] **Step 6: Expose ở preload**

Trong `electron/preload/index.ts`, trong `devices`, sau `changeStatus`:
```ts
    delete: (args) => ipcRenderer.invoke(CHANNELS.devicesDelete, args),
```
(`src/lib/api.ts` dùng getter `get devices()` nên không cần sửa.)

- [ ] **Step 7: Chạy test để xác nhận PASS**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/handlers/devices.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + Commit**

Run: `npm run typecheck` → không lỗi.
```bash
git add electron/shared/ipc.ts electron/main/handlers/devices.ts electron/main/handlers/devices.test.ts electron/main/handlers/index.ts electron/preload/index.ts
git commit -m "feat: devices.delete handler (block when allocated, cascade history)"
```

---

## Task 5: Xoá thiết bị — frontend (DeviceDetail)

**Files:**
- Create: `src/components/ConfirmDeleteDialog.tsx`
- Modify: `src/pages/DeviceDetail.tsx`

**Interfaces:**
- Consumes: `api.devices.delete({ sku })` (Task 4).
- Produces: component `ConfirmDeleteDialog` props `{ deviceName: string; deviceSku: string; loading: boolean; error: string; onClose(): void; onConfirm(): void }`.

- [ ] **Step 1: Tạo `ConfirmDeleteDialog`**

Tạo `src/components/ConfirmDeleteDialog.tsx`:

```tsx
interface ConfirmDeleteDialogProps {
  deviceName: string
  deviceSku: string
  loading: boolean
  error: string
  onClose(): void
  onConfirm(): void
}

export function ConfirmDeleteDialog({
  deviceName, deviceSku, loading, error, onClose, onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
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
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>Xoá thiết bị</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Bạn có chắc muốn xoá <strong style={{ color: 'var(--text)' }}>{deviceName}</strong>{' '}
            (<span style={{ fontFamily: "'Consolas',monospace" }}>{deviceSku}</span>)? Hành động này
            xoá vĩnh viễn thiết bị và toàn bộ lịch sử cấp phát/bảo trì liên quan.
          </div>
        </div>
        {error && (
          <div style={{ padding: '12px 22px', fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
            {error}
          </div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 22px', borderTop: '1px solid var(--border)',
        }}>
          <button onClick={onClose} style={{
            height: 38, padding: '0 16px', border: '1px solid var(--border)',
            borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Huỷ</button>
          <button onClick={onConfirm} disabled={loading} style={{
            height: 38, padding: '0 16px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: '#dc2626',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Đang xoá…' : 'Xoá thiết bị'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire vào `DeviceDetail.tsx`**

(a) Thêm import:
```ts
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
```
(b) Thêm state cạnh các state dialog khác:
```ts
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
```
(c) Thêm mutation cạnh các mutation khác:
```ts
  const deleteMutation = useMutation({
    mutationFn: () => unwrap(api.devices.delete({ sku: sku! })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      navigate('/devices')
    },
  })
```
(d) Trong cụm nút `isAdmin`, sau nút "Chỉnh sửa", thêm nút Xoá:
```tsx
            <button
              onClick={() => setShowDeleteDialog(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 38, padding: '0 14px',
                border: '1px solid #dc2626', borderRadius: 'var(--rad-md)',
                background: 'var(--surface)', color: '#dc2626',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
            >
              <span>Xoá</span>
            </button>
```
(e) Cuối JSX (cạnh các dialog khác, trước `</div>` đóng trang), thêm:
```tsx
      {showDeleteDialog && data && (
        <ConfirmDeleteDialog
          deviceName={data.device.name}
          deviceSku={data.device.sku}
          loading={deleteMutation.isPending}
          error={deleteMutation.isError ? (deleteMutation.error as Error).message : ''}
          onClose={() => { setShowDeleteDialog(false); deleteMutation.reset() }}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 4: Commit**

```bash
git add src/components/ConfirmDeleteDialog.tsx src/pages/DeviceDetail.tsx
git commit -m "feat: delete-device action on DeviceDetail (admin)"
```

---

## Task 6: Trang Cấp phát lẻ — nhập tay người nhận

**Files:**
- Modify: `src/pages/Allocate.tsx`

**Interfaces:**
- Consumes: `api.allocate.quick(QuickAllocateArgs)` (Task 1).

- [ ] **Step 1: Đổi state**

Trong `src/pages/Allocate.tsx`, thay các state:
```ts
  const [employeeId, setEmployeeId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [requestId, setRequestId] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
```
bằng:
```ts
  const [borrowerName, setBorrowerName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
```

- [ ] **Step 2: Đổi mutation sang quickAllocate**

Đổi import type ở đầu file thành `import type { AvailableDeviceRow, QuickAllocateArgs } from '@shared/ipc'`, rồi thay khối `const mutation = useMutation({...})` bằng:
```ts
  const mutation = useMutation({
    mutationFn: (args: QuickAllocateArgs) => unwrap(api.allocate.quick(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['allocate'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['requests', 'available-devices'] })
      setSuccess(true)
      setSelectedDevices([])
      setBorrowerName(''); setDepartmentId(''); setConditionNotes('')
    },
    onError: (e) => setFormError((e as Error).message),
  })
```
(`CreateAllocationArgs` không còn dùng — đã được thay bằng `QuickAllocateArgs` ở dòng import trên.)

- [ ] **Step 3: Đổi `submit`**

Thay hàm `submit()`:
```ts
  function submit() {
    setFormError('')
    setSuccess(false)
    if (selectedDevices.length === 0) { setFormError('Vui lòng chọn thiết bị.'); return }
    if (!borrowerName.trim()) { setFormError('Vui lòng nhập tên người nhận.'); return }
    if (!departmentId) { setFormError('Vui lòng chọn phòng ban.'); return }
    mutation.mutate({
      deviceSkus: selectedDevices.map(d => d.sku),
      departmentId: Number(departmentId),
      borrowerName: borrowerName.trim(),
      requestId: null,
      notes: conditionNotes || null,
    })
  }
```

- [ ] **Step 4: Đổi JSX form**

(a) Thay field "Nhân viên nhận" (`<select>`) bằng input text:
```tsx
              <Field label="Nhân viên nhận" required>
                <input
                  type="text"
                  value={borrowerName}
                  onChange={e => setBorrowerName(e.target.value)}
                  placeholder="Nhập tên người nhận"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </Field>
```
(b) **Xoá** nguyên khối `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>` chứa "Ngày hẹn trả" + "Liên kết phiếu đề nghị" (cả hai field bị bỏ).
(c) Dưới phần mô tả tiêu đề (sau `<div>...Bàn giao nhanh...</div>` đóng), thêm badge trạng thái:
```tsx
        <div style={{
          display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
          padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          background: 'var(--surface-2)', color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}>
          Không liên kết phiếu đề nghị
        </div>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi (không còn tham chiếu `employeeId`, `dueDate`, `requestId`, `data.employees`, `data.requests` trong render).

> Nếu typecheck báo "unused" cho `data.employees`/`data.requests`: chúng chỉ là field của object `data`, không gây lỗi. Đảm bảo đã xoá mọi `.map` render employees/requests trong JSX.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Allocate.tsx
git commit -m "feat: manual recipient on loose-allocation page (no request link)"
```

---

## Task 7: Phòng ban mặc định Đội 1–4 (seed)

**Files:**
- Modify: `electron/main/db/seed.ts`
- Modify: `electron/main/db/seed.test.ts`
- Modify: `electron/main/handlers/dashboard.test.ts` (số phòng ban + tên)

**Interfaces:**
- Produces: DB seed có đúng 4 phòng ban: `Đội 1, Đội 2, Đội 3, Đội 4`. Dữ liệu requests/allocations/employees mẫu tham chiếu các đội này.

- [ ] **Step 1: Cập nhật test seed (FAIL trước)**

Trong `electron/main/db/seed.test.ts`, đổi test `'seeds 7 departments'`:
```ts
  it('seeds 4 default departments (Đội 1–4)', () => {
    const db = freshSeededDb()
    const rows = db.select().from(departments).all()
    expect(rows.length).toBe(4)
    expect(rows.map((d) => d.name).sort()).toEqual(['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4'])
  })
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/db/seed.test.ts`
Expected: FAIL — seed vẫn tạo 7 phòng ban tiếng Việt cũ.

- [ ] **Step 3: Đổi `deptNames` + reshape**

Trong `electron/main/db/seed.ts`:

(a) Thay khối `const deptNames = [...]`:
```ts
    const deptNames = ['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4']
```

(b) Thay `dept` trong `seedEmployees` (ánh xạ phòng ban cũ → đội):
```ts
    const seedEmployees = [
      { code: 'NV001', name: 'Nguyễn Văn An', dept: 'Đội 1' },
      { code: 'NV002', name: 'Trần Thị Bình', dept: 'Đội 4' },
      { code: 'NV003', name: 'Lê Hoàng Cường', dept: 'Đội 2' },
      { code: 'NV004', name: 'Phạm Thị Dung', dept: 'Đội 1' },
      { code: 'NV005', name: 'Vũ Minh Đức', dept: 'Đội 2' },
      { code: 'NV006', name: 'Hoàng Thị Em', dept: 'Đội 4' },
      { code: 'NV007', name: 'Đặng Văn Phúc', dept: 'Đội 3' },
    ]
```

(c) Trong `requestDefs`, đổi field `dept` của từng phiếu (giữ nguyên mọi field khác):
- `DX-301`: `dept: 'Đội 1'`
- `DX-300`: `dept: 'Đội 2'`
- `DX-298`: `dept: 'Đội 3'`
- `DX-295`: `dept: 'Đội 4'`
- `DX-293`: `dept: 'Đội 1'`
- `DX-290`: `dept: 'Đội 2'`

(Không đổi `items`, `requester`, `lender`, `vnStatus`, `notes`, `date`.)

- [ ] **Step 4: Chạy seed test để xác nhận PASS**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/main/db/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Cập nhật dashboard.test cho 4 phòng ban**

Trong `electron/main/handlers/dashboard.test.ts`:

(a) Test `'returns a card for every department...'` — đổi `expect(deptOnly.length).toBe(7)` thành `expect(deptOnly.length).toBe(4)`.

(b) Test `'a department with no active allocations shows count 0 and no request chips'` — đổi tham chiếu `'Ban Giám đốc'` thành `'Đội 4'` (DX-295 thuộc Đội 4 là 'Hoàn tất' → không có active alloc):
```ts
    const empty = res.data.deptCards.find((c) => c.dept === 'Đội 4')
    expect(empty).toBeDefined()
    expect(empty!.count).toBe(0)
    expect(empty!.requests.length).toBe(0)
```

- [ ] **Step 6: Chạy toàn bộ test backend**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run electron/`
Expected: PASS toàn bộ. (Nếu `requests.test.ts` có assert tên phòng ban cũ, sửa tương tự sang Đội tương ứng — kiểm tra output và cập nhật.)

- [ ] **Step 7: Commit**

```bash
git add electron/main/db/seed.ts electron/main/db/seed.test.ts electron/main/handlers/dashboard.test.ts
git commit -m "feat: default departments Đội 1–4 in seed"
```

---

## Task 8: Gỡ tab Nhân viên khỏi Danh mục

**Files:**
- Modify: `src/pages/Catalog.tsx`

**Interfaces:**
- (Không có interface mới; chỉ gỡ UI.)

- [ ] **Step 1: Bỏ tab khỏi cấu hình**

Trong `src/pages/Catalog.tsx`:
(a) Đổi `type Tab`:
```ts
type Tab = 'categories' | 'departments'
```
(b) Đổi mảng `TABS` (bỏ phần tử employees):
```ts
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'categories', label: 'Loại thiết bị' },
  { key: 'departments', label: 'Phòng ban' },
]
```

- [ ] **Step 2: Bỏ render nhánh employees**

Xoá khối:
```tsx
      {tab === 'employees' && (
        <EmployeesTab rows={data?.employees ?? []} depts={data?.departments ?? []} isAdmin={isAdmin} />
      )}
```

- [ ] **Step 3: Xoá component `EmployeesTab`**

Xoá toàn bộ định nghĩa `function EmployeesTab({...}) {...}` (khối "// ── Employees tab ──"). Nếu sau khi xoá còn import không dùng (vd `EmployeeRow` chỉ dùng trong `EmployeesTab`), xoá khỏi dòng `import type { CategoryRow, DepartmentRow, EmployeeRow } from '@shared/ipc'` → còn `import type { CategoryRow, DepartmentRow } from '@shared/ipc'`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi (không còn tham chiếu `EmployeesTab`, `EmployeeRow` mồ côi, hay `'employees'` trong `Tab`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Catalog.tsx
git commit -m "feat: remove Employees tab from Catalog"
```

---

## Hoàn tất

- [ ] **Chạy toàn bộ test một lần cuối**

Run: `/Users/natmaster/.nvm/versions/node/v22.19.0/bin/node node_modules/.bin/vitest run`
Expected: tất cả PASS.

- [ ] **Typecheck toàn dự án**

Run: `npm run typecheck`
Expected: không lỗi.

> **Reset DB dev:** vì phòng ban mặc định đổi (Task 7), DB cục bộ cũ vẫn giữ phòng ban tiếng Việt cũ (`seedIfEmpty` chỉ seed khi DB rỗng). Để thấy Đội 1–4, người dùng cần xoá file SQLite dev và chạy lại app để seed mới. Ghi rõ điều này khi bàn giao.
</content>
