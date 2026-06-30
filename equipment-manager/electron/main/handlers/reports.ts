import { and, gte, lt, eq } from 'drizzle-orm'
import type { AppDb } from '../db'
import { requests, allocations, devices, deviceGroups, departments } from '../db/schema'
import type {
  ApiResponse, ReportArgs, ReportSummary, ReportRequestRow, ReportGroupRow, ReportDeptRow,
} from '@shared/ipc'

export function makeReportHandlers(db: AppDb) {
  return {
    async summary(args: ReportArgs): Promise<ApiResponse<ReportSummary>> {
      const { from, to } = args
      if (!from || !to) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: 'Khoảng thời gian không hợp lệ.' } }
      }

      // ── (1) Phiếu đề nghị trong kỳ (theo createdAt) ──
      const reqRows = db
        .select({
          id: requests.id,
          code: requests.code,
          createdAt: requests.createdAt,
          deptName: departments.name,
        })
        .from(requests)
        .leftJoin(departments, eq(requests.departmentId, departments.id))
        .where(and(gte(requests.createdAt, from), lt(requests.createdAt, to)))
        .all()

      // Số lượt cấp phát theo từng phiếu = TẤT CẢ allocation của phiếu (không giới hạn ngày)
      const allAllocReq = db.select({ requestId: allocations.requestId }).from(allocations).all()
      const countByReq = new Map<number, number>()
      for (const a of allAllocReq) {
        if (a.requestId == null) continue
        countByReq.set(a.requestId, (countByReq.get(a.requestId) ?? 0) + 1)
      }

      const requestRows: ReportRequestRow[] = [...reqRows]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          code: r.code,
          deptName: r.deptName ?? 'Không xác định',
          allocationCount: countByReq.get(r.id) ?? 0,
        }))

      // ── Lượt cấp phát trong kỳ (theo issuedAt) ──
      const allocRows = db
        .select({
          deptId: allocations.departmentId,
          deptName: departments.name,
          groupId: devices.groupId,
          groupName: deviceGroups.name,
        })
        .from(allocations)
        .leftJoin(devices, eq(allocations.deviceId, devices.id))
        .leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .where(and(gte(allocations.issuedAt, from), lt(allocations.issuedAt, to)))
        .all()

      const totalAllocations = allocRows.length
      const pct = (n: number) => (totalAllocations > 0 ? Math.round((n / totalAllocations) * 100) : 0)

      // ── (2) Theo nhóm thiết bị ──
      const groupMap = new Map<string, { groupId: number | null; groupName: string; count: number }>()
      for (const a of allocRows) {
        const key = a.groupId == null ? 'null' : String(a.groupId)
        const name = a.groupId == null ? 'Chưa phân nhóm' : (a.groupName ?? 'Chưa phân nhóm')
        const cur = groupMap.get(key) ?? { groupId: a.groupId ?? null, groupName: name, count: 0 }
        cur.count += 1
        groupMap.set(key, cur)
      }
      const byGroup: ReportGroupRow[] = [...groupMap.values()]
        .map((g) => ({ ...g, share: pct(g.count) }))
        .sort((a, b) => b.count - a.count)

      // ── (3) Theo phòng ban ──
      const deptMap = new Map<string, { deptId: number | null; deptName: string; count: number }>()
      for (const a of allocRows) {
        const key = a.deptId == null ? 'null' : String(a.deptId)
        const name = a.deptId == null ? 'Cấp phát lẻ' : (a.deptName ?? 'Cấp phát lẻ')
        const cur = deptMap.get(key) ?? { deptId: a.deptId ?? null, deptName: name, count: 0 }
        cur.count += 1
        deptMap.set(key, cur)
      }
      const byDepartment: ReportDeptRow[] = [...deptMap.values()]
        .map((d) => ({ ...d, share: pct(d.count) }))
        .sort((a, b) => b.count - a.count)

      return {
        ok: true,
        data: {
          range: { from, to },
          requestCount: requestRows.length,
          requests: requestRows,
          totalAllocations,
          byGroup,
          byDepartment,
        },
      }
    },
  }
}
