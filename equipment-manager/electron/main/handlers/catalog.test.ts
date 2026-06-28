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

    const res = await catalog.saveGroup({ name: 'Dell XPS 15', categoryId: catId })
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

    await catalog.saveGroup({ name: 'Original', categoryId: catId })
    const after = await catalog.list()
    if (!after.ok) throw new Error('list failed')
    const group = after.data.groups.find((g) => g.name === 'Original')!

    const res = await catalog.saveGroup({ id: group.id, name: 'Updated', categoryId: catId })
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
    const res = await catalog.saveGroup({ name: '   ', categoryId: catId })
    expect(res.ok).toBe(false)
  })
})

describe('catalog.deleteGroup', () => {
  it('deletes group and detaches devices (sets groupId to null)', async () => {
    const { catalog, devices: devH, db } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error('list failed')
    const catId = cats.data.categories[0].id

    await catalog.saveGroup({ name: 'ToDelete', categoryId: catId })
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

    await catalog.saveGroup({ name: 'BlockerGroup', categoryId: cat.id })
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

describe('catalog.listGroupTemplates', () => {
  it('returns empty array when no templates', async () => {
    const { catalog } = setup()
    const res = await catalog.listGroupTemplates()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.templates).toEqual([])
    }
  })
})

describe('catalog.saveGroupTemplate', () => {
  it('creates a new template and returns it', async () => {
    const { catalog } = setup()
    const res = await catalog.saveGroupTemplate({ name: 'Thương hiệu' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.id).toBeGreaterThan(0)
      expect(res.data.name).toBe('Thương hiệu')
    }
  })

  it('updates an existing template name', async () => {
    const { catalog } = setup()
    const created = await catalog.saveGroupTemplate({ name: 'Cũ' })
    if (!created.ok) throw new Error('create failed')
    const updated = await catalog.saveGroupTemplate({ id: created.data.id, name: 'Mới' })
    expect(updated.ok).toBe(true)
    const list = await catalog.listGroupTemplates()
    if (list.ok) {
      expect(list.data.templates.find(t => t.name === 'Mới')).toBeDefined()
      expect(list.data.templates.find(t => t.name === 'Cũ')).toBeUndefined()
    }
  })

  it('rejects empty name', async () => {
    const { catalog } = setup()
    const res = await catalog.saveGroupTemplate({ name: '   ' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_REQUEST')
  })
})

describe('catalog.deleteGroupTemplate', () => {
  it('deletes template and cascades to field values', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id

    await catalog.saveGroup({ name: 'G1', categoryId: catId })
    const listAfter = await catalog.list()
    if (!listAfter.ok) throw new Error()
    const group = listAfter.data.groups.find(g => g.name === 'G1')!

    const tmpl = await catalog.saveGroupTemplate({ name: 'Hãng' })
    if (!tmpl.ok) throw new Error()

    // Save a value
    await catalog.saveGroupDetail({ groupId: group.id, thumbnailSourcePath: null, fields: [{ templateId: tmpl.data.id, value: 'Dell' }] })

    // Delete template
    const del = await catalog.deleteGroupTemplate({ id: tmpl.data.id })
    expect(del.ok).toBe(true)

    // Detail should have no fields
    const detail = await catalog.getGroupDetail({ groupId: group.id })
    if (detail.ok) expect(detail.data.fields).toHaveLength(0)
  })
})

describe('catalog.getGroupDetail', () => {
  it('returns null thumbnail and empty fields for new group', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id
    await catalog.saveGroup({ name: 'G2', categoryId: catId })
    const groups = await catalog.list()
    if (!groups.ok) throw new Error()
    const group = groups.data.groups.find(g => g.name === 'G2')!

    const res = await catalog.getGroupDetail({ groupId: group.id })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.thumbnailPath).toBeNull()
      expect(res.data.fields).toEqual([])
    }
  })

  it('returns NOT_FOUND for unknown group', async () => {
    const { catalog } = setup()
    const res = await catalog.getGroupDetail({ groupId: 99999 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })
})

describe('catalog.saveGroupDetail', () => {
  it('upserts field values for a group', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id
    await catalog.saveGroup({ name: 'G3', categoryId: catId })
    const groups = await catalog.list()
    if (!groups.ok) throw new Error()
    const group = groups.data.groups.find(g => g.name === 'G3')!

    const tmpl = await catalog.saveGroupTemplate({ name: 'Bảo hành' })
    if (!tmpl.ok) throw new Error()

    const res = await catalog.saveGroupDetail({
      groupId: group.id,
      thumbnailSourcePath: null,
      fields: [{ templateId: tmpl.data.id, value: '2 năm' }],
    })
    expect(res.ok).toBe(true)

    const detail = await catalog.getGroupDetail({ groupId: group.id })
    if (detail.ok) {
      const field = detail.data.fields.find(f => f.templateId === tmpl.data.id)
      expect(field?.value).toBe('2 năm')
    }
  })

  it('overwrites existing value on second call', async () => {
    const { catalog } = setup()
    const cats = await catalog.list()
    if (!cats.ok) throw new Error()
    const catId = cats.data.categories[0].id
    await catalog.saveGroup({ name: 'G4', categoryId: catId })
    const groups = await catalog.list()
    if (!groups.ok) throw new Error()
    const group = groups.data.groups.find(g => g.name === 'G4')!

    const tmpl = await catalog.saveGroupTemplate({ name: 'Model' })
    if (!tmpl.ok) throw new Error()

    await catalog.saveGroupDetail({ groupId: group.id, thumbnailSourcePath: null, fields: [{ templateId: tmpl.data.id, value: 'v1' }] })
    await catalog.saveGroupDetail({ groupId: group.id, thumbnailSourcePath: null, fields: [{ templateId: tmpl.data.id, value: 'v2' }] })

    const detail = await catalog.getGroupDetail({ groupId: group.id })
    if (detail.ok) {
      expect(detail.data.fields.find(f => f.templateId === tmpl.data.id)?.value).toBe('v2')
    }
  })
})
