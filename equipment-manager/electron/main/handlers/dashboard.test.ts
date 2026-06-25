import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { requests } from '../db/schema'
import { makeDashboardHandlers } from './dashboard'
import { makeRequestHandlers } from './requests'
import { makeAllocateHandlers } from './allocate'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  return {
    db,
    dash: makeDashboardHandlers(db),
    req: makeRequestHandlers(db),
    alloc: makeAllocateHandlers(db),
  }
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

  it('only includes requests with allocated status in dept card chips', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const allRequests = res.data.deptCards.flatMap((c) => c.requests)
    expect(allRequests.length).toBeGreaterThan(0)
    expect(allRequests.every((r) => r.status === 'allocated')).toBe(true)
  })

  it('returns a card for every department, including ones with no active allocations', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // The seed creates 4 departments — all of them get a card.
    const deptOnly = res.data.deptCards.filter((c) => c.kind === 'department')
    expect(deptOnly.length).toBe(4)
  })

  it('a department with no active allocations shows count 0 and no request chips', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Đội 4 (DX-295, 'Hoàn tất') has no active allocations in the seed.
    const empty = res.data.deptCards.find((c) => c.dept === 'Đội 4')
    expect(empty).toBeDefined()
    expect(empty!.count).toBe(0)
    expect(empty!.requests.length).toBe(0)
  })

  it('orders departments by active allocation count, highest first', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const counts = res.data.deptCards.filter((c) => c.kind === 'department').map((c) => c.count)
    const sorted = [...counts].sort((a, b) => b - a)
    expect(counts).toEqual(sorted)
    expect(res.data.deptCards[0].count).toBeGreaterThan(0)
  })

  it('quick-allocated device shows borrowerName from notes, not empty string', async () => {
    const { db, dash, alloc } = setup()

    // DX-295 is a seed request (Phòng Nhân sự) with no allocations — safe to add one
    const dx295 = db.select({ id: requests.id, departmentId: requests.departmentId })
      .from(requests).where(eq(requests.code, 'DX-295')).get()
    expect(dx295).toBeDefined()

    // Quick-allocate LAP-0024 (MacBook Air M2 — never allocated in seed) linked to DX-295
    const res = await alloc.quickAllocate({
      deviceSkus: ['LAP-0024'],
      departmentId: dx295!.departmentId!,
      borrowerName: 'Nguyễn Văn Test',
      requestId: dx295!.id,
      notes: null,
    })
    expect(res.ok).toBe(true)

    // Dashboard must show the borrower name, not blank
    const after = await dash.summary()
    expect(after.ok).toBe(true)
    if (!after.ok) return
    const allItems = after.data.deptCards.flatMap(c => c.requests.flatMap(r => r.items))
    const item = allItems.find(i => i.deviceSku === 'LAP-0024')
    expect(item).toBeDefined()
    expect(item!.borrowerName).toBe('Nguyễn Văn Test')
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

  it('groups requestId-null active allocations into the loose card, not a department card', async () => {
    const { dash, alloc } = setup()
    const res0 = await alloc.quickAllocate({
      deviceSkus: ['LAP-0024'], departmentId: null,
      borrowerName: 'Người Lẻ', requestId: null, notes: null,
    })
    expect(res0.ok).toBe(true)

    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const loose = res.data.deptCards.find((c) => c.kind === 'loose')
    expect(loose).toBeDefined()
    expect(loose!.dept).toBe('Cấp phát lẻ')
    expect(loose!.deptId).toBeNull()
    const looseSkus = (loose!.looseItems ?? []).map((i) => i.deviceSku)
    expect(looseSkus).toContain('LAP-0024')

    const deptItemSkus = res.data.deptCards
      .filter((c) => c.kind === 'department')
      .flatMap((c) => c.requests.flatMap((r) => r.items.map((i) => i.deviceSku)))
    expect(deptItemSkus).not.toContain('LAP-0024')
  })

  it('always returns exactly one loose card even when empty', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const looseCards = res.data.deptCards.filter((c) => c.kind === 'loose')
    expect(looseCards.length).toBe(1)
    expect(looseCards[0].count).toBe(0)
    expect(looseCards[0].looseItems).toEqual([])
  })
})
