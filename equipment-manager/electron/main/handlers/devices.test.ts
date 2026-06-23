import { describe, it, expect } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeDeviceHandlers } from './devices'

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
