import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeRequestHandlers } from './requests'
import { session } from '../session'
import { departments, requests, devices, allocations } from '../db/schema'
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
