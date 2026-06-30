import { describe, it, expect } from 'vitest'
import { isNull, eq, and } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { allocations, devices, employees } from '../db/schema'
import { session } from '../session'
import { ALL_PERMISSIONS } from '@shared/ipc'
import { makeAllocateHandlers } from './allocate'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
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
})

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
    expect(alc!.notes).toBeNull()
  })
})
