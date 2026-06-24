import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { devices, allocations } from '../db/schema'
import { makeDeviceHandlers } from './devices'
import { makeAllocateHandlers } from './allocate'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return makeDeviceHandlers(db)
}

describe('devices.list', () => {
  it('returns all 12 devices with total and counts when filter=all', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: '' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.total).toBe(12)
      expect(res.data.devices.length).toBe(12)
      const all = res.data.counts.find((c) => c.key === 'all')
      expect(all?.count).toBe(12)
    }
  })

  it('filters by status', async () => {
    const h = setup()
    const res = await h.list({ filter: 'available', query: '' })
    if (res.ok) expect(res.data.devices.every((d) => d.status === 'available')).toBe(true)
  })

  it('searches by sku/name (case-insensitive)', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: 'lap-0012' })
    if (res.ok) {
      expect(res.data.devices.length).toBe(1)
      expect(res.data.devices[0].sku).toBe('LAP-0012')
    }
  })
})

describe('devices.get', () => {
  it('returns device detail with info fields and history for LAP-0012', async () => {
    const h = setup()
    const res = await h.get({ sku: 'LAP-0012' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.device.sku).toBe('LAP-0012')
      expect(res.data.info.length).toBeGreaterThanOrEqual(6)
      expect(Array.isArray(res.data.history)).toBe(true)
    }
  })

  it('returns an error for an unknown sku', async () => {
    const h = setup()
    const res = await h.get({ sku: 'NOPE-9999' })
    expect(res.ok).toBe(false)
  })
})

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
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.data.devices.length).toBeGreaterThan(0)
    const allocatedSku = list.data.devices[0].sku
    const res = await h.changeStatus({ sku: allocatedSku, status: 'maintenance', notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('CONFLICT')
  })
})

describe('devices.list — activeAllocationId', () => {
  it('exposes activeAllocationId for an allocated device and null for one without an active allocation', async () => {
    const h = setup()
    const res = await h.list({ filter: 'all', query: '' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const allocated = res.data.devices.find((d) => d.sku === 'LAP-0012')  // active in DX-301
    const free = res.data.devices.find((d) => d.sku === 'LAP-0024')       // never allocated
    expect(allocated).toBeDefined()
    expect(free).toBeDefined()
    expect(typeof allocated!.activeAllocationId).toBe('number')
    expect(free!.activeAllocationId).toBeNull()
  })
})

describe('devices.get — activeAllocationId', () => {
  it('exposes the active allocationId for an allocated device', async () => {
    const h = setup()
    // LAP-0012 is seeded as allocated under the active request DX-301
    const res = await h.get({ sku: 'LAP-0012' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.device.status).toBe('allocated')
    expect(typeof res.data.device.activeAllocationId).toBe('number')
  })

  it('returns null activeAllocationId for a device with no active allocation', async () => {
    const h = setup()
    // LAP-0024 (MacBook Air M2) is seeded available and never allocated
    const res = await h.get({ sku: 'LAP-0024' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.device.activeAllocationId).toBeNull()
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
