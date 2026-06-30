import { describe, it, expect } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { departments, deviceGroups, devices, requests, allocations } from '../db/schema'
import { makeReportHandlers } from './reports'

const NOW = '2026-01-01T00:00:00.000Z'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db)

  const deptA = db.insert(departments).values({ name: 'Đội 1', createdAt: NOW }).returning({ id: departments.id }).get()
  const deptB = db.insert(departments).values({ name: 'Đội 2', createdAt: NOW }).returning({ id: departments.id }).get()

  const g1 = db.insert(deviceGroups).values({ name: 'Điện thoại Samsung', createdAt: NOW }).returning({ id: deviceGroups.id }).get()
  const g2 = db.insert(deviceGroups).values({ name: 'Laptop Dell', createdAt: NOW }).returning({ id: deviceGroups.id }).get()

  const mkDev = (sku: string, groupId: number | null) =>
    db.insert(devices).values({ sku, name: sku, status: 'allocated', createdAt: NOW, updatedAt: NOW, groupId })
      .returning({ id: devices.id }).get()
  const d1 = mkDev('PH-1', g1.id)
  const d2 = mkDev('PH-2', g1.id)
  const d3 = mkDev('LAP-1', g2.id)
  const d4 = mkDev('MISC-1', null) // không thuộc nhóm

  const r1 = db.insert(requests).values({ code: 'PA12', createdAt: '2026-06-20T03:00:00.000Z', departmentId: deptA.id, status: 'allocated' }).returning({ id: requests.id }).get()
  const r2 = db.insert(requests).values({ code: 'PA11', createdAt: '2026-06-10T03:00:00.000Z', departmentId: deptB.id, status: 'allocated' }).returning({ id: requests.id }).get()
  // r3 ngoài kỳ (tháng 5) — không được đếm
  db.insert(requests).values({ code: 'PA00', createdAt: '2026-05-20T03:00:00.000Z', departmentId: deptA.id, status: 'allocated' }).run()

  const mkAlloc = (deviceId: number, requestId: number | null, departmentId: number | null, issuedAt: string) =>
    db.insert(allocations).values({ deviceId, requestId, departmentId, issuedAt }).run()
  mkAlloc(d1.id, r1.id, deptA.id, '2026-06-10T03:00:00.000Z')
  mkAlloc(d2.id, r1.id, deptA.id, '2026-06-11T03:00:00.000Z')
  mkAlloc(d3.id, r2.id, deptB.id, '2026-06-12T03:00:00.000Z')
  mkAlloc(d4.id, null, null, '2026-06-13T03:00:00.000Z') // cấp phát lẻ
  mkAlloc(d1.id, r1.id, deptA.id, '2026-05-01T03:00:00.000Z') // ngoài kỳ — không tính lượt kỳ, nhưng tính vào allocationCount của r1

  return { reports: makeReportHandlers(db) }
}

const JUNE = { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' }

describe('reports.summary', () => {
  it('đếm số phiếu đề nghị theo createdAt trong kỳ', async () => {
    const { reports } = setup()
    const res = await reports.summary(JUNE)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.requestCount).toBe(2)
    expect(res.data.requests.map((r) => r.code)).toEqual(['PA12', 'PA11']) // mới nhất trước
  })

  it('allocationCount đếm TẤT CẢ lượt của phiếu, kể cả ngoài kỳ', async () => {
    const { reports } = setup()
    const res = await reports.summary(JUNE)
    if (!res.ok) throw new Error('expected ok')
    const pa12 = res.data.requests.find((r) => r.code === 'PA12')!
    expect(pa12.deptName).toBe('Đội 1')
    expect(pa12.allocationCount).toBe(3) // 2 trong kỳ + 1 ngoài kỳ
    expect(res.data.requests.find((r) => r.code === 'PA11')!.allocationCount).toBe(1)
  })

  it('tổng lượt cấp phát chỉ tính lượt issuedAt trong kỳ', async () => {
    const { reports } = setup()
    const res = await reports.summary(JUNE)
    if (!res.ok) throw new Error('expected ok')
    expect(res.data.totalAllocations).toBe(4) // loại lượt 01/05
  })

  it('gom theo nhóm thiết bị (kèm Chưa phân nhóm) và sắp xếp giảm dần', async () => {
    const { reports } = setup()
    const res = await reports.summary(JUNE)
    if (!res.ok) throw new Error('expected ok')
    const g = res.data.byGroup
    expect(g[0]).toMatchObject({ groupName: 'Điện thoại Samsung', count: 2, share: 50 })
    const misc = g.find((x) => x.groupId === null)!
    expect(misc).toMatchObject({ groupName: 'Chưa phân nhóm', count: 1, share: 25 })
  })

  it('gom theo phòng ban (kèm Cấp phát lẻ)', async () => {
    const { reports } = setup()
    const res = await reports.summary(JUNE)
    if (!res.ok) throw new Error('expected ok')
    const byDept = res.data.byDepartment
    expect(byDept.find((d) => d.deptName === 'Đội 1')).toMatchObject({ count: 2, share: 50 })
    expect(byDept.find((d) => d.deptId === null)).toMatchObject({ deptName: 'Cấp phát lẻ', count: 1, share: 25 })
  })

  it('kỳ rỗng → mọi số = 0, mảng rỗng', async () => {
    const { reports } = setup()
    const res = await reports.summary({ from: '2030-01-01T00:00:00.000Z', to: '2030-02-01T00:00:00.000Z' })
    if (!res.ok) throw new Error('expected ok')
    expect(res.data.requestCount).toBe(0)
    expect(res.data.totalAllocations).toBe(0)
    expect(res.data.byGroup).toEqual([])
    expect(res.data.byDepartment).toEqual([])
    expect(res.data.requests).toEqual([])
  })

  it('args thiếu from/to → trả lỗi', async () => {
    const { reports } = setup()
    const res = await reports.summary({ from: '', to: '' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.message).toBe('Khoảng thời gian không hợp lệ.')
  })
})
