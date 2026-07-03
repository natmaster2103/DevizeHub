import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { createDb } from './index'
import { runMigrations } from './migrate'
import { seedIfEmpty } from './seed'
import { appUsers, devices, departments, requests } from './schema'
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

  it('seeds 4 default departments (Đội 1–4)', () => {
    const db = freshSeededDb()
    const rows = db.select().from(departments).all()
    expect(rows.length).toBe(4)
    expect(rows.map((d) => d.name).sort()).toEqual(['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4'])
  })

  it('does not double-seed when called twice', () => {
    const { db } = createDb(':memory:')
    runMigrations(db)
    seedIfEmpty(db)
    seedIfEmpty(db)
    expect(db.select().from(devices).all().length).toBe(12)
  })

  it('sets a real requests.status per seeded request, not just the schema default', () => {
    const db = freshSeededDb()
    const byCode = new Map(
      db.select({ code: requests.code, status: requests.status }).from(requests).all()
        .map((r) => [r.code, r.status]),
    )
    expect(byCode.get('DX-301')).toBe('allocated')
    expect(byCode.get('DX-300')).toBe('allocated')
    expect(byCode.get('DX-298')).toBe('completed')
    expect(byCode.get('DX-295')).toBe('completed')
    expect(byCode.get('DX-293')).toBe('pending')
    expect(byCode.get('DX-290')).toBe('completed')
  })
})
