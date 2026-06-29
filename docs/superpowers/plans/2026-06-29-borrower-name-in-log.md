# Borrower Name In Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the borrower (người mượn) name in a dedicated `allocations.borrower_name` column written by every allocation flow, and read it from there in the device history log and other read sites.

**Architecture:** Add a nullable `borrower_name` column to the `allocations` table. **Read sites are updated first** (they prefer the column, then the live `employees` join, then the legacy `notes` regex), so they stay backward-compatible while the column is still empty. Then each of the three write flows is switched to populate the column (quick allocate + add-to-request from their text field; full form from a snapshot of the selected employee's name). This ordering keeps the full test suite green after every task — no backfill required.

**Tech Stack:** Electron + TypeScript, Drizzle ORM over better-sqlite3, Vitest, drizzle-kit for migrations.

## Global Constraints

- All user-facing strings are Vietnamese. The borrower-not-found fallback string is exactly `'Người dùng'`.
- The legacy borrower-from-notes format is exactly `Người mượn: X`; the existing parse helpers (`parseBorrowerName` in `devices.ts`, `parseBorrowerFromNotes` in `requests.ts` and `dashboard.ts`) must remain as the final fallback.
- The lender/issuer (`allocations.issuedBy`) is unrelated to this work — do not touch it.
- The new column is nullable text: `borrower_name` (Drizzle: `borrowerName: text('borrower_name')`).
- Run tests with `npx vitest run <file>` from the `equipment-manager/` directory. If better-sqlite3 fails with a NODE_MODULE_VERSION / ABI mismatch, run `npm install` (restores the Node-ABI build) and retry.
- Run all commands from `equipment-manager/` unless stated otherwise.
- Resolution chain (apply consistently): `borrowerName (column) ?? <live employee name> ?? <legacy notes parse>`, with the trailing `?? 'Người dùng'` only in the history-log `flow.to` (where it exists today).

---

### Task 1: Add `borrower_name` column + migration

**Files:**
- Modify: `equipment-manager/electron/main/db/schema.ts:97`
- Create: `equipment-manager/electron/main/db/migrations/0008_*.sql` (generated)
- Test: `equipment-manager/electron/main/handlers/allocate.test.ts`

**Interfaces:**
- Produces: `allocations.borrowerName` Drizzle column (`text('borrower_name')`, nullable). Appears on `typeof allocations.$inferSelect` as `borrowerName: string | null` and is accepted by `db.insert(allocations).values({ … })`.

- [ ] **Step 1: Write the failing test**

Add to the end of `equipment-manager/electron/main/handlers/allocate.test.ts` (the file already imports `createDb`, `runMigrations`, `seedIfEmpty`, `allocations`, `devices`, `eq`):

```ts
describe('allocations.borrower_name column', () => {
  it('persists and reads back a borrower_name value', () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    db.insert(allocations).values({
      deviceId: dev!.id,
      issuedAt: new Date().toISOString(),
      borrowerName: 'Người Test',
    }).run()
    const row = db.select().from(allocations).where(eq(allocations.deviceId, dev!.id)).get()
    expect(row!.borrowerName).toBe('Người Test')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/handlers/allocate.test.ts -t "persists and reads back a borrower_name value"`
Expected: FAIL — `borrowerName` does not exist on the insert values type / no such column.

- [ ] **Step 3: Add the column to the schema**

In `equipment-manager/electron/main/db/schema.ts`, change the `allocations` table tail (currently `notes: text('notes')` is the last line, ~line 97):

```ts
  conditionIn: text('condition_in'),
  notes: text('notes'),
  borrowerName: text('borrower_name')
})
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: drizzle-kit creates `electron/main/db/migrations/0008_*.sql` containing `ALTER TABLE \`allocations\` ADD \`borrower_name\` text;` and updates `migrations/meta/`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run electron/main/handlers/allocate.test.ts -t "persists and reads back a borrower_name value"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/main/db/schema.ts electron/main/db/migrations electron/main/handlers/allocate.test.ts
git commit -m "feat(db): add borrower_name column to allocations"
```

---

### Task 2: Read borrower_name in `devices.ts` (history log, holder, list)

**Files:**
- Modify: `equipment-manager/electron/main/handlers/devices.ts` (list select @86-92 + holder @113; get `activeAlloc` select @200-205 + holder const @212; get `allocRows` select @246-257 + history name @269)
- Test: `equipment-manager/electron/main/handlers/devices.test.ts`

**Interfaces:**
- Consumes: `allocations.borrowerName` column (Task 1).
- Produces: `devices.get` history `flow.to` = `borrowerName ?? holderName ?? parseBorrowerName(notes) ?? 'Người dùng'`; `holder`/info "Người dùng" = `borrowerName ?? holderName ?? parseBorrowerName(notes)`. Column is still empty here, so behavior is unchanged for seeded/legacy rows.

- [ ] **Step 1: Write the failing test**

Add to `equipment-manager/electron/main/handlers/devices.test.ts`. The file already imports `createDb`, `runMigrations`, `seedIfEmpty`, `devices`, `allocations`, `eq`, and `makeDeviceHandlers`. This test inserts an allocation row directly with the column set (no writer flow needed yet):

```ts
describe('devices.get — borrower_name column in history', () => {
  it('uses borrower_name column for the allocate entry flow.to', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const h = makeDeviceHandlers(db)
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    db.insert(allocations).values({
      deviceId: dev!.id,
      issuedAt: new Date().toISOString(),
      borrowerName: 'Người Mượn Cột',
      notes: null,
    }).run()
    const res = await h.get({ sku: 'LAP-0024' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const allocateEntry = res.data.history.find(e => e.type === 'allocate')
    expect(allocateEntry!.flow!.to).toBe('Người Mượn Cột')
  })

  it('falls back to legacy notes when borrower_name is null', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const h = makeDeviceHandlers(db)
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    db.insert(allocations).values({
      deviceId: dev!.id,
      issuedAt: new Date().toISOString(),
      borrowerName: null,
      notes: 'Người mượn: Legacy Cũ',
    }).run()
    const res = await h.get({ sku: 'LAP-0024' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const allocateEntry = res.data.history.find(e => e.type === 'allocate')
    expect(allocateEntry!.flow!.to).toBe('Legacy Cũ')
  })
})
```

- [ ] **Step 2: Run test to verify the first case fails**

Run: `npx vitest run electron/main/handlers/devices.test.ts -t "uses borrower_name column for the allocate entry flow.to"`
Expected: FAIL — `flow.to` is `'Người dùng'` (column neither selected nor used). The legacy-fallback test already passes.

- [ ] **Step 3: Add `borrowerName` to the three allocation selects**

In `equipment-manager/electron/main/handlers/devices.ts`:

`list` — the `activeAllocs` select (~line 86):

```ts
        .select({
          allocationId: allocations.id,
          deviceId: allocations.deviceId,
          holderName: employees.name,
          deptName: departments.name,
          borrowerName: allocations.borrowerName,
          notes: allocations.notes,
        })
```

`get` — the `activeAlloc` select (~line 200):

```ts
        .select({
          allocationId: allocations.id,
          holderName: employees.name,
          deptName: departments.name,
          borrowerName: allocations.borrowerName,
          notes: allocations.notes,
        })
```

`get` — the `allocRows` history select (~line 246):

```ts
        .select({
          issuedAt: allocations.issuedAt,
          returnedAt: allocations.returnedAt,
          holderName: employees.name,
          deptName: departments.name,
          borrowerName: allocations.borrowerName,
          notes: allocations.notes,
          issuerName: issuer.displayName,
          returnerName: returner.displayName,
          dueDate: allocations.dueDate,
          conditionOut: allocations.conditionOut,
          conditionIn: allocations.conditionIn,
        })
```

- [ ] **Step 4: Update the three resolution expressions**

`list` — the `holder` field (~line 113):

```ts
          holder: alloc?.borrowerName ?? alloc?.holderName ?? parseBorrowerName(alloc?.notes ?? null),
```

`get` — the `holderName` const (~line 212):

```ts
      const holderName = activeAlloc?.borrowerName ?? activeAlloc?.holderName ?? parseBorrowerName(activeAlloc?.notes ?? null)
```

`get` — the history `name` const (~line 269):

```ts
        const name = a.borrowerName ?? a.holderName ?? parseBorrowerName(a.notes) ?? 'Người dùng'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/devices.test.ts`
Expected: PASS (all tests in file)

- [ ] **Step 6: Commit**

```bash
git add electron/main/handlers/devices.ts electron/main/handlers/devices.test.ts
git commit -m "feat(devices): prefer borrower_name column in log/holder/list"
```

---

### Task 3: Read borrower_name in `requests.get` and `dashboard.ts`

**Files:**
- Modify: `equipment-manager/electron/main/handlers/requests.ts` (`lines` select @116-124 + recipient @137)
- Modify: `equipment-manager/electron/main/handlers/dashboard.ts` (`allocRows` select @33-43 + the two `borrowerName:` mappings @130 and @161)
- Test: `equipment-manager/electron/main/handlers/requests.test.ts`, `equipment-manager/electron/main/handlers/dashboard.test.ts`

**Interfaces:**
- Consumes: `allocations.borrowerName` column (Task 1).
- Produces: `requests.get` line `recipient` = `borrowerName ?? recipientName ?? parseBorrowerFromNotes(notes)`; dashboard card `borrowerName` = `borrowerName ?? employeeName ?? parseBorrowerFromNotes(allocNotes)`. Column still empty, so existing tests are unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `equipment-manager/electron/main/handlers/requests.test.ts` (inside the same `describe` block that defines the `setup()` helper at line 257; the file imports `devices`, `allocations`, `eq`). This inserts a column-only allocation directly:

```ts
  it('returns recipient from the borrower_name column', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.status, 'available')).all()[0]
    db.insert(allocations).values({
      requestId: reqId,
      deviceId: dev.id,
      issuedAt: new Date().toISOString(),
      borrowerName: 'Cột Recipient',
      notes: null,
    }).run()
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.lines[0].recipient).toBe('Cột Recipient')
  })
```

Add to `equipment-manager/electron/main/handlers/dashboard.test.ts` (inside the `describe('dashboard.summary', …)` block that has the `setup()` helper at line 13; the file imports `eq` and `requests`, and needs `allocations` and `devices` added to the `'../db/schema'` import):

```ts
  it('shows borrowerName from the column for a loose allocation', async () => {
    const { db, dash } = setup()
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    db.insert(allocations).values({
      deviceId: dev!.id,
      requestId: null,
      issuedAt: new Date().toISOString(),
      borrowerName: 'Cột Lẻ',
      notes: null,
    }).run()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const loose = res.data.deptCards.find(c => c.kind === 'loose')
    const item = loose?.looseItems?.find(i => i.deviceSku === 'LAP-0024')
    expect(item).toBeDefined()
    expect(item!.borrowerName).toBe('Cột Lẻ')
  })
```

Update the import line in `dashboard.test.ts`:

```ts
import { requests, allocations, devices } from '../db/schema'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/main/handlers/requests.test.ts -t "returns recipient from the borrower_name column"`
Expected: FAIL — `recipient` is `''` (no employee join, `notes` null, column not read).

Run: `npx vitest run electron/main/handlers/dashboard.test.ts -t "shows borrowerName from the column for a loose allocation"`
Expected: FAIL — `borrowerName` is `''`.

- [ ] **Step 3: Update `requests.get`**

In `equipment-manager/electron/main/handlers/requests.ts`, add `borrowerName` to the `lines` select (~line 116):

```ts
        .select({
          allocationId: allocations.id,
          returnedAt: allocations.returnedAt,
          deviceSku: devices.sku,
          deviceName: devices.name,
          categoryName: categories.name,
          recipientName: employees.name,
          borrowerName: allocations.borrowerName,
          allocNotes: allocations.notes,
        })
```

Update the `recipient` mapping (~line 137):

```ts
        recipient: l.borrowerName ?? l.recipientName ?? parseBorrowerFromNotes(l.allocNotes),
```

- [ ] **Step 4: Update `dashboard.ts`**

In `equipment-manager/electron/main/handlers/dashboard.ts`, add `borrowerName` to the single `allocRows` select (~line 33), after `employeeName`:

```ts
          employeeName: employees.name,
          borrowerName: allocations.borrowerName,
          allocNotes: allocations.notes,
```

Then update **both** `borrowerName:` mappings — the request-card map (~line 130) and the loose-items map (~line 161) — to the identical expression:

```ts
              borrowerName: a.borrowerName ?? a.employeeName ?? parseBorrowerFromNotes(a.allocNotes),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/requests.test.ts electron/main/handlers/dashboard.test.ts`
Expected: PASS (all tests in both files)

- [ ] **Step 6: Commit**

```bash
git add electron/main/handlers/requests.ts electron/main/handlers/dashboard.ts electron/main/handlers/requests.test.ts electron/main/handlers/dashboard.test.ts
git commit -m "feat(requests,dashboard): prefer borrower_name column"
```

---

### Task 4: Write borrower_name in `allocate.quickAllocate`

**Files:**
- Modify: `equipment-manager/electron/main/handlers/allocate.ts:146-160`
- Test: `equipment-manager/electron/main/handlers/allocate.test.ts`

**Interfaces:**
- Consumes: column (Task 1), read chains (Tasks 2–3).
- Produces: each `quickAllocate` row has `borrowerName = args.borrowerName.trim()` and `notes = args.notes || null` (no `Người mượn:` prefix).

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('allocate.quickAllocate', …)` block in `equipment-manager/electron/main/handlers/allocate.test.ts` (reuse the `setup()` helper at line 11):

```ts
  it('stores borrowerName in the column and leaves notes free-text only', async () => {
    const { db, alloc } = setup()
    await alloc.quickAllocate({
      deviceSkus: ['LAP-0024'], departmentId: null,
      borrowerName: 'Nguyễn Văn Lẻ', requestId: null, notes: 'giao gấp',
    })
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    const alc = db.select().from(allocations)
      .where(and(eq(allocations.deviceId, dev!.id), isNull(allocations.returnedAt))).get()
    expect(alc!.borrowerName).toBe('Nguyễn Văn Lẻ')
    expect(alc!.notes).toBe('giao gấp')
  })
```

(`and`, `isNull`, `eq` are already imported at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/handlers/allocate.test.ts -t "stores borrowerName in the column and leaves notes free-text only"`
Expected: FAIL — `borrowerName` is `null`, `notes` is `"Người mượn: Nguyễn Văn Lẻ\ngiao gấp"`.

- [ ] **Step 3: Update the handler**

In `equipment-manager/electron/main/handlers/allocate.ts`, in `quickAllocate`, delete the `const notesStr = …` line (~line 147) and change the insert block:

```ts
      const now = new Date().toISOString()

      for (const dev of devs) {
        db.insert(allocations)
          .values({
            requestId: args.requestId ?? null,
            deviceId: dev.id,
            employeeId: null,
            departmentId: args.departmentId ?? null,
            issuedBy: session.current?.id ?? null,
            issuedAt: now,
            borrowerName: args.borrowerName.trim(),
            notes: args.notes || null,
          })
          .run()

        db.update(devices)
          .set({ status: 'allocated', updatedAt: now })
          .where(eq(devices.id, dev.id))
          .run()
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/allocate.test.ts`
Expected: PASS (all tests in file)

- [ ] **Step 5: Commit**

```bash
git add electron/main/handlers/allocate.ts electron/main/handlers/allocate.test.ts
git commit -m "feat(allocate): store borrower name in column for quick allocate"
```

---

### Task 5: Write borrower_name in `requests.addDevices`

**Files:**
- Modify: `equipment-manager/electron/main/handlers/requests.ts:234-249`
- Test: `equipment-manager/electron/main/handlers/requests.test.ts`

**Interfaces:**
- Consumes: column (Task 1), read chain (Task 3).
- Produces: each `addDevices` row has `borrowerName = args.borrowerName.trim()` and `notes = null`.

- [ ] **Step 1: Write the failing test**

Add inside the same `describe` block in `equipment-manager/electron/main/handlers/requests.test.ts`:

```ts
  it('stores borrowerName in the column, not in notes', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: 'Trần Thị B' })
    const d = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, dev.sku)).get()
    const alc = db.select().from(allocations).where(eq(allocations.deviceId, d!.id)).get()
    expect(alc!.borrowerName).toBe('Trần Thị B')
    expect(alc!.notes).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/handlers/requests.test.ts -t "stores borrowerName in the column, not in notes"`
Expected: FAIL — `borrowerName` is `null`, `notes` is `"Người mượn: Trần Thị B"`.

- [ ] **Step 3: Update the handler**

In `equipment-manager/electron/main/handlers/requests.ts`, in `addDevices`, delete the `const notesStr = …` line (~line 236) and change the insert:

```ts
      const now = new Date().toISOString()
      const issuedBy = session.current?.id ?? null

      for (const dev of availableDevs) {
        db.insert(allocations)
          .values({
            requestId: req.id,
            deviceId: dev.id,
            employeeId: req.employeeId ?? null,
            departmentId: req.departmentId ?? null,
            issuedBy,
            issuedAt: now,
            borrowerName: args.borrowerName.trim(),
            notes: null,
          })
          .run()

        db.update(devices)
          .set({ status: 'allocated', updatedAt: now })
          .where(eq(devices.id, dev.id))
          .run()
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/requests.test.ts`
Expected: PASS (all tests in file, including the existing `addDevices stores borrower name as the line recipient` at line 291, now served by the column)

- [ ] **Step 5: Commit**

```bash
git add electron/main/handlers/requests.ts electron/main/handlers/requests.test.ts
git commit -m "feat(requests): store borrower name in column for add-to-request"
```

---

### Task 6: Snapshot employee name into borrower_name in `allocate.create`

**Files:**
- Modify: `equipment-manager/electron/main/handlers/allocate.ts:82-109`
- Test: `equipment-manager/electron/main/handlers/allocate.test.ts`

**Interfaces:**
- Consumes: column (Task 1), read chains (Tasks 2–3).
- Produces: the `create` row has `borrowerName` = the selected employee's `employees.name` at allocation time; `notes = args.notes || null`.

- [ ] **Step 1: Write the failing test**

Add to `equipment-manager/electron/main/handlers/allocate.test.ts`. Add `employees` to the existing `'../db/schema'` import, then:

```ts
describe('allocate.create', () => {
  it('snapshots the selected employee name into borrower_name', async () => {
    const { db, alloc } = setup()
    const emp = db.select({ id: employees.id, name: employees.name, departmentId: employees.departmentId })
      .from(employees).get()
    const res = await alloc.create({
      deviceSku: 'LAP-0024',
      employeeId: emp!.id,
      departmentId: emp!.departmentId!,
      dueDate: null,
      requestId: null,
      conditionOut: '',
      notes: '',
    })
    expect(res.ok).toBe(true)
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    const alc = db.select().from(allocations).where(eq(allocations.deviceId, dev!.id)).get()
    expect(alc!.borrowerName).toBe(emp!.name)
  })
})
```

Import update at the top of `allocate.test.ts`:

```ts
import { allocations, devices, employees } from '../db/schema'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/handlers/allocate.test.ts -t "snapshots the selected employee name into borrower_name"`
Expected: FAIL — `borrowerName` is `null`.

- [ ] **Step 3: Update the handler**

In `equipment-manager/electron/main/handlers/allocate.ts`, in `create`, after the device availability check (after the `if (device.status !== 'available')` block) and replacing the existing `const now …` + insert block:

```ts
      const emp = db
        .select({ name: employees.name })
        .from(employees)
        .where(eq(employees.id, args.employeeId))
        .all()[0]

      const now = new Date().toISOString()

      db.insert(allocations)
        .values({
          requestId: args.requestId ?? null,
          deviceId: device.id,
          employeeId: args.employeeId,
          departmentId: args.departmentId,
          issuedBy: session.current?.id ?? null,
          issuedAt: now,
          dueDate: args.dueDate || null,
          conditionOut: args.conditionOut || null,
          borrowerName: emp?.name ?? null,
          notes: args.notes || null,
        })
        .run()
```

(`employees` and `eq` are already imported in `allocate.ts`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/main/handlers/allocate.test.ts`
Expected: PASS (all tests in file)

- [ ] **Step 5: Commit**

```bash
git add electron/main/handlers/allocate.ts electron/main/handlers/allocate.test.ts
git commit -m "feat(allocate): snapshot employee name into borrower_name for full form"
```

---

### Task 7: Full typecheck + suite

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS both `typecheck:node` and `typecheck:web` with no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: PASS. (If better-sqlite3 ABI error, run `npm install` then retry.)

- [ ] **Step 3: Commit (only if a fixup was needed)**

```bash
git add -A
git commit -m "chore: typecheck + suite green for borrower_name"
```
