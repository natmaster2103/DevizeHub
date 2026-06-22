import type { DeviceStatus, RequestStatus } from '@shared/ipc'

export const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Trong kho',
  allocated: 'Đang trang bị',
  maintenance: 'Đang bảo trì',
  broken: 'Hỏng',
  decommissioned: 'Thanh lý'
}

const COLORS: Record<DeviceStatus, { bg: string; fg: string }> = {
  available: { bg: 'rgba(22,163,74,.14)', fg: '#16a34a' },
  allocated: { bg: 'rgba(37,99,235,.14)', fg: '#2563eb' },
  maintenance: { bg: 'rgba(202,138,4,.18)', fg: '#ca8a04' },
  broken: { bg: 'rgba(220,38,38,.14)', fg: '#dc2626' },
  decommissioned: { bg: 'rgba(100,116,139,.18)', fg: '#64748b' }
}
export function badgeStyle(status: DeviceStatus) { return COLORS[status] }

export function requestStatusLabel(s: RequestStatus): string {
  return s === 'allocated' ? 'Đang trang bị' : 'Hoàn tất'
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  allocated: 'Đang trang bị',
  completed: 'Hoàn tất',
}

const REQ_COLORS: Record<RequestStatus, { bg: string; fg: string }> = {
  allocated: { bg: 'rgba(37,99,235,.14)', fg: '#2563eb' },
  completed: { bg: 'rgba(22,163,74,.14)', fg: '#16a34a' },
}
export function requestBadgeStyle(status: RequestStatus) { return REQ_COLORS[status] }
