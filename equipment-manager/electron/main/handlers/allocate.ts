import { eq, inArray } from 'drizzle-orm'
import type { AppDb } from '../db'
import { devices, categories, allocations, employees, departments, requests } from '../db/schema'
import { session } from '../session'
import { requirePermission } from './settings'
import type {
  ApiResponse,
  AllocateFormData,
  CreateAllocationArgs,
  AvailableDeviceRow,
  DepartmentRow,
  EmployeeRow,
  QuickAllocateArgs,
} from '@shared/ipc'

export function makeAllocateHandlers(db: AppDb) {
  return {
    async formData(): Promise<ApiResponse<AllocateFormData>> {
      const availableDevs = db
        .select({ sku: devices.sku, name: devices.name, categoryName: categories.name })
        .from(devices)
        .leftJoin(categories, eq(devices.categoryId, categories.id))
        .where(eq(devices.status, 'available'))
        .all()

      const depts = db
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .all()

      const emps = db
        .select({
          id: employees.id,
          name: employees.name,
          employeeCode: employees.employeeCode,
          departmentId: employees.departmentId,
          departmentName: departments.name,
        })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .all()

      const reqs = db
        .select({ id: requests.id, code: requests.code })
        .from(requests)
        .all()

      return {
        ok: true,
        data: {
          availableDevices: availableDevs.map<AvailableDeviceRow>((d) => ({
            sku: d.sku,
            name: d.name,
            category: d.categoryName ?? '',
          })),
          departments: depts.map<DepartmentRow>((d) => ({ id: d.id, name: d.name })),
          employees: emps.map<EmployeeRow>((e) => ({
            id: e.id,
            name: e.name,
            employeeCode: e.employeeCode,
            departmentId: e.departmentId ?? null,
            departmentName: e.departmentName ?? '',
          })),
          requests: reqs.map((r) => ({ id: r.id, code: r.code })),
        },
      }
    },

    async create(args: CreateAllocationArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('allocate')
      if (forbidden) return forbidden
      if (!args?.deviceSku) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Chưa chọn thiết bị.' } }
      }
      if (!args.employeeId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Chưa chọn nhân viên.' } }
      }
      if (!args.departmentId) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Chưa chọn phòng ban.' } }
      }

      const device = db
        .select({ id: devices.id, status: devices.status })
        .from(devices)
        .where(eq(devices.sku, args.deviceSku))
        .all()[0]

      if (!device) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy thiết bị.' } }
      }
      if (device.status !== 'available') {
        return { ok: false, error: { code: 'CONFLICT', message: 'Thiết bị không còn trong kho.' } }
      }

      const now = new Date().toISOString()

      db.insert(allocations)
        .values({
          requestId: args.requestId ?? null,
          deviceId: device.id,
          employeeId: args.employeeId,
          departmentId: args.departmentId,
          issuedBy: session.current?.id ?? null,
          issuedAt: now,
          dueDate: args.dueDate || null,
          conditionOut: args.conditionOut || null,
          notes: args.notes || null,
        })
        .run()

      db.update(devices)
        .set({ status: 'allocated', updatedAt: now })
        .where(eq(devices.id, device.id))
        .run()

      return { ok: true, data: { ok: true } }
    },

    async quickAllocate(args: QuickAllocateArgs): Promise<ApiResponse<{ ok: true }>> {
      const forbidden = requirePermission('allocate')
      if (forbidden) return forbidden
      if (!Array.isArray(args?.deviceSkus) || args.deviceSkus.length === 0) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Chưa chọn thiết bị.' } }
      }
      if (!args.borrowerName?.trim()) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Vui lòng nhập tên người mượn.' } }
      }

      const devs = db
        .select({ id: devices.id, sku: devices.sku, status: devices.status })
        .from(devices)
        .where(inArray(devices.sku, args.deviceSkus))
        .all()

      const unavailable = devs.filter((d) => d.status !== 'available')
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
      const notesStr = `Người mượn: ${args.borrowerName.trim()}${args.notes ? '\n' + args.notes : ''}`

      for (const dev of devs) {
        db.insert(allocations)
          .values({
            requestId: args.requestId ?? null,
            deviceId: dev.id,
            employeeId: null,
            departmentId: args.departmentId ?? null,
            issuedBy: session.current?.id ?? null,
            issuedAt: now,
            notes: notesStr,
          })
          .run()

        db.update(devices)
          .set({ status: 'allocated', updatedAt: now })
          .where(eq(devices.id, dev.id))
          .run()
      }

      return { ok: true, data: { ok: true } }
    },
  }
}
