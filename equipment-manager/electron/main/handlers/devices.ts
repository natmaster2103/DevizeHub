import { eq, isNull, and, isNotNull } from 'drizzle-orm'
import type { AppDb } from '../db'
import {
  devices,
  categories,
  allocations,
  employees,
  departments,
  maintenanceLogs,
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
        })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .all()

      // Fetch active allocations (returnedAt IS NULL) with employee + department
      const activeAllocs = db
        .select({
          deviceId: allocations.deviceId,
          holderName: employees.name,
          deptName: departments.name,
        })
        .from(allocations)
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .where(isNull(allocations.returnedAt))
        .all()

      // Index active alloc by deviceId (one active alloc per device at most)
      const activeByDeviceId = new Map(activeAllocs.map((a) => [a.deviceId, a]))

      // Build counts over full set
      const counts: StatusCount[] = STATUS_KEYS.map((key) => ({
        key,
        count: key === 'all' ? devRows.length : devRows.filter((r) => r.status === key).length,
      }))

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
          holder: alloc?.holderName ?? null,
          department: alloc?.deptName ?? null,
        }
      })

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
          notes: devices.notes,
          createdAt: devices.createdAt,
          categoryId: devices.categoryId,
          categoryName: categories.name,
        })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
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
          holderName: employees.name,
          deptName: departments.name,
        })
        .from(allocations)
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .where(and(eq(allocations.deviceId, deviceRow.id), isNull(allocations.returnedAt)))
        .all()[0]

      const holderName = activeAlloc?.holderName ?? null
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
      const allocRows = db
        .select({
          issuedAt: allocations.issuedAt,
          returnedAt: allocations.returnedAt,
          holderName: employees.name,
          deptName: departments.name,
        })
        .from(allocations)
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .where(and(eq(allocations.deviceId, deviceRow.id)))
        .all()

      const historyEntries: DeviceHistoryEntry[] = []

      for (const a of allocRows) {
        historyEntries.push({
          type: 'allocate',
          title: 'Bàn giao',
          sub: `${a.holderName ?? ''}${a.deptName ? ' – ' + a.deptName : ''}`,
          date: fmtDate(a.issuedAt),
        })
        if (a.returnedAt) {
          historyEntries.push({
            type: 'return',
            title: 'Thu hồi',
            sub: `${a.holderName ?? ''}${a.deptName ? ' – ' + a.deptName : ''}`,
            date: fmtDate(a.returnedAt),
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
        historyEntries.push({
          type: 'maintenance',
          title: 'Bảo trì',
          sub: m.description ?? '',
          date: fmtDate(m.startedAt),
        })
      }

      // Create entry
      historyEntries.push({
        type: 'create',
        title: 'Nhập kho',
        sub: deviceRow.name,
        date: fmtDate(deviceRow.createdAt),
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
      const now = new Date().toISOString()
      db.insert(devices).values({
        sku: args.sku.trim(),
        name: args.name.trim(),
        categoryId: args.categoryId ?? null,
        serialNumber: args.serialNumber?.trim() || null,
        status: 'available',
        notes: args.notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      }).run()
      return { ok: true, data: { sku: args.sku.trim() } }
    },

    async update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>> {
      if (!args?.name?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Tên thiết bị không được để trống.' } }
      }
      const device = db.select({ id: devices.id }).from(devices).where(eq(devices.sku, args.sku)).all()[0]
      if (!device) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
      }
      db.update(devices)
        .set({
          name: args.name.trim(),
          categoryId: args.categoryId ?? null,
          serialNumber: args.serialNumber?.trim() || null,
          notes: args.notes?.trim() || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(devices.sku, args.sku))
        .run()
      return { ok: true, data: { ok: true } }
    },

    async changeStatus(args: DeviceChangeStatusArgs): Promise<ApiResponse<{ ok: true }>> {
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
  }
}
