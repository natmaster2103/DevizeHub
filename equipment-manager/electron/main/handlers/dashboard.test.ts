import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { requests, allocations, devices, departments, deviceGroups } from '../db/schema'
import { session } from '../session'
import { ALL_PERMISSIONS } from '@shared/ipc'
import { makeDashboardHandlers } from './dashboard'
import { makeRequestHandlers } from './requests'
import { makeAllocateHandlers } from './allocate'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
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

  it('includes pending and allocated requests as chips, excludes completed', async () => {
    const { dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const allRequests = res.data.deptCards.flatMap((c) => c.requests)
    expect(allRequests.length).toBeGreaterThan(0)
    expect(allRequests.every((r) => r.status === 'pending' || r.status === 'allocated')).toBe(true)

    // DX-293 is seeded as 'pending' with zero allocations — it must still show
    // as an empty, droppable chip (this is the whole point of the feature).
    const dx293 = allRequests.find((r) => r.code === 'DX-293')
    expect(dx293).toBeDefined()
    expect(dx293!.items).toEqual([])

    // DX-298/DX-295/DX-290 are seeded 'completed' — must not appear as chips.
    expect(allRequests.find((r) => r.code === 'DX-298')).toBeUndefined()
    expect(allRequests.find((r) => r.code === 'DX-295')).toBeUndefined()
    expect(allRequests.find((r) => r.code === 'DX-290')).toBeUndefined()
  })

  it('request chips expose a numeric request id matching the requests table', async () => {
    const { db, dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const dx301Chip = res.data.deptCards.flatMap((c) => c.requests).find((r) => r.code === 'DX-301')
    expect(dx301Chip).toBeDefined()
    const dx301Row = db.select({ id: requests.id }).from(requests).where(eq(requests.code, 'DX-301')).get()
    expect(dx301Chip!.id).toBe(dx301Row!.id)
  })

  it('a freshly created request with zero allocations appears as an empty pending chip', async () => {
    const { db, dash, req } = setup()
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const created = await req.create({ code: 'NEW-CHIP', departmentId: deptId, createdAt: null, notes: null })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const card = res.data.deptCards.find((c) => c.deptId === deptId)
    const chip = card?.requests.find((r) => r.code === 'NEW-CHIP')
    expect(chip).toBeDefined()
    expect(chip!.status).toBe('pending')
    expect(chip!.id).toBe(created.data.id)
    expect(chip!.items).toEqual([])
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

    // DX-293 is a seed request with no allocations — safe to add one.
    // (DX-295 was used previously, but it's seeded as 'completed', and completed
    // requests are now correctly hidden from dept card chips regardless of any
    // allocation later attached to them — see Task 3. DX-293 is seeded 'pending'
    // with zero items, so it stays visible as a chip after this quick-allocate.)
    const dx293 = db.select({ id: requests.id, departmentId: requests.departmentId })
      .from(requests).where(eq(requests.code, 'DX-293')).get()
    expect(dx293).toBeDefined()

    // Quick-allocate LAP-0024 (MacBook Air M2 — never allocated in seed) linked to DX-293
    const res = await alloc.quickAllocate({
      deviceSkus: ['LAP-0024'],
      departmentId: dx293!.departmentId!,
      borrowerName: 'Nguyễn Văn Test',
      requestId: dx293!.id,
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

  it('exposes the device group thumbnail path on dept card items', async () => {
    const { db, dash } = setup()
    const res = await dash.summary()
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const allItems = res.data.deptCards.flatMap(c =>
      [...c.requests.flatMap(r => r.items), ...(c.looseItems ?? [])]
    )
    expect(allItems.length).toBeGreaterThan(0)
    // Every item must carry the field (even if null for ungrouped devices).
    expect(allItems.every(i => 'thumbnailPath' in i)).toBe(true)

    const dev = db.select({ id: devices.id, groupId: devices.groupId })
      .from(devices).where(eq(devices.sku, 'LAP-0024')).get()
    if (dev?.groupId != null) {
      const group = db.select({ thumbnailPath: deviceGroups.thumbnailPath })
        .from(deviceGroups).where(eq(deviceGroups.id, dev.groupId)).get()
      const item = allItems.find(i => i.deviceSku === 'LAP-0024')
      if (item) expect(item.thumbnailPath).toBe(group?.thumbnailPath ?? null)
    }
  })

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
})
