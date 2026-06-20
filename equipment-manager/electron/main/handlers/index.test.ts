import { describe, it, expect, vi } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { registerHandlers } from './index'
import { CHANNELS } from '@shared/ipc'

describe('registerHandlers', () => {
  it('registers a handler for every channel', () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const handlers = new Map<string, Function>()
    const ipcMain = { handle: (ch: string, fn: Function) => handlers.set(ch, fn) }
    registerHandlers(ipcMain as any, db)
    for (const ch of Object.values(CHANNELS)) {
      expect(handlers.has(ch)).toBe(true)
    }
  })

  it('dispatches devices.list through the registered handler', async () => {
    const { db } = createDb(':memory:')
    runMigrations(db); seedIfEmpty(db)
    const handlers = new Map<string, Function>()
    const ipcMain = { handle: (ch: string, fn: Function) => handlers.set(ch, fn) }
    registerHandlers(ipcMain as any, db)
    const res = await handlers.get(CHANNELS.devicesList)!({}, { filter: 'all', query: '' })
    expect(res.ok).toBe(true)
  })
})
