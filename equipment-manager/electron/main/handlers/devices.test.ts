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
