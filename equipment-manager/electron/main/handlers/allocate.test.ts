import { describe, it, expect } from 'vitest'
import { isNull, eq, and } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { allocations, devices } from '../db/schema'
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
})
