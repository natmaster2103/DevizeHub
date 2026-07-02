import { eq, isNull, and } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import * as XLSX from 'xlsx'
import type { AppDb } from '../db'
import { requirePermission } from './settings'
import {
  devices,
  categories,
  allocations,
  employees,
  departments,
  maintenanceLogs,
  deviceGroups,
  appUsers,
} from '../db/schema'
import type {
  ApiResponse,
  DeviceListArgs,
  DeviceListResult,
  DeviceGetArgs,
  DeviceDetailResult,
  DeviceRow,
  StatusCount,
  DeviceHistoryEntry,
  DeviceInfoField,
  DeviceStatus,
  DeviceCreateArgs,
  DeviceUpdateArgs,
  DeviceChangeStatusArgs,
  DeviceDeleteArgs,
  DownloadTemplateResult,
  PreviewImportArgs,
  PreviewImportResult,
  PreviewRow,
  ImportBatchArgs,
  ImportBatchResult,
} from '@shared/ipc'

const STATUS_KEYS: Array<'all' | DeviceStatus> = [
  'all',
  'available',
  'allocated',
  'maintenance',
  'broken',
  'decommissioned',
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mi}`
}

function parseBorrowerName(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/^Người mượn:\s*(.+)/)
  return match ? match[1].trim() : null
}

export function makeDeviceHandlers(db: AppDb) {
  return {
    async list(args: DeviceListArgs): Promise<ApiResponse<DeviceListResult>> {
      // Fetch all devices with category
      const devRows = db
        .select({
          id: devices.id,
          sku: devices.sku,
          name: devices.name,
          status: devices.status,
          serialNumber: devices.serialNumber,
          categoryId: devices.categoryId,
          categoryName: categories.name,
          notes: devices.notes,
          groupId: devices.groupId,
          groupName: deviceGroups.name,
        })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))
        .all()

      // Fetch active allocations (returnedAt IS NULL) with employee + department
      const activeAllocs = db
        .select({
          allocationId: allocations.id,
          deviceId: allocations.deviceId,
          holderName: employees.name,
          deptName: departments.name,
          borrowerName: allocations.borrowerName,
          notes: allocations.notes,
        })
        .from(allocations)
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .where(isNull(allocations.returnedAt))
        .all()

      // Index active alloc by deviceId (one active alloc per device at most)
      const activeByDeviceId = new Map(activeAllocs.map((a) => [a.deviceId, a]))

      // Shape into DeviceRow
      let deviceRows: DeviceRow[] = devRows.map((r) => {
        const alloc = activeByDeviceId.get(r.id)
        return {
          sku: r.sku,
          name: r.name,
          category: r.categoryName ?? '',
          categoryId: r.categoryId ?? null,
          status: r.status as DeviceStatus,
          serialNumber: r.serialNumber ?? null,
          notes: r.notes ?? null,
          holder: alloc?.borrowerName ?? alloc?.holderName ?? parseBorrowerName(alloc?.notes ?? null),
          department: alloc?.deptName ?? null,
          activeAllocationId: alloc?.allocationId ?? null,
          group: r.groupName ?? null,
          groupId: r.groupId ?? null,
        }
      })

      // Apply categoryId filter FIRST so counts are scoped to the selected category
      if (args.categoryId != null) {
        deviceRows = deviceRows.filter((d) => d.categoryId === args.categoryId)
      }

      // Apply groupId filter within the category scope; also affects counts
      if (args.groupId != null) {
        deviceRows = deviceRows.filter((d) => d.groupId === args.groupId)
      }

      // Build counts over category-scoped set (not affected by status filter or search query)
      const counts: StatusCount[] = STATUS_KEYS.map((key) => ({
        key,
        count: key === 'all' ? deviceRows.length : deviceRows.filter((d) => d.status === key).length,
      }))

      // Apply filter
      if (args.filter !== 'all') {
        deviceRows = deviceRows.filter((d) => d.status === args.filter)
      }

      // Apply query (case-insensitive)
      if ((args.query ?? '').trim()) {
        const q = (args.query ?? '').toLowerCase()
        deviceRows = deviceRows.filter(
          (d) =>
            d.sku.toLowerCase().includes(q) ||
            d.name.toLowerCase().includes(q) ||
            (d.holder ?? '').toLowerCase().includes(q) ||
            (d.department ?? '').toLowerCase().includes(q) ||
            (d.serialNumber ?? '').toLowerCase().includes(q),
        )
      }

      const total = deviceRows.length
      const page = args.page ?? 1
      const pageSize = args.pageSize ?? 20
      const paged = deviceRows.slice((page - 1) * pageSize, page * pageSize)

      return {
        ok: true,
        data: { devices: paged, counts, total },
      }
    },

    async get(args: DeviceGetArgs): Promise<ApiResponse<DeviceDetailResult>> {
      if (!args?.sku || typeof args.sku !== 'string') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'SKU không hợp lệ.' } }
      }
      // Fetch device + category
      const deviceRow = db
        .select({
          id: devices.id,
          sku: devices.sku,
          name: devices.name,
          status: devices.status,
          serialNumber: devices.serialNumber,
          categoryId: devices.categoryId,
          categoryName: categories.name,
          notes: devices.notes,
          createdAt: devices.createdAt,
          groupId: devices.groupId,
          groupName: deviceGroups.name,
        })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))
        .where(eq(devices.sku, args.sku))
        .all()[0]

      if (!deviceRow) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' },
        }
      }

      // Active allocation (returnedAt IS NULL)
      const activeAlloc = db
        .select({
          allocationId: allocations.id,
          holderName: employees.name,
          deptName: departments.name,
          borrowerName: allocations.borrowerName,
          notes: allocations.notes,
        })
        .from(allocations)
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .where(and(eq(allocations.deviceId, deviceRow.id), isNull(allocations.returnedAt)))
        .all()[0]

      const holderName = activeAlloc?.borrowerName ?? activeAlloc?.holderName ?? parseBorrowerName(activeAlloc?.notes ?? null)
      const deptName = activeAlloc?.deptName ?? null

      const deviceRowOut: DeviceDetailResult['device'] = {
        sku: deviceRow.sku,
        name: deviceRow.name,
        category: deviceRow.categoryName ?? '',
        categoryId: deviceRow.categoryId ?? null,
        status: deviceRow.status as DeviceStatus,
        serialNumber: deviceRow.serialNumber ?? null,
        holder: holderName,
        department: deptName,
        notes: deviceRow.notes ?? null,
        activeAllocationId: activeAlloc?.allocationId ?? null,
        group: deviceRow.groupName ?? null,
        groupId: deviceRow.groupId ?? null,
      }

      // Build info fields
      const info: DeviceInfoField[] = [
        { key: 'SKU', value: deviceRow.sku },
        { key: 'Tên', value: deviceRow.name },
        { key: 'Loại', value: deviceRow.categoryName ?? '' },
        { key: 'Serial', value: deviceRow.serialNumber ?? '' },
        { key: 'Trạng thái', value: deviceRow.status, isStatus: true },
        { key: 'Phòng', value: deptName ?? '' },
        { key: 'Người dùng', value: holderName ?? '' },
        { key: 'Ghi chú', value: deviceRow.notes ?? '' },
      ]

      // Build history from allocations
      const issuer = alias(appUsers, 'issuer')
      const returner = alias(appUsers, 'returner')
      const allocRows = db
        .select({
          issuedAt: allocations.issuedAt,
          returnedAt: allocations.returnedAt,
          holderName: employees.name,
          deptName: departments.name,
          borrowerName: allocations.borrowerName,
          notes: allocations.notes,
          issuerName: issuer.displayName,
          returnerName: returner.displayName,
          dueDate: allocations.dueDate,
          conditionOut: allocations.conditionOut,
          conditionIn: allocations.conditionIn,
        })
        .from(allocations)
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .leftJoin(issuer, eq(allocations.issuedBy, issuer.id))
        .leftJoin(returner, eq(allocations.returnedBy, returner.id))
        .where(and(eq(allocations.deviceId, deviceRow.id)))
        .all()

      const historyEntries: DeviceHistoryEntry[] = []

      for (const a of allocRows) {
        const name = a.borrowerName ?? a.holderName ?? parseBorrowerName(a.notes) ?? 'Người dùng'
        const allocDetail: DeviceHistoryEntry['detail'] = []
        if (a.deptName) allocDetail.push({ label: 'Phòng ban', value: a.deptName })
        if (a.dueDate) allocDetail.push({ label: 'Hạn trả', value: fmtDate(a.dueDate) })
        if (a.conditionOut) allocDetail.push({ label: 'Tình trạng', value: a.conditionOut })
        historyEntries.push({
          type: 'allocate',
          title: 'Bàn giao',
          date: fmtDate(a.issuedAt),
          time: fmtTime(a.issuedAt),
          flow: { from: a.issuerName ?? 'Kho', to: name },
          detail: allocDetail,
        })
        if (a.returnedAt) {
          const retDetail: DeviceHistoryEntry['detail'] = []
          if (a.deptName) retDetail.push({ label: 'Phòng ban', value: a.deptName })
          if (a.conditionIn) retDetail.push({ label: 'Tình trạng', value: a.conditionIn })
          historyEntries.push({
            type: 'return',
            title: 'Thu hồi',
            date: fmtDate(a.returnedAt),
            time: fmtTime(a.returnedAt),
            flow: { from: name, to: a.returnerName ?? 'Kho' },
            detail: retDetail,
          })
        }
      }

      // Build history from maintenance_logs
      const maintRows = db
        .select()
        .from(maintenanceLogs)
        .where(and(eq(maintenanceLogs.deviceId, deviceRow.id)))
        .all()

      for (const m of maintRows) {
        const maintDetail: DeviceHistoryEntry['detail'] = []
        if (m.description) maintDetail.push({ label: 'Nội dung', value: m.description })
        if (m.performedBy) maintDetail.push({ label: 'Người thực hiện', value: m.performedBy })
        if (m.completedAt) maintDetail.push({ label: 'Hoàn tất', value: `${fmtDate(m.completedAt)} ${fmtTime(m.completedAt)}` })
        historyEntries.push({
          type: 'maintenance',
          title: 'Bảo trì',
          date: fmtDate(m.startedAt),
          time: fmtTime(m.startedAt),
          detail: maintDetail,
        })
      }

      // Create entry
      historyEntries.push({
        type: 'create',
        title: 'Nhập kho',
        date: fmtDate(deviceRow.createdAt),
        time: fmtTime(deviceRow.createdAt),
        detail: [{ label: 'Thiết bị', value: deviceRow.name }],
      })

      // Sort desc by date string (DD/MM/YYYY → need to parse for sort)
      historyEntries.sort((a, b) => {
        const toSortKey = (d: string) => {
          const [dd, mm, yyyy] = d.split('/')
          return `${yyyy}${mm}${dd}`
        }
        return toSortKey(b.date).localeCompare(toSortKey(a.date))
      })

      return {
        ok: true,
        data: { device: deviceRowOut, info, history: historyEntries },
      }
    },

    async create(args: DeviceCreateArgs): Promise<ApiResponse<{ sku: string }>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
      if (!args?.sku?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'SKU không được để trống.' } }
      }
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên thiết bị không được để trống.' } }
      }
      const existing = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku.trim())).all()[0]
      if (existing) {
        return { ok: false, error: { code: 'CONFLICT', message: `SKU "${args.sku.trim()}" đã tồn tại.` } }
      }
      // Auto-clear groupId if the group belongs to a different category
      let resolvedGroupId: number | null = args.groupId ?? null
      if (resolvedGroupId != null) {
        const grp = db.select({ categoryId: deviceGroups.categoryId })
          .from(deviceGroups)
          .where(eq(deviceGroups.id, resolvedGroupId))
          .all()[0]
        if (!grp || grp.categoryId !== args.categoryId) {
          resolvedGroupId = null
        }
      }

      const now = new Date().toISOString()
      db.insert(devices).values({
        sku: args.sku.trim(),
        name: args.name.trim(),
        categoryId: args.categoryId ?? null,
        serialNumber: args.serialNumber?.trim() || null,
        status: 'available',
        notes: args.notes?.trim() || null,
        groupId: resolvedGroupId,
        createdAt: now,
        updatedAt: now,
      }).run()
      return { ok: true, data: { sku: args.sku.trim() } }
    },

    async update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên thiết bị không được để trống.' } }
      }
      const device = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku)).all()[0]
      if (!device) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
      }

      // Auto-clear groupId if the group belongs to a different category
      let resolvedGroupId: number | null = args.groupId ?? null
      if (resolvedGroupId != null) {
        const grp = db.select({ categoryId: deviceGroups.categoryId })
          .from(deviceGroups)
          .where(eq(deviceGroups.id, resolvedGroupId))
          .all()[0]
        if (!grp || grp.categoryId !== args.categoryId) {
          resolvedGroupId = null
        }
      }

      db.update(devices)
        .set({
          name: args.name.trim(),
          categoryId: args.categoryId ?? null,
          serialNumber: args.serialNumber?.trim() || null,
          notes: args.notes?.trim() || null,
          groupId: resolvedGroupId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(devices.sku, args.sku))
        .run()
      return { ok: true, data: { ok: true } }
    },

    async changeStatus(args: DeviceChangeStatusArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('change_status')
      if (forbidden) return forbidden
      const allowed: string[] = ['available', 'maintenance', 'broken', 'decommissioned']
      if (!allowed.includes(args.status)) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Không thể đổi sang trạng thái này thủ công.' } }
      }
      const device = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku)).all()[0]
      if (!device) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
      }
      const activeAlloc = db.select({ id: allocations.id })
        .from(allocations)
        .where(and(eq(allocations.deviceId, device.id), isNull(allocations.returnedAt)))
        .all()[0]
      if (activeAlloc) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: 'Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi đổi trạng thái.' },
        }
      }
      db.update(devices)
        .set({ status: args.status, updatedAt: new Date().toISOString() })
        .where(eq(devices.sku, args.sku))
        .run()
      return { ok: true, data: { ok: true } }
    },

    async delete(args: DeviceDeleteArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('delete_device')
      if (forbidden) return forbidden
      const device = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku)).all()[0]
      if (!device) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
      }
      const activeAlloc = db.select({ id: allocations.id })
        .from(allocations)
        .where(and(eq(allocations.deviceId, device.id), isNull(allocations.returnedAt)))
        .all()[0]
      if (activeAlloc) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: 'Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi xoá.' },
        }
      }
      db.transaction((tx) => {
        tx.delete(maintenanceLogs).where(eq(maintenanceLogs.deviceId, device.id)).run()
        tx.delete(allocations).where(eq(allocations.deviceId, device.id)).run()
        tx.delete(devices).where(eq(devices.id, device.id)).run()
      })
      return { ok: true, data: { ok: true } }
    },

    async downloadTemplate(): Promise<ApiResponse<DownloadTemplateResult>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
      // Lazy require so module stays unit-testable (dialog is Electron-only runtime)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dialog } = require('electron') as typeof import('electron')

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([
        ['SKU', 'Tên thiết bị', 'Loại', 'Nhóm', 'Số serial', 'Ghi chú'],
        ['TB-001', 'Laptop Dell XPS 15', 'Laptop', 'Dell', 'SN123456', 'Ghi chú tùy chọn'],
      ])
      ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Thiết bị')

      const result = await dialog.showSaveDialog({
        title: 'Lưu template nhập thiết bị',
        defaultPath: 'template_nhap_thiet_bi.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      })
      if (result.canceled || !result.filePath) return { ok: true, data: { saved: false } }
      XLSX.writeFile(wb, result.filePath)
      return { ok: true, data: { saved: true } }
    },

    async previewImport(args: PreviewImportArgs): Promise<ApiResponse<PreviewImportResult>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden

      let workbook: XLSX.WorkBook
      try {
        workbook = XLSX.readFile(args.filePath)
      } catch {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Không thể đọc file. Vui lòng kiểm tra định dạng file (.xlsx, .xls, .csv).' } }
      }

      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      const allCats = db.select({ id: categories.id, name: categories.name }).from(categories).all()
      const allGroups = db.select({ id: deviceGroups.id, name: deviceGroups.name, categoryId: deviceGroups.categoryId }).from(deviceGroups).all()
      const catByName = new Map(allCats.map(c => [c.name.trim().toLowerCase(), c]))
      const grpByName = new Map(allGroups.map(g => [g.name.trim().toLowerCase(), g]))

      const skusInFile = new Map<string, number>() // lowercase sku → first rowNum

      const rows: PreviewRow[] = rawRows.map((raw, idx) => {
        const rowNum = idx + 2
        const sku = String(raw['SKU'] ?? '').trim()
        const name = String(raw['Tên thiết bị'] ?? '').trim()
        const categoryName = String(raw['Loại'] ?? '').trim()
        const groupName = String(raw['Nhóm'] ?? '').trim()
        const serialNumber = String(raw['Số serial'] ?? '').trim() || null
        const notes = String(raw['Ghi chú'] ?? '').trim() || null

        let categoryId: number | null = null
        let groupId: number | null = null
        let error: string | null = null

        if (!sku) {
          error = 'SKU không được để trống'
        } else if (!name) {
          error = 'Tên thiết bị không được để trống'
        } else if (skusInFile.has(sku.toLowerCase())) {
          error = `SKU bị trùng lặp trong file (dòng ${skusInFile.get(sku.toLowerCase())})`
        } else {
          skusInFile.set(sku.toLowerCase(), rowNum)
          const existing = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, sku)).all()[0]
          if (existing) {
            error = `SKU đã tồn tại trong hệ thống`
          }
        }

        if (!error && categoryName) {
          const cat = catByName.get(categoryName.toLowerCase())
          if (!cat) {
            error = `Loại thiết bị không tồn tại: "${categoryName}"`
          } else {
            categoryId = cat.id
          }
        }

        if (!error && groupName) {
          const grp = grpByName.get(groupName.toLowerCase())
          if (!grp) {
            error = `Nhóm không tồn tại: "${groupName}"`
          } else if (categoryId != null && grp.categoryId !== categoryId) {
            error = `Nhóm không thuộc loại đã chọn: "${groupName}"`
          } else {
            groupId = grp.id
          }
        }

        return { rowNum, sku, name, category: categoryName, group: groupName, categoryId, groupId, serialNumber, notes, valid: error === null, error }
      })

      return { ok: true, data: { rows } }
    },

    async importBatch(args: ImportBatchArgs): Promise<ApiResponse<ImportBatchResult>> {
      const forbidden = requirePermission('edit_device')
      if (forbidden) return forbidden
      if (!args?.rows?.length) return { ok: true, data: { imported: 0 } }

      const now = new Date().toISOString()
      let imported = 0
      db.transaction((tx) => {
        for (const row of args.rows) {
          tx.insert(devices).values({
            sku: row.sku.trim(),
            name: row.name.trim(),
            categoryId: row.categoryId,
            serialNumber: row.serialNumber?.trim() || null,
            notes: row.notes?.trim() || null,
            groupId: row.groupId,
            status: 'available',
            createdAt: now,
            updatedAt: now,
          }).run()
          imported++
        }
      })
      return { ok: true, data: { imported } }
    },
  }
}
