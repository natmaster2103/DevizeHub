import { eq, inArray } from 'drizzle-orm'
import type { AppDb } from '../db'
import { devices, categories, allocations, employees, departments, requests } from '../db/schema'
import { session } from '../session'
import type {
  ApiResponse,
  RequestListArgs,
  RequestListResult,
  RequestGetArgs,
  RequestDetail,
  RequestRow,
  RequestDeviceLine,
  RequestStatus,
  ReturnDeviceArgs,
  AddToRequestArgs,
  AvailableDevicesResult,
  CreateRequestArgs,
  CreateRequestResult,
} from '@shared/ipc'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function deriveStatus(totalLines: number, activeLines: number): RequestStatus {
  if (activeLines > 0) return 'allocated'
  return 'completed'
}

export function makeRequestHandlers(db: AppDb) {
  return {
    async list(args: RequestListArgs): Promise<ApiResponse<RequestListResult>> {
      const allRequests = db
        .select({
          id: requests.id,
          code: requests.code,
          createdAt: requests.createdAt,
          notes: requests.notes,
          deptName: departments.name,
        })
        .from(requests)
        .leftJoin(departments, eq(requests.departmentId, departments.id))
        .all()

      const allAllocs = db
        .select({
          requestId: allocations.requestId,
          returnedAt: allocations.returnedAt,
        })
        .from(allocations)
        .all()

      const totalByReq = new Map<number, number>()
      const activeByReq = new Map<number, number>()
      for (const a of allAllocs) {
        if (a.requestId == null) continue
        totalByReq.set(a.requestId, (totalByReq.get(a.requestId) ?? 0) + 1)
        if (a.returnedAt === null) {
          activeByReq.set(a.requestId, (activeByReq.get(a.requestId) ?? 0) + 1)
        }
      }

      const q = (args.query ?? '').toLowerCase().trim()

      let rows: RequestRow[] = allRequests.map((r) => {
        const total = totalByReq.get(r.id) ?? 0
        const active = activeByReq.get(r.id) ?? 0
        return {
          id: r.id,
          code: r.code,
          department: r.deptName ?? '',
          createdAt: fmtDate(r.createdAt),
          deviceCount: total,
          status: deriveStatus(total, active),
        }
      })

      if (q) {
        rows = rows.filter(
          (r) =>
            r.code.toLowerCase().includes(q) ||
            r.department.toLowerCase().includes(q),
        )
      }

      rows.sort((a, b) => b.id - a.id)

      return { ok: true, data: { requests: rows } }
    },

    async get(args: RequestGetArgs): Promise<ApiResponse<RequestDetail>> {
      if (!args?.id || typeof args.id !== 'number') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'ID phiếu không hợp lệ.' } }
      }

      const req = db
        .select({
          id: requests.id,
          code: requests.code,
          createdAt: requests.createdAt,
          notes: requests.notes,
          deptName: departments.name,
        })
        .from(requests)
        .leftJoin(departments, eq(requests.departmentId, departments.id))
        .where(eq(requests.id, args.id))
        .all()[0]

      if (!req) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu đề nghị.' } }
      }

      const lines = db
        .select({
          allocationId: allocations.id,
          returnedAt: allocations.returnedAt,
          deviceSku: devices.sku,
          deviceName: devices.name,
          categoryName: categories.name,
          recipientName: employees.name,
        })
        .from(allocations)
        .leftJoin(devices, eq(allocations.deviceId, devices.id))
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .where(eq(allocations.requestId, args.id))
        .all()

      const deviceLines: RequestDeviceLine[] = lines.map((l) => ({
        allocationId: l.allocationId,
        deviceSku: l.deviceSku ?? '',
        deviceName: l.deviceName ?? '',
        category: l.categoryName ?? '',
        recipient: l.recipientName ?? '',
        isReturned: l.returnedAt !== null,
      }))

      const total = lines.length
      const active = lines.filter((l) => l.returnedAt === null).length

      return {
        ok: true,
        data: {
          id: req.id,
          code: req.code,
          department: req.deptName ?? '',
          createdAt: fmtDate(req.createdAt),
          deviceCount: total,
          status: deriveStatus(total, active),
          notes: req.notes ?? null,
          lines: deviceLines,
        },
      }
    },

    async returnDevice(args: ReturnDeviceArgs): Promise<ApiResponse<{ ok: true }>> {
      if (!args?.allocationId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'ID cấp phát không hợp lệ.' } }
      }

      const alloc = db
        .select({ id: allocations.id, deviceId: allocations.deviceId, returnedAt: allocations.returnedAt })
        .from(allocations)
        .where(eq(allocations.id, args.allocationId))
        .all()[0]

      if (!alloc) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy bản ghi cấp phát.' } }
      }
      if (alloc.returnedAt !== null) {
        return { ok: false, error: { code: 'CONFLICT', message: 'Thiết bị đã được trả về.' } }
      }

      const now = new Date().toISOString()
      const conditionToStatus: Record<string, 'available' | 'maintenance' | 'broken'> = {
        'Cần bảo trì': 'maintenance',
        'Hỏng': 'broken',
      }
      const newStatus = conditionToStatus[args.condition] ?? 'available'

      db.update(allocations)
        .set({ returnedAt: now, conditionIn: args.condition, notes: args.notes || null })
        .where(eq(allocations.id, alloc.id))
        .run()

      db.update(devices)
        .set({ status: newStatus, updatedAt: now })
        .where(eq(devices.id, alloc.deviceId!))
        .run()

      return { ok: true, data: { ok: true } }
    },

    async addDevices(args: AddToRequestArgs): Promise<ApiResponse<{ ok: true }>> {
      if (!args?.requestId || !Array.isArray(args.deviceSkus) || args.deviceSkus.length === 0) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Dữ liệu không hợp lệ.' } }
      }

      const req = db
        .select({ id: requests.id, employeeId: requests.employeeId, departmentId: requests.departmentId })
        .from(requests)
        .where(eq(requests.id, args.requestId))
        .all()[0]

      if (!req) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu đề nghị.' } }
      }

      const availableDevs = db
        .select({ id: devices.id, sku: devices.sku, status: devices.status })
        .from(devices)
        .where(inArray(devices.sku, args.deviceSkus))
        .all()

      const unavailable = availableDevs.filter((d) => d.status !== 'available')
      if (unavailable.length > 0) {
        return {
          ok: false,
          error: {
            code: 'CONFLICT',
            message: `Thiết bị không còn trong kho: ${unavailable.map((d) => d.sku).join(', ')}`,
          },
        }
      }

      const now = new Date().toISOString()
      const issuedBy = session.current?.id ?? null

      for (const dev of availableDevs) {
        db.insert(allocations)
          .values({
            requestId: req.id,
            deviceId: dev.id,
            employeeId: req.employeeId ?? null,
            departmentId: req.departmentId ?? null,
            issuedBy,
            issuedAt: now,
          })
          .run()

        db.update(devices)
          .set({ status: 'allocated', updatedAt: now })
          .where(eq(devices.id, dev.id))
          .run()
      }

      return { ok: true, data: { ok: true } }
    },

    async availableDevices(): Promise<ApiResponse<AvailableDevicesResult>> {
      const rows = db
        .select({ sku: devices.sku, name: devices.name, categoryName: categories.name })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .where(eq(devices.status, 'available'))
        .all()

      return {
        ok: true,
        data: {
          devices: rows.map((r) => ({ sku: r.sku, name: r.name, category: r.categoryName ?? '' })),
        },
      }
    },

    async create(args: CreateRequestArgs): Promise<ApiResponse<CreateRequestResult>> {
      if (!args?.code?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Mã phiếu không được để trống.' } }
      }
      if (!args.departmentId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Vui lòng chọn phòng ban.' } }
      }

      const existing = db
        .select({ id: requests.id })
        .from(requests)
        .where(eq(requests.code, args.code.trim()))
        .all()[0]
      if (existing) {
        return { ok: false, error: { code: 'CONFLICT', message: 'Mã phiếu đã tồn tại.' } }
      }

      const now = args.createdAt ?? new Date().toISOString()

      db.insert(requests)
        .values({
          code: args.code.trim(),
          departmentId: args.departmentId,
          employeeId: null,
          createdBy: session.current?.id ?? null,
          createdAt: now,
          notes: args.notes ?? null,
        })
        .run()

      const inserted = db
        .select({ id: requests.id })
        .from(requests)
        .where(eq(requests.code, args.code.trim()))
        .all()[0]

      return { ok: true, data: { id: inserted.id, code: args.code.trim() } }
    },
  }
}
