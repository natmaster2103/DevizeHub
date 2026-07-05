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
  if (s === 'pending') return 'Chưa cấp phát'
  if (s === 'allocated') return 'Đang cho mượn'
  return 'Hoàn tất'
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Chưa cấp phát',
  allocated: 'Đang cho mượn',
  completed: 'Hoàn tất',
}

const REQ_COLORS: Record<RequestStatus, { bg: string; fg: string }> = {
  pending: { bg: 'rgba(100,116,139,.18)', fg: '#64748b' },
  allocated: { bg: 'rgba(37,99,235,.14)', fg: '#2563eb' },
  completed: { bg: 'rgba(22,163,74,.14)', fg: '#16a34a' },
}
export function requestBadgeStyle(status: RequestStatus) { return REQ_COLORS[status] }

const FULLY_RETURNED_LABEL = 'Đã trả đủ'
const FULLY_RETURNED_COLOR = { bg: 'rgba(202,138,4,.18)', fg: '#ca8a04' }

/** An allocated request whose devices have all come back is ready to complete — surface that distinctly from "still on loan". */
export function requestEffectiveLabel(status: RequestStatus, allReturned: boolean): string {
  if (status === 'allocated' && allReturned) return FULLY_RETURNED_LABEL
  return REQUEST_STATUS_LABELS[status]
}

export function requestEffectiveBadgeStyle(status: RequestStatus, allReturned: boolean) {
  if (status === 'allocated' && allReturned) return FULLY_RETURNED_COLOR
  return REQ_COLORS[status]
}
