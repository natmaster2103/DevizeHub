import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeRequestHandlers } from './requests'
import { session } from '../session'
import { departments } from '../db/schema'
import { ALL_PERMISSIONS } from '@shared/ipc'

describe('requests.create', () => {
  it('creates a new request with valid args', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }

    const deptId = db.select({ id: departments.id }).from(departments).all()[0]?.id ?? 1
    const handlers = makeRequestHandlers(db)
    const res = await handlers.create({ code: 'TEST-001', departmentId: deptId, createdAt: null, notes: null })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.code).toBe('TEST-001')
      expect(typeof res.data.id).toBe('number')
    }
    session.current = null
  })

  it('rejects empty code', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
    const handlers = makeRequestHandlers(db)
    const res = await handlers.create({ code: '  ', departmentId: 1, createdAt: null, notes: null })
    expect(res.ok).toBe(false)
    session.current = null
  })

  it('rejects duplicate code', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }

    const deptId = db.select({ id: departments.id }).from(departments).all()[0]?.id ?? 1
    const handlers = makeRequestHandlers(db)
    await handlers.create({ code: 'DUP-001', departmentId: deptId, createdAt: null, notes: null })
    const res = await handlers.create({ code: 'DUP-001', departmentId: deptId, createdAt: null, notes: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('CONFLICT')
    session.current = null
  })
})

describe('requests.list — status derivation', () => {
  it('returns pending for a newly created request with no devices', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }

    const deptId = db.select({ id: departments.id }).from(departments).all()[0]?.id ?? 1
    const handlers = makeRequestHandlers(db)
    await handlers.create({ code: 'NEW-001', departmentId: deptId, createdAt: null, notes: null })

    const res = await handlers.list({ query: 'NEW-001' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const req = res.data.requests.find(r => r.code === 'NEW-001')
      expect(req).toBeDefined()
      expect(req?.status).toBe('pending')
    }
    session.current = null
  })
})
