import { describe, it, expect } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeDashboardHandlers } from './dashboard'
import { makeRequestHandlers } from './requests'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return { dash: makeDashboardHandlers(db), req: makeRequestHandlers(db) }
}

describe('dashboard.summary', () => {
  it('returns stat counts consistent with the seeded devices', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.stats.total).toBe(12)
      expect(res.data.stats.allocated).toBeGreaterThan(0)
      expect(res.data.deptCards.length).toBeGreaterThan(0)
      expect(res.data.deptCards[0].requests.length).toBeGreaterThan(0)
      const firstItem = res.data.deptCards[0].requests[0].items[0]
      expect(typeof firstItem.allocationId).toBe('number')
      expect(typeof firstItem.deviceSku).toBe('string')
      expect(firstItem.deviceSku.length).toBeGreaterThan(0)
    }
  })

  it('returned device no longer appears in dept card items', async () => {
    const { dash, req } = setup()

    const before = await dash.summary()
    expect(before.ok).toBe(true)
    if (!before.ok) return

    // Find a returnable item in any dept card
    let targetAllocId: number | null = null
    outer: for (const card of before.data.deptCards) {
      for (const r of card.requests) {
        for (const item of r.items) {
          if (item.returnable) { targetAllocId = item.allocationId; break outer }
        }
      }
    }
    expect(targetAllocId).not.toBeNull()

    // Return it
    const ret = await req.returnDevice({ allocationId: targetAllocId!, condition: 'Tốt', notes: '' })
    expect(ret.ok).toBe(true)

    // Refetch dashboard — item must be gone
    const after = await dash.summary()
    expect(after.ok).toBe(true)
    if (!after.ok) return

    const allItems = after.data.deptCards.flatMap(c => c.requests.flatMap(r => r.items))
    const found = allItems.some(i => i.allocationId === targetAllocId)
    expect(found).toBe(false)
  })
})
