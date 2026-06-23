import { describe, it, expect } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeDashboardHandlers } from './dashboard'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return makeDashboardHandlers(db)
}

describe('dashboard.summary', () => {
  it('returns stat counts consistent with the seeded devices', async () => {
    const h = setup()
    const res = await h.summary()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.stats.total).toBe(12)
      expect(res.data.stats.allocated).toBeGreaterThan(0)
      expect(res.data.deptCards.length).toBeGreaterThan(0)
      expect(res.data.deptCards[0].requests.length).toBeGreaterThan(0)
      // ← thêm:
      const firstItem = res.data.deptCards[0].requests[0].items[0]
      expect(typeof firstItem.allocationId).toBe('number')
      expect(typeof firstItem.deviceSku).toBe('string')
      expect(firstItem.deviceSku.length).toBeGreaterThan(0)
    }
  })
})
