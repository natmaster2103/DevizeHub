# Request Status & Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển trạng thái phiếu đề nghị từ auto-derive sang lưu trong DB (pending → allocated tự động khi cấp thiết bị, → completed thủ công), và thêm filter trạng thái + phòng ban cho trang danh sách phiếu.

**Architecture:** Thêm cột `status` vào bảng `requests` (Drizzle migration với backfill). Loại bỏ hàm `deriveStatus()` — handler `list`/`get` đọc `status` trực tiếp từ DB. Handler `addDevices` tự động set `allocated`. Thêm IPC action `updateStatus` (gated `manage_requests`) cho nút "Đánh dấu hoàn tất". Filter ở list page thực hiện client-side.

**Tech Stack:** Electron, better-sqlite3, Drizzle ORM, React 18, TanStack Query, TypeScript, Vitest

## Global Constraints

- Tất cả label/thông báo user-facing bằng **tiếng Việt**.
- Admin role mặc định có mọi permission (`requirePermission` trả `null` cho admin).
- Permission `manage_requests` gate cho `updateStatus` (cả handler lẫn nút UI).
- Status values: `'pending'` (Chưa cấp phát), `'allocated'` (Đang cho mượn), `'completed'` (Hoàn tất).
- Transition `updateStatus` chỉ cho phép `allocated → completed` (một chiều).
- `addDevices`: chỉ tự động set `allocated` khi request đang `pending` (không ghi đè `completed`).
- Label `allocated` đổi từ "Đang trang bị" → **"Đang cho mượn"** trong cả `requestStatusLabel` và `REQUEST_STATUS_LABELS`.
- Run TypeScript check: `npm run typecheck` (chạy cả node + web).
- Run tests: `npx vitest run electron/main/handlers/requests.test.ts` (tránh ABI issue — xem CLAUDE.md; nếu lỗi `better-sqlite3` NODE_MODULE_VERSION thì chạy vitest dưới Node 22).
- Styling: inline styles + CSS custom properties (`--primary`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--rad-sm/md/lg`, `--hoverbg`).

---

## File Map

| File | Change |
|---|---|
| `electron/main/db/schema.ts` | + cột `status` vào `requests` table |
| `electron/main/db/migrations/0006_*.sql` | Tạo thủ công: `ALTER TABLE` + backfill |
| `electron/main/db/migrations/meta/_journal.json` | + entry cho migration 0006 |
| `electron/main/db/migrations/meta/0006_snapshot.json` | Snapshot (tạo thủ công hoặc qua db:generate) |
| `electron/shared/ipc.ts` | + `requestsUpdateStatus` channel; + `UpdateRequestStatusArgs`; + `api.requests.updateStatus` |
| `electron/preload/index.ts` | Expose `api.requests.updateStatus` |
| `electron/main/handlers/index.ts` | Register `requestsUpdateStatus` với `auth_guard` |
| `electron/main/handlers/requests.ts` | Xóa `deriveStatus()`; sửa `list`/`get`/`addDevices`/`create`; + `updateStatus` |
| `electron/main/handlers/requests.test.ts` | + tests cho status flow + updateStatus |
| `src/lib/status.ts` | Đổi label `allocated` → "Đang cho mượn" |
| `src/hooks/useRequest.ts` | + hook `useUpdateRequestStatus` (hoặc inline mutation trong page) |
| `src/pages/RequestDetail.tsx` | + nút "Đánh dấu hoàn tất" |
| `src/pages/Requests.tsx` | + status tabs + department dropdown filter |

---

## Task 1: DB Schema + Migration

**Files:**
- Modify: `electron/main/db/schema.ts:73-81`
- Create: `electron/main/db/migrations/0006_request_status.sql`
- Modify: `electron/main/db/migrations/meta/_journal.json`
- Create: `electron/main/db/migrations/meta/0006_snapshot.json`

**Interfaces:**
- Produces: cột `requests.status` (text, NOT NULL, default `'pending'`), accessible qua `requests.status` trong Drizzle queries.

> **Lưu ý về cách tạo migration:** Cách an toàn nhất là sửa `schema.ts` rồi chạy `npm run db:generate` để Drizzle tự sinh file SQL + snapshot + cập nhật journal. Nếu `db:generate` không chạy được trong môi trường, tạo thủ công 3 file như Step 2–4 dưới đây. **Chỉ một trong hai cách** — nếu đã chạy `db:generate` thành công thì bỏ qua việc tạo thủ công, nhưng vẫn phải **bổ sung backfill SQL** (Step 3) vào file Drizzle sinh ra (Drizzle chỉ tạo `ALTER TABLE`, không tạo backfill).

- [ ] **Step 1: Thêm cột `status` vào schema**

Trong `electron/main/db/schema.ts`, sửa định nghĩa bảng `requests` (lines 73-81):

```ts
export const requests = sqliteTable('requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  employeeId: integer('employee_id').references(() => employees.id),
  createdBy: integer('created_by').references(() => appUsers.id),
  createdAt: text('created_at').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('pending')
})
```

- [ ] **Step 2: Tạo file migration SQL**

Tạo `electron/main/db/migrations/0006_request_status.sql`:

```sql
ALTER TABLE `requests` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE `requests` SET `status` = 'allocated'
	WHERE `id` IN (SELECT DISTINCT `request_id` FROM `allocations` WHERE `returned_at` IS NULL AND `request_id` IS NOT NULL);--> statement-breakpoint
UPDATE `requests` SET `status` = 'completed'
	WHERE `id` IN (SELECT DISTINCT `request_id` FROM `allocations` WHERE `request_id` IS NOT NULL)
	AND `id` NOT IN (SELECT DISTINCT `request_id` FROM `allocations` WHERE `returned_at` IS NULL AND `request_id` IS NOT NULL);
```

- [ ] **Step 3: Cập nhật journal**

Trong `electron/main/db/migrations/meta/_journal.json`, thêm entry vào cuối mảng `entries` (sau entry idx 5):

```json
    {
      "idx": 6,
      "version": "6",
      "when": 1782720000000,
      "tag": "0006_request_status",
      "breakpoints": true
    }
```

(Nhớ thêm dấu phẩy sau entry idx 5.)

- [ ] **Step 4: Tạo snapshot 0006**

Copy `electron/main/db/migrations/meta/0005_snapshot.json` thành `0006_snapshot.json`, sau đó trong bảng `requests` thêm cột `status` vào object `columns` (giữ nguyên format của các cột khác trong file đó):

```json
        "status": {
          "name": "status",
          "type": "text",
          "primaryKey": false,
          "notNull": true,
          "autoincrement": false,
          "default": "'pending'"
        }
```

Cập nhật trường `"id"` ở đầu snapshot thành một UUID mới bất kỳ và `"prevId"` = id của snapshot 0005.

> Nếu dùng `npm run db:generate` (khuyến nghị), Step 2–4 được tự động hoá; chỉ cần thêm 2 câu `UPDATE` backfill từ Step 2 vào file `.sql` mà Drizzle sinh ra.

- [ ] **Step 5: Verify migration chạy được**

Run: `npx vitest run electron/main/handlers/requests.test.ts`
Expected: PASS (test hiện có vẫn xanh — migration chạy không lỗi; `freshDb()` gọi `runMigrations`). Nếu lỗi ABI, chạy vitest dưới Node 22.

- [ ] **Step 6: Commit**

```bash
git add electron/main/db/schema.ts electron/main/db/migrations/
git commit -m "feat(db): add status column to requests with backfill"
```

---

## Task 2: IPC Contract + Wiring

**Files:**
- Modify: `electron/shared/ipc.ts` (CHANNELS line 19, types ~303, Api interface ~334)
- Modify: `electron/preload/index.ts:21-29`
- Modify: `electron/main/handlers/index.ts:47`

**Interfaces:**
- Consumes: không có (chỉ định nghĩa hợp đồng).
- Produces: `CHANNELS.requestsUpdateStatus`, `UpdateRequestStatusArgs { id: number; status: 'completed' }`, `api.requests.updateStatus(args): Promise<ApiResponse<{ ok: true }>>`.

- [ ] **Step 1: Thêm channel**

Trong `electron/shared/ipc.ts`, trong object `CHANNELS`, sau dòng `requestsDelete: 'requests.delete',` (line 19) thêm:

```ts
  requestsUpdateStatus: 'requests.updateStatus',
```

- [ ] **Step 2: Thêm type `UpdateRequestStatusArgs`**

Trong `electron/shared/ipc.ts`, sau `export interface DeleteRequestArgs { id: number }` (line 303) thêm:

```ts
export interface UpdateRequestStatusArgs { id: number; status: 'completed' }
```

- [ ] **Step 3: Thêm method vào Api interface**

Trong `electron/shared/ipc.ts`, trong `requests: { ... }` của interface `Api`, sau dòng `delete(args: DeleteRequestArgs): Promise<ApiResponse<{ ok: true }>>` (line 334) thêm:

```ts
    updateStatus(args: UpdateRequestStatusArgs): Promise<ApiResponse<{ ok: true }>>
```

- [ ] **Step 4: Expose trong preload**

Trong `electron/preload/index.ts`, trong block `requests: { ... }`, sau dòng `delete: (args) => ipcRenderer.invoke(CHANNELS.requestsDelete, args),` (line 29) thêm:

```ts
    updateStatus: (args) => ipcRenderer.invoke(CHANNELS.requestsUpdateStatus, args),
```

- [ ] **Step 5: Register handler channel**

Trong `electron/main/handlers/index.ts`, sau dòng `ipcMain.handle(CHANNELS.requestsDelete, ...)` (line 47) thêm:

```ts
  ipcMain.handle(CHANNELS.requestsUpdateStatus, (_e, args) => auth_guard(() => requestsH.updateStatus(args)))
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: FAIL ở `requests.ts` với lỗi kiểu `Property 'updateStatus' is missing in type ...` (vì handler chưa implement). Đây là kết quả mong đợi — Task 3 sẽ implement.

- [ ] **Step 7: Commit**

```bash
git add electron/shared/ipc.ts electron/preload/index.ts electron/main/handlers/index.ts
git commit -m "feat(ipc): add requests.updateStatus contract + wiring"
```

---

## Task 3: Backend Handler — status từ DB, auto-allocate, updateStatus

**Files:**
- Modify: `electron/main/handlers/requests.ts`
- Test: `electron/main/handlers/requests.test.ts`

**Interfaces:**
- Consumes: `requests.status` (Task 1), `UpdateRequestStatusArgs`, `CHANNELS.requestsUpdateStatus` (Task 2).
- Produces: `requestsH.updateStatus(args: UpdateRequestStatusArgs): Promise<ApiResponse<{ ok: true }>>`; `list`/`get` trả `status` đọc từ DB; `addDevices` tự set `allocated`.

- [ ] **Step 1: Viết test cho status flow (failing)**

Thêm vào cuối `electron/main/handlers/requests.test.ts`:

```ts
// ── status flow: pending → allocated → completed ─────────────────────────────
describe('requests status flow', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  async function setup() {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const r = await h.create({ code: 'ST-001', departmentId: deptId, createdAt: null, notes: null })
    if (!r.ok) throw new Error('setup failed')
    return { db, h, reqId: r.data.id }
  }

  it('new request is pending', async () => {
    const { h, reqId } = await setup()
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.status).toBe('pending')
  })

  it('addDevices moves pending → allocated', async () => {
    const { db, h, reqId } = await setup()
    // make a device available
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    const added = await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku] })
    expect(added.ok).toBe(true)
    const got = await h.get({ id: reqId })
    if (got.ok) expect(got.data.status).toBe('allocated')
  })

  it('updateStatus moves allocated → completed', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku] })
    const upd = await h.updateStatus({ id: reqId, status: 'completed' })
    expect(upd.ok).toBe(true)
    const got = await h.get({ id: reqId })
    if (got.ok) expect(got.data.status).toBe('completed')
  })

  it('updateStatus rejects when request is still pending', async () => {
    const { h, reqId } = await setup()
    const upd = await h.updateStatus({ id: reqId, status: 'completed' })
    expect(upd.ok).toBe(false)
    if (!upd.ok) expect(upd.error.code).toBe('CONFLICT')
  })

  it('addDevices does not overwrite completed', async () => {
    const { db, h, reqId } = await setup()
    const avail = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()
    await h.addDevices({ requestId: reqId, deviceSkus: [avail[0].sku] })
    await h.updateStatus({ id: reqId, status: 'completed' })
    await h.addDevices({ requestId: reqId, deviceSkus: [avail[1].sku] })
    const got = await h.get({ id: reqId })
    if (got.ok) expect(got.data.status).toBe('completed')
  })

  it('staff without manage_requests cannot updateStatus', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku] })
    session.current = STAFF_SESSION
    const upd = await h.updateStatus({ id: reqId, status: 'completed' })
    expect(upd.ok).toBe(false)
    if (!upd.ok) expect(upd.error.code).toBe('FORBIDDEN')
  })
})
```

> Lưu ý: kiểm tra `STAFF_SESSION` đã import sẵn ở đầu file (nó đã có). Mã lỗi permission (`FORBIDDEN`) phải khớp với mã mà `requirePermission` trả về — xác nhận ở Step 3.

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run electron/main/handlers/requests.test.ts -t "requests status flow"`
Expected: FAIL — `updateStatus` chưa tồn tại; `status` chưa được trả đúng.

- [ ] **Step 3: Xác nhận mã lỗi của requirePermission**

Mở `electron/main/handlers/settings.ts`, tìm hàm `requirePermission`. Xác nhận `error.code` nó trả về khi thiếu quyền (ví dụ `'FORBIDDEN'`). Nếu khác `'FORBIDDEN'`, sửa assertion trong test Step 1 cho khớp.

- [ ] **Step 4: Implement — xóa deriveStatus, sửa list/get/addDevices, thêm updateStatus**

Trong `electron/main/handlers/requests.ts`:

(a) Xóa hàm `deriveStatus` (lines 32-36).

(b) Thêm `UpdateRequestStatusArgs` vào import type từ `@shared/ipc` (thêm vào danh sách import hiện có, sau `DeleteRequestArgs`):

```ts
  DeleteRequestArgs,
  UpdateRequestStatusArgs,
```

(c) Trong `list`, thêm `status: requests.status` vào select của `allRequests`, và bỏ tính toán từ allocations. Sửa block (lines 41-96) thành:

```ts
    async list(args: RequestListArgs): Promise<ApiResponse<RequestListResult>> {
      const allRequests = db
        .select({
          id: requests.id,
          code: requests.code,
          createdAt: requests.createdAt,
          notes: requests.notes,
          status: requests.status,
          deptName: departments.name,
        })
        .from(requests)
        .leftJoin(departments, eq(requests.departmentId, departments.id))
        .all()

      const allAllocs = db
        .select({ requestId: allocations.requestId })
        .from(allocations)
        .all()

      const countByReq = new Map<number, number>()
      for (const a of allAllocs) {
        if (a.requestId == null) continue
        countByReq.set(a.requestId, (countByReq.get(a.requestId) ?? 0) + 1)
      }

      const q = (args.query ?? '').toLowerCase().trim()

      let rows: RequestRow[] = allRequests.map((r) => ({
        id: r.id,
        code: r.code,
        department: r.deptName ?? '',
        createdAt: fmtDate(r.createdAt),
        deviceCount: countByReq.get(r.id) ?? 0,
        status: r.status as RequestStatus,
      }))

      if (q) {
        rows = rows.filter(
          (r) =>
            r.code.toLowerCase().includes(q) ||
            r.department.toLowerCase().includes(q),
        )
      }

      rows.sort((a, b) => b.id - a.id)

      return { ok: true, data: { requests: rows } }
    },
```

(d) Trong `get`, thêm `status: requests.status` vào select của `req`, và thay `deriveStatus(total, active)` bằng `req.status`. Sửa select (lines 105-116) thêm `status: requests.status,` và sửa phần return `status` (line 159) thành `status: req.status as RequestStatus,`. Giữ nguyên `total`/`active` chỉ để tính `deviceCount` và `isReturned` của từng line (vẫn cần cho `deviceLines`).

(e) Trong `addDevices`, sau vòng lặp insert allocations (sau line 257, trước `return`), thêm:

```ts
      const cur = db.select({ status: requests.status }).from(requests)
        .where(eq(requests.id, req.id)).all()[0]
      if (cur && cur.status === 'pending') {
        db.update(requests).set({ status: 'allocated' }).where(eq(requests.id, req.id)).run()
      }
```

(f) Thêm method `updateStatus` (đặt sau `delete`, trước dấu `}` đóng object return):

```ts
    async updateStatus(args: UpdateRequestStatusArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_requests')
      if (forbidden) return forbidden
      if (!args?.id || typeof args.id !== 'number') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'ID phiếu không hợp lệ.' } }
      }
      if (args.status !== 'completed') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Trạng thái không hợp lệ.' } }
      }

      const existing = db.select({ id: requests.id, status: requests.status })
        .from(requests).where(eq(requests.id, args.id)).all()[0]
      if (!existing) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu đề nghị.' } }
      }
      if (existing.status !== 'allocated') {
        return { ok: false, error: { code: 'CONFLICT', message: 'Chỉ có thể hoàn tất phiếu đang cho mượn.' } }
      }

      db.update(requests).set({ status: 'completed' }).where(eq(requests.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx vitest run electron/main/handlers/requests.test.ts`
Expected: PASS (tất cả test cũ + mới).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (handler giờ đã implement `updateStatus`).

- [ ] **Step 7: Commit**

```bash
git add electron/main/handlers/requests.ts electron/main/handlers/requests.test.ts
git commit -m "feat(requests): store status in DB, auto-allocate, add updateStatus"
```

---

## Task 4: Frontend — label + nút "Đánh dấu hoàn tất"

**Files:**
- Modify: `src/lib/status.ts:20-29`
- Modify: `src/pages/RequestDetail.tsx`

**Interfaces:**
- Consumes: `api.requests.updateStatus` (Task 2/3).
- Produces: nút UI; không có export mới cho task khác.

- [ ] **Step 1: Đổi label `allocated`**

Trong `src/lib/status.ts`:

Trong `requestStatusLabel` đổi `if (s === 'allocated') return 'Đang trang bị'` thành:
```ts
  if (s === 'allocated') return 'Đang cho mượn'
```

Trong `REQUEST_STATUS_LABELS` đổi `allocated: 'Đang trang bị',` thành:
```ts
  allocated: 'Đang cho mượn',
```

- [ ] **Step 2: Import type + icon trong RequestDetail**

Trong `src/pages/RequestDetail.tsx`, thêm `UpdateRequestStatusArgs` vào import từ `@shared/ipc` (line 10):

```ts
import type { RequestDeviceLine, RequestDetail, ReturnDeviceArgs, AddToRequestArgs, UpdateRequestArgs, DeleteRequestArgs, UpdateRequestStatusArgs } from '@shared/ipc'
```

- [ ] **Step 3: Thêm mutation updateStatus trong component `RequestDetail`**

Trong `export default function RequestDetail()`, sau `addMutation` (sau line 564), thêm:

```ts
  const statusMutation = useMutation({
    mutationFn: (args: UpdateRequestStatusArgs) => unwrap(api.requests.updateStatus(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', requestId] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
    }
  })
```

- [ ] **Step 4: Thêm nút "Đánh dấu hoàn tất"**

Trong header toolbar của RequestDetail, sau block nút Sửa/Xoá (`manage_requests`) và trước block nút "Thêm thiết bị" (`create_request`) — tức sau line 666 `)}` đóng của `hasPermission('manage_requests')`, thêm:

```tsx
            {hasPermission('manage_requests') && data.status === 'allocated' && (
              <button
                onClick={() => statusMutation.mutate({ id: data.id, status: 'completed' })}
                disabled={statusMutation.isPending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 38, padding: '0 14px',
                  border: 'none', borderRadius: 'var(--rad-sm)',
                  background: '#16a34a', color: '#fff',
                  fontSize: 13, fontWeight: 600,
                  cursor: statusMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: statusMutation.isPending ? 0.7 : 1,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>✓</span>
                {statusMutation.isPending ? 'Đang lưu…' : 'Đánh dấu hoàn tất'}
              </button>
            )}
```

- [ ] **Step 5: Thêm error toast cho statusMutation**

Trong RequestDetail, cạnh các toast hiện có (sau block `addMutation.isError`, sau line 788), thêm:

```tsx
      {statusMutation.isError && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          background: '#dc2626', color: '#fff', padding: '12px 18px',
          borderRadius: 'var(--rad-md)', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,.2)'
        }}>
          {(statusMutation.error as Error).message}
        </div>
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/status.ts src/pages/RequestDetail.tsx
git commit -m "feat(ui): add Đánh dấu hoàn tất button + relabel allocated status"
```

---

## Task 5: Frontend — Filters trên trang danh sách phiếu

**Files:**
- Modify: `src/pages/Requests.tsx`

**Interfaces:**
- Consumes: `useRequests(query)` (hiện có), `api.catalog.list()` (cho departments), `REQUEST_STATUS_LABELS`, `RequestStatus`.
- Produces: không có export mới.

- [ ] **Step 1: Import thêm trong Requests.tsx**

Trong `src/pages/Requests.tsx`, đảm bảo có import `RequestStatus` từ `@shared/ipc` (sửa line 9):

```ts
import type { RequestRow, CreateRequestArgs, RequestStatus } from '@shared/ipc'
```

`useDepartments()` đã được định nghĩa sẵn trong file (lines 37-43) — tái sử dụng nó.

- [ ] **Step 2: Thêm filter constants (module scope)**

Sau dòng `const COL = '140px 1fr 1fr 60px 130px 36px'` (line 247) thêm:

```ts
const STATUS_FILTER_KEYS: Array<'all' | RequestStatus> = ['all', 'pending', 'allocated', 'completed']
const STATUS_FILTER_LABELS: Record<'all' | RequestStatus, string> = {
  all: 'Tất cả',
  pending: 'Chưa cấp phát',
  allocated: 'Đang cho mượn',
  completed: 'Hoàn tất',
}
```

- [ ] **Step 3: Thêm state + filter logic trong `Requests()`**

Trong `export default function Requests()`, sau `const [query, setQuery] = useState('')` (line 252) thêm:

```ts
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const [deptFilter, setDeptFilter] = useState<string>('')
  const { data: departments } = useDepartments()
```

Sau `const { data, isLoading, error } = useRequests(query)` (line 254) thêm filter dẫn xuất:

```ts
  const filtered = (data?.requests ?? []).filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (deptFilter && r.department !== deptFilter) return false
    return true
  })
```

- [ ] **Step 4: Render department dropdown trong toolbar**

Trong toolbar (sau search input div, trước nút "Tạo phiếu" — sau line 280 `</div>` đóng của search wrapper), thêm:

```tsx
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          style={{
            height: 40, padding: '0 12px', flexShrink: 0,
            border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 14, outline: 'none', appearance: 'auto' as any,
          }}
        >
          <option value="">Tất cả phòng ban</option>
          {(departments ?? []).map(d => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
```

- [ ] **Step 5: Render status filter tabs**

Ngay sau toolbar div đóng (sau line 299 `</div>` đóng của toolbar), trước block Loading, thêm:

```tsx
      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_FILTER_KEYS.map(key => {
          const isActive = statusFilter === key
          return (
            <div
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: isActive ? 'var(--primary)' : 'var(--surface-2)',
                color: isActive ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`
              }}
            >
              {STATUS_FILTER_LABELS[key]}
            </div>
          )
        })}
      </div>
```

- [ ] **Step 6: Dùng `filtered` thay cho `data?.requests` khi render rows + footer**

Thay `(data?.requests ?? []).length === 0` → `filtered.length === 0`.
Thay `(data?.requests ?? []).map(req => (...))` → `filtered.map(req => (...))`.
Thay footer `{data?.requests.length ?? 0} phiếu đề nghị` → `{filtered.length} phiếu đề nghị`.

(Các dòng tương ứng: lines 332, 337, 369.)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Verify trực quan (chạy app)**

Run: `npm run dev`
Expected: Trang "Phiếu đề nghị" hiển thị status tabs + dropdown phòng ban; click tab lọc đúng trạng thái; chọn phòng ban lọc đúng. Vào một phiếu đang "Đang cho mượn", thấy nút "Đánh dấu hoàn tất"; bấm → trạng thái đổi sang "Hoàn tất", nút biến mất.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Requests.tsx
git commit -m "feat(ui): add status tabs + department filter to Requests list"
```

---

## Self-Review Notes

- **Spec coverage:** trạng thái lưu DB (Task 1,3) ✓; auto pending→allocated (Task 3) ✓; completed thủ công (Task 3 handler + Task 4 nút) ✓; label "Đang cho mượn" (Task 4) ✓; filter trạng thái + phòng ban (Task 5) ✓; permission gate (Task 3,4) ✓; migration backfill (Task 1) ✓.
- **Type consistency:** `UpdateRequestStatusArgs { id; status: 'completed' }` dùng nhất quán ở ipc/preload/handler/test/RequestDetail. `RequestStatus` import ở Requests.tsx và status.ts. Handler cast `r.status as RequestStatus` vì Drizzle trả `string`.
- **deviceCount:** `list` vẫn đếm allocations (countByReq) — `deviceCount` không còn ảnh hưởng tới status. `get` vẫn dùng `lines.length` cho deviceCount và `returnedAt` cho `isReturned` của từng dòng.
