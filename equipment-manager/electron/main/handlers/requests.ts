import { eq, inArray, and, isNull } from 'drizzle-orm'
import type { AppDb } from '../db'
import { devices, categories, allocations, employees, departments, requests } from '../db/schema'
import { session } from '../session'
import { requirePermission } from './settings'
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
  UpdateRequestArgs,
  DeleteRequestArgs,
  UpdateRequestStatusArgs,
} from '@shared/ipc'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function parseBorrowerFromNotes(notes: string | null): string {
  if (!notes) return ''
  const match = notes.match(/^Người mượn: (.+)/)
  return match ? match[1].trim() : ''
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
          status: requests.status,
          deptName: departments.name,
        })
        .from(requests)
        .leftJoin(departments, eq(requests.departmentId, departments.id))
        .all()

      const allAllocs = db
        .select({ requestId: allocations.requestId })
        .from(allocations)
        .all()

      const countByReq = new Map<number, number>()
      for (const a of allAllocs) {
        if (a.requestId == null) continue
        countByReq.set(a.requestId, (countByReq.get(a.requestId) ?? 0) + 1)
      }

      const q = (args.query ?? '').toLowerCase().trim()

      let rows: RequestRow[] = allRequests.map((r) => ({
        id: r.id,
        code: r.code,
        department: r.deptName ?? '',
        createdAt: fmtDate(r.createdAt),
        deviceCount: countByReq.get(r.id) ?? 0,
        status: r.status as RequestStatus,
      }))

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
          status: requests.status,
          deptName: departments.name,
          departmentId: requests.departmentId,
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
          borrowerName: allocations.borrowerName,
          allocNotes: allocations.notes,
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
        recipient: l.borrowerName ?? l.recipientName ?? parseBorrowerFromNotes(l.allocNotes),
        isReturned: l.returnedAt !== null,
      }))

      const total = lines.length

      return {
        ok: true,
        data: {
          id: req.id,
          code: req.code,
          department: req.deptName ?? '',
          departmentId: req.departmentId ?? null,
          createdAt: fmtDate(req.createdAt),
          deviceCount: total,
          status: req.status as RequestStatus,
          notes: req.notes ?? null,
          lines: deviceLines,
        },
      }
    },

    async returnDevice(args: ReturnDeviceArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('return_device')
      if (forbidden) return forbidden
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
        .set({ returnedAt: now, returnedBy: session.current?.id ?? null, conditionIn: args.condition, notes: args.notes || null })
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
      if (!args.borrowerName?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Vui lòng nhập tên người mượn.' } }
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
            borrowerName: args.borrowerName.trim(),
            notes: null,
          })
          .run()

        db.update(devices)
          .set({ status: 'allocated', updatedAt: now })
          .where(eq(devices.id, dev.id))
          .run()
      }

      const cur = db.select({ status: requests.status }).from(requests)
        .where(eq(requests.id, req.id)).all()[0]
      if (cur && cur.status === 'pending') {
        db.update(requests).set({ status: 'allocated' }).where(eq(requests.id, req.id)).run()
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
      const forbidden = requirePermission('create_request')
      if (forbidden) return forbidden
      if (!args?.code?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Mã phiếu không được để trống.' } }
      }
      if (!args.departmentId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Vui lòng chọn phòng ban.' } }
      }

      const now = args.createdAt ?? new Date().toISOString()

      const result = db.insert(requests)
        .values({
          code: args.code.trim(),
          departmentId: args.departmentId,
          employeeId: null,
          createdBy: session.current?.id ?? null,
          createdAt: now,
          notes: args.notes ?? null,
        })
        .run()

      return { ok: true, data: { id: Number(result.lastInsertRowid), code: args.code.trim() } }
    },

    async update(args: UpdateRequestArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_requests')
      if (forbidden) return forbidden
      if (!args?.id || typeof args.id !== 'number') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'ID phiếu không hợp lệ.' } }
      }
      if (!args.code?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Mã phiếu không được để trống.' } }
      }
      if (!args.departmentId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Vui lòng chọn phòng ban.' } }
      }

      const existing = db.select({ id: requests.id }).from(requests)
        .where(eq(requests.id, args.id)).all()[0]
      if (!existing) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu đề nghị.' } }
      }

      db.update(requests)
        .set({
          code: args.code.trim(),
          departmentId: args.departmentId,
          createdAt: args.createdAt ?? new Date().toISOString(),
          notes: args.notes ?? null,
        })
        .where(eq(requests.id, args.id))
        .run()

      return { ok: true, data: { ok: true } }
    },

    async delete(args: DeleteRequestArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_requests')
      if (forbidden) return forbidden
      if (!args?.id || typeof args.id !== 'number') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'ID phiếu không hợp lệ.' } }
      }

      const existing = db.select({ id: requests.id }).from(requests)
        .where(eq(requests.id, args.id)).all()[0]
      if (!existing) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu đề nghị.' } }
      }

      db.transaction((tx) => {
        const now = new Date().toISOString()

        const unreturned = tx
          .select({ deviceId: allocations.deviceId })
          .from(allocations)
          .where(and(eq(allocations.requestId, args.id), isNull(allocations.returnedAt)))
          .all()

        for (const alloc of unreturned) {
          if (alloc.deviceId != null) {
            tx.update(devices)
              .set({ status: 'available', updatedAt: now })
              .where(eq(devices.id, alloc.deviceId))
              .run()
          }
        }

        tx.delete(allocations).where(eq(allocations.requestId, args.id)).run()
        tx.delete(requests).where(eq(requests.id, args.id)).run()
      })

      return { ok: true, data: { ok: true } }
    },

    async updateStatus(args: UpdateRequestStatusArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('manage_requests')
      if (forbidden) return forbidden
      if (!args?.id || typeof args.id !== 'number') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'ID phiếu không hợp lệ.' } }
      }
      if (args.status !== 'completed') {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Trạng thái không hợp lệ.' } }
      }

      const existing = db.select({ id: requests.id, status: requests.status })
        .from(requests).where(eq(requests.id, args.id)).all()[0]
      if (!existing) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiếu đề nghị.' } }
      }
      if (existing.status !== 'allocated') {
        return { ok: false, error: { code: 'CONFLICT', message: 'Chỉ có thể hoàn tất phiếu đang cho mượn.' } }
      }

      db.update(requests).set({ status: 'completed' }).where(eq(requests.id, args.id)).run()
      return { ok: true, data: { ok: true } }
    },
  }
}
