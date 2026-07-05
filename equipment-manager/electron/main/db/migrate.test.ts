import { describe, it, expect } from 'vitest'
import { createDb } from './index'
import { runMigrations } from './migrate'

describe('runMigrations', () => {
  it('creates all tables in a fresh in-memory db', () => {
    const { db, sqlite } = createDb(':memory:')
    runMigrations(db)
    const rows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const names = rows.map((r) => r.name)
    for (const t of ['categories','departments','employees','app_users','devices','requests','allocations','maintenance_logs','app_config']) {
      expect(names).toContain(t)
    }
  })

  it('is idempotent (second run does not throw)', () => {
    const { db } = createDb(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })
})
