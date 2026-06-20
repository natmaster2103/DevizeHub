import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { createDb } from './index'
import { runMigrations } from './migrate'
import { seedIfEmpty } from './seed'
import { appUsers, devices, departments } from './schema'
import { eq } from 'drizzle-orm'

function freshSeededDb() {
  const { db } = createDb(':memory:')
  runMigrations(db)
  seedIfEmpty(db)
  return db
}

describe('seedIfEmpty', () => {
  it('seeds the admin user with a working bcrypt password', () => {
    const db = freshSeededDb()
    const admin = db.select().from(appUsers).where(eq(appUsers.username, 'admin')).all()[0]
    expect(admin).toBeTruthy()
    expect(admin.role).toBe('admin')
    expect(bcrypt.compareSync('admin', admin.passwordHash)).toBe(true)
  })

  it('seeds 12 devices with English status enums', () => {
    const db = freshSeededDb()
    const all = db.select().from(devices).all()
    expect(all.length).toBe(12)
    const statuses = new Set(all.map((d) => d.status))
    for (const s of statuses) {
      expect(['available','allocated','maintenance','broken','decommissioned']).toContain(s)
    }
  })

  it('seeds 7 departments', () => {
    const db = freshSeededDb()
    expect(db.select().from(departments).all().length).toBe(7)
  })

  it('does not double-seed when called twice', () => {
    const { db } = createDb(':memory:')
    runMigrations(db)
    seedIfEmpty(db)
    seedIfEmpty(db)
    expect(db.select().from(devices).all().length).toBe(12)
  })
})
