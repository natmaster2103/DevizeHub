export const CHANNELS = {
  authLogin: 'auth.login',
  authMe: 'auth.me',
  authLogout: 'auth.logout',
  devicesList: 'devices.list',
  devicesGet: 'devices.get',
  devicesCreate: 'devices.create',
  devicesUpdate: 'devices.update',
  devicesChangeStatus: 'devices.changeStatus',
  devicesDelete: 'devices.delete',
  dashboardSummary: 'dashboard.summary',
  requestsList: 'requests.list',
  requestsGet: 'requests.get',
  requestsReturn: 'requests.return',
  requestsAddDevices: 'requests.addDevices',
  requestsAvailableDevices: 'requests.availableDevices',
  requestsCreate: 'requests.create',
  allocateFormData: 'allocate.formData',
  allocateCreate: 'allocate.create',
  allocateQuick: 'allocate.quick',
  catalogList: 'catalog.list',
  catalogSaveCategory: 'catalog.saveCategory',
  catalogDeleteCategory: 'catalog.deleteCategory',
  catalogSaveDepartment: 'catalog.saveDepartment',
  catalogDeleteDepartment: 'catalog.deleteDepartment',
  catalogSaveEmployee: 'catalog.saveEmployee',
  catalogDeleteEmployee: 'catalog.deleteEmployee',
  catalogSaveGroup: 'catalog.saveGroup',
  catalogDeleteGroup: 'catalog.deleteGroup',
  settingsListUsers: 'settings.listUsers',
  settingsSaveUser: 'settings.saveUser',
  settingsChangePassword: 'settings.changePassword',
  settingsDbInfo: 'settings.dbInfo',
  settingsResetData: 'settings.resetData',
  settingsSaveUserPermissions: 'settings.saveUserPermissions',
  settingsSaveUserGroups: 'settings.saveUserGroups',
} as const

export type Role = 'admin' | 'staff'
export type DeviceStatus = 'available' | 'allocated' | 'maintenance' | 'broken' | 'decommissioned'

export type Permission =
  | 'allocate'
  | 'return_device'
  | 'create_request'
  | 'edit_device'
  | 'change_status'
  | 'delete_device'
  | 'manage_catalog'
  | 'manage_users'
  | 'reset_data'
  | 'view_reports'

export const ALL_PERMISSIONS: Permission[] = [
  'allocate', 'return_device', 'create_request', 'edit_device',
  'change_status', 'delete_device', 'manage_catalog', 'manage_users',
  'reset_data', 'view_reports',
]

export interface SessionUser {
  id: number
  username: string
  role: Role
  displayName: string
  permissions: string[]
  groupIds: number[]
}

export interface LoginArgs { username: string; password: string }
export interface LoginResult { user: SessionUser }

export interface DeviceRow {
  sku: string
  name: string
  category: string
  categoryId: number | null
  status: DeviceStatus
  department: string | null
  holder: string | null
  serialNumber: string | null
  notes: string | null
  activeAllocationId: number | null  // id of the active (not-yet-returned) allocation, for recall
  group: string | null
  groupId: number | null
}
export interface StatusCount { key: 'all' | DeviceStatus; count: number }
export interface DeviceListArgs {
  filter: 'all' | DeviceStatus
  query: string
  page?: number      // 1-based, default 1
  pageSize?: number  // default 20
  categoryId?: number | null
  groupId?: number | null
}
export interface DeviceListResult {
  devices: DeviceRow[]   // đã slice theo page
  counts: StatusCount[]  // theo danh mục đang lọc; không bị filter trạng thái/tìm kiếm ảnh hưởng
  total: number          // tổng sau filter+search, trước slice — dùng tính totalPages
}

export interface DeviceHistoryEntry {
  type: 'allocate' | 'return' | 'maintenance' | 'create'
  title: string
  sub: string
  date: string
}
export interface DeviceInfoField { key: string; value: string; isStatus?: boolean }
export interface DeviceDetailResult {
  device: DeviceRow
  info: DeviceInfoField[]
  history: DeviceHistoryEntry[]
}
export interface DeviceGetArgs { sku: string }

export interface DeviceCreateArgs {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
  groupId: number | null
}

export interface DeviceUpdateArgs {
  sku: string
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
  groupId: number | null
}

export interface DeviceChangeStatusArgs {
  sku: string
  status: 'available' | 'maintenance' | 'broken' | 'decommissioned'
  notes: string | null
}

export interface DeviceDeleteArgs { sku: string }

export interface DeptCardItem {
  allocationId: number
  deviceSku: string
  name: string
  datetime: string
  borrowerName: string
  lender: string
  returnable: boolean
}
export interface DeptCardRequest { code: string; date: string; status: RequestStatus; items: DeptCardItem[] }
export interface DeptCard {
  dept: string
  deptId: number | null
  kind: 'department' | 'loose'
  count: number
  share: number
  requests: DeptCardRequest[]
  looseItems?: DeptCardItem[]
}
export interface DashboardSummary {
  stats: { total: number; allocated: number; maintenance: number; broken: number; decommissioned: number }
  deptCards: DeptCard[]
  deptAllocTotal: number
}

// ── Catalog ──────────────────────────────────────────────────────────────────
export interface CategoryRow { id: number; name: string; minStock: number }
export interface DepartmentRow { id: number; name: string }
export interface EmployeeRow { id: number; name: string; employeeCode: string; departmentId: number | null; departmentName: string }
export interface GroupRow { id: number; name: string; categoryId: number; categoryName: string; minStock: number }
export interface CatalogListResult {
  categories: CategoryRow[]
  departments: DepartmentRow[]
  employees: EmployeeRow[]
  groups: GroupRow[]
}
export interface SaveCategoryArgs { id?: number; name: string; minStock: number }
export interface SaveDepartmentArgs { id?: number; name: string }
export interface SaveEmployeeArgs { id?: number; name: string; employeeCode: string; departmentId: number | null }
export interface SaveGroupArgs { id?: number; name: string; categoryId: number; minStock: number }
export interface DeleteEntityArgs { id: number }
export interface SaveUserPermissionsArgs { userId: number; permissions: Permission[] }
export interface SaveUserGroupsArgs { userId: number; groupIds: number[] }

// ── Allocate ─────────────────────────────────────────────────────────────────
export interface CreateAllocationArgs {
  deviceSku: string
  employeeId: number
  departmentId: number
  dueDate: string | null
  requestId: number | null
  conditionOut: string
  notes: string
}
export interface AllocateFormData {
  availableDevices: AvailableDeviceRow[]
  departments: DepartmentRow[]
  employees: EmployeeRow[]
  requests: Array<{ id: number; code: string }>
}

export interface QuickAllocateArgs {
  deviceSkus: string[]
  departmentId: number | null
  borrowerName: string
  requestId: number | null
  notes: string | null
}

// ── Settings ─────────────────────────────────────────────────────────────────
export interface AppUserRow {
  id: number
  username: string
  displayName: string
  role: Role
  active: boolean
  permissions: string[]
  groupIds: number[]
}
export interface SaveUserArgs { id?: number; username: string; displayName: string; role: Role; password?: string; active: boolean }
export interface ChangePasswordArgs { currentPassword: string; newPassword: string }
export interface DbInfoResult { path: string; sizeKb: number; lastBackup: string | null }

export type RequestStatus = 'pending' | 'allocated' | 'completed'

export interface RequestRow {
  id: number
  code: string
  department: string
  createdAt: string
  deviceCount: number
  status: RequestStatus
}
export interface RequestListArgs { query: string }
export interface RequestListResult { requests: RequestRow[] }

export interface RequestDeviceLine {
  allocationId: number
  deviceSku: string
  deviceName: string
  category: string
  recipient: string
  isReturned: boolean
}
export interface RequestDetail {
  id: number
  code: string
  department: string
  createdAt: string
  deviceCount: number
  status: RequestStatus
  notes: string | null
  lines: RequestDeviceLine[]
}
export interface RequestGetArgs { id: number }

export interface ReturnDeviceArgs { allocationId: number; condition: string; notes: string }

export interface AddToRequestArgs { requestId: number; deviceSkus: string[] }

export interface AvailableDeviceRow { sku: string; name: string; category: string }
export interface AvailableDevicesResult { devices: AvailableDeviceRow[] }

export interface CreateRequestArgs {
  code: string
  departmentId: number
  createdAt: string | null
  notes: string | null
}
export interface CreateRequestResult { id: number; code: string }

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export interface Api {
  auth: {
    login(args: LoginArgs): Promise<ApiResponse<LoginResult>>
    me(): Promise<ApiResponse<SessionUser | null>>
    logout(): Promise<ApiResponse<{ ok: true }>>
  }
  devices: {
    list(args: DeviceListArgs): Promise<ApiResponse<DeviceListResult>>
    get(args: DeviceGetArgs): Promise<ApiResponse<DeviceDetailResult>>
    create(args: DeviceCreateArgs): Promise<ApiResponse<{ sku: string }>>
    update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>>
    changeStatus(args: DeviceChangeStatusArgs): Promise<ApiResponse<{ ok: true }>>
    delete(args: DeviceDeleteArgs): Promise<ApiResponse<{ ok: true }>>
  }
  dashboard: {
    summary(): Promise<ApiResponse<DashboardSummary>>
  }
  requests: {
    list(args: RequestListArgs): Promise<ApiResponse<RequestListResult>>
    get(args: RequestGetArgs): Promise<ApiResponse<RequestDetail>>
    returnDevice(args: ReturnDeviceArgs): Promise<ApiResponse<{ ok: true }>>
    addDevices(args: AddToRequestArgs): Promise<ApiResponse<{ ok: true }>>
    availableDevices(): Promise<ApiResponse<AvailableDevicesResult>>
    create(args: CreateRequestArgs): Promise<ApiResponse<CreateRequestResult>>
  }
  allocate: {
    formData(): Promise<ApiResponse<AllocateFormData>>
    create(args: CreateAllocationArgs): Promise<ApiResponse<{ ok: true }>>
    quick(args: QuickAllocateArgs): Promise<ApiResponse<{ ok: true }>>
  }
  catalog: {
    list(): Promise<ApiResponse<CatalogListResult>>
    saveCategory(args: SaveCategoryArgs): Promise<ApiResponse<CategoryRow>>
    deleteCategory(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
    saveDepartment(args: SaveDepartmentArgs): Promise<ApiResponse<DepartmentRow>>
    deleteDepartment(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
    saveEmployee(args: SaveEmployeeArgs): Promise<ApiResponse<EmployeeRow>>
    deleteEmployee(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
    saveGroup(args: SaveGroupArgs): Promise<ApiResponse<{ ok: true }>>
    deleteGroup(args: DeleteEntityArgs): Promise<ApiResponse<{ ok: true }>>
  }
  settings: {
    listUsers(): Promise<ApiResponse<AppUserRow[]>>
    saveUser(args: SaveUserArgs): Promise<ApiResponse<AppUserRow>>
    changePassword(args: ChangePasswordArgs): Promise<ApiResponse<{ ok: true }>>
    dbInfo(): Promise<ApiResponse<DbInfoResult>>
    resetData(): Promise<ApiResponse<{ ok: true }>>
    saveUserPermissions(args: SaveUserPermissionsArgs): Promise<ApiResponse<{ ok: true }>>
    saveUserGroups(args: SaveUserGroupsArgs): Promise<ApiResponse<{ ok: true }>>
  }
}
