export const CHANNELS = {
  authLogin: 'auth.login',
  authMe: 'auth.me',
  authLogout: 'auth.logout',
  devicesList: 'devices.list',
  devicesGet: 'devices.get',
  dashboardSummary: 'dashboard.summary'
} as const

export type Role = 'admin' | 'staff'
export type DeviceStatus = 'available' | 'allocated' | 'maintenance' | 'broken' | 'decommissioned'

export interface SessionUser {
  id: number
  username: string
  role: Role
  displayName: string
}

export interface LoginArgs { username: string; password: string }
export interface LoginResult { user: SessionUser }

export interface DeviceRow {
  sku: string
  name: string
  category: string
  status: DeviceStatus
  department: string | null
  holder: string | null
  serialNumber: string | null
}
export interface StatusCount { key: 'all' | DeviceStatus; count: number }
export interface DeviceListArgs { filter: 'all' | DeviceStatus; query: string }
export interface DeviceListResult { devices: DeviceRow[]; counts: StatusCount[]; total: number }

export interface DeviceHistoryEntry {
  type: 'allocate' | 'return' | 'maintenance' | 'create'
  title: string
  sub: string
  date: string // display string DD/MM/YYYY
}
export interface DeviceInfoField { key: string; value: string }
export interface DeviceDetailResult {
  device: DeviceRow & { notes: string | null }
  info: DeviceInfoField[]
  history: DeviceHistoryEntry[]
}
export interface DeviceGetArgs { sku: string }

export interface DeptCardItem { name: string; datetime: string; borrower: string; lender: string; returnable: boolean }
export interface DeptCardRequest { code: string; requester: string; date: string; status: 'allocated' | 'completed'; items: DeptCardItem[] }
export interface DeptCard { dept: string; count: number; share: number; requests: DeptCardRequest[] }
export interface DashboardSummary {
  stats: { total: number; allocated: number; maintenance: number; broken: number; decommissioned: number }
  deptCards: DeptCard[]
  deptAllocTotal: number
}

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
  }
  dashboard: {
    summary(): Promise<ApiResponse<DashboardSummary>>
  }
}
