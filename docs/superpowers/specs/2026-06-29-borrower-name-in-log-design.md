# Design: Persist borrower name in a dedicated column

**Date:** 2026-06-29
**Status:** Approved

## Problem

The device history log (the "Lịch sử" tab on `DeviceDetail`) shows the borrower
(người mượn) as the `to` side of each *Bàn giao* (allocate) entry. Today the
borrower name is stored implicitly: two of the three allocation flows embed
`"Người mượn: X"` into the free-text `allocations.notes` field, and every read
site recovers it with a regex (`parseBorrowerName` / `parseBorrowerFromNotes`).

This is fragile. The borrower name should be saved explicitly for **every**
allocation flow so it reliably appears in the log and other read sites.

Terminology: **borrower (người mượn)** = the person who receives the device.
This is distinct from the **lender/issuer**, already stored as
`allocations.issuedBy` (the logged-in user). This design concerns the borrower.

## Decision

Add a dedicated nullable `borrower_name` column to `allocations`. All three
allocation flows write it. All read sites prefer the column, keeping the
legacy regex parse only as a last-resort fallback for pre-migration rows (no
data backfill required).

## Schema + migration

- `electron/main/db/schema.ts`: add `borrowerName: text('borrower_name')` to the
  `allocations` table (nullable).
- Generate migration `0008_*.sql` with `npm run db:generate`. Nullable column,
  so no backfill.

## Write sites (3 flows)

| Flow | Handler | Change |
|------|---------|--------|
| Quick allocate | `allocate.quickAllocate` | set `borrowerName = args.borrowerName.trim()`; `notes` becomes `args.notes || null` (stop prepending `"Người mượn: …"`) |
| Add to request | `requests.addDevices` | set `borrowerName = args.borrowerName.trim()`; `notes` becomes `null` (it carried no real notes) |
| Full form | `allocate.create` | borrower = the selected employee. Snapshot the employee's name into `borrowerName` at allocation time; `notes` unchanged |

For the full form, "snapshot" means: look up `employees.name` for
`args.employeeId` at allocation time and store that string in `borrower_name`.
The log then keeps the correct borrower even if the employee is later renamed.

## Read sites — new priority chain

Everywhere the borrower currently resolves, change the chain to:

```
borrowerName (column) ?? holderName (employee join) ?? parseBorrowerName(notes) [legacy] ?? 'Người dùng'
```

(For request/dashboard read sites the empty-string fallback stays as today,
e.g. `... ?? parseBorrowerFromNotes(notes)` with no `'Người dùng'`.)

Affected read sites:

- `devices.get` — history log `flow.to`, plus the device `holder` and the
  "Người dùng" info field. Add `borrowerName` to the allocation selects.
- `devices.list` — the row `holder`.
- `requests.get` — the line `recipient`.
- `dashboard.ts` — the two `borrowerName` card fields.

Keeping `parseBorrowerName` / `parseBorrowerFromNotes` as the final fallback
preserves correct display for allocations created before the migration.

## Tests

- Per write flow (`allocate.quickAllocate`, `requests.addDevices`,
  `allocate.create`): assert `allocations.borrower_name` is populated with the
  expected name.
- `devices.get`: assert the *Bàn giao* entry's `flow.to` equals the borrower for
  each of the three flows.
- Legacy fallback: an allocation row with `borrower_name = NULL` and
  `notes = "Người mượn: X"` still resolves to `X` (guards backward compat).
- Existing borrower tests continue to pass unchanged.

## Out of scope

- No UI changes — the forms already collect the borrower name.
- No backfill of existing `notes` rows; the legacy fallback covers them.
