import { eq } from 'drizzle-orm'
import type { AppDb } from '../db'
import {
  devices,
  allocations,
  employees,
  departments,
  requests,
  appUsers,
} from '../db/schema'
import type {
  ApiResponse,
  DashboardSummary,
  DeptCard,
  DeptCardRequest,
  DeptCardItem,
} from '@shared/ipc'

export function makeDashboardHandlers(db: AppDb) {
  return {
    async summary(): Promise<ApiResponse<DashboardSummary>> {
      // ── Stats ──────────────────────────────────────────────────────────────
      const allDevices = db.select({ status: devices.status }).from(devices).all()
      const total = allDevices.length
      const allocated = allDevices.filter((d) => d.status === 'allocated').length
      const maintenance = allDevices.filter((d) => d.status === 'maintenance').length
      const broken = allDevices.filter((d) => d.status === 'broken').length
      const decommissioned = allDevices.filter((d) => d.status === 'decommissioned').length

      // ── DeptCards ──────────────────────────────────────────────────────────
      // Fetch all allocations with request info, department, employee, lender
      const allocRows = db
        .select({
          allocId: allocations.id,
          requestId: allocations.requestId,
          deviceId: allocations.deviceId,
          issuedAt: allocations.issuedAt,
          returnedAt: allocations.returnedAt,
          employeeName: employees.name,
          borrowerName: allocations.borrowerName,
          allocNotes: allocations.notes,
          deptId: allocations.departmentId,
          deptName: departments.name,
        })
        .from(allocations)
        .leftJoin(employees, eq(allocations.employeeId, employees.id))
        .leftJoin(departments, eq(allocations.departmentId, departments.id))
        .all()

      // Fetch all requests
      const allRequests = db
        .select({
          id: requests.id,
          code: requests.code,
          createdAt: requests.createdAt,
          departmentId: requests.departmentId,
          employeeId: requests.employeeId,
          createdBy: requests.createdBy,
        })
        .from(requests)
        .all()

      // Fetch all app users for lender lookup
      const allUsers = db.select({ id: appUsers.id, displayName: appUsers.displayName }).from(appUsers).all()
      const userById = new Map(allUsers.map((u) => [u.id, u.displayName]))

      // Fetch device names for items
      const allDevicesInfo = db.select({ id: devices.id, name: devices.name, sku: devices.sku }).from(devices).all()
      const deviceById = new Map(allDevicesInfo.map((d) => [d.id, d.name]))
      const deviceSkuById = new Map(allDevicesInfo.map((d) => [d.id, d.sku]))

      // Fetch lender per allocation (issuedBy on allocation)
      const allocWithLender = db
        .select({
          allocId: allocations.id,
          issuedBy: allocations.issuedBy,
        })
        .from(allocations)
        .all()
      const lenderByAllocId = new Map(allocWithLender.map((a) => [a.allocId, a.issuedBy]))

      // Build per-department grouping using request-level data
      // Determine request status: if any active alloc in request → 'allocated', else 'completed'
      const requestAllocMap = new Map<number, typeof allocRows>()
      for (const a of allocRows) {
        if (a.requestId == null) continue
        if (!requestAllocMap.has(a.requestId)) requestAllocMap.set(a.requestId, [])
        requestAllocMap.get(a.requestId)!.push(a)
      }

      // Group requests by department
      type DeptGroup = {
        deptName: string
        deptId: number
        activeCount: number
        requestCards: DeptCardRequest[]
      }
      const deptGroups = new Map<number, DeptGroup>()

      // Pre-populate a group for every department so each gets a card on the
      // dashboard, even ones with no active allocations (empty list inside).
      const allDepts = db.select({ id: departments.id, name: departments.name }).from(departments).all()
      for (const d of allDepts) {
        deptGroups.set(d.id, { deptName: d.name, deptId: d.id, activeCount: 0, requestCards: [] })
      }

      for (const req of allRequests) {
        if (req.departmentId == null) continue
        const reqAllocs = requestAllocMap.get(req.id) ?? []
        if (reqAllocs.length === 0) continue

        const hasActiveAlloc = reqAllocs.some((a) => a.returnedAt === null)
        const status: 'allocated' | 'completed' = hasActiveAlloc ? 'allocated' : 'completed'
        const activeCount = reqAllocs.filter((a) => a.returnedAt === null).length

        const group = deptGroups.get(req.departmentId)
        if (!group) continue
        group.activeCount += activeCount

        // Build items — only show allocations that have not been returned yet
        const items: DeptCardItem[] = reqAllocs
          .filter((a) => a.returnedAt === null)
          .map((a) => {
            const lenderId = lenderByAllocId.get(a.allocId) ?? null
            const lenderName = lenderId != null ? (userById.get(lenderId) ?? '') : ''
            return {
              allocationId: a.allocId,
              deviceSku: deviceSkuById.get(a.deviceId) ?? '',
              name: deviceById.get(a.deviceId) ?? '',
              datetime: fmtDateTime(a.issuedAt),
              borrowerName: a.borrowerName ?? a.employeeName ?? parseBorrowerFromNotes(a.allocNotes),
              lender: lenderName,
              returnable: true,
            }
          })

        // Chips only show requests that are currently allocated ("đang trang bị")
        if (status === 'allocated') {
          group.requestCards.push({
            code: req.code ?? '',
            date: fmtDate(req.createdAt),
            status,
            items,
          })
        }
      }

      const sortedGroups = [...deptGroups.values()]
        .sort((a, b) => a.deptName.localeCompare(b.deptName))

      // Active allocations with no request link → loose ("Cấp phát lẻ") card
      const looseItems: DeptCardItem[] = allocRows
        .filter((a) => a.requestId == null && a.returnedAt === null)
        .map((a) => {
          const lenderId = lenderByAllocId.get(a.allocId) ?? null
          const lenderName = lenderId != null ? (userById.get(lenderId) ?? '') : ''
          return {
            allocationId: a.allocId,
            deviceSku: deviceSkuById.get(a.deviceId) ?? '',
            name: deviceById.get(a.deviceId) ?? '',
            datetime: fmtDateTime(a.issuedAt),
            borrowerName: a.borrowerName ?? a.employeeName ?? parseBorrowerFromNotes(a.allocNotes),
            lender: lenderName,
            returnable: true,
          }
        })

      // Compute total active allocations across all depts (for share calculation)
      const deptAllocTotal =
        sortedGroups.reduce((sum, g) => sum + g.activeCount, 0) + looseItems.length

      const departmentCards: DeptCard[] = sortedGroups.map((g) => ({
        dept: g.deptName,
        deptId: g.deptId,
        kind: 'department' as const,
        count: g.activeCount,
        share: deptAllocTotal > 0 ? Math.round((g.activeCount / deptAllocTotal) * 100) : 0,
        requests: g.requestCards,
      }))

      const looseCard: DeptCard = {
        dept: 'Cấp phát lẻ',
        deptId: null,
        kind: 'loose',
        count: looseItems.length,
        share: deptAllocTotal > 0 ? Math.round((looseItems.length / deptAllocTotal) * 100) : 0,
        requests: [],
        looseItems,
      }
      const deptCards: DeptCard[] = [...departmentCards, looseCard]

      return {
        ok: true,
        data: {
          stats: { total, allocated, maintenance, broken, decommissioned },
          deptCards,
          deptAllocTotal,
        },
      }
    },
  }
}

function parseBorrowerFromNotes(notes: string | null): string {
  if (!notes) return ''
  const match = notes.match(/^Người mượn: (.+)/)
  return match ? match[1].split('\n')[0].trim() : ''
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}
