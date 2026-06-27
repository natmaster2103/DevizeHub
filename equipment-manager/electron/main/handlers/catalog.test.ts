import { describe, it, expect } from 'vitest'
import { createDb } from '../db'
import { runMigrations } from '../db/migrate'
import { seedIfEmpty } from '../db/seed'
import { session } from '../session'
import { ALL_PERMISSIONS } from '@shared/ipc'
import { makeCatalogHandlers } from './catalog'
import { makeDeviceHandlers } from './devices'

function setup() {
  const { db } = createDb(':memory:')
  runMigrations(db); seedIfEmpty(db)
  session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
  return { catalog: makeCatalogHandlers(db), devices: makeDeviceHandlers(db), db }
}

describe('catalog.list', () => {
  it('returns groups array (empty after seed)', async () => {
    const { catalog } = setup()
    const res = await catalog.list()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(Array.isArray(res.data.groups)).toBe(true)
    }
  })
})

describe('catalog.saveGroup', () => {
  it('creates a new group under a category', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id

    const res = await catalog.saveGroup({ name: 'Dell XPS 15', categoryId: catId, minStock: 0 })
    expect(res.ok).toBe(true)

    const after = await catalog.list()
    if (!after.ok) throw new Error('list failed')
    const group = after.data.groups.find((g) => g.name === 'Dell XPS 15')
    expect(group).toBeDefined()
    expect(group?.categoryId).toBe(catId)
  })

  it('updates an existing group name', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id

    await catalog.saveGroup({ name: 'Original', categoryId: catId, minStock: 0 })
    const after = await catalog.list()
    if (!after.ok) throw new Error('list failed')
    const group = after.data.groups.find((g) => g.name === 'Original')!

    const res = await catalog.saveGroup({ id: group.id, name: 'Updated', categoryId: catId, minStock: 0 })
    expect(res.ok).toBe(true)

    const final = await catalog.list()
    if (!final.ok) throw new Error('list failed')
    expect(final.data.groups.find((g) => g.name === 'Updated')).toBeDefined()
    expect(final.data.groups.find((g) => g.name === 'Original')).toBeUndefined()
  })

  it('rejects empty name', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id
    const res = await catalog.saveGroup({ name: '   ', categoryId: catId, minStock: 0 })
    expect(res.ok).toBe(false)
  })
})

describe('catalog.deleteGroup', () => {
  it('deletes group and detaches devices (sets groupId to null)', async () => {
    const { catalog, devices: devH, db } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id

    await catalog.saveGroup({ name: 'ToDelete', categoryId: catId, minStock: 0 })
    const after = await catalog.list()
    if (!after.ok) throw new Error('list failed')
    const group = after.data.groups.find((g) => g.name === 'ToDelete')!

    // Assign a device to this group
    const devList = await devH.list({ filter: 'all', query: '' })
    if (!devList.ok) throw new Error('list failed')
    const sku = devList.data.devices[0].sku
    await devH.update({ sku, name: devList.data.devices[0].name, categoryId: catId, serialNumber: null, notes: null, groupId: group.id })

    // Delete the group
    const delRes = await catalog.deleteGroup({ id: group.id })
    expect(delRes.ok).toBe(true)

    // Device should have groupId = null
    const devAfter = await devH.list({ filter: 'all', query: '' })
    if (!devAfter.ok) throw new Error('list failed')
    const dev = devAfter.data.devices.find((d) => d.sku === sku)
    expect(dev?.groupId).toBeNull()
  })
})

describe('catalog.deleteCategory', () => {
  it('blocks deletion when category has groups', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const cat = cats.data.categories[0]

    await catalog.saveGroup({ name: 'BlockerGroup', categoryId: cat.id, minStock: 0 })
    const res = await catalog.deleteCategory({ id: cat.id })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('CONFLICT')
  })

  it('allows deletion when category has no groups', async () => {
    const { catalog } = setup()
    // Add a fresh category with no groups
    const saved = await catalog.saveCategory({ name: 'EmptyCat', minStock: 0 })
    if (!saved.ok) throw new Error('save failed')
    const res = await catalog.deleteCategory({ id: saved.data.id })
    expect(res.ok).toBe(true)
  })
})

describe('catalog.saveGroup — minStock', () => {
  function setup() {
    const { db } = createDb(':memory:')
    runMigrations(db)
    seedIfEmpty(db)
    session.current = { id: 1, username: 'admin', role: 'admin', displayName: 'Admin', permissions: ALL_PERMISSIONS, groupIds: [] }
    return makeCatalogHandlers(db)
  }

  it('creates a group with minStock and list returns it', async () => {
    const h = setup()
    // Need a category id — get one from list
    const listRes = await h.list()
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    const catId = listRes.data.categories[0].id

    await h.saveGroup({ name: 'Test Group', categoryId: catId, minStock: 3 })
    const res2 = await h.list()
    if (!res2.ok) return
    const grp = res2.data.groups.find((g) => g.name === 'Test Group')
    expect(grp).toBeDefined()
    expect(grp?.minStock).toBe(3)
  })

  it('updates minStock on existing group', async () => {
    const h = setup()
    const listRes = await h.list()
    if (!listRes.ok) return
    const catId = listRes.data.categories[0].id

    await h.saveGroup({ name: 'Grp A', categoryId: catId, minStock: 2 })
    const mid = await h.list()
    if (!mid.ok) return
    const grp = mid.data.groups.find((g) => g.name === 'Grp A')!

    await h.saveGroup({ id: grp.id, name: 'Grp A', categoryId: catId, minStock: 7 })
    const final = await h.list()
    if (!final.ok) return
    expect(final.data.groups.find((g) => g.id === grp.id)?.minStock).toBe(7)
  })
})
