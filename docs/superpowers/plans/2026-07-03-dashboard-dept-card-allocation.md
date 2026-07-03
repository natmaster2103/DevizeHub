# Dashboard: Tạo phiếu từ DeptCard & AllocationDrawer rút gọn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tạo phiếu" (create request) button to each department card on the Dashboard, and simplify `AllocationDrawer` to a pure device-search-and-drag panel where the target phiếu đề nghị is resolved automatically from the drop target's active chip.

**Architecture:** Backend: extend `AvailableDeviceRow` with a device-group thumbnail, extend `DeptCardRequest` with a numeric `id`, and switch the dashboard's per-request chip visibility to the request's real `status` column (so newly-created zero-device requests appear as empty, droppable chips). Frontend: extract the existing request-creation dialog into a shared component usable from both the Requests page and the Dashboard; lift "which chip is active" state up from `DeptCardPanel` into `Dashboard` so the drop handler can resolve a concrete `requestId`; drop the phiếu picker from `AllocationDrawer`.

**Tech Stack:** Electron main process (Drizzle ORM over better-sqlite3), React 18 + TanStack Query renderer, Vitest for handler tests.

## Global Constraints

- All user-facing strings are Vietnamese (project convention — see `equipment-manager/CLAUDE.md`).
- Styling is inline styles + CSS custom properties from `src/styles/tokens.css` (`--primary`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--hoverbg`, `--rad-lg/md/sm`) — no CSS modules, no new Tailwind usage.
- Every new/changed IPC-facing type goes in `electron/shared/ipc.ts` (the single source of truth shared by both processes).
- Run `npx vitest run <file>` directly (not `npm test`) per this repo's known Node/Electron ABI mismatch gotcha (see CLAUDE.md).
- Run `env -u ELECTRON_RUN_AS_NODE npm run dev` if manually verifying in the running app — never invoke `electron-vite` directly.
- Frontend changes in this plan have no dedicated component test files in this codebase (tests here are handler-level only) — verification for frontend tasks is `npm run typecheck:web` plus a manual run-through in the dev app, per project convention ("test the golden path... before reporting complete").

---

### Task 1: Add device-group thumbnail to `AvailableDeviceRow`

**Files:**
- Modify: `electron/shared/ipc.ts:336`
- Modify: `electron/main/handlers/requests.ts:1-3, 267-281`
- Modify: `electron/main/handlers/allocate.ts:1-3, 18-24, 51-55`
- Test: `electron/main/handlers/requests.test.ts` (new `describe` block)

**Interfaces:**
- Produces: `AvailableDeviceRow { sku: string; name: string; category: string; thumbnailPath: string | null }` — consumed by Task 6 (AllocationDrawer thumbnail rendering).

- [ ] **Step 1: Write the failing test**

Append to `electron/main/handlers/requests.test.ts`:

```ts
// ── availableDevices: thumbnailPath ──────────────────────────────────────────
describe('requests.availableDevices — thumbnailPath', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  it('includes the device group thumbnail when the device has a group', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)

    const { deviceGroups, categories } = await import('../db/schema')
    const catId = db.select({ id: categories.id }).from(categories).all()[0].id
    const [group] = db.insert(deviceGroups)
      .values({ name: 'Test Group', categoryId: catId, thumbnailPath: '/tmp/thumb.png', createdAt: new Date().toISOString() })
      .returning({ id: deviceGroups.id })
      .all()

    const avail = db.select({ id: devices.id, sku: devices.sku }).from(devices)
      .where(eq(devices.status, 'available')).all()[0]
    db.update(devices).set({ groupId: group.id }).where(eq(devices.id, avail.id)).run()

    const res = await h.availableDevices()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const row = res.data.devices.find((d) => d.sku === avail.sku)
    expect(row).toBeDefined()
    expect(row!.thumbnailPath).toBe('/tmp/thumb.png')
  })

  it('returns null thumbnailPath when the device has no group', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const avail = db.select({ id: devices.id, sku: devices.sku }).from(devices)
      .where(eq(devices.status, 'available')).all()[0]
    db.update(devices).set({ groupId: null }).where(eq(devices.id, avail.id)).run()

    const res = await h.availableDevices()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const row = res.data.devices.find((d) => d.sku === avail.sku)
    expect(row).toBeDefined()
    expect(row!.thumbnailPath).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/handlers/requests.test.ts -t "thumbnailPath"`
Expected: FAIL — `thumbnailPath` is `undefined`, not `'/tmp/thumb.png'` / not present on the type.

- [ ] **Step 3: Update the shared type**

In `electron/shared/ipc.ts:336`, change:

```ts
export interface AvailableDeviceRow { sku: string; name: string; category: string }
```

to:

```ts
export interface AvailableDeviceRow { sku: string; name: string; category: string; thumbnailPath: string | null }
```

- [ ] **Step 4: Update `requests.ts` handler**

In `electron/main/handlers/requests.ts:3`, change:

```ts
import { devices, categories, allocations, employees, departments, requests } from '../db/schema'
```

to:

```ts
import { devices, categories, deviceGroups, allocations, employees, departments, requests } from '../db/schema'
```

In `electron/main/handlers/requests.ts:267-281`, change:

```ts
    async availableDevices(): Promise<ApiResponse<AvailableDevicesResult>> {
      const rows = db
        .select({ sku: devices.sku, name: devices.name, categoryName: categories.name })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .where(eq(devices.status, 'available'))
        .all()

      return {
        ok: true,
        data: {
          devices: rows.map((r) => ({ sku: r.sku, name: r.name, category: r.categoryName ?? '' })),
        },
      }
    },
```

to:

```ts
    async availableDevices(): Promise<ApiResponse<AvailableDevicesResult>> {
      const rows = db
        .select({
          sku: devices.sku,
          name: devices.name,
          categoryName: categories.name,
          thumbnailPath: deviceGroups.thumbnailPath,
        })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))
        .where(eq(devices.status, 'available'))
        .all()

      return {
        ok: true,
        data: {
          devices: rows.map((r) => ({
            sku: r.sku,
            name: r.name,
            category: r.categoryName ?? '',
            thumbnailPath: r.thumbnailPath ?? null,
          })),
        },
      }
    },
```

- [ ] **Step 5: Update `allocate.ts` handler for type consistency**

In `electron/main/handlers/allocate.ts:3`, change:

```ts
import { devices, categories, allocations, employees, departments, requests } from '../db/schema'
```

to:

```ts
import { devices, categories, deviceGroups, allocations, employees, departments, requests } from '../db/schema'
```

In `electron/main/handlers/allocate.ts:18-24`, change:

```ts
      const availableDevs = db
        .select({ sku: devices.sku, name: devices.name, categoryName: categories.name })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .where(eq(devices.status, 'available'))
        .all()
```

to:

```ts
      const availableDevs = db
        .select({
          sku: devices.sku,
          name: devices.name,
          categoryName: categories.name,
          thumbnailPath: deviceGroups.thumbnailPath,
        })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))
        .where(eq(devices.status, 'available'))
        .all()
```

In `electron/main/handlers/allocate.ts:51-55`, change:

```ts
          availableDevices: availableDevs.map<AvailableDeviceRow>((d) => ({
            sku: d.sku,
            name: d.name,
            category: d.categoryName ?? '',
          })),
```

to:

```ts
          availableDevices: availableDevs.map<AvailableDeviceRow>((d) => ({
            sku: d.sku,
            name: d.name,
            category: d.categoryName ?? '',
            thumbnailPath: d.thumbnailPath ?? null,
          })),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/requests.test.ts electron/main/handlers/allocate.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add electron/shared/ipc.ts electron/main/handlers/requests.ts electron/main/handlers/allocate.ts electron/main/handlers/requests.test.ts
git commit -m "feat(allocate): include device group thumbnail in available-devices queries"
```

---

### Task 2: Seed data — set the real `status` column per seeded request

**Why this is needed:** `electron/main/db/seed.ts` never sets `requests.status` explicitly, so every seeded request silently defaults to `'pending'` (the schema default) regardless of the prototype's intended `vnStatus` label (`'Đang trang bị'`, `'Hoàn tất'`, `'Đang xử lý'`). Task 4 changes the dashboard to key chip visibility off this real column instead of an allocation-derived approximation — without this fix, seeded "Hoàn tất" (completed) requests like `DX-298`/`DX-290`/`DX-295` would incorrectly still show up as dashboard chips.

**Files:**
- Modify: `electron/main/db/seed.ts:305-391` (the `requestDefs` array) and `:400-411` (the insert)
- Test: `electron/main/db/seed.test.ts` (new test)

**Interfaces:**
- Consumes: nothing new.
- Produces: seeded `requests.status` values that Task 3's dashboard tests rely on (`DX-301`/`DX-300` → `'allocated'`, `DX-298`/`DX-295`/`DX-290` → `'completed'`, `DX-293` → `'pending'`).

- [ ] **Step 1: Write the failing test**

In `electron/main/db/seed.test.ts:6`, change the schema import from:

```ts
import { appUsers, devices, departments } from './schema'
```

to:

```ts
import { appUsers, devices, departments, requests } from './schema'
```

Then append this test to `electron/main/db/seed.test.ts`:

```ts
  it('sets a real requests.status per seeded request, not just the schema default', () => {
    const db = freshSeededDb()
    const byCode = new Map(
      db.select({ code: requests.code, status: requests.status }).from(requests).all()
        .map((r) => [r.code, r.status]),
    )
    expect(byCode.get('DX-301')).toBe('allocated')
    expect(byCode.get('DX-300')).toBe('allocated')
    expect(byCode.get('DX-298')).toBe('completed')
    expect(byCode.get('DX-295')).toBe('completed')
    expect(byCode.get('DX-293')).toBe('pending')
    expect(byCode.get('DX-290')).toBe('completed')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/db/seed.test.ts -t "real requests.status"`
Expected: FAIL — all statuses are `'pending'` instead of the expected mix.

- [ ] **Step 3: Add a `status` field to each `requestDefs` entry**

In `electron/main/db/seed.ts:305-391`, add an explicit `status` key to each of the 6 entries (mirrors the existing `vnStatus` value — `'Đang trang bị'` → `'allocated'`, `'Hoàn tất'` → `'completed'`, `'Đang xử lý'` → `'pending'`). For example, the `DX-301` entry:

```ts
      {
        code: 'DX-301',
        dept: 'Đội 1',
        requester: 'Nguyễn Văn An',
        date: '12/03/2026',
        vnStatus: 'Đang trang bị',
        status: 'allocated',
        notes: 'Trang bị cho 2 nhân viên mới phòng Kế toán.',
        lender: 'Đặng Văn Phúc',
        items: [ /* unchanged */ ],
      },
```

Add `status: 'allocated'` to `DX-300`, `status: 'completed'` to `DX-298`, `status: 'completed'` to `DX-295`, `status: 'pending'` to `DX-293`, `status: 'completed'` to `DX-290`. Leave every other field in each entry unchanged.

- [ ] **Step 4: Write the new status column on insert**

In `electron/main/db/seed.ts:400-411`, change:

```ts
      const [reqRow] = tx
        .insert(requests)
        .values({
          code: req.code,
          departmentId: deptId,
          employeeId: requesterId,
          createdBy: adminUser.id,
          createdAt,
          notes: req.notes || null,
        })
        .returning({ id: requests.id })
        .all()
```

to:

```ts
      const [reqRow] = tx
        .insert(requests)
        .values({
          code: req.code,
          departmentId: deptId,
          employeeId: requesterId,
          createdBy: adminUser.id,
          createdAt,
          notes: req.notes || null,
          status: req.status,
        })
        .returning({ id: requests.id })
        .all()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run electron/main/db/seed.test.ts`
Expected: PASS (all tests)

- [ ] **Step 6: Run the full existing handler suite to check for fallout**

Run: `npx vitest run electron/main/handlers/requests.test.ts electron/main/handlers/dashboard.test.ts electron/main/handlers/allocate.test.ts`
Expected: PASS — this step is a checkpoint only; Task 3 is where `dashboard.test.ts` gets updated for the new chip-visibility rule, so some of its assertions may still fail here until Task 3 lands. If failures appear here, confirm they are exactly the ones Task 3 documents below (the `'only includes requests with allocated status'` test) and not something new.

- [ ] **Step 7: Commit**

```bash
git add electron/main/db/seed.ts electron/main/db/seed.test.ts
git commit -m "fix(seed): set the real requests.status column instead of relying on the pending default"
```

---

### Task 3: `DeptCardRequest.id` + dashboard chip visibility from real request status

**Files:**
- Modify: `electron/shared/ipc.ts:197`
- Modify: `electron/main/handlers/dashboard.ts:11-17, 50-61, 82-146`
- Test: `electron/main/handlers/dashboard.test.ts`

**Interfaces:**
- Consumes: `requests.status` column values seeded correctly by Task 2.
- Produces: `DeptCardRequest { id: number; code: string; date: string; status: RequestStatus; items: DeptCardItem[] }` — consumed by Task 5 (Dashboard.tsx drop-resolution logic needs `id`).

- [ ] **Step 1: Write the failing tests**

In `electron/main/handlers/dashboard.test.ts:1-11`, add `departments` to the schema import:

```ts
import { requests, allocations, devices, departments } from '../db/schema'
```

Replace the existing test at lines 42-50 (`'only includes requests with allocated status in dept card chips'`) with:

```ts
  it('includes pending and allocated requests as chips, excludes completed', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const allRequests = res.data.deptCards.flatMap((c) => c.requests)
    expect(allRequests.length).toBeGreaterThan(0)
    expect(allRequests.every((r) => r.status === 'pending' || r.status === 'allocated')).toBe(true)

    // DX-293 is seeded as 'pending' with zero allocations — it must still show
    // as an empty, droppable chip (this is the whole point of the feature).
    const dx293 = allRequests.find((r) => r.code === 'DX-293')
    expect(dx293).toBeDefined()
    expect(dx293!.items).toEqual([])

    // DX-298/DX-295/DX-290 are seeded 'completed' — must not appear as chips.
    expect(allRequests.find((r) => r.code === 'DX-298')).toBeUndefined()
    expect(allRequests.find((r) => r.code === 'DX-295')).toBeUndefined()
    expect(allRequests.find((r) => r.code === 'DX-290')).toBeUndefined()
  })

  it('request chips expose a numeric request id matching the requests table', async () => {
    const { db, dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const dx301Chip = res.data.deptCards.flatMap((c) => c.requests).find((r) => r.code === 'DX-301')
    expect(dx301Chip).toBeDefined()
    const dx301Row = db.select({ id: requests.id }).from(requests).where(eq(requests.code, 'DX-301')).get()
    expect(dx301Chip!.id).toBe(dx301Row!.id)
  })

  it('a freshly created request with zero allocations appears as an empty pending chip', async () => {
    const { db, dash, req } = setup()
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const created = await req.create({ code: 'NEW-CHIP', departmentId: deptId, createdAt: null, notes: null })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const card = res.data.deptCards.find((c) => c.deptId === deptId)
    const chip = card?.requests.find((r) => r.code === 'NEW-CHIP')
    expect(chip).toBeDefined()
    expect(chip!.status).toBe('pending')
    expect(chip!.id).toBe(created.data.id)
    expect(chip!.items).toEqual([])
  })
```

Note: `eq` and `requests` must already be imported at the top of `dashboard.test.ts` (they are, per the existing import lines) — only the `departments` import needs adding.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/main/handlers/dashboard.test.ts`
Expected: FAIL — `id` is `undefined` on chip objects; `DX-298`/`DX-295`/`DX-290` still appear or don't as currently computed; `DX-293` chip missing entirely.

- [ ] **Step 3: Update `DeptCardRequest` type**

In `electron/shared/ipc.ts:197`, change:

```ts
export interface DeptCardRequest { code: string; date: string; status: RequestStatus; items: DeptCardItem[] }
```

to:

```ts
export interface DeptCardRequest { id: number; code: string; date: string; status: RequestStatus; items: DeptCardItem[] }
```

- [ ] **Step 4: Select the real `status` column in `dashboard.ts`**

In `electron/main/handlers/dashboard.ts:11-17`, add `RequestStatus` to the type import:

```ts
import type {
  ApiResponse,
  DashboardSummary,
  DeptCard,
  DeptCardRequest,
  DeptCardItem,
  RequestStatus,
} from '@shared/ipc'
```

In `electron/main/handlers/dashboard.ts:50-61`, change:

```ts
      const allRequests = db
        .select({
          id: requests.id,
          code: requests.code,
          createdAt: requests.createdAt,
          departmentId: requests.departmentId,
          employeeId: requests.employeeId,
          createdBy: requests.createdBy,
        })
        .from(requests)
        .all()
```

to:

```ts
      const allRequests = db
        .select({
          id: requests.id,
          code: requests.code,
          createdAt: requests.createdAt,
          departmentId: requests.departmentId,
          employeeId: requests.employeeId,
          createdBy: requests.createdBy,
          status: requests.status,
        })
        .from(requests)
        .all()
```

- [ ] **Step 5: Rewrite the per-request chip loop**

In `electron/main/handlers/dashboard.ts:107-146`, change:

```ts
      for (const req of allRequests) {
        if (req.departmentId == null) continue
        const reqAllocs = requestAllocMap.get(req.id) ?? []
        if (reqAllocs.length === 0) continue

        const hasActiveAlloc = reqAllocs.some((a) => a.returnedAt === null)
        const status: 'allocated' | 'completed' = hasActiveAlloc ? 'allocated' : 'completed'
        const activeCount = reqAllocs.filter((a) => a.returnedAt === null).length

        const group = deptGroups.get(req.departmentId)
        if (!group) continue
        group.activeCount += activeCount

        // Build items — only show allocations that have not been returned yet
        const items: DeptCardItem[] = reqAllocs
          .filter((a) => a.returnedAt === null)
          .map((a) => {
            const lenderId = lenderByAllocId.get(a.allocId) ?? null
            const lenderName = lenderId != null ? (userById.get(lenderId) ?? '') : ''
            return {
              allocationId: a.allocId,
              deviceSku: deviceSkuById.get(a.deviceId) ?? '',
              name: deviceById.get(a.deviceId) ?? '',
              datetime: fmtDateTime(a.issuedAt),
              borrowerName: a.borrowerName ?? a.employeeName ?? parseBorrowerFromNotes(a.allocNotes),
              lender: lenderName,
              returnable: true,
            }
          })

        // Chips only show requests that are currently allocated ("đang trang bị")
        if (status === 'allocated') {
          group.requestCards.push({
            code: req.code ?? '',
            date: fmtDate(req.createdAt),
            status,
            items,
          })
        }
      }
```

to:

```ts
      for (const req of allRequests) {
        if (req.departmentId == null) continue
        // Completed requests are done — hide them from the dashboard entirely.
        if (req.status === 'completed') continue

        const reqAllocs = requestAllocMap.get(req.id) ?? []
        const activeCount = reqAllocs.filter((a) => a.returnedAt === null).length

        const group = deptGroups.get(req.departmentId)
        if (!group) continue
        group.activeCount += activeCount

        // Build items — only show allocations that have not been returned yet.
        // A brand-new (pending) request has no allocations yet, so this is [].
        const items: DeptCardItem[] = reqAllocs
          .filter((a) => a.returnedAt === null)
          .map((a) => {
            const lenderId = lenderByAllocId.get(a.allocId) ?? null
            const lenderName = lenderId != null ? (userById.get(lenderId) ?? '') : ''
            return {
              allocationId: a.allocId,
              deviceSku: deviceSkuById.get(a.deviceId) ?? '',
              name: deviceById.get(a.deviceId) ?? '',
              datetime: fmtDateTime(a.issuedAt),
              borrowerName: a.borrowerName ?? a.employeeName ?? parseBorrowerFromNotes(a.allocNotes),
              lender: lenderName,
              returnable: true,
            }
          })

        // Chips show every non-completed request (pending or allocated) so a
        // freshly created request is immediately a valid drag-and-drop target.
        group.requestCards.push({
          id: req.id,
          code: req.code ?? '',
          date: fmtDate(req.createdAt),
          status: req.status as RequestStatus,
          items,
        })
      }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/dashboard.test.ts`
Expected: PASS (all tests)

- [ ] **Step 7: Run the full handler suite**

Run: `npx vitest run electron/main/handlers`
Expected: PASS

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors — this will also flag any other place that builds a `DeptCardRequest` without `id` (there should be none besides `dashboard.ts`).

- [ ] **Step 9: Commit**

```bash
git add electron/shared/ipc.ts electron/main/handlers/dashboard.ts electron/main/handlers/dashboard.test.ts
git commit -m "feat(dashboard): show pending requests as empty chips, expose numeric request id"
```

---

### Task 4: Extract `CreateRequestDialog` into a shared, reusable component

**Files:**
- Create: `src/components/CreateRequestDialog.tsx`
- Modify: `src/pages/Requests.tsx:1-244` (remove local definition, import shared one)

**Interfaces:**
- Produces: `export function CreateRequestDialog({ onClose, presetDepartmentId }: { onClose(): void; presetDepartmentId?: number }): JSX.Element` — consumed by Task 5 (Dashboard.tsx).

- [ ] **Step 1: Create the shared component**

Create `src/components/CreateRequestDialog.tsx` with the full contents of the current `CreateRequestDialog` function from `src/pages/Requests.tsx:26-244` (the `IconX`, `useDepartments`, and `CreateRequestDialog` pieces), adapted as follows:

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IconPlus } from '@/lib/icons'
import { api, unwrap } from '@/lib/api'
import type { CreateRequestArgs } from '@shared/ipc'

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function useDepartments() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => unwrap(api.catalog.list()),
    select: (data) => data.departments,
  })
}

export interface CreateRequestDialogProps {
  onClose(): void
  /** When set, the department field is pre-filled and locked (used when
   * creating a request from a specific DeptCard on the Dashboard). */
  presetDepartmentId?: number
}

export function CreateRequestDialog({ onClose, presetDepartmentId }: CreateRequestDialogProps) {
  const queryClient = useQueryClient()
  const { data: departments } = useDepartments()
  const [code, setCode] = useState('')
  const [departmentId, setDepartmentId] = useState(
    presetDepartmentId != null ? String(presetDepartmentId) : ''
  )
  const [createdAt, setCreatedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const mutation = useMutation({
    mutationFn: (args: CreateRequestArgs) => unwrap(api.requests.create(args)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e) => setFormError((e as Error).message),
  })

  function submit() {
    setFormError('')
    if (!code.trim()) { setFormError('Vui lòng nhập mã phiếu.'); return }
    if (!departmentId) { setFormError('Vui lòng chọn phòng ban.'); return }
    mutation.mutate({
      code: code.trim(),
      departmentId: Number(departmentId),
      createdAt: createdAt || null,
      notes: notes.trim() || null,
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  const REQUIRED = <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn .12s ease'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
          boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
          animation: 'popIn .14s ease'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)'
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Tạo phiếu đề nghị</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Điền thông tin phiếu đề nghị cấp phát thiết bị
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              borderRadius: 'var(--rad-sm)'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: code + dept */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Mã phiếu{REQUIRED}
              </label>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="VD: DX-302"
                style={{ ...inputStyle, fontFamily: "'Consolas','SF Mono',monospace" }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Phòng ban{REQUIRED}
              </label>
              <select
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
                disabled={presetDepartmentId != null}
                style={{
                  ...inputStyle, appearance: 'auto' as any,
                  opacity: presetDepartmentId != null ? 0.7 : 1,
                  cursor: presetDepartmentId != null ? 'not-allowed' : 'auto',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              >
                <option value="">— Chọn phòng ban —</option>
                {(departments ?? []).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ngày lập */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Ngày lập
            </label>
            <input
              type="date"
              value={createdAt}
              onChange={e => setCreatedAt(e.target.value)}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Ghi chú */}
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
                resize: 'vertical', fontFamily: 'inherit'
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {formError && (
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{formError}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: '1px solid var(--border)'
        }}>
          <button
            onClick={onClose}
            style={{
              height: 38, padding: '0 16px', border: '1px solid var(--border)',
              borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={mutation.isPending}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 38, padding: '0 16px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              opacity: mutation.isPending ? 0.7 : 1
            }}
            onMouseEnter={e => { if (!mutation.isPending) (e.currentTarget.style.background = 'var(--primary-hover)') }}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            <IconPlus size={14} />
            {mutation.isPending ? 'Đang tạo…' : 'Tạo phiếu'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `Requests.tsx` to use the shared component**

In `src/pages/Requests.tsx`, remove lines 26-244 (the `IconX` function at 27-35, `useDepartments` at 37-43, `CreateRequestDialogProps`/`CreateRequestDialog` at 45-244 — but keep the top-level `RequestBadge` function at lines 12-24, and keep the page's own `useDepartments` usage working).

Since `Requests.tsx`'s main `Requests()` component (line 256 onward) also calls `useDepartments()` directly (line 263, for the department filter dropdown — unrelated to the dialog), re-add a local (non-exported) copy of `useDepartments` in `Requests.tsx` right after the imports, OR import it from the new shared file. Simplest: export `useDepartments` from `CreateRequestDialog.tsx` too and import it in `Requests.tsx`.

In `CreateRequestDialog.tsx`, change:

```ts
function useDepartments() {
```

to:

```ts
export function useDepartments() {
```

In `src/pages/Requests.tsx`, replace the import block at the top (lines 1-9):

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRequests } from '@/hooks/useRequests'
import { useAuth } from '@/context/AuthContext'
import { REQUEST_STATUS_LABELS, requestBadgeStyle } from '@/lib/status'
import { IconSearch, IconPlus } from '@/lib/icons'
import { api, unwrap } from '@/lib/api'
import type { RequestRow, CreateRequestArgs, RequestStatus } from '@shared/ipc'
```

with:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequests } from '@/hooks/useRequests'
import { useAuth } from '@/context/AuthContext'
import { REQUEST_STATUS_LABELS, requestBadgeStyle } from '@/lib/status'
import { IconSearch, IconPlus } from '@/lib/icons'
import { CreateRequestDialog, useDepartments } from '@/components/CreateRequestDialog'
import type { RequestRow, RequestStatus } from '@shared/ipc'
```

Then delete the old local `IconX` (old lines 27-35), old local `useDepartments` (old lines 37-43), and the old local `CreateRequestDialogProps`/`CreateRequestDialog` (old lines 45-244) from `Requests.tsx`, leaving `RequestBadge` (old lines 12-24) as the only thing above the `// ── Main page ──` comment (old line 246).

The rest of `Requests.tsx` (the `Requests()` component, its use of `showCreate` state, and `{showCreate && <CreateRequestDialog onClose={() => setShowCreate(false)} />}` at old line 428) needs no changes — it already calls `CreateRequestDialog` with only `onClose`, which still matches the new shared component's props (`presetDepartmentId` is optional).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run: `env -u ELECTRON_RUN_AS_NODE npm run dev`, log in as `admin`/`admin`, go to "Phiếu đề nghị", click "Tạo phiếu đề nghị", confirm the dialog still opens, the department field is a normal enabled dropdown, and creating a request still works and closes the dialog.

- [ ] **Step 5: Commit**

```bash
git add src/components/CreateRequestDialog.tsx src/pages/Requests.tsx
git commit -m "refactor(requests): extract CreateRequestDialog into a shared component"
```

---

### Task 5: Dashboard — "Tạo phiếu" button on `DeptCardPanel`

**Files:**
- Modify: `src/pages/Dashboard.tsx:1-10` (imports), `:194-264` (`DeptCardPanel`), `:461-473` (`Dashboard` state), `:602-640` (card rendering)

**Interfaces:**
- Consumes: `CreateRequestDialog` from Task 4 (`src/components/CreateRequestDialog.tsx`), `useAuth().hasPermission` from `@/context/AuthContext`.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add imports**

In `src/pages/Dashboard.tsx:1-10`, add:

```tsx
import { useAuth } from '@/context/AuthContext'
import { CreateRequestDialog } from '@/components/CreateRequestDialog'
```

and add `IconPlus` to the existing icon import (`src/pages/Dashboard.tsx:5-7`):

```tsx
import {
  IconBox, IconCheck, IconWrench, IconAlert, IconReturn, IconBuilding, IconPlus
} from '@/lib/icons'
```

- [ ] **Step 2: Add the `onCreateRequest` prop to `DeptCardPanel`**

In `src/pages/Dashboard.tsx:194-208`, change the `DeptCardPanel` prop type from:

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
  onReturnItem?(item: DeptCardItem): void
}) {
```

to:

```tsx
function DeptCardPanel({
  card,
  isDrop,
  onDragOver,
  onDrop,
  onDragLeave,
  onReturnItem,
  onCreateRequest,
  canCreateRequest,
}: {
  card: DeptCard
  isDrop?: boolean
  onDragOver?(): void
  onDrop?(): void
  onDragLeave?(): void
  onReturnItem?(item: DeptCardItem): void
  onCreateRequest?(): void
  canCreateRequest?: boolean
}) {
```

- [ ] **Step 3: Render the "+" button in the card header**

In `src/pages/Dashboard.tsx:261-264`, change:

```tsx
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>
          {card.count}
        </div>
      </div>
```

to:

```tsx
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>
          {card.count}
        </div>
        {canCreateRequest && (
          <button
            onClick={onCreateRequest}
            disabled={card.deptId == null}
            title="Tạo phiếu"
            style={{
              width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
              background: 'none', color: card.deptId == null ? 'var(--text-muted)' : 'var(--text)',
              cursor: card.deptId == null ? 'not-allowed' : 'pointer',
              opacity: card.deptId == null ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (card.deptId == null) return
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.color = 'var(--primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text)'
            }}
          >
            <IconPlus size={14} />
          </button>
        )}
      </div>
```

- [ ] **Step 4: Add state to `Dashboard()` and pass props through**

In `src/pages/Dashboard.tsx:461-473`, add the auth hook and dialog state right after the existing state declarations:

```tsx
export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const [lendOpen, setLendOpen] = useState(false)
  const [dropDept, setDropDept] = useState<string | null>(null)
  const [createReqForDept, setCreateReqForDept] = useState<{ deptId: number; deptName: string } | null>(null)
  const dragStateRef = useRef<{ devices: AvailableDeviceRow[]; requestId: number | null } | null>(null)
```

(leave the rest of the existing state declarations below this untouched for now — `requestId` on the ref type is removed in Task 6, not here.)

- [ ] **Step 5: Wire the button and dialog into the card grid**

In `src/pages/Dashboard.tsx:602-639`, change the `data.deptCards.map(card => ...)` block to pass the two new props to `DeptCardPanel`:

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
                  canCreateRequest={hasPermission('create_request')}
                  onCreateRequest={() => {
                    if (card.deptId != null) setCreateReqForDept({ deptId: card.deptId, deptName: card.dept })
                  }}
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

(Only `canCreateRequest`/`onCreateRequest` are new here — `onDrop`'s body is untouched in this step; Task 6 rewrites it.)

- [ ] **Step 6: Render the dialog**

In `src/pages/Dashboard.tsx`, right after the closing `</AllocationDrawer>` tag (around line 648), add:

```tsx
      {createReqForDept && (
        <CreateRequestDialog
          presetDepartmentId={createReqForDept.deptId}
          onClose={() => setCreateReqForDept(null)}
        />
      )}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors

- [ ] **Step 8: Manual verification**

Run: `env -u ELECTRON_RUN_AS_NODE npm run dev`, log in as `admin`, go to Dashboard. Confirm:
- Each department card shows a small "+" button next to its count, with a "Tạo phiếu" tooltip.
- The "Cấp phát lẻ" (loose) card's "+" button is visibly disabled (it has no `deptId`).
- Clicking "+" on a real department card opens the create-request dialog with that department pre-selected and the dropdown disabled.
- Submitting creates the request and the dialog closes; refresh (or wait for the query to refetch) shows the department's card gained a new chip for the just-created request (this requires Task 3 already landed).
- Log in as a `staff` user without `create_request` permission and confirm the "+" button doesn't render at all.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): add create-request button to department cards"
```

---

### Task 6: Simplify `AllocationDrawer` and auto-resolve the target request on drop

**Files:**
- Modify: `src/components/AllocationDrawer.tsx` (whole file)
- Modify: `src/pages/Dashboard.tsx:194-264` (`DeptCardPanel` — lift chip state up), `:461-473` (state), `:602-639` (drop resolution)

**Interfaces:**
- Consumes: `AvailableDeviceRow.thumbnailPath` from Task 1; `DeptCardRequest.id` from Task 3.
- Produces: `dragStateRef: React.MutableRefObject<{ devices: AvailableDeviceRow[] } | null>` (no more `requestId` field) — this is the final shape; nothing downstream of this plan consumes it further.

- [ ] **Step 1: Rewrite `AllocationDrawer.tsx`**

Replace the full contents of `src/components/AllocationDrawer.tsx` with:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { IconBox } from "@/lib/icons";
import type { AvailableDeviceRow } from "@shared/ipc";

export interface AllocationDrawerProps {
  open: boolean;
  onClose(): void;
  dragStateRef: React.MutableRefObject<{
    devices: AvailableDeviceRow[];
  } | null>;
}

function useAvailableForDrawer() {
  return useQuery({
    queryKey: ["requests", "available-devices"],
    queryFn: () => unwrap(api.requests.availableDevices()),
    select: (d) => d.devices,
  });
}

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconDrag({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </svg>
  );
}

function DeviceThumbnail({ thumbnailPath }: { thumbnailPath: string | null }) {
  if (thumbnailPath) {
    return (
      <img
        src={`file://${thumbnailPath}`}
        alt=""
        style={{
          width: 48,
          height: 48,
          borderRadius: "var(--rad-sm)",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 48,
        height: 48,
        flexShrink: 0,
        borderRadius: "var(--rad-sm)",
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconBox size={20} />
    </div>
  );
}

export function AllocationDrawer({
  open,
  onClose,
  dragStateRef,
}: AllocationDrawerProps) {
  const { data: devices = [] } = useAvailableForDrawer();

  const [lendQuery, setLendQuery] = useState("");
  const [lendSelected, setLendSelected] = useState<string[]>([]);

  const filtered = devices.filter((d) => {
    const q = lendQuery.trim().toLowerCase();
    return (
      !q || (d.name + " " + d.sku + " " + d.category).toLowerCase().includes(q)
    );
  });

  const allSelected =
    filtered.length > 0 && filtered.every((d) => lendSelected.includes(d.sku));

  function toggleOne(sku: string) {
    setLendSelected((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku],
    );
  }

  function toggleAll() {
    if (allSelected) {
      setLendSelected([]);
    } else {
      setLendSelected(filtered.map((d) => d.sku));
    }
  }

  function handleDragStart(sku: string) {
    const skus =
      lendSelected.includes(sku) && lendSelected.length > 0
        ? lendSelected
        : [sku];
    const picked = devices.filter((d) => skus.includes(d.sku));
    dragStateRef.current = { devices: picked };
  }

  if (!open) return null;

  return (
    <>
      {/* Pointer-events:none overlay so dashboard cards remain clickable */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          pointerEvents: "none",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 400,
          height: "100vh",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          zIndex: 41,
          boxShadow: "-4px 0 24px rgba(0,0,0,.12)",
          animation: "slideInRight .18s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 56,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Cấp phát thiết bị
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}
            >
              Chọn rồi kéo thiết bị vào thẻ phòng ban
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              borderRadius: "var(--rad-sm)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--hoverbg)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Search */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <input
            value={lendQuery}
            onChange={(e) => setLendQuery(e.target.value)}
            placeholder="Tìm thiết bị trong kho…"
            style={{
              width: "100%",
              height: 36,
              padding: "0 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--rad-sm)",
              background: "var(--surface-2)",
              color: "var(--text)",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Select-all bar */}
        {filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
              flexShrink: 0,
            }}
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ accentColor: "var(--primary)", width: 15, height: 15 }}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>
              {lendSelected.length > 0
                ? `${lendSelected.length} đã chọn`
                : "Chọn tất cả"}
            </span>
          </div>
        )}

        {/* Device list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div
              style={{
                padding: 20,
                fontSize: 13,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              Không có thiết bị trong kho.
            </div>
          )}
          {filtered.map((d) => {
            const selected = lendSelected.includes(d.sku);
            return (
              <div
                key={d.sku}
                draggable
                onDragStart={() => handleDragStart(d.sku)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  cursor: "grab",
                  borderBottom: "1px solid var(--border)",
                  background: selected
                    ? "color-mix(in srgb, var(--primary) 6%, transparent)"
                    : "none",
                  border: selected
                    ? "1px solid color-mix(in srgb, var(--primary) 30%, transparent)"
                    : "1px solid transparent",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = "var(--hoverbg)";
                }}
                onMouseLeave={(e) => {
                  if (!selected) e.currentTarget.style.background = "none";
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleOne(d.sku)}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    accentColor: "var(--primary)",
                    width: 15,
                    height: 15,
                    flexShrink: 0,
                  }}
                />
                <DeviceThumbnail thumbnailPath={d.thumbnailPath} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {d.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    <span style={{ fontFamily: "'Consolas',monospace" }}>
                      {d.sku}
                    </span>
                    {d.category ? ` · ${d.category}` : ""}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  <IconDrag size={14} />
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-muted)",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          Kéo thiết bị và thả vào thẻ phòng ban để cấp phát
        </div>
      </div>
    </>
  );
}
```

Note what changed vs. the original: the whole "PHIẾU ĐỀ NGHỊ" `<select>` block and `useAllocatedRequests`/`lendReqId` are gone; `handleDragStart` no longer sets `requestId`; each row now renders `<DeviceThumbnail>` before its text; each row gets a hover handler that only applies `--hoverbg` when the row isn't already selection-highlighted.

- [ ] **Step 2: Lift `activeCode` state out of `DeptCardPanel` in `Dashboard.tsx`**

In `src/pages/Dashboard.tsx:194-227`, change the `DeptCardPanel` signature and internals from:

```tsx
function DeptCardPanel({
  card,
  isDrop,
  onDragOver,
  onDrop,
  onDragLeave,
  onReturnItem,
  onCreateRequest,
  canCreateRequest,
}: {
  card: DeptCard
  isDrop?: boolean
  onDragOver?(): void
  onDrop?(): void
  onDragLeave?(): void
  onReturnItem?(item: DeptCardItem): void
  onCreateRequest?(): void
  canCreateRequest?: boolean
}) {
  const firstCode = card.requests[0]?.code ?? ''
  const [activeCode, setActiveCode] = useState(firstCode)
  const [page, setPage] = useState(1)

  const isLoose = card.kind === 'loose'

  const req: DeptCardRequest | undefined =
    isLoose ? undefined : (card.requests.find(r => r.code === activeCode) ?? card.requests[0])

  const items = isLoose ? (card.looseItems ?? []) : (req?.items ?? [])
  const totalPages = Math.ceil(items.length / PAGE_SIZE)
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasPager = items.length > PAGE_SIZE

  function switchChip(code: string) {
    setActiveCode(code)
    setPage(1)
  }
```

to:

```tsx
function DeptCardPanel({
  card,
  activeCode,
  onActiveCodeChange,
  isDrop,
  onDragOver,
  onDrop,
  onDragLeave,
  onReturnItem,
  onCreateRequest,
  canCreateRequest,
}: {
  card: DeptCard
  activeCode: string
  onActiveCodeChange(code: string): void
  isDrop?: boolean
  onDragOver?(): void
  onDrop?(): void
  onDragLeave?(): void
  onReturnItem?(item: DeptCardItem): void
  onCreateRequest?(): void
  canCreateRequest?: boolean
}) {
  const [page, setPage] = useState(1)

  const isLoose = card.kind === 'loose'

  const req: DeptCardRequest | undefined =
    isLoose ? undefined : (card.requests.find(r => r.code === activeCode) ?? card.requests[0])

  const items = isLoose ? (card.looseItems ?? []) : (req?.items ?? [])
  const totalPages = Math.ceil(items.length / PAGE_SIZE)
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasPager = items.length > PAGE_SIZE

  function switchChip(code: string) {
    onActiveCodeChange(code)
    setPage(1)
  }
```

(The `switchChip(r.code)` call site inside the chip-rendering JSX further down, `src/pages/Dashboard.tsx:301`, needs no change — it already calls `switchChip`.)

- [ ] **Step 3: Update `dragStateRef` type and per-card active-code map in `Dashboard()`**

In `src/pages/Dashboard.tsx:461-475`, change:

```tsx
export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const [lendOpen, setLendOpen] = useState(false)
  const [dropDept, setDropDept] = useState<string | null>(null)
  const [createReqForDept, setCreateReqForDept] = useState<{ deptId: number; deptName: string } | null>(null)
  const dragStateRef = useRef<{ devices: AvailableDeviceRow[]; requestId: number | null } | null>(null)
  const [lendModal, setLendModal] = useState<{
    devices: AvailableDeviceRow[]
    dept: string
    deptId: number | null
    requestId: number | null
  } | null>(null)
```

to:

```tsx
export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const [lendOpen, setLendOpen] = useState(false)
  const [dropDept, setDropDept] = useState<string | null>(null)
  const [createReqForDept, setCreateReqForDept] = useState<{ deptId: number; deptName: string } | null>(null)
  const [activeCodeByDept, setActiveCodeByDept] = useState<Record<string, string>>({})
  const dragStateRef = useRef<{ devices: AvailableDeviceRow[] } | null>(null)
  const [lendModal, setLendModal] = useState<{
    devices: AvailableDeviceRow[]
    dept: string
    deptId: number | null
    requestId: number | null
  } | null>(null)
```

- [ ] **Step 4: Rewrite the drop-resolution logic in the card-rendering block**

In `src/pages/Dashboard.tsx:602-639`, change:

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
                  canCreateRequest={hasPermission('create_request')}
                  onCreateRequest={() => {
                    if (card.deptId != null) setCreateReqForDept({ deptId: card.deptId, deptName: card.dept })
                  }}
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

to:

```tsx
            {data.deptCards.map(card => {
              const activeCode = activeCodeByDept[card.dept] ?? card.requests[0]?.code ?? ''
              const validDrop = () => card.kind === 'loose' ? true : card.requests.length > 0
              return (
                <DeptCardPanel
                  key={card.dept}
                  card={card}
                  activeCode={activeCode}
                  onActiveCodeChange={code => setActiveCodeByDept(prev => ({ ...prev, [card.dept]: code }))}
                  isDrop={dropDept === card.dept}
                  canCreateRequest={hasPermission('create_request')}
                  onCreateRequest={() => {
                    if (card.deptId != null) setCreateReqForDept({ deptId: card.deptId, deptName: card.dept })
                  }}
                  onDragOver={() => setDropDept(validDrop() ? card.dept : null)}
                  onDragLeave={() => setDropDept(null)}
                  onDrop={() => {
                    setDropDept(null)
                    const drag = dragStateRef.current
                    dragStateRef.current = null
                    if (!drag) return
                    if (!validDrop()) return
                    const activeReq = card.requests.find(r => r.code === activeCode) ?? card.requests[0]
                    const reqId = card.kind === 'loose' ? null : (activeReq?.id ?? null)
                    if (card.kind !== 'loose' && reqId == null) return
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

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors (this will catch any leftover reference to the removed `requestId` field or `lendReqId`/`useAllocatedRequests`).

- [ ] **Step 6: Manual verification**

Run: `env -u ELECTRON_RUN_AS_NODE npm run dev`, log in as `admin`. On Dashboard:
- Click "Cấp phát" to open the drawer. Confirm there is no "PHIẾU ĐỀ NGHỊ" selector — only the search box, select-all bar, and device list.
- Confirm each device row shows a 48×48px thumbnail (a placeholder box with a box icon for devices with no group thumbnail, since seed data has no thumbnails set by default) and that rows highlight on mouse hover.
- Drag a device onto a department card that has at least one request chip (e.g. "Đội 1" / DX-301). Confirm the `LendConfirmDialog` opens and, on confirm, the device appears under the currently-active chip for that department.
- Switch to a different chip on that same card (if it has more than one, e.g. after Task 5 you created a second request there), then drag another device onto the card — confirm it attaches to whichever chip is now active, not the first one.
- Drag a device onto a department card with **zero** request chips (a department that has never had a request created) — confirm the drop is rejected (no highlight while dragging over it, and no dialog opens if dropped).
- Drag a device onto the "Cấp phát lẻ" card — confirm it still works with no request attached (`requestId: null`).

- [ ] **Step 7: Commit**

```bash
git add src/components/AllocationDrawer.tsx src/pages/Dashboard.tsx
git commit -m "feat(dashboard): auto-resolve target request on drop, simplify AllocationDrawer to search-only with thumbnails"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (Tạo phiếu button + reused/locked dialog) → Tasks 4–5. Part 2 (remove phiếu form, thumbnail, hover, active-chip auto-assignment) → Tasks 1, 6. The `DeptCardRequest.id` / pending-chip-visibility gap found during planning (not in the original spec, since it wasn't discovered until reading `dashboard.ts`) → Tasks 2–3, called out explicitly above as a necessary correctness fix.
- **Type consistency check:** `AvailableDeviceRow.thumbnailPath` (Task 1) is used identically in `requests.ts`, `allocate.ts`, and consumed in `AllocationDrawer.tsx`'s `DeviceThumbnail`. `DeptCardRequest.id` (Task 3) is used identically in `dashboard.ts`'s push and `Dashboard.tsx`'s `activeReq?.id` lookup. `dragStateRef`'s `{ devices: AvailableDeviceRow[] }` shape (no `requestId`) is identical between `AllocationDrawer.tsx`'s prop type and `Dashboard.tsx`'s `useRef` type — both changed together in Task 6 to avoid a broken intermediate state.
- **Scope:** This plan touches Dashboard, AllocationDrawer, the shared request-create dialog, and their direct backend handlers only. It does not touch the Requests page's own list/filter behavior, the older Allocate page's UI, or Catalog thumbnail management — only the type/query plumbing needed to keep those compiling.
