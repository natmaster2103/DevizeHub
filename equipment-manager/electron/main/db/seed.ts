import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { AppDb } from './index'
import {
  categories,
  departments,
  employees,
  appUsers,
  userPermissions,
  userGroups,
  devices,
  requests,
  allocations,
} from './schema'
import { ALL_PERMISSIONS } from '@shared/ipc'

const NOW = '2026-06-01T00:00:00.000Z'

const STATUS_MAP: Record<
  string,
  'available' | 'allocated' | 'maintenance' | 'broken' | 'decommissioned'
> = {
  'Trong kho': 'available',
  'Đang trang bị': 'allocated',
  'Đang bảo trì': 'maintenance',
  Hỏng: 'broken',
  'Thanh lý': 'decommissioned',
}

/** Parse prototype datetime strings like '12/03/2026 09:00' (DD/MM/YYYY HH:mm) → ISO string */
function parseVnDateTime(s: string): string {
  const [datePart, timePart] = s.trim().split(' ')
  const [dd, mm, yyyy] = datePart.split('/')
  const [hh, min] = (timePart ?? '00:00').split(':')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00.000Z`
}

/** Parse date-only strings like '12/03/2026' → ISO string at midnight UTC */
function parseVnDate(s: string): string {
  return parseVnDateTime(s + ' 00:00')
}

export function seedIfEmpty(db: AppDb): void {
  const existing = db.select().from(appUsers).all()
  if (existing.length > 0) return

  db.transaction((tx) => {
    // ── 1. Categories (7) ─────────────────────────────────────────────────
    const catNames = [
      'Máy tính xách tay',
      'Máy tính để bàn',
      'Màn hình',
      'Máy in',
      'Điện thoại',
      'Máy chiếu',
      'Thiết bị mạng',
    ]
    const catMap = new Map<string, number>()
    for (const name of catNames) {
      const [row] = tx
        .insert(categories)
        .values({ name, minStock: 5, createdAt: NOW })
        .returning({ id: categories.id })
        .all()
      catMap.set(name, row.id)
    }

    // ── 2. Departments (4) ────────────────────────────────────────────────
    const deptNames = ['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4']
    const deptMap = new Map<string, number>()
    for (const name of deptNames) {
      const [row] = tx
        .insert(departments)
        .values({ name, createdAt: NOW })
        .returning({ id: departments.id })
        .all()
      deptMap.set(name, row.id)
    }

    // ── 3. Employees (NV001..NV007) ───────────────────────────────────────
    const seedEmployees = [
      { code: 'NV001', name: 'Nguyễn Văn An', dept: 'Đội 1' },
      { code: 'NV002', name: 'Trần Thị Bình', dept: 'Đội 4' },
      { code: 'NV003', name: 'Lê Hoàng Cường', dept: 'Đội 2' },
      { code: 'NV004', name: 'Phạm Thị Dung', dept: 'Đội 1' },
      { code: 'NV005', name: 'Vũ Minh Đức', dept: 'Đội 2' },
      { code: 'NV006', name: 'Hoàng Thị Em', dept: 'Đội 4' },
      { code: 'NV007', name: 'Đặng Văn Phúc', dept: 'Đội 3' },
    ]
    const empMap = new Map<string, number>() // name → id
    let nextEmpNum = 8

    for (const emp of seedEmployees) {
      const [row] = tx
        .insert(employees)
        .values({
          name: emp.name,
          employeeCode: emp.code,
          departmentId: deptMap.get(emp.dept) ?? null,
          createdAt: NOW,
        })
        .returning({ id: employees.id })
        .all()
      empMap.set(emp.name, row.id)
    }

    /** Insert a minimal employee on-the-fly when a name appears in allocations but isn't seeded */
    function ensureEmployee(name: string, deptName?: string): number {
      if (empMap.has(name)) return empMap.get(name)!
      const code = `NV${String(nextEmpNum++).padStart(3, '0')}`
      const deptId = deptName ? (deptMap.get(deptName) ?? null) : null
      const [row] = tx
        .insert(employees)
        .values({ name, employeeCode: code, departmentId: deptId, createdAt: NOW })
        .returning({ id: employees.id })
        .all()
      empMap.set(name, row.id)
      return row.id
    }

    // ── 4. App users ──────────────────────────────────────────────────────
    const passwordHash = bcrypt.hashSync('admin', 10)

    const [adminUser] = tx
      .insert(appUsers)
      .values({
        username: 'admin',
        passwordHash,
        role: 'admin',
        displayName: 'Trần Quốc Bảo',
        active: 1,
        createdAt: NOW,
      })
      .returning({ id: appUsers.id })
      .all()

    tx.insert(appUsers).values([
      {
        username: 'hang.le',
        passwordHash,
        role: 'staff',
        displayName: 'Lê Thị Hằng',
        active: 1,
        createdAt: NOW,
      },
      {
        username: 'khoa.pham',
        passwordHash,
        role: 'staff',
        displayName: 'Phạm Văn Khoa',
        active: 1,
        createdAt: NOW,
      },
      {
        username: 'lan.do',
        passwordHash,
        role: 'staff',
        displayName: 'Đỗ Thị Lan',
        active: 0,
        createdAt: NOW,
      },
    ]).run()

    // ── 4b. Seed permissions ──────────────────────────────────────────────
    // Admin gets all permissions; staff gets view_reports only
    for (const perm of ALL_PERMISSIONS) {
      tx.insert(userPermissions).values({ userId: adminUser.id, permission: perm }).run()
    }

    // Get staff user IDs to seed view_reports
    const staffUsers = tx.select({ id: appUsers.id }).from(appUsers)
      .where(eq(appUsers.role, 'staff')).all()
    for (const u of staffUsers) {
      tx.insert(userPermissions).values({ userId: u.id, permission: 'view_reports' }).run()
    }

    // ── 5. Devices (12) ───────────────────────────────────────────────────
    const deviceRows = [
      {
        sku: 'LAP-0012',
        name: 'Dell Latitude 5440',
        cat: 'Máy tính xách tay',
        vnStatus: 'Đang trang bị',
        serial: 'DL5440-VN-88213',
        notes: 'Bàn giao kèm túi chống sốc và sạc 65W.',
      },
      {
        sku: 'LAP-0018',
        name: 'ThinkPad T14 Gen 4',
        cat: 'Máy tính xách tay',
        vnStatus: 'Trong kho',
        serial: 'TP-T14-44190',
        notes: 'Máy mới, còn nguyên seal.',
      },
      {
        sku: 'MON-0034',
        name: 'Dell P2422H 24"',
        cat: 'Màn hình',
        vnStatus: 'Đang trang bị',
        serial: 'DELLP24-77321',
        notes: '',
      },
      {
        sku: 'MON-0041',
        name: 'LG 27UP650 27"',
        cat: 'Màn hình',
        vnStatus: 'Đang bảo trì',
        serial: 'LG27UP-90122',
        notes: 'Điểm chết góc trên phải, đang đổi bảo hành.',
      },
      {
        sku: 'PRN-0007',
        name: 'HP LaserJet Pro M404',
        cat: 'Máy in',
        vnStatus: 'Đang trang bị',
        serial: 'HPM404-31002',
        notes: '',
      },
      {
        sku: 'PHN-0021',
        name: 'iPhone 13 128GB',
        cat: 'Điện thoại',
        vnStatus: 'Đang trang bị',
        serial: 'IP13-VN-55810',
        notes: 'Lắp SIM công ty 0987xxxxxx.',
      },
      {
        sku: 'PHN-0025',
        name: 'Samsung Galaxy A54',
        cat: 'Điện thoại',
        vnStatus: 'Hỏng',
        serial: 'SGA54-66230',
        notes: 'Vỡ màn hình, chờ thanh lý.',
      },
      {
        sku: 'PRJ-0003',
        name: 'Epson EB-X06',
        cat: 'Máy chiếu',
        vnStatus: 'Trong kho',
        serial: 'EPX06-12003',
        notes: '',
      },
      {
        sku: 'PC-0009',
        name: 'HP ProDesk 400 G9',
        cat: 'Máy tính để bàn',
        vnStatus: 'Đang trang bị',
        serial: 'HP400G9-78110',
        notes: '',
      },
      {
        sku: 'NET-0002',
        name: 'TP-Link Switch 24 cổng',
        cat: 'Thiết bị mạng',
        vnStatus: 'Đang trang bị',
        serial: 'TPSW24-00781',
        notes: 'Đặt tại tủ rack tầng 3.',
      },
      {
        sku: 'LAP-0024',
        name: 'MacBook Air M2',
        cat: 'Máy tính xách tay',
        vnStatus: 'Trong kho',
        serial: 'MBA-M2-41209',
        notes: '',
      },
      {
        sku: 'PRN-0011',
        name: 'Canon imageCLASS MF445',
        cat: 'Máy in',
        vnStatus: 'Thanh lý',
        serial: 'CN445-90021',
        notes: 'Đã hết khấu hao, lập biên bản thanh lý.',
      },
    ]

    const deviceMap = new Map<string, number>() // name → id

    for (const d of deviceRows) {
      const status = STATUS_MAP[d.vnStatus]
      const categoryId = catMap.get(d.cat) ?? null
      const [row] = tx
        .insert(devices)
        .values({
          sku: d.sku,
          name: d.name,
          categoryId,
          serialNumber: d.serial || null,
          status,
          notes: d.notes || null,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning({ id: devices.id })
        .all()
      deviceMap.set(d.name, row.id)
    }

    // ── 6. Requests + allocations from prototype deptAlloc & requests ─────
    //
    // Prototype requests list: DX-301, DX-300, DX-298, DX-295, DX-293, DX-290
    // deptAlloc has requests: DX-301, DX-300, DX-290, DX-298 (+ DX-287, DX-281, DX-279, DX-272 as completed ones)
    // We only create the 6 from the prototype requests list.

    const requestDefs = [
      {
        code: 'DX-301',
        dept: 'Đội 1',
        requester: 'Nguyễn Văn An',
        date: '12/03/2026',
        vnStatus: 'Đang trang bị',
        notes: 'Trang bị cho 2 nhân viên mới phòng Kế toán.',
        lender: 'Đặng Văn Phúc',
        items: [
          { name: 'Dell Latitude 5440', datetime: '12/03/2026 09:00', borrower: 'Nguyễn Văn An' },
          { name: 'HP ProDesk 400 G9', datetime: '12/03/2026 09:05', borrower: 'Đỗ Văn Khải' },
          { name: 'Dell P2422H 24"', datetime: '12/03/2026 09:08', borrower: 'Nguyễn Văn An' },
          {
            name: 'HP LaserJet Pro M404',
            datetime: '12/03/2026 09:12',
            borrower: 'Phạm Thị Dung',
          },
          { name: 'iPhone 13 128GB', datetime: '12/03/2026 09:20', borrower: 'Nguyễn Văn An' },
          { name: 'ThinkPad T14 Gen 4', datetime: '12/03/2026 09:24', borrower: 'Lê Thị Hồng' },
          { name: 'Dell P2422H 24"', datetime: '12/03/2026 09:28', borrower: 'Lê Thị Hồng' },
        ],
      },
      {
        code: 'DX-300',
        dept: 'Đội 2',
        requester: 'Vũ Minh Đức',
        date: '09/03/2026',
        vnStatus: 'Đang trang bị',
        notes: 'Bổ sung điện thoại cho đội sales thị trường.',
        lender: 'Đặng Văn Phúc',
        items: [
          { name: 'iPhone 13 128GB', datetime: '09/03/2026 14:20', borrower: 'Vũ Minh Đức' },
          { name: 'Dell P2422H 24"', datetime: '09/03/2026 14:25', borrower: 'Vũ Minh Đức' },
        ],
      },
      {
        code: 'DX-298',
        dept: 'Đội 3',
        requester: 'Đặng Văn Phúc',
        date: '03/03/2026',
        vnStatus: 'Hoàn tất',
        notes: 'Nâng cấp thiết bị mạng tầng 3.',
        lender: 'Trần Quốc Bảo',
        items: [
          {
            name: 'TP-Link Switch 24 cổng',
            datetime: '03/03/2026 15:30',
            borrower: 'Đặng Văn Phúc',
          },
          { name: 'HP ProDesk 400 G9', datetime: '03/03/2026 15:35', borrower: 'Hoàng Thị Em' },
        ],
      },
      {
        code: 'DX-295',
        dept: 'Đội 4',
        requester: 'Hoàng Thị Em',
        date: '24/02/2026',
        vnStatus: 'Hoàn tất',
        notes: '',
        lender: 'Đặng Văn Phúc',
        items: [],
      },
      {
        code: 'DX-293',
        dept: 'Đội 1',
        requester: 'Phạm Thị Dung',
        date: '18/02/2026',
        vnStatus: 'Đang xử lý',
        notes: 'Chờ duyệt ngân sách quý 1.',
        lender: 'Đặng Văn Phúc',
        items: [],
      },
      {
        code: 'DX-290',
        dept: 'Đội 2',
        requester: 'Lê Hoàng Cường',
        date: '10/02/2026',
        vnStatus: 'Hoàn tất',
        notes: '',
        lender: 'Đặng Văn Phúc',
        items: [
          { name: 'ThinkPad T14 Gen 4', datetime: '10/02/2026 08:30', borrower: 'Lê Hoàng Cường' },
          { name: 'LG 27UP650 27"', datetime: '10/02/2026 08:35', borrower: 'Lê Hoàng Cường' },
        ],
      },
    ]

    const requestMap = new Map<string, number>() // code → id

    for (const req of requestDefs) {
      const deptId = deptMap.get(req.dept) ?? null
      const requesterId = ensureEmployee(req.requester, req.dept)
      const createdAt = parseVnDate(req.date)

      const [reqRow] = tx
        .insert(requests)
        .values({
          code: req.code,
          departmentId: deptId,
          employeeId: requesterId,
          createdBy: adminUser.id,
          createdAt,
          notes: req.notes || null,
        })
        .returning({ id: requests.id })
        .all()

      requestMap.set(req.code, reqRow.id)

      // Determine returnedAt: null when status is 'Đang trang bị', else a fixed past date
      const isActive = req.vnStatus === 'Đang trang bị'
      const returnedAt = isActive ? null : '2026-05-01T00:00:00.000Z'

      // Resolve lender (issued by) — use admin user id for 'Trần Quốc Bảo', otherwise leave as admin
      const issuedById = adminUser.id

      for (const item of req.items) {
        const deviceId = deviceMap.get(item.name)
        if (!deviceId) continue // skip if device not seeded (shouldn't happen)

        const borrowerId = ensureEmployee(item.borrower, req.dept)
        const issuedAt = parseVnDateTime(item.datetime)

        tx.insert(allocations)
          .values({
            requestId: reqRow.id,
            deviceId,
            employeeId: borrowerId,
            departmentId: deptId,
            issuedBy: issuedById,
            issuedAt,
            returnedAt,
          })
          .run()
      }
    }
  })
}
