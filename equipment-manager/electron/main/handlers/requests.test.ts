import { describe, it, expect, beforeEach } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeRequestHandlers } from './requests'
import { session } from '../session'
import { departments, requests, devices, allocations, categories, deviceGroups } from '../db/schema'
import type { AppDb } from '../db'
import { ALL_PERMISSIONS } from '@shared/ipc'

function freshDb(): AppDb {
  const { db } = createDb(':memory:')
  runMigrations(db)
  seedIfEmpty(db)
  return db
}

const ADMIN_SESSION = {
  id: 1, username: 'admin', role: 'admin' as const,
  displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [],
}
const STAFF_SESSION = {
  id: 2, username: 'staff', role: 'staff' as const,
  displayName: 'Staff', permissions: [], groupIds: [],
}

// ── create: allows duplicate codes ───────────────────────────────────────────
describe('requests.create — duplicate codes allowed', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  it('creates two requests with the same code', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id

    const r1 = await h.create({ code: 'TEST-001', departmentId: deptId, createdAt: null, notes: null })
    const r2 = await h.create({ code: 'TEST-001', departmentId: deptId, createdAt: null, notes: null })

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r1.data.id).not.toBe(r2.data.id)
    }
  })
})

// ── get: includes departmentId ────────────────────────────────────────────────
describe('requests.get — includes departmentId', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  it('returns departmentId in the result', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id

    const create = await h.create({ code: 'R-001', departmentId: deptId, createdAt: null, notes: null })
    expect(create.ok).toBe(true)
    if (!create.ok) return

    const result = await h.get({ id: create.data.id })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.departmentId).toBe(deptId)
    }
  })
})

// ── update ────────────────────────────────────────────────────────────────────
describe('requests.update', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  async function createRequest(db: AppDb) {
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const h = makeRequestHandlers(db)
    const r = await h.create({ code: 'ORIG-001', departmentId: deptId, createdAt: null, notes: null })
    if (!r.ok) throw new Error('setup failed')
    return { id: r.data.id, deptId }
  }

  it('rejects staff without manage_requests', async () => {
    const db = freshDb()
    const { id, deptId } = await createRequest(db)  // create while ADMIN (from beforeEach)
    session.current = STAFF_SESSION                   // then switch to staff for the actual test
    const h = makeRequestHandlers(db)
    const res = await h.update({ id, code: 'NEW-001', departmentId: deptId, createdAt: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })

  it('rejects invalid id', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    // @ts-expect-error testing bad input
    const res = await h.update({ id: null, code: 'X', departmentId: 1, createdAt: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })

  it('rejects empty code', async () => {
    const db = freshDb()
    const { id, deptId } = await createRequest(db)
    const h = makeRequestHandlers(db)
    const res = await h.update({ id, code: '  ', departmentId: deptId, createdAt: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })

  it('rejects departmentId of 0', async () => {
    const db = freshDb()
    const { id } = await createRequest(db)
    const h = makeRequestHandlers(db)
    const res = await h.update({ id, code: 'X', departmentId: 0, createdAt: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })

  it('returns NOT_FOUND for unknown id', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const res = await h.update({ id: 99999, code: 'X', departmentId: deptId, createdAt: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })

  it('updates code, department, date, and notes', async () => {
    const db = freshDb()
    const { id } = await createRequest(db)
    const allDepts = db.select({ id: departments.id }).from(departments).all()
    const newDeptId = allDepts[1].id
    const h = makeRequestHandlers(db)

    const res = await h.update({ id, code: 'UPDATED-002', departmentId: newDeptId, createdAt: '2026-03-15', notes: 'Ghi chú mới' })
    expect(res.ok).toBe(true)

    const row = db.select().from(requests).where(eq(requests.id, id)).all()[0]
    expect(row.code).toBe('UPDATED-002')
    expect(row.departmentId).toBe(newDeptId)
    expect(row.createdAt).toBe('2026-03-15')
    expect(row.notes).toBe('Ghi chú mới')
  })
})

// ── delete ────────────────────────────────────────────────────────────────────
describe('requests.delete', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  it('rejects staff without manage_requests', async () => {
    const db = freshDb()
    // Insert a request to delete while ADMIN, then switch to STAFF for the call
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const ins = db.insert(requests).values({
      code: 'DEL-PERM', departmentId: deptId, employeeId: null,
      createdBy: 1, createdAt: new Date().toISOString(), notes: null,
    }).run()
    const reqId = Number(ins.lastInsertRowid)

    session.current = STAFF_SESSION
    const h = makeRequestHandlers(db)
    const res = await h.delete({ id: reqId })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })

  it('rejects invalid id', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    // @ts-expect-error testing bad input
    const res = await h.delete({ id: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })

  it('returns NOT_FOUND for unknown id', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const res = await h.delete({ id: 99999 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })

  it('deletes request and its allocations, restores unreturned devices to available', async () => {
    const db = freshDb()

    // Find a device with 'available' status from seed
    const availDev = db.select().from(devices).all().find(d => d.status === 'available')
    if (!availDev) throw new Error('no available device in seed')

    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const now = new Date().toISOString()

    // Create request
    const ins = db.insert(requests).values({
      code: 'DEL-001', departmentId: deptId, employeeId: null,
      createdBy: 1, createdAt: now, notes: null,
    }).run()
    const reqId = Number(ins.lastInsertRowid)

    // Mark device as allocated and create allocation
    db.update(devices).set({ status: 'allocated', updatedAt: now })
      .where(eq(devices.id, availDev.id)).run()
    db.insert(allocations).values({
      requestId: reqId, deviceId: availDev.id, employeeId: null,
      departmentId: deptId, issuedBy: 1, issuedAt: now,
    }).run()

    const h = makeRequestHandlers(db)
    const res = await h.delete({ id: reqId })
    expect(res.ok).toBe(true)

    // Request gone
    expect(db.select().from(requests).where(eq(requests.id, reqId)).all()).toHaveLength(0)

    // Allocations gone
    expect(db.select().from(allocations).all().filter(a => a.requestId === reqId)).toHaveLength(0)

    // Device restored to 'available'
    const devRow = db.select().from(devices).where(eq(devices.id, availDev.id)).all()[0]
    expect(devRow?.status).toBe('available')
  })

  it('does not change status of already-returned devices', async () => {
    const db = freshDb()

    const availDev = db.select().from(devices).all().find(d => d.status === 'available')
    if (!availDev) throw new Error('no available device in seed')

    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const now = new Date().toISOString()

    const ins = db.insert(requests).values({
      code: 'DEL-002', departmentId: deptId, employeeId: null,
      createdBy: 1, createdAt: now, notes: null,
    }).run()
    const reqId = Number(ins.lastInsertRowid)

    // Device stays 'available'; allocation is already marked returned
    db.insert(allocations).values({
      requestId: reqId, deviceId: availDev.id, employeeId: null,
      departmentId: deptId, issuedBy: 1, issuedAt: now, returnedAt: now,
    }).run()

    const h = makeRequestHandlers(db)
    await h.delete({ id: reqId })

    // Device status unchanged (still 'available')
    const devRow = db.select().from(devices).where(eq(devices.id, availDev.id)).all()[0]
    expect(devRow?.status).toBe('available')
  })
})

// ── status flow: pending → allocated → completed ─────────────────────────────
describe('requests status flow', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  async function setup() {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const deptId = db.select({ id: departments.id }).from(departments).all()[0].id
    const r = await h.create({ code: 'ST-001', departmentId: deptId, createdAt: null, notes: null })
    if (!r.ok) throw new Error('setup failed')
    return { db, h, reqId: r.data.id }
  }

  it('new request is pending', async () => {
    const { h, reqId } = await setup()
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.status).toBe('pending')
  })

  it('addDevices moves pending → allocated', async () => {
    const { db, h, reqId } = await setup()
    // make a device available
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    const added = await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: 'Nguyễn Văn A' })
    expect(added.ok).toBe(true)
    const got = await h.get({ id: reqId })
    if (got.ok) expect(got.data.status).toBe('allocated')
  })

  it('addDevices requires a borrower name', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    const added = await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: '  ' })
    expect(added.ok).toBe(false)
    if (!added.ok) expect(added.error.code).toBe('BAD_REQUEST')
  })

  it('addDevices stores borrower name as the line recipient', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: 'Trần Thị B' })
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.lines[0].recipient).toBe('Trần Thị B')
  })

  it('updateStatus moves allocated → completed', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: 'Nguyễn Văn A' })
    const upd = await h.updateStatus({ id: reqId, status: 'completed' })
    expect(upd.ok).toBe(true)
    const got = await h.get({ id: reqId })
    if (got.ok) expect(got.data.status).toBe('completed')
  })

  it('updateStatus rejects when request is still pending', async () => {
    const { h, reqId } = await setup()
    const upd = await h.updateStatus({ id: reqId, status: 'completed' })
    expect(upd.ok).toBe(false)
    if (!upd.ok) expect(upd.error.code).toBe('CONFLICT')
  })

  it('addDevices does not overwrite completed', async () => {
    const { db, h, reqId } = await setup()
    const avail = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()
    await h.addDevices({ requestId: reqId, deviceSkus: [avail[0].sku], borrowerName: 'Nguyễn Văn A' })
    await h.updateStatus({ id: reqId, status: 'completed' })
    await h.addDevices({ requestId: reqId, deviceSkus: [avail[1].sku], borrowerName: 'Nguyễn Văn A' })
    const got = await h.get({ id: reqId })
    if (got.ok) expect(got.data.status).toBe('completed')
  })

  it('staff without manage_requests cannot updateStatus', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: 'Nguyễn Văn A' })
    session.current = STAFF_SESSION
    const upd = await h.updateStatus({ id: reqId, status: 'completed' })
    expect(upd.ok).toBe(false)
    if (!upd.ok) expect(upd.error.code).toBe('FORBIDDEN')
  })

  it('stores borrowerName in the column, not in notes', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: 'Trần Thị B' })
    const d = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, dev.sku)).get()
    const alc = db.select().from(allocations)
      .where(and(eq(allocations.deviceId, d!.id), eq(allocations.requestId, reqId)))
      .get()
    expect(alc!.borrowerName).toBe('Trần Thị B')
    expect(alc!.notes).toBeNull()
  })

  it('returns recipient from the borrower_name column', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.status, 'available')).all()[0]
    db.insert(allocations).values({
      requestId: reqId,
      deviceId: dev.id,
      issuedAt: new Date().toISOString(),
      borrowerName: 'Cột Recipient',
      notes: null,
    }).run()
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.lines[0].recipient).toBe('Cột Recipient')
  })

  it('formats the allocation issuedAt as dd/mm/yyyy HH:mm on each line', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.status, 'available')).all()[0]
    const localTime = new Date(2026, 2, 5, 15, 15) // 05/03/2026 15:15, device's local wall clock
    db.insert(allocations).values({
      requestId: reqId,
      deviceId: dev.id,
      issuedAt: localTime.toISOString(),
      borrowerName: 'Nguyễn Văn A',
      notes: null,
    }).run()
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.lines[0].issuedAt).toBe('05/03/2026 15:15')
  })

  it('formats issuedAt using the local device clock across a UTC day boundary', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ id: devices.id }).from(devices).where(eq(devices.status, 'available')).all()[0]
    // 05/03/2026 01:30 local time — in timezones ahead of UTC this instant falls on 04/03 in UTC,
    // so a formatter using UTC getters would report the wrong day entirely.
    const localTime = new Date(2026, 2, 5, 1, 30)
    db.insert(allocations).values({
      requestId: reqId,
      deviceId: dev.id,
      issuedAt: localTime.toISOString(),
      borrowerName: 'Nguyễn Văn A',
      notes: null,
    }).run()
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.lines[0].issuedAt).toBe('05/03/2026 01:30')
  })

  it('get: allReturned is false for a pending request with no devices', async () => {
    const { h, reqId } = await setup()
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.data.allReturned).toBe(false)
  })

  it('get: allReturned is false while a device is still on loan', async () => {
    const { db, h, reqId } = await setup()
    const avail = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()
    await h.addDevices({ requestId: reqId, deviceSkus: [avail[0].sku, avail[1].sku], borrowerName: 'Nguyễn Văn A' })
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) {
      const allocationId = got.data.lines[0].allocationId
      await h.returnDevice({ allocationId, condition: 'Tốt', notes: '' })
      const after = await h.get({ id: reqId })
      if (after.ok) expect(after.data.allReturned).toBe(false)
    }
  })

  it('get: allReturned is true once every device on the request has been returned', async () => {
    const { db, h, reqId } = await setup()
    const avail = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()
    await h.addDevices({ requestId: reqId, deviceSkus: [avail[0].sku, avail[1].sku], borrowerName: 'Nguyễn Văn A' })
    const got = await h.get({ id: reqId })
    expect(got.ok).toBe(true)
    if (got.ok) {
      for (const line of got.data.lines) {
        await h.returnDevice({ allocationId: line.allocationId, condition: 'Tốt', notes: '' })
      }
      const after = await h.get({ id: reqId })
      if (after.ok) expect(after.data.allReturned).toBe(true)
    }
  })

  it('list: allReturned is true once every device on the request has been returned', async () => {
    const { db, h, reqId } = await setup()
    const dev = db.select({ sku: devices.sku }).from(devices).where(eq(devices.status, 'available')).all()[0]
    await h.addDevices({ requestId: reqId, deviceSkus: [dev.sku], borrowerName: 'Nguyễn Văn A' })
    const got = await h.get({ id: reqId })
    if (got.ok) await h.returnDevice({ allocationId: got.data.lines[0].allocationId, condition: 'Tốt', notes: '' })

    const list = await h.list({ query: '' })
    expect(list.ok).toBe(true)
    if (list.ok) {
      const row = list.data.requests.find((r) => r.id === reqId)
      expect(row?.allReturned).toBe(true)
    }
  })
})

// ── availableDevices: thumbnailPath ──────────────────────────────────────────
describe('requests.availableDevices — thumbnailPath', () => {
  beforeEach(() => { session.current = ADMIN_SESSION })

  it('includes the device group thumbnail when the device has a group', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)

    const catId = db.select({ id: categories.id }).from(categories).all()[0].id
    const [group] = db.insert(deviceGroups)
      .values({ name: 'Test Group', categoryId: catId, thumbnailPath: '/tmp/thumb.png', createdAt: new Date().toISOString() })
      .returning({ id: deviceGroups.id })
      .all()

    const avail = db.select({ id: devices.id, sku: devices.sku }).from(devices)
      .where(eq(devices.status, 'available')).all()[0]
    db.update(devices).set({ groupId: group.id }).where(eq(devices.id, avail.id)).run()

    const res = await h.availableDevices()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const row = res.data.devices.find((d) => d.sku === avail.sku)
    expect(row).toBeDefined()
    expect(row!.thumbnailPath).toBe('/tmp/thumb.png')
  })

  it('returns null thumbnailPath when the device has no group', async () => {
    const db = freshDb()
    const h = makeRequestHandlers(db)
    const avail = db.select({ id: devices.id, sku: devices.sku }).from(devices)
      .where(eq(devices.status, 'available')).all()[0]
    db.update(devices).set({ groupId: null }).where(eq(devices.id, avail.id)).run()

    const res = await h.availableDevices()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const row = res.data.devices.find((d) => d.sku === avail.sku)
    expect(row).toBeDefined()
    expect(row!.thumbnailPath).toBeNull()
  })
})
