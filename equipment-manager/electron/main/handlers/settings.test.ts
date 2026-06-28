import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeSettingsHandlers } from './settings'
import { session } from '../session'
import { devices, appUsers, departments } from '../db/schema'
import { ALL_PERMISSIONS } from '@shared/ipc'

function freshDb() {
  const { db } = createDb(':memory:')
  runMigrations(db)
  seedIfEmpty(db)
  return db
}

describe('settings.resetData', () => {
  beforeEach(() => {
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
  })

  it('wipes existing data and reseeds from seed.ts', () => {
    const db = freshDb()
    // Mutate the DB away from the seeded baseline (FK-safe insert).
    db.insert(departments).values({ name: 'Đội Tạm', createdAt: '2026-06-01T00:00:00.000Z' }).run()
    expect(db.select().from(departments).all().length).toBe(5)

    const h = makeSettingsHandlers(db, ':memory:')
    const res = h.resetData()

    expect(res.ok).toBe(true)
    // Back to the seeded baseline — extra department gone, seed data restored.
    expect(db.select().from(departments).all().length).toBe(4)
    expect(db.select().from(devices).all().length).toBe(12)
    expect(db.select().from(appUsers).all().length).toBe(4)
  })

  it('does not duplicate rows when data is already at baseline', () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    h.resetData()
    expect(db.select().from(devices).all().length).toBe(12)
  })

  it('rejects callers without reset_data permission', () => {
    const db = freshDb()
    session.current = { id: 2, username: 'staff', role: 'staff', displayName: 'Staff', permissions: [], groupIds: [] }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = h.resetData()
    expect(res.ok).toBe(false)
    // Data untouched.
    expect(db.select().from(devices).all().length).toBe(12)
  })
})

describe('settings.listUsers — includes permissions', () => {
  beforeEach(() => {
    session.current = {
      id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
      permissions: ALL_PERMISSIONS, groupIds: [],
    }
  })

  it('returns permissions for each user', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    const res = await h.listUsers()
    expect(res.ok).toBe(true)
    if (res.ok) {
      const admin = res.data.find((u) => u.username === 'admin')
      expect(admin?.permissions).toContain('allocate')
      const staff = res.data.find((u) => u.username === 'hang.le')
      expect(staff?.permissions).toEqual(['view_reports'])
    }
  })
})

describe('settings.saveUserPermissions', () => {
  beforeEach(() => {
    session.current = {
      id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
      permissions: ALL_PERMISSIONS, groupIds: [],
    }
  })

  it('replaces all permissions for a user', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    // Get staff user id
    const listRes = await h.listUsers()
    if (!listRes.ok) return
    const staff = listRes.data.find((u) => u.role === 'staff' && u.active)!

    const res = await h.saveUserPermissions({ userId: staff.id, permissions: ['allocate', 'return_device'] })
    expect(res.ok).toBe(true)

    const updated = await h.listUsers()
    if (!updated.ok) return
    const u = updated.data.find((x) => x.id === staff.id)
    expect(u?.permissions).toEqual(expect.arrayContaining(['allocate', 'return_device']))
    expect(u?.permissions).not.toContain('view_reports')
  })

  it('rejects caller without manage_users permission', async () => {
    const db = freshDb()
    session.current = { id: 2, username: 'staff', role: 'staff', displayName: 'Staff', permissions: [], groupIds: [] }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = await h.saveUserPermissions({ userId: 1, permissions: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })

  it('allows an admin-role caller even with no explicit permission rows', async () => {
    // Repro for DBs seeded before the user_permissions table existed: the
    // admin has role 'admin' but no permission rows, so its session perms are [].
    const db = freshDb()
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: [], groupIds: [] }
    const h = makeSettingsHandlers(db, ':memory:')
    const listRes = await h.listUsers()
    if (!listRes.ok) return
    const staff = listRes.data.find((u) => u.role === 'staff' && u.active)!
    const res = await h.saveUserPermissions({ userId: staff.id, permissions: ['allocate'] })
    expect(res.ok).toBe(true)
  })
})

describe('settings.saveUserGroups', () => {
  beforeEach(() => {
    session.current = {
      id: 1, username: 'admin', role: 'admin', displayName: 'Admin',
      permissions: ALL_PERMISSIONS, groupIds: [],
    }
  })

  it('assigns groups to a user and replaces on re-save', async () => {
    const db = freshDb()
    const h = makeSettingsHandlers(db, ':memory:')
    const listRes = await h.listUsers()
    if (!listRes.ok) return
    const staff = listRes.data.find((u) => u.role === 'staff' && u.active)!

    // Need a real group id — create one via catalog handler
    const { makeCatalogHandlers } = await import('./catalog')
    const catalogH = makeCatalogHandlers(db)
    const catList = await catalogH.list()
    if (!catList.ok) return
    const catId = catList.data.categories[0].id
    await catalogH.saveGroup({ name: 'Test Grp', categoryId: catId })
    const updated = await catalogH.list()
    if (!updated.ok) return
    const grpId = updated.data.groups.find((g) => g.name === 'Test Grp')!.id

    const res = await h.saveUserGroups({ userId: staff.id, groupIds: [grpId] })
    expect(res.ok).toBe(true)

    const u2 = await h.listUsers()
    if (!u2.ok) return
    expect(u2.data.find((x) => x.id === staff.id)?.groupIds).toContain(grpId)
  })
})

describe('settings.resetData — permission check', () => {
  it('rejects caller without reset_data permission', () => {
    const db = freshDb()
    session.current = {
      id: 2, username: 'staff', role: 'staff', displayName: 'Staff',
      permissions: ['view_reports'], groupIds: [],
    }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = h.resetData()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN')
  })

  it('allows caller with reset_data permission regardless of role', () => {
    const db = freshDb()
    session.current = {
      id: 2, username: 'staff', role: 'staff', displayName: 'Staff',
      permissions: ['reset_data'], groupIds: [],
    }
    const h = makeSettingsHandlers(db, ':memory:')
    const res = h.resetData()
    expect(res.ok).toBe(true)
  })
})
