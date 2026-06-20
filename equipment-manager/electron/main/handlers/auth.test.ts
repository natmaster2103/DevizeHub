import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { makeAuthHandlers } from './auth'
import { session } from '../session'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db)
  seedIfEmpty(db)
  return makeAuthHandlers(db)
}

describe('auth handlers', () => {
  beforeEach(() => { session.current = null })

  it('logs in admin/admin and sets session', async () => {
    const h = setup()
    const res = await h.login({ username: 'admin', password: 'admin' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.user.role).toBe('admin')
    expect(session.current?.username).toBe('admin')
  })

  it('rejects wrong password without leaking which field', async () => {
    const h = setup()
    const res = await h.login({ username: 'admin', password: 'nope' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.message).toBe('Tên đăng nhập hoặc mật khẩu không đúng.')
    expect(session.current).toBeNull()
  })

  it('rejects an inactive user', async () => {
    const h = setup()
    const res = await h.login({ username: 'lan.do', password: 'admin' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_CREDENTIALS')
  })

  it('me() returns the current session and logout clears it', async () => {
    const h = setup()
    await h.login({ username: 'admin', password: 'admin' })
    const me = await h.me()
    expect(me.ok && me.data?.username).toBe('admin')
    await h.logout()
    expect(session.current).toBeNull()
  })
})
